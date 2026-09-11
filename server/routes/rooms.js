const express = require('express');
const Room = require('../../models/Room');
const matchManager = require('../services/matchManager');

const router = express.Router();

// Home: listado de salas activas con resumen (jugadores, equipos, tableros libres/totales)
router.get('/', async (req, res) => {
  res.json(matchManager.getActiveRoomsSummary());
});

// Detalle de sala + estado en vivo de tableros
router.get('/:id', async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!room) return res.status(404).json({ error: 'Sala no encontrada' });
  const live = matchManager.getRoomBoardsSummary(room._id);
  res.json({ room, boards: live ? live.boards : [] });
});

module.exports = router;
