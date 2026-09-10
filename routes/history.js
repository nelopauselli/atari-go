const express = require('express');
const Match = require('../models/Match');
const { matchToSgf } = require('../services/sgf');

const router = express.Router();

// Historial global de partidas finalizadas (vista Home)
router.get('/global', async (req, res) => {
  const matches = await Match.find({ status: { $in: ['finished', 'aborted'] } })
    .sort({ endedAt: -1 })
    .limit(100)
    .select('roomName boardNumber boardSize players result endedAt');
  res.json(matches);
});

// Historial de una sala puntual + ranking acumulado (torneos)
router.get('/room/:roomId', async (req, res) => {
  const matches = await Match.find({ room: req.params.roomId, status: { $in: ['finished', 'aborted'] } })
    .sort({ endedAt: -1 });

  const rankingByTeam = new Map();
  for (const m of matches) {
    if (!m.result || !m.result.winnerColor) continue;
    const winner = m.players.find((p) => p.color === m.result.winnerColor);
    if (!winner) continue;
    const key = String(winner.team);
    if (!rankingByTeam.has(key)) rankingByTeam.set(key, { team: key, teamName: winner.teamName, wins: 0 });
    rankingByTeam.get(key).wins += 1;
  }

  res.json({
    matches,
    ranking: [...rankingByTeam.values()].sort((a, b) => b.wins - a.wins),
  });
});

// Descarga de SGF de una partida
router.get('/:matchId/sgf', async (req, res) => {
  const match = await Match.findById(req.params.matchId);
  if (!match) return res.status(404).json({ error: 'Partida no encontrada' });
  const sgf = matchToSgf(match);
  res.setHeader('Content-Type', 'application/x-go-sgf');
  res.setHeader('Content-Disposition', `attachment; filename="tablero${match.boardNumber}_${match._id}.sgf"`);
  res.send(sgf);
});

module.exports = router;
