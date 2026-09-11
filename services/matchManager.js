/**
 * matchManager.js
 * ÚNICA FUENTE DE VERDAD para el estado en memoria de salas/tableros/partidas.
 * Los handlers de sockets NUNCA tocan Mongo directamente ni mutan este estado
 * por fuera de las funciones exportadas aquí.
 *
 * Persistencia a Mongo (creación/actualización de Match) ocurre solo dentro
 * de este módulo, al iniciar y al finalizar una partida.
 */

const goEngine = require('./goEngine');
const Match = require('../models/Match');

const CLOCK_PRESETS = {
  'fischer-1-3': { baseMs: 1 * 60 * 1000, incrementMs: 3 * 1000 },
  'fischer-5-3': { baseMs: 5 * 60 * 1000, incrementMs: 3 * 1000 },
  'fischer-10-5': { baseMs: 10 * 60 * 1000, incrementMs: 5 * 1000 }
};

/** rooms: Map<roomId, { config, boards: Map<boardNumber, BoardState> }> */
const rooms = new Map();

/** playerLocation: Map<playerId, { roomId, boardNumber }> para localizar rápido en disconnect */
const playerLocation = new Map();

let broadcastHandler = null;

/**
 * Registra la función usada para emitir eventos a los clientes.
 * fn(event: string, roomId: string, payload: any)
 */
function setBroadcastHandler(fn) {
  broadcastHandler = fn;
}

function emit(event, roomId, payload) {
  if (typeof broadcastHandler === 'function') {
    broadcastHandler(event, roomId, payload);
  }
}

function makeEmptyBoardState(number) {
  return {
    number,
    status: 'empty', // empty | waiting | playing | finished
    matchId: null,
    game: null, // { players, board, size, stonesToWin, clockType, turn, clocks, moves, ... }
    spectators: new Set(), // socketIds
    lastResult: null, // { winnerColor, reason, players } para mostrar breve resumen tras finalizar
  };
}

function registerRoom(roomDoc) {
  const boards = new Map();
  for (let n = 1; n <= roomDoc.boardCount; n++) {
    boards.set(n, makeEmptyBoardState(n));
  }
  rooms.set(String(roomDoc._id), {
    config: {
      id: String(roomDoc._id),
      name: roomDoc.name,
      type: roomDoc.type,
      boardCount: roomDoc.boardCount,
      boardSize: roomDoc.boardSize,
      stonesToWin: roomDoc.stonesToWin,
      clockType: roomDoc.clockType,
    },
    boards,
  });
  return rooms.get(String(roomDoc._id));
}

function getRoom(roomId) {
  return rooms.get(String(roomId));
}

function unregisterRoom(roomId) {
  const room = rooms.get(String(roomId));
  if (!room) return;
  for (const board of room.boards.values()) {
    if (board.game && board.game.timer) clearInterval(board.game.timer);
  }
  rooms.delete(String(roomId));
}

// ---------- Serialización para el frontend ----------

function serializeBoard(board) {
  const base = {
    number: board.number,
    status: board.status,
    spectatorCount: board.spectators.size,
    lastResult: board.lastResult,
  };
  if (!board.game) return { ...base, players: [] };
  const g = board.game;
  return {
    ...base,
    players: g.players.map((p) => ({ nickname: p.nickname, team: p.team, teamName: p.teamName, color: p.color })),
    boardSize: g.size,
    stonesToWin: g.stonesToWin,
    clockType: g.clockType,
    board: g.board,
    turn: g.turn,
    clocks: g.clocks,
    capturedByBlack: g.capturedByBlack,
    capturedByWhite: g.capturedByWhite,
    moveCount: g.moves.length,
  };
}

const STATUS_ORDER = { waiting: 0, empty: 1, playing: 2, finished: 3 };

