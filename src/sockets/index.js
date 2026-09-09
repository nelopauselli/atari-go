'use strict';

const Room = require('../models/Room');
const matchManager = require('../game/matchManager');

// roomId -> Set<socketId> de sockets presentes en la sala (jugando o mirando el lobby de tableros)
const roomPresence = new Map();

function getConnectedCount(roomId) {
  return roomPresence.get(roomId)?.size || 0;
}

function addPresence(roomId, socketId) {
  if (!roomPresence.has(roomId)) roomPresence.set(roomId, new Set());
  roomPresence.get(roomId).add(socketId);
}

function removePresence(roomId, socketId) {
  const set = roomPresence.get(roomId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) roomPresence.delete(roomId);
}

function registerSocketHandlers(io) {
  matchManager.init(io);

  io.on('connection', (socket) => {
    // Estado propio de la conexión, para poder limpiar prolijamente al desconectar.
    socket.data.roomId = null;
    socket.data.matchId = null;
    socket.data.role = null; // 'player' | 'spectator'
    socket.data.playerName = null;

    // --- Sala: entrar/salir del lobby de una sala (ver sus tableros) ---
    socket.on('room:enter', async ({ roomId }, ack) => {
      try {
        const room = await Room.findById(roomId).lean();
        if (!room) return ack?.({ ok: false, error: 'sala_no_encontrada' });

        leaveCurrentRoom(socket);
        socket.join(`sala:${roomId}`);
        socket.data.roomId = roomId;
        addPresence(roomId, socket.id);

        io.emit('lobby:update');
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: 'error_interno' });
      }
    });

    socket.on('room:leave', () => {
      leaveCurrentRoom(socket);
      io.emit('lobby:update');
    });

    // --- Tablero: crear uno nuevo dentro de la sala actual ---
    socket.on('board:create', async (_payload, ack) => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) return ack?.({ ok: false, error: 'no_estas_en_una_sala' });

        const room = await Room.findById(roomId);
        if (!room) return ack?.({ ok: false, error: 'sala_no_encontrada' });

        const number = room.nextBoardNumber;
        room.boards.push({ number, status: 'libre', currentMatchId: null });
        room.nextBoardNumber += 1;
        await room.save();

        io.to(`sala:${roomId}`).emit('room:boards', serializeBoards(room));
        ack?.({ ok: true, number });
      } catch (err) {
        ack?.({ ok: false, error: 'error_interno' });
      }
    });

    // --- Tablero: sentarse a jugar (toma el primer color libre) ---
    socket.on('board:sit', async ({ boardNumber, name }, ack) => {
      try {
        const roomId = socket.data.roomId;
        if (!roomId) return ack?.({ ok: false, error: 'no_estas_en_una_sala' });
        const playerName = (name || '').trim().slice(0, 30) || 'Jugador';

        const room = await Room.findById(roomId);
        if (!room) return ack?.({ ok: false, error: 'sala_no_encontrada' });
        const slot = room.boards.find((b) => b.number === Number(boardNumber));
        if (!slot) return ack?.({ ok: false, error: 'tablero_no_encontrado' });

        if (slot.status === 'jugando') {
          return ack?.({ ok: false, error: 'tablero_ocupado' });
        }

        // Si ya hay una partida "esperando" para este slot (un jugador ya
        // sentado esperando rival), la completamos vía matchManager; si no,
        // creamos una nueva partida en estado esperando con este jugador
        // como negro. Todo pasa por matchManager para que quede una única
        // instancia en memoria por partida (ver comentario en matchManager.js).
        let matchDoc = slot.currentMatchId
          ? await matchManager.getActiveMatch(slot.currentMatchId.toString())
          : null;

        if (!matchDoc || matchDoc.status !== 'esperando') {
          matchDoc = await matchManager.createWaitingMatch({
            room,
            boardNumber: slot.number,
            blackPlayer: { socketId: socket.id, name: playerName },
          });
          slot.currentMatchId = matchDoc._id;
          slot.status = 'libre'; // sigue libre para el rival hasta completar los 2 asientos
          await room.save();

          joinMatchRoom(socket, roomId, matchDoc._id.toString(), 'player', playerName);
          io.to(`sala:${roomId}`).emit('room:boards', serializeBoards(room));
          io.to(`match:${matchDoc._id}`).emit('match:waiting', {
            matchId: matchDoc._id.toString(),
            players: matchDoc.players,
          });
          return ack?.({ ok: true, matchId: matchDoc._id.toString(), color: 'black', waiting: true });
        }

        // Ya había alguien esperando: este jugador entra como blanco y arranca la partida.
        matchDoc = await matchManager.seatSecondPlayer(matchDoc._id.toString(), {
          socketId: socket.id,
          name: playerName,
        });
        if (!matchDoc) return ack?.({ ok: false, error: 'tablero_ocupado' });

        slot.status = 'jugando';
        await room.save();

        joinMatchRoom(socket, roomId, matchDoc._id.toString(), 'player', playerName);
        io.to(`sala:${roomId}`).emit('room:boards', serializeBoards(room));
        io.emit('lobby:update');
        io.to(`match:${matchDoc._id}`).emit('match:started', matchManager.toPublicMatch(matchDoc));
        ack?.({ ok: true, matchId: matchDoc._id.toString(), color: 'white', waiting: false });
      } catch (err) {
        ack?.({ ok: false, error: 'error_interno' });
      }
    });

    // --- Tablero: unirse como espectador a una partida en curso ---
    socket.on('board:spectate', async ({ matchId, name }, ack) => {
      try {
        const matchDoc = await matchManager.getActiveMatch(matchId);
        if (!matchDoc) return ack?.({ ok: false, error: 'partida_no_encontrada' });

        joinMatchRoom(socket, socket.data.roomId, matchId, 'spectator', (name || 'Espectador').trim().slice(0, 30));
        ack?.({ ok: true, match: matchManager.toPublicMatch(matchDoc) });
      } catch (err) {
        ack?.({ ok: false, error: 'error_interno' });
      }
    });

    // --- Reconexión a una partida propia (ej. tras recargar la página) ---
    socket.on('match:rejoin', async ({ matchId, color }, ack) => {
      try {
        const matchDoc = await matchManager.getActiveMatch(matchId);
        if (!matchDoc) return ack?.({ ok: false, error: 'partida_no_encontrada' });
        if (matchDoc.status === 'finalizada') return ack?.({ ok: false, error: 'partida_finalizada' });

        const key = color === 'white' ? 'white' : 'black';
        if (!matchDoc.players[key]) return ack?.({ ok: false, error: 'asiento_invalido' });

        matchDoc.players[key].socketId = socket.id;
        await matchDoc.save();

        joinMatchRoom(socket, socket.data.roomId, matchId, 'player', matchDoc.players[key].name);
        ack?.({ ok: true, match: matchManager.toPublicMatch(matchDoc) });
      } catch (err) {
        ack?.({ ok: false, error: 'error_interno' });
      }
    });

    // --- Jugadas ---
    socket.on('match:move', async ({ matchId, row, col }, ack) => {
      const result = await matchManager.playMove(matchId, socket.id, row, col);
      ack?.(result.ok ? { ok: true } : { ok: false, error: result.error });
    });

    socket.on('match:pass', async ({ matchId }, ack) => {
      const result = await matchManager.pass(matchId, socket.id);
      ack?.(result.ok ? { ok: true } : { ok: false, error: result.error });
    });

    socket.on('match:resign', async ({ matchId }, ack) => {
      const result = await matchManager.resign(matchId, socket.id);
      ack?.(result.ok ? { ok: true } : { ok: false, error: result.error });
    });

    socket.on('disconnect', () => {
      leaveCurrentMatch(socket);
      leaveCurrentRoom(socket);
      io.emit('lobby:update');
    });
  });

  function joinMatchRoom(socket, roomId, matchId, role, name) {
    leaveCurrentMatch(socket);
    socket.join(`match:${matchId}`);
    socket.data.matchId = matchId;
    socket.data.role = role;
    socket.data.playerName = name;
    if (role === 'spectator') {
      bumpSpectatorCount(matchId, 1);
    }
  }

  function leaveCurrentMatch(socket) {
    const matchId = socket.data.matchId;
    if (!matchId) return;
    socket.leave(`match:${matchId}`);
    if (socket.data.role === 'spectator') {
      bumpSpectatorCount(matchId, -1);
    }
    socket.data.matchId = null;
    socket.data.role = null;
  }

  async function bumpSpectatorCount(matchId, delta) {
    const matchDoc = await matchManager.getActiveMatch(matchId);
    if (!matchDoc) return;
    matchDoc.spectatorCount = Math.max(0, (matchDoc.spectatorCount || 0) + delta);
    await matchDoc.save();
    io.to(`match:${matchId}`).emit('match:spectators', {
      matchId,
      spectatorCount: matchDoc.spectatorCount,
    });
  }

  function leaveCurrentRoom(socket) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.leave(`sala:${roomId}`);
    removePresence(roomId, socket.id);
    socket.data.roomId = null;
  }

  function serializeBoards(roomDoc) {
    return roomDoc.boards.map((b) => ({
      number: b.number,
      status: b.status,
      matchId: b.currentMatchId ? b.currentMatchId.toString() : null,
    }));
  }
}

module.exports = { registerSocketHandlers, getConnectedCount };
