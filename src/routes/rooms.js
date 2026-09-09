'use strict';

const express = require('express');
const Room = require('../models/Room');
const Match = require('../models/Match');
const { isValidClockPreset, CLOCK_PRESETS } = require('../game/clock');

const router = express.Router();

/** Inyectado desde server.js: función (roomId) => cantidad de sockets conectados a esa sala. */
let getConnectedCount = () => 0;
function setConnectedCountFn(fn) {
  getConnectedCount = fn;
}

router.get('/clock-presets', (req, res) => {
  res.json(
    Object.entries(CLOCK_PRESETS).map(([key, preset]) => ({
      key,
      label: preset.label,
      type: preset.type,
    }))
  );
});

// GET /api/rooms  -> salas activas con cantidad de jugadores conectados
router.get('/', async (req, res) => {
  const rooms = await Room.find().sort({ createdAt: -1 }).limit(100).lean();
  const enriched = rooms.map((room) => ({
    id: room._id.toString(),
    name: room.name,
    boardSize: room.boardSize,
    capturesToWin: room.capturesToWin,
    clockPresetKey: room.clockPresetKey,
    boardsTotal: room.boards.length,
    boardsEnJuego: room.boards.filter((b) => b.status === 'jugando').length,
    connectedCount: getConnectedCount(room._id.toString()),
    createdAt: room.createdAt,
  }));
  res.json(enriched);
});

// POST /api/rooms -> crear sala
router.post('/', async (req, res) => {
  const { name, boardSize, capturesToWin, clockPresetKey, createdBy } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'nombre_requerido' });
  }
  if (![5, 7, 9, 13].includes(Number(boardSize))) {
    return res.status(400).json({ error: 'tamano_tablero_invalido' });
  }
  const captures = Number(capturesToWin);
  if (!Number.isInteger(captures) || captures < 1 || captures > 60) {
    return res.status(400).json({ error: 'capturas_invalidas' });
  }
  if (!isValidClockPreset(clockPresetKey)) {
    return res.status(400).json({ error: 'reloj_invalido' });
  }

  const room = await Room.create({
    name: name.trim().slice(0, 60),
    boardSize: Number(boardSize),
    capturesToWin: captures,
    clockPresetKey,
    createdBy: createdBy ? String(createdBy).trim().slice(0, 30) : null,
    boards: [{ number: 1, status: 'libre', currentMatchId: null }],
    nextBoardNumber: 2,
  });

  res.status(201).json({ id: room._id.toString() });
});

// GET /api/rooms/:id -> detalle de sala + estado de sus tableros
router.get('/:id', async (req, res) => {
  const room = await Room.findById(req.params.id).lean();
  if (!room) return res.status(404).json({ error: 'sala_no_encontrada' });

  const matchIds = room.boards.map((b) => b.currentMatchId).filter(Boolean);
  const matches = matchIds.length
    ? await Match.find({ _id: { $in: matchIds } })
        .select('_id players status boardNumber captures turnColor')
        .lean()
    : [];
  const matchById = new Map(matches.map((m) => [m._id.toString(), m]));

  res.json({
    id: room._id.toString(),
    name: room.name,
    boardSize: room.boardSize,
    capturesToWin: room.capturesToWin,
    clockPresetKey: room.clockPresetKey,
    connectedCount: getConnectedCount(room._id.toString()),
    boards: room.boards.map((b) => ({
      number: b.number,
      status: b.status,
      match: b.currentMatchId ? matchById.get(b.currentMatchId.toString()) || null : null,
    })),
  });
});

module.exports = { router, setConnectedCountFn };
