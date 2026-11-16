const mongoose = require('mongoose');
const matchManager = require('../services/matchManager');
const presence = require('../services/presence');
const Player = require('../models/Player');
const log = require('../services/logger');

// Cada cuánto se escribe el resumen del estado (conexiones, partidas, memoria).
const STATS_INTERVAL_MS = Number(process.env.STATS_INTERVAL_MS) || 60 * 1000;

function roomChannel(roomId) {
  return `room:${roomId}`;
}

/**
 * Resumen periódico del estado. Con el servidor ocioso (sin conexiones ni partidas) se
 * escribe una sola vez y se calla hasta que vuelva a haber actividad.
 */
function startStatsReport(io) {
  let wasIdle = false;
  const timer = setInterval(() => {
    const stats = matchManager.getStats();
    const sockets = io.engine.clientsCount;
    const idle = !sockets && !stats.playing && !stats.waiting;
    if (idle && wasIdle) return;
    wasIdle = idle;
    const mem = process.memoryUsage();
    log.info('server.stats', {
      sockets,
      playersOnline: presence.listOnline().length,
      ...stats,
      rssMB: Math.round(mem.rss / 1048576),
      heapMB: Math.round(mem.heapUsed / 1048576),
    });
  }, STATS_INTERVAL_MS);
  timer.unref();
}

function initSockets(io) {
  // Registro explícito del handler de broadcast usado por matchManager
  matchManager.setBroadcastHandler((event, roomId, payload) => {
    io.to(roomChannel(roomId)).emit(event, payload);
  });
  startStatsReport(io);

  io.on('connection', (socket) => {
    socket.data.playerId = null;
    socket.data.roomId = null;
    socket.data.identity = null;
    log.debug('socket.connect', { socketId: socket.id, sockets: io.engine.clientsCount });

    socket.on('presence:identify', ({ player } = {}) => {
      presence.identify(socket.id, player);
      // El cliente se identifica en cada (re)conexión: equivale a "jugador conectado".
      socket.data.identity = player && player.id ? { playerId: String(player.id), nickname: player.nickname } : null;
      if (socket.data.identity) log.info('player.identify', { ...socket.data.identity, socketId: socket.id });
      // Un jugador con la sesión guardada no pasa por el login: su última conexión se registra acá.
      if (player && mongoose.isValidObjectId(player.id)) {
        Player.updateOne({ _id: player.id }, { lastSeenAt: new Date() })
          .catch((err) => console.error('[sockets] error al actualizar lastSeenAt', err));
      }
    });

    // El cliente mide la latencia con el round-trip de este ack.
    socket.on('app:ping', (ack) => {
      if (typeof ack === 'function') ack({ online: presence.listOnline().length });
    });

    // En salas torneo, al entrar se le asigna automáticamente un equipo al jugador (myTeam).
    // teamAssigned indica que el equipo se le asignó en este ingreso (primera vez o porque
    // le quitaron el anterior), para que el cliente le avise. Los invitados no tienen id: no se les asigna equipo.
    socket.on('room:join', async ({ roomId, player }, ack) => {
      socket.join(roomChannel(roomId));
      socket.data.roomId = roomId;
      socket.data.playerId = matchManager.isGuest(player) ? null : player.id;
      const previousTeamId = matchManager.getAssignedTeamId(roomId, socket.data.playerId);
      const myTeam = await matchManager.assignTeamOnJoin(roomId, socket.data.playerId);
      const teamAssigned = !!myTeam && myTeam._id !== previousTeamId;
      const summary = matchManager.getRoomBoardsSummary(roomId);
      if (summary) {
        log.info('room.join', {
          roomId, room: summary.config.name, type: summary.config.type,
          playerId: socket.data.playerId, nickname: player && player.nickname, guest: !socket.data.playerId,
          team: myTeam ? myTeam.name : undefined, teamAssigned: myTeam ? teamAssigned : undefined,
        });
      } else {
        log.warn('room.join_failed', { roomId, playerId: socket.data.playerId, error: 'Sala inexistente' });
      }
      if (typeof ack === 'function') ack(summary ? { ...summary, myTeam, teamAssigned } : { error: 'Sala inexistente' });
    });

    socket.on('room:leave', ({ roomId }) => {
      log.debug('room.leave', { roomId, playerId: socket.data.playerId, socketId: socket.id });
      socket.leave(roomChannel(roomId));
      if (socket.data.roomId === roomId) socket.data.roomId = null;
    });

    // mode: 'play' ("Sentarse a jugar") u 'watch' ("Observar"); sin mode el backend decide el rol
    // (reconexión). El equipo (salas torneo) es el asignado al entrar a la sala; el cliente no lo elige.
    socket.on('board:sit', ({ roomId, boardNumber, player, mode }, ack) => {
      socket.data.playerId = matchManager.isGuest(player) ? null : player.id;
      const result = matchManager.handleSit({
        roomId, boardNumber, player, socketId: socket.id, mode,
      });
      if (typeof ack === 'function') ack(result);
    });

    socket.on('board:leave', ({ roomId, boardNumber }) => {
      matchManager.handleLeaveBoard({ roomId, boardNumber, socketId: socket.id, playerId: socket.data.playerId });
    });

    socket.on('board:move', ({ roomId, boardNumber, playerId, x, y }, ack) => {
      const result = matchManager.handleMove({ roomId, boardNumber, playerId, x, y });
      if (typeof ack === 'function') ack(result);
    });

    socket.on('board:resign', ({ roomId, boardNumber, playerId }, ack) => {
      const result = matchManager.handleResign({ roomId, boardNumber, playerId });
      if (typeof ack === 'function') ack(result);
    });

    socket.on('disconnect', (reason) => {
      // reason distingue cierre normal ("client namespace disconnect", "transport close")
      // de problemas de red ("ping timeout"). Los sockets sin identificar van como debug.
      const identity = socket.data.identity;
      log[identity ? 'info' : 'debug']('socket.disconnect', {
        ...identity, socketId: socket.id, roomId: socket.data.roomId, reason, sockets: io.engine.clientsCount,
      });
      presence.remove(socket.id);
      matchManager.handleDisconnect({ socketId: socket.id, playerId: socket.data.playerId });
    });
  });
}

module.exports = { initSockets };
