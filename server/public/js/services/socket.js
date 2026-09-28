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

function leaveSpectator(roomId, boardNumber) {
  socket.emit('board:leaveSpectator', { roomId, boardNumber });
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

function on(event, handler) {
  socket.on(event, handler);
  return () => socket.off(event, handler);
}

export const socketService = {
  raw: socket,
  identify,
  joinRoom,
  leaveRoom,
  sitBoard,
  leaveSpectator,
  move,
  resign,
  on,
};
