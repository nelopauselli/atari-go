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
const Match = require('../../models/Match');
const Room = require('../../models/Room');
const Player = require('../../models/Player');

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

function buildRoomConfig(roomDoc) {
  return {
    id: String(roomDoc._id),
    name: roomDoc.name,
    type: roomDoc.type,
    boardCount: roomDoc.boardCount,
    boardSize: roomDoc.boardSize,
    stonesToWin: roomDoc.stonesToWin,
    clockType: roomDoc.clockType,
    koRuleEnabled: roomDoc.koRuleEnabled,
    // Solo las salas torneo tienen equipos (nombre + avatar, definidos en la sala).
    teams: roomDoc.type === 'torneo'
      ? (roomDoc.teams || []).map((t) => ({ _id: String(t._id), name: t.name, avatar: t.avatar || '' }))
      : [],
  };
}

function registerRoom(roomDoc) {
  const boards = new Map();
  for (let n = 1; n <= roomDoc.boardCount; n++) {
    boards.set(n, makeEmptyBoardState(n));
  }
  // assignments: Map<playerId, { institution, team }> con el equipo asignado a cada jugador (salas torneo).
  const assignments = new Map();
  for (const a of roomDoc.teamAssignments || []) {
    assignments.set(String(a.player), { institution: a.institution ? String(a.institution) : null, team: String(a.team) });
  }
  rooms.set(String(roomDoc._id), {
    config: buildRoomConfig(roomDoc),
    boards,
    assignments,
  });
  return rooms.get(String(roomDoc._id));
}

/**
 * Aplica a una sala ya registrada los cambios de configuración hechos desde el
 * backend administrativo. Las partidas en curso (o finalizadas) conservan la
 * configuración con la que empezaron; las que están esperando rival todavía no
 * arrancaron, así que se actualizan con la nueva config.
 * Devuelve true si hubo algún cambio.
 */
function updateRoomConfig(room, roomDoc) {
  const newConfig = buildRoomConfig(roomDoc);
  const configChanged = Object.keys(newConfig).some((k) => JSON.stringify(room.config[k]) !== JSON.stringify(newConfig[k]));
  let boardsChanged = false;

  if (configChanged) {
    room.config = newConfig;
    const preset = CLOCK_PRESETS[newConfig.clockType];
    for (const board of room.boards.values()) {
      if (board.status !== 'waiting' || !board.game) continue;
      const g = board.game;
      if (g.size !== newConfig.boardSize) {
        g.size = newConfig.boardSize;
        g.board = goEngine.createEmptyBoard(newConfig.boardSize);
      }
      g.stonesToWin = newConfig.stonesToWin;
      g.clockType = newConfig.clockType;
      g.koRuleEnabled = newConfig.koRuleEnabled;
      g.preset = preset;
      g.clocks = { black: preset.baseMs, white: preset.baseMs };
    }
  }

  // Cantidad de tableros: se agregan los que falten; los sobrantes se quitan
  // solo si están vacíos (si no, se reintenta en el próximo ciclo de sync).
  for (let n = 1; n <= newConfig.boardCount; n++) {
    if (!room.boards.has(n)) {
      room.boards.set(n, makeEmptyBoardState(n));
      boardsChanged = true;
    }
  }
  for (const [n, board] of [...room.boards.entries()]) {
    if (n > newConfig.boardCount && board.status === 'empty') {
      room.boards.delete(n);
      boardsChanged = true;
    }
  }

  return configChanged || boardsChanged;
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

/**
 * Recarga la lista de salas desde Mongo: registra en memoria las salas nuevas
 * (creadas por el backend administrativo mientras este server estaba corriendo)
 * y da de baja las que ya no figuran como abiertas, siempre que no tengan
 * partidas en curso (en ese caso se pospone la baja hasta el próximo ciclo).
 */
async function syncRoomsWithDB() {
  const openRooms = await Room.find({ closed: false });
  const openIds = new Set(openRooms.map((r) => String(r._id)));

  for (const roomDoc of openRooms) {
    const id = String(roomDoc._id);
    if (!rooms.has(id)) {
      registerRoom(roomDoc);
      console.log(`[matchManager] sala nueva registrada: ${roomDoc.name} (${id})`);
    } else if (updateRoomConfig(rooms.get(id), roomDoc)) {
      console.log(`[matchManager] configuración de sala actualizada: ${roomDoc.name} (${id})`);
      emit('room:update', id, getRoomBoardsSummary(id));
    }
  }

  for (const id of [...rooms.keys()]) {
    if (openIds.has(id)) continue;
    const room = rooms.get(id);
    const hasActivity = [...room.boards.values()].some((b) => b.status === 'playing' || b.status === 'waiting');
    if (hasActivity) {
      console.warn(`[matchManager] sala ${id} cerrada/eliminada en BD pero con partidas activas; se pospone su baja`);
      continue;
    }
    unregisterRoom(id);
    console.log(`[matchManager] sala dada de baja: ${id}`);
  }
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
    koRuleEnabled: g.koRuleEnabled,
    board: g.board,
    lastMove: g.lastMove,
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
          if (p.team) teamsSet.add(String(p.team));
        }
      }
    }
    // Los avatares de los equipos no hacen falta en el listado de salas.
    const { teams, ...config } = room.config;
    list.push({
      ...config,
      freeBoards,
      totalBoards: boardsArr.length,
      playersOnline: playersSet.size,
      teamsPlaying: teamsSet.size,
    });
  }
  return list;
}

