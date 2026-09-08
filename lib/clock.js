// Opciones de reloj y toda la aritmética de tiempo. El servidor es
// autoritativo: guarda milisegundos restantes por color más la marca de
// cuándo arrancó el turno actual, y quien "vive" corriendo es siempre
// esta lógica, nunca el reloj del navegador de cada jugador.

// 'none' no tiene entrada acá — se maneja aparte (sin objeto de reloj).
const TIME_CONTROLS = {
  'fischer-5-10': { type: 'fischer', label: 'Fischer 5m + 10s', initialSeconds: 5 * 60, incrementSeconds: 10 },
  'fischer-10-5': { type: 'fischer', label: 'Fischer 10m + 5s', initialSeconds: 10 * 60, incrementSeconds: 5 },
  'absolute-10': { type: 'absolute', label: 'Absoluto 10m', initialSeconds: 10 * 60, incrementSeconds: 0 },
};

function normalizeTimeControl(id) {
  return Object.prototype.hasOwnProperty.call(TIME_CONTROLS, id) ? id : 'none';
}

function initClock(timeControlId) {
  const tc = TIME_CONTROLS[timeControlId];
  if (!tc) return null;
  return {
    black: tc.initialSeconds * 1000,
    white: tc.initialSeconds * 1000,
    turnStartedAt: null,
    running: false,
  };
}

// Congela el reloj en el instante actual (resta lo transcurrido del lado
// que estaba corriendo) y lo detiene. Se usa al pausar por desconexión,
// rendición, timeout, etc.
function pauseClock(room) {
  if (!room.clock || !room.clock.running) return;
  const elapsed = Date.now() - room.clock.turnStartedAt;
  room.clock[room.current] = Math.max(0, room.clock[room.current] - elapsed);
  room.clock.running = false;
}

// Arranca (o reanuda) el reloj cuando ambos jugadores están presentes.
function resumeClock(room) {
  if (!room.clock || room.clock.running || room.gameOver) return;
  if (!room.players.black || !room.players.white) return;
  room.clock.running = true;
  room.clock.turnStartedAt = Date.now();
}

// Descuenta el tiempo usado por quien acaba de mover y le suma el
// incremento (Fischer) si corresponde. Debe llamarse después de una
// jugada válida, con room.current todavía apuntando a quien jugó (o con
// `mover` explícito si room.current ya cambió).
function tickClockForMove(room, mover) {
  if (!room.clock) return;
  const tc = TIME_CONTROLS[room.timeControlId];
  const elapsed = Date.now() - room.clock.turnStartedAt;
  room.clock[mover] = Math.max(0, room.clock[mover] - elapsed);
  if (tc && tc.type === 'fischer') room.clock[mover] += tc.incrementSeconds * 1000;
  if (room.gameOver) {
    room.clock.running = false;
  } else {
    room.clock.turnStartedAt = Date.now();
  }
}

// Tiempo restante "en vivo" para un color, sin mutar el estado — sirve
// tanto para el chequeo periódico de timeout como para incluir en el
// snapshot que se manda al cliente.
function remainingMs(room, color) {
  if (!room.clock) return null;
  if (room.clock.running && room.current === color) {
    return Math.max(0, room.clock[color] - (Date.now() - room.clock.turnStartedAt));
  }
  return room.clock[color];
}

module.exports = {
  TIME_CONTROLS,
  normalizeTimeControl,
  initClock,
  pauseClock,
  resumeClock,
  tickClockForMove,
  remainingMs,
};
