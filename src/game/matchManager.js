'use strict';

const Match = require('../models/Match');
const Room = require('../models/Room');
const {
  createEmptyBoard,
  applyMove,
  BLACK,
  WHITE,
  otherColor,
} = require('./board');
const {
  createClockState,
  applyMoveToClock,
  projectClockNow,
  checkFlagFall,
} = require('./clock');

/**
 * Cache en memoria de partidas activas (esperando o en curso), indexada
 * por matchId (string). Evita ir a Mongo en cada tick de reloj; los
 * cambios importantes (jugada, pase, renuncia, fin de partida) se
 * persisten inmediatamente.
 */
const activeMatches = new Map();

let ioRef = null;
let sweepInterval = null;

function init(io) {
  ioRef = io;
  if (sweepInterval) clearInterval(sweepInterval);
  // Barrido cada 500ms para detectar banderas de tiempo caídas.
  sweepInterval = setInterval(sweepTimeouts, 500);
}

function colorName(color) {
  return color === BLACK ? 'black' : 'white';
}

function toPublicMatch(matchDoc, nowMs = Date.now()) {
  const clock = matchDoc.clock ? projectClockNow(matchDoc.clock, nowMs) : null;
  return {
    id: matchDoc._id.toString(),
    roomId: matchDoc.room.toString(),
    roomName: matchDoc.roomName,
    boardNumber: matchDoc.boardNumber,
    boardSize: matchDoc.boardSize,
    capturesToWin: matchDoc.capturesToWin,
    clockPresetKey: matchDoc.clockPresetKey,
    players: matchDoc.players,
    status: matchDoc.status,
    board: matchDoc.board,
    captures: matchDoc.captures,
    turnColor: matchDoc.turnColor,
    clock,
    winnerColor: matchDoc.winnerColor,
    winReason: matchDoc.winReason,
    spectatorCount: matchDoc.spectatorCount,
    moveCount: matchDoc.moves.length,
    createdAt: matchDoc.createdAt,
    startedAt: matchDoc.startedAt,
    endedAt: matchDoc.endedAt,
  };
}

/**
 * Crea una partida en estado "esperando" con el primer jugador (negro)
 * sentado, y la deja cacheada. A partir de acá, CUALQUIER lectura o
 * mutación de esta partida (por jugadas, por el segundo jugador
 * sentándose, por reconexión, etc.) debe pasar por `getActiveMatch` /
 * las funciones de este módulo, para que todos operen sobre la misma
 * instancia en memoria y nadie pise cambios ajenos guardándolos por su
 * cuenta contra una copia vieja.
 */
async function createWaitingMatch({ room, boardNumber, blackPlayer }) {
  const matchDoc = await Match.create({
    room: room._id,
    roomName: room.name,
    boardNumber,
    boardSize: room.boardSize,
    capturesToWin: room.capturesToWin,
    clockPresetKey: room.clockPresetKey,
    players: { black: blackPlayer, white: null },
    status: 'esperando',
    board: [],
  });
  activeMatches.set(matchDoc._id.toString(), matchDoc);
  return matchDoc;
}

/**
 * Sienta al segundo jugador (blanco) en una partida "esperando" y la
 * arranca: inicializa tablero y reloj. Siempre opera sobre la instancia
 * cacheada (la misma que devuelve getActiveMatch), así que sus cambios
 * quedan visibles para cualquier otro handler que consulte la partida
 * después.
 */
async function seatSecondPlayer(matchId, whitePlayer) {
  const matchDoc = await getActiveMatch(matchId);
  if (!matchDoc || matchDoc.status !== 'esperando') return null;

  matchDoc.players.white = whitePlayer;
  matchDoc.status = 'en_curso';
  matchDoc.board = createEmptyBoard(matchDoc.boardSize);
  matchDoc.clock = createClockState(matchDoc.clockPresetKey);
  matchDoc.turnColor = BLACK;
  matchDoc.startedAt = new Date();
  await matchDoc.save();

  activeMatches.set(matchId, matchDoc);
  return matchDoc;
}

async function getActiveMatch(matchId) {
  if (activeMatches.has(matchId)) return activeMatches.get(matchId);
  const doc = await Match.findById(matchId);
  if (doc && doc.status !== 'finalizada') activeMatches.set(matchId, doc);
  return doc;
}

function playerColorForSocket(matchDoc, socketId) {
  if (matchDoc.players.black && matchDoc.players.black.socketId === socketId) return BLACK;
  if (matchDoc.players.white && matchDoc.players.white.socketId === socketId) return WHITE;
  return null;
}

/**
 * Libera el tablero de la sala para que otro par de jugadores pueda
 * usarlo, y desconecta la referencia a la partida ya finalizada.
 */
async function freeBoardSlot(roomId, boardNumber) {
  await Room.updateOne(
    { _id: roomId, 'boards.number': boardNumber },
    { $set: { 'boards.$.status': 'libre', 'boards.$.currentMatchId': null } }
  );
}

async function finishMatch(matchDoc, { winnerColor, winReason }) {
  matchDoc.status = 'finalizada';
  matchDoc.winnerColor = winnerColor;
  matchDoc.winReason = winReason;
  matchDoc.endedAt = new Date();
  await matchDoc.save();
  activeMatches.delete(matchDoc._id.toString());
  await freeBoardSlot(matchDoc.room, matchDoc.boardNumber);

  if (ioRef) {
    ioRef.to(`match:${matchDoc._id}`).emit('match:over', toPublicMatch(matchDoc));
    ioRef.emit('rooms:activity', { roomId: matchDoc.room.toString() });
  }
}