// ---------- Asignación de equipos (salas torneo) ----------

/**
 * Elige el equipo para un jugador nuevo: el que tenga menos jugadores de su misma
 * institución y, a igualdad, el que tenga menos jugadores en total (desempate al azar).
 * Así los compañeros de institución quedan repartidos en distintos equipos y los
 * equipos se mantienen parejos.
 */
function pickBalancedTeam(room, institution) {
  const stats = new Map(room.config.teams.map((t) => [t._id, { sameInstitution: 0, total: 0 }]));
  for (const a of room.assignments.values()) {
    const s = stats.get(a.team);
    if (!s) continue;
    s.total++;
    if (a.institution === institution) s.sameInstitution++;
  }
  let best = [];
  let bestStats = null;
  for (const [teamId, s] of stats) {
    const cmp = bestStats ? (s.sameInstitution - bestStats.sameInstitution) || (s.total - bestStats.total) : -1;
    if (cmp < 0) {
      best = [teamId];
      bestStats = s;
    } else if (cmp === 0) {
      best.push(teamId);
    }
  }
  return best.length ? best[Math.floor(Math.random() * best.length)] : null;
}

function persistAssignment(roomId, playerId, assignment) {
  const filter = { _id: roomId };
  return Room.updateOne(filter, { $pull: { teamAssignments: { player: playerId } } })
    .then(() => Room.updateOne(filter, { $push: { teamAssignments: { player: playerId, ...assignment } } }));
}

/**
 * Devuelve el equipo ({ _id, name, avatar }) del jugador en la sala torneo, asignándolo
 * si todavía no tiene o si su equipo fue quitado de la sala desde el panel.
 */
function ensureAssignment(room, playerId, institution) {
  if (room.config.type !== 'torneo') return null;
  const pid = String(playerId);
  const current = room.assignments.get(pid);
  const currentTeam = current && room.config.teams.find((t) => t._id === current.team);
  if (currentTeam) return currentTeam;

  const inst = current ? current.institution : (institution ? String(institution) : null);
  const teamId = pickBalancedTeam(room, inst);
  if (!teamId) return null;
  const assignment = { institution: inst, team: teamId };
  room.assignments.set(pid, assignment);
  persistAssignment(room.config.id, pid, assignment)
    .catch((err) => console.error('[matchManager] error guardando asignación de equipo', err));
  return room.config.teams.find((t) => t._id === teamId);
}

/**
 * Al entrar a una sala torneo se le asigna automáticamente un equipo al jugador.
 * Resuelve con el equipo asignado o null (amistosa / sala sin equipos).
 */
async function assignTeamOnJoin(roomId, playerId) {
  const room = getRoom(roomId);
  if (!room || room.config.type !== 'torneo' || !playerId) return null;
  if (room.assignments.has(String(playerId))) return ensureAssignment(room, playerId);
  // La institución se toma de la base, no de lo que manda el cliente.
  const playerDoc = await Player.findById(playerId).select('institution').lean().catch(() => null);
  const fresh = getRoom(roomId);
  return fresh ? ensureAssignment(fresh, playerId, playerDoc ? playerDoc.institution : null) : null;
}

// ---------- Lógica de asiento (board:sit) ----------

/**
 * Equipo con el que se sienta el jugador. En amistosas no hay equipos; en
 * torneo es el que se le asignó al entrar a la sala (si no tiene, devuelve null).
 */
function resolveSeatTeam(room, playerId) {
  if (room.config.type !== 'torneo') return { team: null, teamName: '' };
  if (!room.assignments.has(String(playerId))) return null;
  const team = ensureAssignment(room, playerId);
  return team ? { team: team._id, teamName: team.name } : null;
}

const TEAM_REQUIRED_ERROR = 'No tenés equipo asignado en esta sala (todavía no tiene equipos)';
const GUEST_CANNOT_PLAY_ERROR = 'Los invitados no pueden jugar partidas';

/** Un invitado ingresa sin autenticarse: no tiene id de jugador. */
function isGuest(player) {
  return !player || !player.id || player.guest === true;
}

/**
 * El frontend SIEMPRE llama a esto sin importar board.status; el backend decide
 * si el jugador entra como jugador (negro/blanco) o como espectador.
 */
