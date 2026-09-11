const matchManager = require('../services/matchManager');

function roomChannel(roomId) {
  return `room:${roomId}`;
}

function initSockets(io) {
  // Registro explícito del handler de broadcast usado por matchManager
  matchManager.setBroadcastHandler((event, roomId, payload) => {
    io.to(roomChannel(roomId)).emit(event, payload);
  });

  io.on('connection', (socket) => {
    socket.data.playerId = null;
    socket.data.roomId = null;

    socket.on('room:join', ({ roomId, player }, ack) => {
      socket.join(roomChannel(roomId));
      socket.data.roomId = roomId;
      socket.data.playerId = player ? player.id : null;
      const summary = matchManager.getRoomBoardsSummary(roomId);
      if (typeof ack === 'function') ack(summary || { error: 'Sala inexistente' });
    });

    socket.on('room:leave', ({ roomId }) => {
      socket.leave(roomChannel(roomId));
      if (socket.data.roomId === roomId) socket.data.roomId = null;
    });

    // El frontend SIEMPRE emite esto al hacer click en un tablero,
    // sin importar su estado; el backend decide el rol (jugador/espectador).
    socket.on('board:sit', ({ roomId, boardNumber, player }, ack) => {
      socket.data.playerId = player.id;
      const result = matchManager.handleSit({ roomId, boardNumber, player, socketId: socket.id });
      if (typeof ack === 'function') ack(result);
    });

    socket.on('board:leaveSpectator', ({ roomId, boardNumber }) => {
      matchManager.handleLeaveSpectator({ roomId, boardNumber, socketId: socket.id });
    });

    socket.on('board:move', ({ roomId, boardNumber, playerId, x, y, pass }, ack) => {
      const result = matchManager.handleMove({ roomId, boardNumber, playerId, x, y, pass });
      if (typeof ack === 'function') ack(result);
    });

    socket.on('board:resign', ({ roomId, boardNumber, playerId }, ack) => {
      const result = matchManager.handleResign({ roomId, boardNumber, playerId });
      if (typeof ack === 'function') ack(result);
    });

    socket.on('disconnect', () => {
      matchManager.handleDisconnect({ socketId: socket.id, playerId: socket.data.playerId });
    });
  });
}

module.exports = { initSockets };
