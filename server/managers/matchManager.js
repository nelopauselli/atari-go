'use strict';

/**
 * matchManager es la ÚNICA vía por la que se crean y mutan Partidas.
 *
 * Motivo (bug corregido): antes, el handler `board:sit` creaba/actualizaba
 * el documento Match directamente contra Mongo (Match.create / doc.save())
 * sin registrar el resultado en el cache en memoria (`activeMatches`).
 * Si ya existía una copia vieja cacheada (por ejemplo porque el creador
 * hizo `match:rejoin` mientras esperaba), esa copia vieja quedaba
 * "congelada" en estado `waiting` para siempre, y todo lo que pasaba por
 * matchManager (jugadas, pases) seguía viendo esa versión vieja.
 *
 * Regla de oro: para cada partida activa existe UNA sola instancia en
 * memoria (`MatchState`, con su documento Mongoose `doc` embebido) y
 * TODA mutación (crear, sentarse, jugar, pasar, abandonar, timeout)
 * pasa por las funciones de este módulo. Nadie más debe hacer
 * `Match.create`, `Match.findByIdAndUpdate` ni `doc.save()` afuera de acá.
 */

const Match = require('../models/Match');
const roomManager = require('./roomManager');
const engine = require('../game/atariGoEngine');
const { initialRemainingMs, applyIncrement } = require('../game/clock');

/** Map<matchIdString, MatchState> — única fuente de verdad de partidas activas */
const activeMatches = new Map();

/** Map<"roomId:boardNumber", matchIdString> — qué partida ocupa cada tablero */
const boardOccupancy = new Map();

const TICK_MS = 1000;

let broadcastHandler = null;
/** Permite que la capa de sockets escuche eventos de partidas (jugada, tick, fin, etc). */
function setBroadcastHandler(fn) {
  broadcastHandler = fn;
}
function emit(matchId, event, payload) {
  if (broadcastHandler) broadcastHandler(matchId, event, payload);
}

function boardKey(roomId, boardNumber) {
  return `${roomId}:${boardNumber}`;
}

function colorOf(state, socketId) {
  const player = state.players.find((p) => p.socketId === socketId);
  return player ? player.color : null;
}

function opponentColor(color) {
  return color === 'black' ? 'white' : 'black';
}

/**
 * Obtiene (o crea) la partida "esperando jugador" de un tablero.
 * Si el tablero ya tiene una partida activa/esperando en memoria, la reutiliza
 * en lugar de crear un documento nuevo — evita duplicados y desincronización.
 */
async function getOrCreateWaitingMatch(room, boardNumber) {
  const key = boardKey(room._id, boardNumber);
  const existingId = boardOccupancy.get(key);
  if (existingId && activeMatches.has(existingId)) {
    const state = activeMatches.get(existingId);
    if (state.status !== 'finished') return state;
  }

  const doc = await Match.create({
    roomId: room._id,
    roomName: room.name,
    boardNumber,
    boardSize: room.boardSize,
    stonesToCapture: room.stonesToCapture,
    clockType: room.clockType,
    allowSameDojo: room.allowSameDojo,
    status: 'waiting',
    players: [],
    moves: [],
  });

  const state = {
    matchId: String(doc._id),
    doc,
    roomId: String(room._id),
    boardNumber,
    boardSize: room.boardSize,
    stonesToCapture: room.stonesToCapture,
    clockType: room.clockType,
    allowSameDojo: room.allowSameDojo,
    board: engine.createEmptyBoard(room.boardSize),
    players: [], // {socketId, nickname, dojoId, dojoName, color, capturedStones, remainingMs}
    spectators: new Map(), // socketId -> {nickname}
    status: 'waiting',
    turnColor: 'black',
    consecutivePasses: 0,
    winnerColor: null,
    winnerNickname: null,
    result: null,
    timer: null,
  };

  activeMatches.set(state.matchId, state);
  boardOccupancy.set(key, state.matchId);
  await roomManager.occupyBoard(room._id, boardNumber, doc._id);

  return state;
}

function getState(matchId) {
  return activeMatches.get(String(matchId)) || null;
}

function getMatchIdForBoard(roomId, boardNumber) {
  return boardOccupancy.get(boardKey(roomId, boardNumber)) || null;
}