function handleSit({ roomId, boardNumber, player, socketId }) {
  const room = getRoom(roomId);
  if (!room) return { ok: false, error: 'Sala inexistente' };
  const board = room.boards.get(Number(boardNumber));
  if (!board) return { ok: false, error: 'Tablero inexistente' };

  // Invitado -> solo puede observar partidas ya iniciadas (o esperando rival)
  if (isGuest(player)) {
    if (board.status === 'empty') return { ok: false, error: GUEST_CANNOT_PLAY_ERROR };
    board.spectators.add(socketId);
    return { ok: true, role: 'spectator' };
  }

  // Tablero vacío -> se crea partida en estado "waiting" con el primer jugador
  if (board.status === 'empty') {
    const seat = resolveSeatTeam(room, player.id);
    if (!seat) return { ok: false, error: TEAM_REQUIRED_ERROR };
    const size = room.config.boardSize;
    const preset = CLOCK_PRESETS[room.config.clockType];
    board.status = 'waiting';
    board.game = {
      players: [{
        playerId: player.id, socketId, nickname: player.nickname, ...seat, color: 'black',
      }],
      board: goEngine.createEmptyBoard(size),
      size,
      stonesToWin: room.config.stonesToWin,
      clockType: room.config.clockType,
      koRuleEnabled: room.config.koRuleEnabled,
      turn: 'black',
      clocks: { black: preset.baseMs, white: preset.baseMs },
      preset,
      moves: [],
      capturedByBlack: 0,
      capturedByWhite: 0,
      previousBoardKey: null,
      lastMove: null,
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
    const seat = resolveSeatTeam(room, player.id);
    if (!seat) return { ok: false, error: TEAM_REQUIRED_ERROR };
    if (room.config.type === 'torneo' && String(seated.team) === String(seat.team)) {
      board.spectators.add(socketId);
      return { ok: true, role: 'spectator', error: 'No pueden enfrentarse jugadores del mismo equipo' };
    }
    board.game.players.push({
      playerId: player.id, socketId, nickname: player.nickname, ...seat, color: 'white',
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

function handleMove({ roomId, boardNumber, playerId, x, y }) {
  const room = getRoom(roomId);
  if (!room) return { ok: false, error: 'Sala inexistente' };
  const board = room.boards.get(Number(boardNumber));
  if (!board || board.status !== 'playing') return { ok: false, error: 'La partida no está en curso' };
  const g = board.game;
  const mover = g.players.find((p) => p.playerId === playerId);
  if (!mover) return { ok: false, error: 'No participás de esta partida' };
  if (mover.color !== g.turn) return { ok: false, error: 'No es tu turno' };

  if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, error: 'Jugada inválida' };

  const result = goEngine.playMove(g.board, g.size, x, y, mover.color);
  if (!result.ok) return { ok: false, error: result.error };
  const newKey = goEngine.boardKey(result.board);
  if (g.koRuleEnabled && goEngine.violatesSimpleKo(newKey, g.previousBoardKey)) {
    return { ok: false, error: 'Jugada inválida: regla de Ko' };
  }
  g.previousBoardKey = goEngine.boardKey(g.board);
  g.board = result.board;
  const captured = result.captured;
  if (mover.color === 'black') g.capturedByBlack += captured;
  else g.capturedByWhite += captured;
  g.moves.push({ color: mover.color, x, y, pass: false, captured, timestamp: Date.now() });
  g.lastMove = { x, y };

  applyClockIncrement(g, mover.color);
  g.turn = mover.color === 'black' ? 'white' : 'black';
  g.lastMoveAt = Date.now();

  emit('board:state', roomId, { boardNumber: board.number, ...serializeBoard(board) });

  const capturesForWin = mover.color === 'black' ? g.capturedByBlack : g.capturedByWhite;
  if (capturesForWin >= g.stonesToWin) {
    finishMatch(roomId, board, mover.color, 'capture').catch((err) => console.error('[matchManager]', err));
  } else if (!goEngine.hasLegalMove(g.board, g.size, g.turn, g.previousBoardKey, g.koRuleEnabled)) {
    // Quien tiene el turno no tiene ningún lugar permitido donde jugar -> pierde
    finishMatch(roomId, board, mover.color, 'no-moves').catch((err) => console.error('[matchManager]', err));
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
      g.clocks[g.turn] = 0;
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
    koRuleEnabled: g.koRuleEnabled,
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
    players: g.players.map((p) => ({ nickname: p.nickname, color: p.color, team: p.team, teamName: p.teamName })),
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
  // Si está "playing", no se aborta: se permite reconexión (por id de jugador)
  // y el reloj del jugador desconectado sigue corriendo con normalidad.
}

module.exports = {
  setBroadcastHandler,
  registerRoom,
  unregisterRoom,
  syncRoomsWithDB,
  getRoom,
  getRoomBoardsSummary,
  getActiveRoomsSummary,
  assignTeamOnJoin,
  handleSit,
  handleLeaveSpectator,
  isGuest,
  handleMove,
  handleResign,
  handleDisconnect,
  CLOCK_PRESETS,
};
