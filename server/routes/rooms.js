const express = require('express');
const Room = require('../../models/Room');
const matchManager = require('../services/matchManager');

const router = express.Router();

// Home: listado de salas activas con resumen (jugadores, equipos, tableros libres/totales)
router.get('/', async (req, res) => {
  res.json(matchManager.getActiveRoomsSummary());
});

// Creación de sala (regla B)
router.post('/', async (req, res) => {
  try {
    const { name, type, boardCount, boardSize, stonesToWin, clockType } = req.body;

    if (!name || !type || !boardCount || !boardSize || !stonesToWin || !clockType) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    if (!['torneo', 'amistosas'].includes(type)) {
      return res.status(400).json({ error: 'Tipo de sala inválido' });
    }
    if (![5, 7, 9, 13].includes(Number(boardSize))) {
      return res.status(400).json({ error: 'Tamaño de tablero inválido' });
    }
    if (!matchManager.CLOCK_PRESETS[clockType]) {
      return res.status(400).json({ error: 'Tipo de reloj inválido' });
    }

    const room = await Room.create({
      name, type, boardCount, boardSize, stonesToWin, clockType,
    });
    matchManager.registerRoom(room);
    res.status(201).json(room);
  } catch (err) {
    console.error('[routes/rooms] error creando sala', err);
    res.status(500).json({ error: 'Error al crear la sala' });
  }
});

// Detalle de sala + estado en vivo de tableros
router.get('/:id', async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!room) return res.status(404).json({ error: 'Sala no encontrada' });
  const live = matchManager.getRoomBoardsSummary(room._id);
  res.json({ room, boards: live ? live.boards : [] });
});

module.exports = router;
