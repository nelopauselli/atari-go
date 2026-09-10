'use strict';

const { Router } = require('express');
const Room = require('../models/Room');
const Match = require('../models/Match');
const dojoManager = require('../managers/dojoManager');
const roomManager = require('../managers/roomManager');

const router = Router();

router.get('/dojos', (req, res) => {
  res.json(dojoManager.listDojos());
});

router.get('/rooms', async (req, res) => {
  const rooms = await roomManager.listActiveRooms();
  const summary = rooms.map((room) => {
    const stats = roomManager.getRoomStats(room._id);
    const freeBoards = room.boards.filter((b) => b.status === 'free').length;
    return {
      _id: room._id,
      name: room.name,
      boardsCount: room.boardsCount,
      freeBoards,
      totalBoards: room.boards.length,
      boardSize: room.boardSize,
      stonesToCapture: room.stonesToCapture,
      clockType: room.clockType,
      allowSameDojo: room.allowSameDojo,
      connectedPlayers: stats.connectedPlayers,
      dojosCount: stats.dojosCount,
      createdAt: room.createdAt,
    };
  });
  res.json(summary);
});

router.post('/rooms', async (req, res) => {
  try {
    const { name, boardsCount, stonesToCapture, boardSize, clockType, allowSameDojo } = req.body;

    if (!name || !boardsCount || !stonesToCapture || !boardSize || !clockType) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    if (!Room.BOARD_SIZES.includes(Number(boardSize))) {
      return res.status(400).json({ error: 'Tamaño de tablero inválido' });
    }
    if (!Room.CLOCK_TYPES.includes(clockType)) {
      return res.status(400).json({ error: 'Tipo de reloj inválido' });
    }

    const room = await roomManager.createRoom({
      name,
      boardsCount: Number(boardsCount),
      stonesToCapture: Number(stonesToCapture),
      boardSize: Number(boardSize),
      clockType,
      allowSameDojo: Boolean(allowSameDojo),
    });

    res.status(201).json(room);
  } catch (err) {
    console.error('[api] error creando sala:', err);
    res.status(500).json({ error: 'Error al crear la sala' });
  }
});

router.get('/rooms/:id', async (req, res) => {
  const room = await roomManager.getRoomLean(req.params.id);
  if (!room) return res.status(404).json({ error: 'Sala no encontrada' });
  res.json(room);
});

router.get('/history', async (req, res) => {
  const matches = await Match.find({ status: 'finished' })
    .sort({ finishedAt: -1 })
    .limit(50)
    .lean();

  const history = matches.map((m) => ({
    _id: m._id,
    roomName: m.roomName,
    boardNumber: m.boardNumber,
    players: m.players.map((p) => ({ nickname: p.nickname, dojoName: p.dojoName, color: p.color })),
    winnerNickname: m.winnerNickname,
    result: m.result,
    finishedAt: m.finishedAt,
  }));

  res.json(history);
});

module.exports = router;
