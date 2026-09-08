const { ALLOWED_SIZES, createEmptyBoard } = require('./go-rules');
const { normalizeTimeControl, initClock } = require('./clock');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos

// Salas en memoria (código de sala -> estado en vivo). Es el "presente"
// de cada partida; lo que persiste entre partidas o reinicios del
// servidor vive en MongoDB (ver persistence.js), no acá.
const rooms = new Map();

function generateCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function makeRoom(code, size, captureTarget, timeControlId) {
  size = ALLOWED_SIZES.includes(size) ? size : 7;
  captureTarget = Number.isInteger(captureTarget) && captureTarget >= 1 && captureTarget <= 25 ? captureTarget : 1;
  const normalizedTimeControl = normalizeTimeControl(timeControlId);
  return {
    salaCode: code,
    size,
    captureTarget,
    board: createEmptyBoard(size),
    current: 'black',
    captures: { black: 0, white: 0 },
    gameOver: false,
    message: '',
    winner: null,
    winReason: null, // 'capture' | 'resign' | 'draw' | 'timeout'
    players: { black: null, white: null },
    sockets: new Map(), // socketId -> role ('black' | 'white' | 'spectator')
    moveHistory: [], // { color, x, y }
    createdAt: new Date(),
    partidaNumber: 1,
    partidaId: null, // ObjectId en Mongo de la partida actual
    timeControlId: normalizedTimeControl,
    clock: initClock(normalizedTimeControl),
    // true en cuanto la sala tuvo alguna vez los dos jugadores presentes.
    // Sirve para distinguir "nunca apareció un rival" (se cancela la sala
    // apenas se queda sin nadie) de "la partida ya había arrancado"
    // (se le da un margen de 60s por si alguien se reconecta).
    wasFull: false,
  };
}

function startNewPartida(room) {
  room.board = createEmptyBoard(room.size);
  room.current = 'black';
  room.captures = { black: 0, white: 0 };
  room.gameOver = false;
  room.message = '';
  room.winner = null;
  room.winReason = null;
  room.moveHistory = [];
  room.clock = initClock(room.timeControlId);
  room.createdAt = new Date();
  room.partidaId = null;
}

function countSpectators(room) {
  let count = 0;
  for (const role of room.sockets.values()) if (role === 'spectator') count++;
  return count;
}

// Salas "activas": primero las que esperan rival, después las que están
// en curso (o recién terminadas, esperando revancha) — estas últimas se
// pueden mirar como espectador.
function getActiveRooms() {
  const waiting = [];
  const inProgress = [];

  for (const [code, room] of rooms.entries()) {
    const hasBlack = !!room.players.black;
    const hasWhite = !!room.players.white;

    if (hasBlack !== hasWhite) {
      waiting.push({
        code,
        status: 'waiting',
        size: room.size,
        captureTarget: room.captureTarget,
        timeControlId: room.timeControlId,
        waitingSince: room.createdAt,
      });
    } else if (hasBlack && hasWhite) {
      inProgress.push({
        code,
        status: 'in_progress',
        size: room.size,
        captureTarget: room.captureTarget,
        timeControlId: room.timeControlId,
        partidaNumber: room.partidaNumber,
        gameOver: room.gameOver,
        spectatorCount: countSpectators(room),
        since: room.createdAt,
      });
    }
  }

  waiting.sort((a, b) => new Date(a.waitingSince) - new Date(b.waitingSince));
  inProgress.sort((a, b) => new Date(b.since) - new Date(a.since));

  return [...waiting, ...inProgress];
}

module.exports = {
  rooms,
  generateCode,
  makeRoom,
  startNewPartida,
  countSpectators,
  getActiveRooms,
};
