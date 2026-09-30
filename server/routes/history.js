const express = require('express');
const Match = require('../../models/Match');
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
    if (!winner || !winner.team) continue; // amistosas: sin equipos
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
  const filename = sgfFilename(match);
  // filename= lleva un fallback ASCII; filename* conserva acentos/ñ en navegadores modernos
  const asciiFallback = filename.normalize('NFD').replace(/[^\x20-\x7E]/g, '');
  res.setHeader('Content-Disposition',
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`);
  res.send(sgf);
});

// "Negro (Equipo) vs Blanco (Equipo) - tablero N - <id>.sgf"
function sgfFilename(match) {
  const clean = (s) => String(s || '').replace(/[\\/:*?"<>|\x00-\x1F]/g, '').trim();
  const label = (p) => {
    if (!p) return 'sin-jugador';
    const team = clean(p.teamName);
    return team ? `${clean(p.nickname)} (${team})` : clean(p.nickname);
  };
  const black = match.players.find((p) => p.color === 'black');
  const white = match.players.find((p) => p.color === 'white');
  return `${label(black)} vs ${label(white)} - ${match._id}.sgf`;
}

module.exports = router;
