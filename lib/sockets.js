const { rooms, generateCode, makeRoom, startNewPartida, countSpectators, getActiveRooms } = require('./rooms');
const { doMove, opponent } = require('./go-rules');
const { pauseClock, resumeClock, tickClockForMove, remainingMs } = require('./clock');
const { persistNewPartida, persistMove, persistFinish, cancelEmptyPartida } = require('./persistence');

function publicState(room, code) {
  return {
    code,
    size: room.size,
    captureTarget: room.captureTarget,
    board: room.board,
    current: room.current,
    captures: room.captures,
    gameOver: room.gameOver,
    winner: room.winner,
    winReason: room.winReason,
    message: room.message,
    hasBlack: !!room.players.black,
    hasWhite: !!room.players.white,
    spectatorCount: countSpectators(room),
    moveCount: room.moveHistory.length,
    partidaId: room.partidaId ? room.partidaId.toString() : null,
    partidaNumber: room.partidaNumber,
    timeControlId: room.timeControlId,
    clock: room.clock ? {
      black: room.clock.black,
      white: room.clock.white,
      running: room.clock.running,
      turnStartedAt: room.clock.turnStartedAt,
    } : null,
  };
}

function registerSocketHandlers(io) {
  function broadcastActiveRooms() {
    io.emit('active_rooms', getActiveRooms());
  }

  function applyTimeout(room, code, colorOutOfTime) {
    if (room.gameOver) return;
    const winner = opponent(colorOutOfTime);
    room.gameOver = true;
    room.winner = winner;
    room.winReason = 'timeout';
    const loserLabel = colorOutOfTime === 'black' ? 'Negro' : 'Blanco';
    const winnerLabel = winner === 'black' ? 'Negro' : 'Blanco';
    room.message = `${loserLabel} se quedó sin tiempo — ¡${winnerLabel} gana!`;
    if (room.clock) {
      room.clock[colorOutOfTime] = 0;
      room.clock.running = false;
    }
    io.to(code).emit('state', publicState(room, code));
    persistFinish(room).catch(() => {});
    io.to(code).emit('history_updated');
    broadcastActiveRooms();
  }

  // Revisa todas las salas con reloj corriendo y aplica derrota por
  // tiempo si a alguien se le acabó, aunque no haya vuelto a mover.
  setInterval(() => {
    for (const [code, room] of rooms.entries()) {
      if (!room.clock || !room.clock.running || room.gameOver) continue;
      if (remainingMs(room, room.current) <= 0) applyTimeout(room, code, room.current);
    }
  }, 1000);

  io.on('connection', (socket) => {
    socket.emit('active_rooms', getActiveRooms());

    socket.on('create_room', async ({ size, captureTarget, timeControl } = {}) => {
      const code = generateCode();
      const room = makeRoom(code, Number(size), Number(captureTarget), timeControl);
      room.players.black = socket.id;
      room.sockets.set(socket.id, 'black');
      rooms.set(code, room);

      socket.join(code);
      socket.data.code = code;
      socket.data.role = 'black';

      room.partidaId = await persistNewPartida(room);

      socket.emit('joined', { color: 'black', state: publicState(room, code) });
      broadcastActiveRooms();
    });

    socket.on('join_room', ({ code } = {}) => {
      const normalized = String(code || '').trim().toUpperCase();
      const room = rooms.get(normalized);
      if (!room) {
        socket.emit('error_msg', 'Esa sala no existe o ya terminó. Revisá el código.');
        return;
      }

      let role;
      if (!room.players.black) { role = 'black'; room.players.black = socket.id; }
      else if (!room.players.white) { role = 'white'; room.players.white = socket.id; }
      else { role = 'spectator'; }

      room.sockets.set(socket.id, role);
      socket.join(normalized);
      socket.data.code = normalized;
      socket.data.role = role;

      if (room.players.black && room.players.white) room.wasFull = true;
      resumeClock(room);

      socket.emit('joined', { color: role, state: publicState(room, normalized) });
      socket.to(normalized).emit('state', publicState(room, normalized));
      broadcastActiveRooms();
    });

    socket.on('watch_room', ({ code } = {}) => {
      const normalized = String(code || '').trim().toUpperCase();
      const room = rooms.get(normalized);
      if (!room) {
        socket.emit('error_msg', 'Esa sala no existe o ya terminó. Revisá el código.');
        return;
      }

      room.sockets.set(socket.id, 'spectator');
      socket.join(normalized);
      socket.data.code = normalized;
      socket.data.role = 'spectator';

      socket.emit('joined', { color: 'spectator', state: publicState(room, normalized) });
      socket.to(normalized).emit('state', publicState(room, normalized));
      broadcastActiveRooms();
    });

    socket.on('move', ({ x, y } = {}) => {
      const code = socket.data.code;
      const room = rooms.get(code);
      if (!room) return;
      const role = socket.data.role;
      if (role !== 'black' && role !== 'white') return;
      if (room.gameOver) return;
      if (!room.players.black || !room.players.white) return;
      if (room.current !== role) return;

      if (room.clock && room.clock.running && remainingMs(room, role) <= 0) {
        applyTimeout(room, code, role);
        return;
      }

      const legal = doMove(room, role, Number(x), Number(y));
      if (legal) tickClockForMove(room, role);
      io.to(code).emit('state', publicState(room, code));

      if (legal) {
        persistMove(room).catch(() => {});
        if (room.gameOver) {
          persistFinish(room).catch(() => {});
          io.to(code).emit('history_updated');
          broadcastActiveRooms();
        }
      }
    });

    socket.on('resign', () => {
      const code = socket.data.code;
      const room = rooms.get(code);
      if (!room) return;
      const role = socket.data.role;
      if (role !== 'black' && role !== 'white') return;
      if (room.gameOver) return;

      room.gameOver = true;
      room.winner = opponent(role);
      room.winReason = 'resign';
      const loserLabel = role === 'black' ? 'Negro' : 'Blanco';
      const winnerLabel = room.winner === 'black' ? 'Negro' : 'Blanco';
      room.message = `${loserLabel} se rindió — ¡${winnerLabel} gana!`;
      pauseClock(room);

      io.to(code).emit('state', publicState(room, code));
      persistFinish(room).catch(() => {});
      io.to(code).emit('history_updated');
      broadcastActiveRooms();
    });

    socket.on('revancha', async () => {
      const code = socket.data.code;
      const room = rooms.get(code);
      if (!room) return;
      const role = socket.data.role;
      if (role !== 'black' && role !== 'white') return;
      if (!room.gameOver) return;
      if (!room.players.black || !room.players.white) return;

      // Se invierten los colores: quien jugó con Negro pasa a Blanco y viceversa.
      const previousBlackId = room.players.black;
      const previousWhiteId = room.players.white;
      room.players.black = previousWhiteId;
      room.players.white = previousBlackId;
      room.sockets.set(previousWhiteId, 'black');
      room.sockets.set(previousBlackId, 'white');

      const newBlackSocket = io.sockets.sockets.get(previousWhiteId);
      const newWhiteSocket = io.sockets.sockets.get(previousBlackId);
      if (newBlackSocket) {
        newBlackSocket.data.role = 'black';
        newBlackSocket.emit('color_changed', { color: 'black' });
      }
      if (newWhiteSocket) {
        newWhiteSocket.data.role = 'white';
        newWhiteSocket.emit('color_changed', { color: 'white' });
      }

      room.partidaNumber += 1;
      startNewPartida(room);
      room.partidaId = await persistNewPartida(room);
      resumeClock(room);

      io.to(code).emit('state', publicState(room, code));
      io.to(code).emit('history_updated');
      broadcastActiveRooms();
    });

    socket.on('disconnect', () => {
      const code = socket.data.code;
      const room = rooms.get(code);
      if (!room) return;

      room.sockets.delete(socket.id);
      if (room.players.black === socket.id) room.players.black = null;
      if (room.players.white === socket.id) room.players.white = null;

      pauseClock(room);

      const bothGone = !room.players.black && !room.players.white;

      // La sala nunca llegó a completarse (no apareció un segundo
      // jugador) y ahora se queda sin nadie: se cancela ya, sin esperar.
      if (bothGone && !room.wasFull) {
        rooms.delete(code);
        if (room.partidaId && room.moveHistory.length === 0) {
          cancelEmptyPartida(room.partidaId).catch(() => {});
        }
        broadcastActiveRooms();
        return;
      }

      io.to(code).emit('state', publicState(room, code));
      broadcastActiveRooms();

      if (bothGone) {
        setTimeout(() => {
          const r = rooms.get(code);
          if (r && !r.players.black && !r.players.white) rooms.delete(code);
          broadcastActiveRooms();
        }, 60000);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
