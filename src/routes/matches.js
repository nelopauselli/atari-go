'use strict';

const express = require('express');
const Match = require('../models/Match');

const router = express.Router();

const LIST_FIELDS =
  'roomName boardNumber boardSize capturesToWin clockPresetKey players status captures turnColor winnerColor winReason createdAt startedAt endedAt spectatorCount room';

// GET /api/matches/active -> partidas en curso, para la home
router.get('/active', async (req, res) => {
  const matches = await Match.find({ status: 'en_curso' })
    .select(LIST_FIELDS)
    .sort({ startedAt: -1 })
    .limit(100)
    .lean();
  res.json(matches.map(serializeListItem));
});

// GET /api/matches/history -> partidas finalizadas, paginado simple
router.get('/history', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Number(req.query.pageSize) || 20);

  const [matches, total] = await Promise.all([
    Match.find({ status: 'finalizada' })
      .select(LIST_FIELDS)
      .sort({ endedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    Match.countDocuments({ status: 'finalizada' }),
  ]);

  res.json({
    page,
    pageSize,
    total,
    items: matches.map(serializeListItem),
  });
});

// GET /api/matches/:id -> detalle completo (para entrar/reconectar a una partida)
router.get('/:id', async (req, res) => {
  const match = await Match.findById(req.params.id).lean();
  if (!match) return res.status(404).json({ error: 'partida_no_encontrada' });
  res.json({ ...serializeListItem(match), board: match.board, moves: match.moves, clock: match.clock });
});

function serializeListItem(m) {
  return {
    id: m._id.toString(),
    roomId: m.room ? m.room.toString() : null,
    roomName: m.roomName,
    boardNumber: m.boardNumber,
    boardSize: m.boardSize,
    capturesToWin: m.capturesToWin,
    clockPresetKey: m.clockPresetKey,
    players: m.players,
    status: m.status,
    captures: m.captures,
    turnColor: m.turnColor,
    winnerColor: m.winnerColor,
    winReason: m.winReason,
    spectatorCount: m.spectatorCount,
    createdAt: m.createdAt,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
  };
}

module.exports = router;