function getRoomBoardsSummary(roomId) {
  const room = getRoom(roomId);
  if (!room) return null;
  const boards = [...room.boards.values()]
    .slice()
    .sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || (a.number - b.number))
    .map(serializeBoard);
  return { config: room.config, boards };
}

function getActiveRoomsSummary() {
  const list = [];
  for (const room of rooms.values()) {
    const boardsArr = [...room.boards.values()];
    const freeBoards = boardsArr.filter((b) => b.status === 'empty' || b.status === 'waiting').length;
    const playersSet = new Set();
    const teamsSet = new Set();
    for (const b of boardsArr) {
      if (b.game) {
        for (const p of b.game.players) {
          playersSet.add(p.playerId);
          teamsSet.add(String(p.team));
        }
      }
    }
    list.push({
      ...room.config,
      freeBoards,
      totalBoards: boardsArr.length,
      playersOnline: playersSet.size,
      teamsPlaying: teamsSet.size,
    });
  }
  return list;
}

// ---------- Lógica de asiento (board:sit) ----------

/**
 * El frontend SIEMPRE llama a esto sin importar board.status; el backend decide
 * si el jugador entra como jugador (negro/blanco) o como espectador.
 */
function handleSit({ roomId, boardNumber, player, socketId }) {
  const room = getRoom(roomId);
  if (!room) return { ok: false, error: 'Sala inexistente' };
  const board = room.boards.get(Number(boardNumber));
  if (!board) return { ok: false, error: 'Tablero inexistente' };

  // Tablero vacío -> se crea partida en estado "waiting" con el primer jugador
  if (board.status === 'empty') {
    const size = room.config.boardSize;
    const preset = CLOCK_PRESETS[room.config.clockType];
    board.status = 'waiting';
    board.game = {
      players: [{
        playerId: player.id, socketId, nickname: player.nickname,
        team: String(player.team), teamName: player.teamName, color: 'black',
      }],
      board: goEngine.createEmptyBoard(size),
      size,
      stonesToWin: room.config.stonesToWin,
      clockType: room.config.clockType,
      turn: 'black',
      clocks: { black: preset.baseMs, white: preset.baseMs },
      preset,
      moves: [],
      capturedByBlack: 0,
      capturedByWhite: 0,
      previousBoardKey: null,
      lastMoveAt: null,
      timer: null,
      mongoMatchId: null,
    };
    playerLocation.set(player.id, { roomId: String(roomId), boardNumber: board.number });
    emit('room:update', roomId, getRoomBoardsSummary(roomId));
    return { ok: true, role: 'player', color: 'black' };
  }

  // Tablero esperando rival -> segundo jugador se suma si cumple reglas
  if (board.status === 'waiting') {
    const seated = board.game.players[0];
    if (seated.playerId === player.id) {
      return { ok: true, role: 'player', color: seated.color };
    }
    if (room.config.type === 'torneo' && String(seated.team) === String(player.team)) {
      board.spectators.add(socketId);
      return { ok: true, role: 'spectator', error: 'No pueden enfrentarse jugadores del mismo equipo' };
    }
    board.game.players.push({
      playerId: player.id, socketId, nickname: player.nickname,
      team: String(player.team), teamName: player.teamName, color: 'white',
    });
    board.status = 'playing';
    board.game.lastMoveAt = Date.now();
    playerLocation.set(player.id, { roomId: String(roomId), boardNumber: board.number });
    startClockTimer(roomId, board);
    persistMatchStart(roomId, board).catch((err) => console.error('[matchManager] error persistMatchStart', err));
    emit('room:update', roomId, getRoomBoardsSummary(roomId));
    return { ok: true, role: 'player', color: 'white' };
  }

  // Jugando o finalizado -> si es uno de los jugadores, reconecta; si no, espectador
  if (board.game) {
    const asPlayer = board.game.players.find((p) => p.playerId === player.id);
    if (asPlayer) {
      asPlayer.socketId = socketId;
      playerLocation.set(player.id, { roomId: String(roomId), boardNumber: board.number });
      return { ok: true, role: 'player', color: asPlayer.color };
    }
  }
  board.spectators.add(socketId);
  return { ok: true, role: 'spectator' };
}

