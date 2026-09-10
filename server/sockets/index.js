'use strict';

const dojoManager = require('../managers/dojoManager');
const roomManager = require('../managers/roomManager');
const matchManager = require('../managers/matchManager');

const LOBBY_ROOM = 'lobby';

function matchRoomName(matchId) {
  return `match:${matchId}`;
}
function roomRoomName(roomId) {
  return `room:${roomId}`;
}

async function buildLobbyPayload() {
  const rooms = await roomManager.listActiveRooms();
  return rooms.map((room) => {
    const stats = roomManager.getRoomStats(room._id);
    const freeBoards = room.boards.filter((b) => b.status === 'free').length;
    return {
      _id: room._id,
      name: room.name,
      boardSize: room.boardSize,
      stonesToCapture: room.stonesToCapture,
      clockType: room.clockType,
      allowSameDojo: room.allowSameDojo,
      totalBoards: room.boards.length,
      freeBoards,
      connectedPlayers: stats.connectedPlayers,
      dojosCount: stats.dojosCount,
    };
  });
}

function registerSocketHandlers(io) {
  // Relay de eventos generados por matchManager hacia los sockets de esa partida.
  matchManager.setBroadcastHandler((matchId, event, payload) => {
    io.to(matchRoomName(matchId)).emit(event, payload);
  });

  async function broadcastLobby() {
    const payload = await buildLobbyPayload();
    io.to(LOBBY_ROOM).emit('lobby:update', payload);
  }

  async function broadcastRoomState(roomId) {
    const room = await roomManager.getRoomLean(roomId);
    if (!room) return;
    const stats = roomManager.getRoomStats(roomId);
    io.to(roomRoomName(roomId)).emit('room:state', {
      room,
      presence: roomManager.getRoomPresenceList(roomId),
      stats,
    });
  }

  io.on('connection', (socket) => {
    socket.data.player = null; // {nickname, dojoId, dojoName}
    socket.data.currentRoomId = null;
    socket.data.currentMatchId = null;

    // ---------- Registro de jugador (pantalla de acceso) ----------
    socket.on('player:register', async ({ nickname, dojoId }, ack) => {
      try {
        if (!nickname || !nickname.trim()) {
          return ack?.({ ok: false, error: 'El apodo es obligatorio' });
        }
        const dojo = dojoManager.getDojo(dojoId);
        if (!dojo) return ack?.({ ok: false, error: 'Debés seleccionar un dojo válido' });

        socket.data.player = {
          nickname: nickname.trim(),
          dojoId: String(dojo._id),
          dojoName: dojo.name,
        };

        ack?.({ ok: true, player: socket.data.player });
      } catch (err) {
        console.error('[sockets] player:register error:', err);
        ack?.({ ok: false, error: 'Error interno al registrar jugador' });
      }
    });

    // ---------- Lobby ----------
    socket.on('lobby:subscribe', async (_payload, ack) => {
      socket.join(LOBBY_ROOM);
      const payload = await buildLobbyPayload();
      ack?.({ ok: true, rooms: payload });
    });

    socket.on('lobby:unsubscribe', () => {
      socket.leave(LOBBY_ROOM);
    });

    // ---------- Sala ----------
    socket.on('room:join', async ({ roomId }, ack) => {
      try {
        if (!socket.data.player) return ack?.({ ok: false, error: 'Debés registrarte primero' });
        const room = await roomManager.getRoomLean(roomId);
        if (!room) return ack?.({ ok: false, error: 'Sala no encontrada' });

        socket.join(roomRoomName(roomId));
        socket.data.currentRoomId = roomId;
        roomManager.joinRoomPresence(roomId, socket.id, socket.data.player);

        ack?.({
          ok: true,
          room,
          presence: roomManager.getRoomPresenceList(roomId),
          stats: roomManager.getRoomStats(roomId),
        });

        await broadcastRoomState(roomId);
        await broadcastLobby();
      } catch (err) {
        console.error('[sockets] room:join error:', err);
        ack?.({ ok: false, error: 'Error al ingresar a la sala' });
      }
    });

    socket.on('room:leave', async ({ roomId }) => {
      socket.leave(roomRoomName(roomId));
      roomManager.leaveRoomPresence(roomId, socket.id);
      if (socket.data.currentRoomId === roomId) socket.data.currentRoomId = null;
      await broadcastRoomState(roomId);
      await broadcastLobby();
    });

    // ---------- Tablero: sentarse a jugar ----------
    // Único punto de entrada para crear/actualizar partidas: todo pasa por
    // matchManager, que mantiene una sola instancia en memoria por partida.
    socket.on('board:sit', async ({ roomId, boardNumber }, ack) => {
      try {
        if (!socket.data.player) return ack?.({ ok: false, error: 'Debés registrarte primero' });

        const room = await roomManager.getRoomDoc(roomId);
        if (!room) return ack?.({ ok: false, error: 'Sala no encontrada' });

        const slot = room.boards.find((b) => b.number === Number(boardNumber));
        if (!slot) return ack?.({ ok: false, error: 'Tablero inexistente' });

        const state = await matchManager.getOrCreateWaitingMatch(room, Number(boardNumber));

        const result = await matchManager.sitPlayer(state, {
          socketId: socket.id,
          ...socket.data.player,
        });

        if (!result.ok) return ack?.({ ok: false, error: result.reason });

        socket.join(matchRoomName(state.matchId));
        socket.data.currentMatchId = state.matchId;

        ack?.({ ok: true, match: matchManager.serialize(state) });

        io.to(matchRoomName(state.matchId)).emit('match:update', matchManager.serialize(state));
        await broadcastRoomState(roomId);
        await broadcastLobby();
      } catch (err) {
        console.error('[sockets] board:sit error:', err);
        ack?.({ ok: false, error: 'Error al sentarse en el tablero' });
      }
    });

    // ---------- Tablero: observar ----------
    socket.on('board:spectate', async ({ roomId, boardNumber }, ack) => {
      const matchId = matchManager.getMatchIdForBoard(roomId, Number(boardNumber));
      if (!matchId) return ack?.({ ok: false, error: 'No hay partida activa en ese tablero' });

      const state = matchManager.getState(matchId);
      if (!state) return ack?.({ ok: false, error: 'Partida no encontrada' });

      socket.join(matchRoomName(matchId));
      socket.data.currentMatchId = matchId;
      matchManager.addSpectator(state, socket.id, socket.data.player?.nickname || 'anónimo');

      ack?.({ ok: true, match: matchManager.serialize(state) });
      io.to(matchRoomName(matchId)).emit('match:update', matchManager.serialize(state));
    });

    // ---------- Partida: rejoin tras reconexión ----------
    socket.on('match:rejoin', ({ matchId }, ack) => {
      const state = matchManager.getState(matchId);
      if (!state) return ack?.({ ok: false, error: 'La partida ya no está disponible' });

      socket.join(matchRoomName(matchId));
      socket.data.currentMatchId = matchId;

      if (socket.data.player) {
        matchManager.rebindPlayerSocket(state, socket.data.player.nickname, socket.id);
      }

      ack?.({ ok: true, match: matchManager.serialize(state) });
    });

    // ---------- Partida: jugar ----------
    socket.on('match:play', async ({ matchId, x, y }, ack) => {
      const state = matchManager.getState(matchId);
      if (!state) return ack?.({ ok: false, error: 'Partida no encontrada' });

      const result = await matchManager.playMove(state, socket.id, Number(x), Number(y));
      ack?.(result);

      if (result.finished) await broadcastLobby();
    });

    socket.on('match:pass', async ({ matchId }, ack) => {
      const state = matchManager.getState(matchId);
      if (!state) return ack?.({ ok: false, error: 'Partida no encontrada' });

      const result = await matchManager.passTurn(state, socket.id);
      ack?.(result);

      if (result.finished) await broadcastLobby();
    });

    socket.on('match:resign', async ({ matchId }, ack) => {
      const state = matchManager.getState(matchId);
      if (!state) return ack?.({ ok: false, error: 'Partida no encontrada' });

      const result = await matchManager.resign(state, socket.id);
      ack?.(result);
      await broadcastLobby();
    });

    socket.on('match:leave', ({ matchId }) => {
      socket.leave(matchRoomName(matchId));
      const state = matchManager.getState(matchId);
      if (state) matchManager.removeSpectator(state, socket.id);
      if (socket.data.currentMatchId === matchId) socket.data.currentMatchId = null;
    });

    // ---------- Desconexión ----------
    socket.on('disconnect', async () => {
      if (socket.data.currentMatchId) {
        const state = matchManager.getState(socket.data.currentMatchId);
        if (state) {
          await matchManager.handlePlayerDisconnect(state, socket.id);
        }
      }
      if (socket.data.currentRoomId) {
        roomManager.leaveRoomPresence(socket.data.currentRoomId, socket.id);
        await broadcastRoomState(socket.data.currentRoomId);
      }
      roomManager.leaveAllRoomsPresence(socket.id);
      await broadcastLobby();
    });
  });
}

module.exports = { registerSocketHandlers };