/**
 * Un jugador se sienta en el tablero. Si ya hay dos jugadores, rechaza.
 * Si tras sentarse hay 2 jugadores, arranca la partida y el reloj.
 */
async function sitPlayer(state, { socketId, nickname, dojoId, dojoName }) {
  if (state.status === 'finished') return { ok: false, reason: 'partida_finalizada' };
  if (state.players.length >= 2) return { ok: false, reason: 'tablero_completo' };
  if (state.players.some((p) => p.nickname === nickname)) {
    return { ok: false, reason: 'ya_sentado' };
  }
  if (!state.allowSameDojo && state.players.length === 1) {
    const rival = state.players[0];
    if (String(rival.dojoId) === String(dojoId)) {
      return { ok: false, reason: 'mismo_dojo_no_permitido' };
    }
  }

  const color = state.players.length === 0 ? 'black' : 'white';
  const player = {
    socketId,
    nickname,
    dojoId,
    dojoName,
    color,
    capturedStones: 0,
    remainingMs: initialRemainingMs(state.clockType),
  };
  state.players.push(player);

  state.doc.players = state.players.map((p) => ({
    nickname: p.nickname,
    dojoId: p.dojoId,
    dojoName: p.dojoName,
    color: p.color,
    capturedStones: p.capturedStones,
    remainingMs: p.remainingMs,
  }));

  if (state.players.length === 2) {
    state.status = 'active';
    state.turnColor = 'black';
    state.doc.status = 'active';
    state.doc.startedAt = new Date();
    startClockTimer(state);
  }

  await state.doc.save();
  return { ok: true };
}

function startClockTimer(state) {
  stopClockTimer(state);
  state.timer = setInterval(() => tickClock(state), TICK_MS);
}