function handleLeaveSpectator({ roomId, boardNumber, socketId }) {
  const room = getRoom(roomId);
  if (!room) return;
  const board = room.boards.get(Number(boardNumber));
  if (!board) return;
  board.spectators.delete(socketId);
}

// ---------- Jugadas ----------

function handleMove({ roomId, boardNumber, playerId, x, y, pass }) {
  const room = getRoom(roomId);
  if (!room) return { ok: false, error: 'Sala inexistente' };
  const board = room.boards.get(Number(boardNumber));
  if (!board || board.status !== 'playing') return { ok: false, error: 'La partida no está en curso' };
  const g = board.game;
  const mover = g.players.find((p) => p.playerId === playerId);
  if (!mover) return { ok: false, error: 'No participás de esta partida' };
  if (mover.color !== g.turn) return { ok: false, error: 'No es tu turno' };

  let captured = 0;
  if (pass) {
    g.moves.push({ color: mover.color, x: null, y: null, pass: true, captured: 0, timestamp: Date.now() });
  } else {
    const result = goEngine.playMove(g.board, g.size, x, y, mover.color);
    if (!result.ok) return { ok: false, error: result.error };
    const newKey = goEngine.boardKey(result.board);
    if (goEngine.violatesSimpleKo(newKey, g.previousBoardKey)) {
      return { ok: false, error: 'Jugada inválida: regla de Ko' };
    }
    g.previousBoardKey = goEngine.boardKey(g.board);
    g.board = result.board;
    captured = result.captured;
    if (mover.color === 'black') g.capturedByBlack += captured;
    else g.capturedByWhite += captured;
    g.moves.push({ color: mover.color, x, y, pass: false, captured, timestamp: Date.now() });
  }

  applyClockIncrement(g, mover.color);
  g.turn = mover.color === 'black' ? 'white' : 'black';
  g.lastMoveAt = Date.now();

  emit('board:state', roomId, { boardNumber: board.number, ...serializeBoard(board) });

  const capturesForWin = mover.color === 'black' ? g.capturedByBlack : g.capturedByWhite;
  if (capturesForWin >= g.stonesToWin) {
    finishMatch(roomId, board, mover.color, 'capture').catch((err) => console.error('[matchManager]', err));
  }

  return { ok: true };
}

function handleResign({ roomId, boardNumber, playerId }) {
  const room = getRoom(roomId);
  if (!room) return { ok: false, error: 'Sala inexistente' };
  const board = room.boards.get(Number(boardNumber));
  if (!board || board.status !== 'playing') return { ok: false, error: 'La partida no está en curso' };
  const mover = board.game.players.find((p) => p.playerId === playerId);
  if (!mover) return { ok: false, error: 'No participás de esta partida' };
  const winnerColor = mover.color === 'black' ? 'white' : 'black';
  finishMatch(roomId, board, winnerColor, 'resign').catch((err) => console.error('[matchManager]', err));
  return { ok: true };
}

// ---------- Reloj ----------

function applyClockIncrement(g, colorThatMoved) {
  const elapsed = g.lastMoveAt ? Date.now() - g.lastMoveAt : 0;
  g.clocks[colorThatMoved] = Math.max(0, g.clocks[colorThatMoved] - elapsed);
  g.clocks[colorThatMoved] += g.preset.incrementMs;
}

function startClockTimer(roomId, board) {
  const g = board.game;
  g.timer = setInterval(() => {
    if (board.status !== 'playing') {
      clearInterval(g.timer);
      return;
    }
    const elapsed = Date.now() - g.lastMoveAt;
    const remaining = g.clocks[g.turn] - elapsed;
    if (remaining <= 0) {
      clearInterval(g.timer);
      const winnerColor = g.turn === 'black' ? 'white' : 'black';
      finishMatch(roomId, board, winnerColor, 'timeout').catch((err) => console.error('[matchManager]', err));
      return;
    }
    emit('board:clock', roomId, {
      boardNumber: board.number,
      turn: g.turn,
      clocks: { ...g.clocks, [g.turn]: remaining },
    });
  }, 1000);
}