/** Aplica una jugada (colocar piedra) validando turno y reglas de Go. */
async function playMove(matchId, socketId, row, col) {
  const matchDoc = await getActiveMatch(matchId);
  if (!matchDoc || matchDoc.status !== 'en_curso') {
    return { ok: false, error: 'partida_no_disponible' };
  }
  const color = playerColorForSocket(matchDoc, socketId);
  if (!color) return { ok: false, error: 'no_sos_jugador' };
  if (color !== matchDoc.turnColor) return { ok: false, error: 'no_es_tu_turno' };

  const result = applyMove(matchDoc.board, row, col, color, matchDoc.koForbiddenPosition);
  if (!result.legal) return { ok: false, error: result.reason };

  matchDoc.board = result.board;
  matchDoc.koForbiddenPosition = result.captured.length === 1 ? result.resultingPosition : null;
  matchDoc.consecutivePasses = 0;
  matchDoc.moves.push({ color, row, col, pass: false, capturedCount: result.capturedCount });

  const capturerKey = colorName(color); // quien capturó
  matchDoc.captures[capturerKey] += result.capturedCount;

  applyMoveToClock(matchDoc.clock);
  matchDoc.turnColor = otherColor(color);

  await matchDoc.save();

  // ¿Se alcanzó el objetivo de capturas de la sala?
  if (matchDoc.captures[capturerKey] >= matchDoc.capturesToWin) {
    await finishMatch(matchDoc, { winnerColor: color, winReason: 'capturas' });
    return { ok: true, match: matchDoc, finished: true };
  }

  if (ioRef) ioRef.to(`match:${matchId}`).emit('match:state', toPublicMatch(matchDoc));
  return { ok: true, match: matchDoc, finished: false };
}

async function pass(matchId, socketId) {
  const matchDoc = await getActiveMatch(matchId);
  if (!matchDoc || matchDoc.status !== 'en_curso') {
    return { ok: false, error: 'partida_no_disponible' };
  }
  const color = playerColorForSocket(matchDoc, socketId);
  if (!color) return { ok: false, error: 'no_sos_jugador' };
  if (color !== matchDoc.turnColor) return { ok: false, error: 'no_es_tu_turno' };

  matchDoc.moves.push({ color, pass: true, capturedCount: 0 });
  matchDoc.koForbiddenPosition = null;
  matchDoc.consecutivePasses += 1;

  applyMoveToClock(matchDoc.clock);
  matchDoc.turnColor = otherColor(color);
  await matchDoc.save();

  if (matchDoc.consecutivePasses >= 2) {
    // Doble pase: gana quien lleve más capturas; empate si están iguales.
    const { black, white } = matchDoc.captures;
    const winnerColor = black === white ? null : black > white ? BLACK : WHITE;
    await finishMatch(matchDoc, { winnerColor, winReason: 'doble_pase' });
    return { ok: true, match: matchDoc, finished: true };
  }

  if (ioRef) ioRef.to(`match:${matchId}`).emit('match:state', toPublicMatch(matchDoc));
  return { ok: true, match: matchDoc, finished: false };
}

async function resign(matchId, socketId) {
  const matchDoc = await getActiveMatch(matchId);
  if (!matchDoc || matchDoc.status !== 'en_curso') {
    return { ok: false, error: 'partida_no_disponible' };
  }
  const color = playerColorForSocket(matchDoc, socketId);
  if (!color) return { ok: false, error: 'no_sos_jugador' };

  await finishMatch(matchDoc, { winnerColor: otherColor(color), winReason: 'renuncia' });
  return { ok: true, match: matchDoc, finished: true };
}

/** Marca desconexión del jugador sin terminar la partida (puede reconectar por nombre+matchId). */
async function markPlayerSocket(matchId, color, socketId) {
  const matchDoc = await getActiveMatch(matchId);
  if (!matchDoc) return;
  matchDoc.players[colorName(color)].socketId = socketId;
  await matchDoc.save();
}

/** Recorre las partidas activas y hace caer la bandera de tiempo si corresponde. */
async function sweepTimeouts() {
  const now = Date.now();
  for (const matchDoc of activeMatches.values()) {
    if (matchDoc.status !== 'en_curso' || !matchDoc.clock) continue;
    const flagged = checkFlagFall(matchDoc.clock, now);
    if (flagged) {
      await finishMatch(matchDoc, { winnerColor: otherColor(flagged), winReason: 'tiempo' });
    } else if (ioRef) {
      // Tick liviano sólo con el reloj proyectado, para no reenviar el tablero entero.
      ioRef.to(`match:${matchDoc._id}`).emit('match:clock', {
        matchId: matchDoc._id.toString(),
        clock: projectClockNow(matchDoc.clock, now),
      });
    }
  }
}

function setSpectatorCount(matchDoc, count) {
  matchDoc.spectatorCount = count;
}

module.exports = {
  init,
  createWaitingMatch,
  seatSecondPlayer,
  getActiveMatch,
  playMove,
  pass,
  resign,
  markPlayerSocket,
  playerColorForSocket,
  toPublicMatch,
  setSpectatorCount,
  finishMatch,
};