function stopClockTimer(state) {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

function tickClock(state) {
  if (state.status !== 'active') {
    stopClockTimer(state);
    return;
  }
  const player = state.players.find((p) => p.color === state.turnColor);
  if (!player) return;

  player.remainingMs = Math.max(0, player.remainingMs - TICK_MS);

  if (player.remainingMs <= 0) {
    finishMatch(state, opponentColor(state.turnColor), 'tiempo').catch((err) =>
      console.error('[matchManager] error al finalizar por tiempo:', err)
    );
    return;
  }

  emit(state.matchId, 'clock:tick', {
    matchId: state.matchId,
    remaining: Object.fromEntries(state.players.map((p) => [p.color, p.remainingMs])),
  });
}

/**
 * Aplica una jugada. Devuelve {ok, reason?} y emite el estado si es válida.
 */
async function playMove(state, socketId, x, y) {
  if (state.status !== 'active') return { ok: false, reason: 'partida_no_activa' };
  const color = colorOf(state, socketId);
  if (!color) return { ok: false, reason: 'no_participas' };
  if (color !== state.turnColor) return { ok: false, reason: 'no_es_tu_turno' };

  const result = engine.playMove(state.board, state.boardSize, x, y, color);
  if (!result.ok) return { ok: false, reason: result.reason };

  state.board = result.board;
  state.consecutivePasses = 0;

  const player = state.players.find((p) => p.color === color);
  player.capturedStones += result.capturedCount;
  player.remainingMs = applyIncrement(state.clockType, player.remainingMs);

  state.doc.moves.push({ color, x, y, pass: false, capturedCount: result.capturedCount });
  syncPlayersToDoc(state);

  if (player.capturedStones >= state.stonesToCapture) {
    await finishMatch(state, color, 'captura');
    return { ok: true, finished: true };
  }

  state.turnColor = opponentColor(color);
  await state.doc.save();

  emit(state.matchId, 'match:update', serialize(state));
  return { ok: true };
}

async function passTurn(state, socketId) {
  if (state.status !== 'active') return { ok: false, reason: 'partida_no_activa' };
  const color = colorOf(state, socketId);
  if (!color) return { ok: false, reason: 'no_participas' };
  if (color !== state.turnColor) return { ok: false, reason: 'no_es_tu_turno' };

  state.consecutivePasses += 1;
  state.doc.moves.push({ color, pass: true, capturedCount: 0 });

  if (state.consecutivePasses >= 2) {
    // Doble pase: gana quien más piedras haya capturado; empate = sin ganador.
    const [p1, p2] = state.players;
    let winnerColor = null;
    if (p1.capturedStones > p2.capturedStones) winnerColor = p1.color;
    else if (p2.capturedStones > p1.capturedStones) winnerColor = p2.color;
    await finishMatch(state, winnerColor, 'doble_pase');
    return { ok: true, finished: true };
  }

  state.turnColor = opponentColor(color);
  await state.doc.save();
  emit(state.matchId, 'match:update', serialize(state));
  return { ok: true };
}

async function resign(state, socketId) {
  if (state.status !== 'active') return { ok: false, reason: 'partida_no_activa' };
  const color = colorOf(state, socketId);
  if (!color) return { ok: false, reason: 'no_participas' };

  await finishMatch(state, opponentColor(color), 'abandono');
  return { ok: true };
}

function syncPlayersToDoc(state) {
  state.doc.players = state.players.map((p) => ({
    nickname: p.nickname,
    dojoId: p.dojoId,
    dojoName: p.dojoName,
    color: p.color,
    capturedStones: p.capturedStones,
    remainingMs: p.remainingMs,
  }));
}

async function finishMatch(state, winnerColor, result) {
  stopClockTimer(state);
  state.status = 'finished';
  state.winnerColor = winnerColor;
  state.result = result;

  const winner = winnerColor ? state.players.find((p) => p.color === winnerColor) : null;
  state.winnerNickname = winner ? winner.nickname : null;

  syncPlayersToDoc(state);
  state.doc.status = 'finished';
  state.doc.winnerColor = winnerColor;
  state.doc.winnerNickname = state.winnerNickname;
  state.doc.result = result;
  state.doc.finishedAt = new Date();

  await state.doc.save();
  await roomManager.freeBoard(state.roomId, state.boardNumber);

  boardOccupancy.delete(boardKey(state.roomId, state.boardNumber));

  emit(state.matchId, 'match:finished', serialize(state));

  // Se mantiene un rato en memoria por si hay clientes reconectando o
  // consultando el resultado final, luego se libera.
  setTimeout(() => activeMatches.delete(state.matchId), 5 * 60 * 1000);
}

/**
 * Reasocia el socketId de un jugador ya sentado (reconexión / match:rejoin)
 * sin crear una nueva entrada ni tocar Mongo: mutamos la misma instancia
 * en memoria que ya es la fuente de verdad.
 */
function rebindPlayerSocket(state, nickname, newSocketId) {
  const player = state.players.find((p) => p.nickname === nickname);
  if (player) player.socketId = newSocketId;
  return player || null;
}

function addSpectator(state, socketId, nickname) {
  state.spectators.set(socketId, { nickname });
}

function removeSpectator(state, socketId) {
  state.spectators.delete(socketId);
}

/**
 * Un jugador se desconecta a mitad de partida: se le da por perdedor
 * si la partida ya estaba activa (evita abandonos "silenciosos").
 */
async function handlePlayerDisconnect(state, socketId) {
  const color = colorOf(state, socketId);
  if (!color) {
    removeSpectator(state, socketId);
    return;
  }
  if (state.status === 'active') {
    await finishMatch(state, opponentColor(color), 'desconexion');
  }
}

function serialize(state) {
  return {
    matchId: state.matchId,
    roomId: state.roomId,
    boardNumber: state.boardNumber,
    boardSize: state.boardSize,
    stonesToCapture: state.stonesToCapture,
    clockType: state.clockType,
    allowSameDojo: state.allowSameDojo,
    board: state.board,
    players: state.players.map((p) => ({
      nickname: p.nickname,
      dojoName: p.dojoName,
      color: p.color,
      capturedStones: p.capturedStones,
      remainingMs: p.remainingMs,
    })),
    spectatorsCount: state.spectators.size,
    status: state.status,
    turnColor: state.turnColor,
    winnerColor: state.winnerColor,
    winnerNickname: state.winnerNickname,
    result: state.result,
  };
}

module.exports = {
  setBroadcastHandler,
  getOrCreateWaitingMatch,
  getState,
  getMatchIdForBoard,
  sitPlayer,
  playMove,
  passTurn,
  resign,
  rebindPlayerSocket,
  addSpectator,
  removeSpectator,
  handlePlayerDisconnect,
  serialize,
  colorOf,
};