// ---------- Ciclo de vida de partida + persistencia ----------

async function persistMatchStart(roomId, board) {
  const room = getRoom(roomId);
  const g = board.game;
  const doc = await Match.create({
    room: roomId,
    roomName: room.config.name,
    boardNumber: board.number,
    boardSize: g.size,
    stonesToWin: g.stonesToWin,
    clockType: g.clockType,
    players: g.players.map((p) => ({
      player: p.playerId, nickname: p.nickname, team: p.team, teamName: p.teamName, color: p.color,
    })),
    status: 'playing',
    startedAt: new Date(),
  });
  g.mongoMatchId = doc._id;
  board.matchId = doc._id;
}

async function finishMatch(roomId, board, winnerColor, reason) {
  const g = board.game;
  if (!g || board.status === 'finished') return;
  if (g.timer) clearInterval(g.timer);
  board.status = 'finished';
  board.lastResult = {
    winnerColor, reason,
    players: g.players.map((p) => ({ nickname: p.nickname, color: p.color, teamName: p.teamName })),
  };

  if (g.mongoMatchId) {
    await Match.findByIdAndUpdate(g.mongoMatchId, {
      moves: g.moves,
      status: reason === 'abandoned' ? 'aborted' : 'finished',
      result: { winnerColor, reason },
      capturedByBlack: g.capturedByBlack,
      capturedByWhite: g.capturedByWhite,
      endedAt: new Date(),
    });
  }

  for (const p of g.players) playerLocation.delete(p.playerId);

  emit('board:finished', roomId, { boardNumber: board.number, ...serializeBoard(board) });
  emit('room:update', roomId, getRoomBoardsSummary(roomId));

  // El tablero queda visible como "finished" hasta que alguien vuelva a la sala
  // y el frontend pida liberarlo, o se libera automáticamente tras un lapso corto.
  setTimeout(() => {
    if (board.status === 'finished') {
      freeBoard(roomId, board.number);
    }
  }, 15000);
}

function freeBoard(roomId, boardNumber) {
  const room = getRoom(roomId);
  if (!room) return;
  const board = room.boards.get(Number(boardNumber));
  if (!board) return;
  if (board.game && board.game.timer) clearInterval(board.game.timer);
  board.status = 'empty';
  board.game = null;
  board.matchId = null;
  board.spectators.clear();
  emit('room:update', roomId, getRoomBoardsSummary(roomId));
}

// ---------- Desconexión (regla E) ----------

function handleDisconnect({ socketId, playerId }) {
  if (!playerId) return;
  const loc = playerLocation.get(playerId);
  if (!loc) return;
  const room = getRoom(loc.roomId);
  if (!room) return;
  const board = room.boards.get(Number(loc.boardNumber));
  if (!board || !board.game) return;

  if (board.status === 'waiting') {
    // Único jugador esperando rival abandona -> se anula y el tablero se libera
    const seated = board.game.players[0];
    if (seated && seated.playerId === playerId) {
      playerLocation.delete(playerId);
      freeBoard(loc.roomId, board.number);
    }
  }
  // Si está "playing", no se aborta: se permite reconexión (nickname+equipo persistido)
  // y el reloj del jugador desconectado sigue corriendo con normalidad.
}

module.exports = {
  setBroadcastHandler,
  registerRoom,
  unregisterRoom,
  getRoom,
  getRoomBoardsSummary,
  getActiveRoomsSummary,
  handleSit,
  handleLeaveSpectator,
  handleMove,
  handleResign,
  handleDisconnect,
  CLOCK_PRESETS,
};
