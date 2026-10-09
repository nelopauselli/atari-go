// `io` es global, inyectado por el script CDN de socket.io en index.html
const socket = io({ autoConnect: true });

// Se re-identifica en cada (re)conexión para figurar como usuario conectado.
let identified = null;
socket.on('connect', () => {
  if (identified) socket.emit('presence:identify', { player: identified });
});

function identify(player) {
  identified = player;
  if (socket.connected) socket.emit('presence:identify', { player });
}

function joinRoom(roomId, player) {
  return new Promise((resolve) => {
    socket.emit('room:join', { roomId, player }, (summary) => resolve(summary));
  });
}

function leaveRoom(roomId) {
  socket.emit('room:leave', { roomId });
}

function sitBoard(roomId, boardNumber, player) {
  return new Promise((resolve) => {
    socket.emit('board:sit', { roomId, boardNumber, player }, (result) => resolve(result));
  });
}

function leaveBoard(roomId, boardNumber) {
  socket.emit('board:leave', { roomId, boardNumber });
}

function move(roomId, boardNumber, playerId, x, y) {
  return new Promise((resolve) => {
    socket.emit('board:move', { roomId, boardNumber, playerId, x, y }, (result) => resolve(result));
  });
}

function resign(roomId, boardNumber, playerId) {
  return new Promise((resolve) => {
    socket.emit('board:resign', { roomId, boardNumber, playerId }, (result) => resolve(result));
  });
}

// Resuelve con { latency (ms), online } o null si el servidor no responde a tiempo.
function ping(timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve(null);
    const start = performance.now();
    socket.timeout(timeoutMs).emit('app:ping', (err, res) => {
      if (err) return resolve(null);
      resolve({ latency: Math.round(performance.now() - start), online: res.online });
    });
  });
}

function on(event, handler) {
  socket.on(event, handler);
  return () => socket.off(event, handler);
}

// Tras una reconexión (corte de red o reinicio del servidor) el socket es nuevo y ya no
// está en el canal de la sala: quien escuche esto tiene que volver a unirse.
function onReconnect(handler) {
  socket.io.on('reconnect', handler);
  return () => socket.io.off('reconnect', handler);
}

export const socketService = {
  raw: socket,
  identify,
  joinRoom,
  leaveRoom,
  sitBoard,
  leaveBoard,
  move,
  resign,
  ping,
  on,
  onReconnect,
};
