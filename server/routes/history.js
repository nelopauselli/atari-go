const express = require('express');
const Match = require('../models/Match');
const mongoose = require('mongoose');
const { matchToSgf } = require('../services/sgf');
const { buildReplayFrames } = require('../services/replay');
const { getRoomHistoryJson } = require('../services/roomHistory');

const router = express.Router();

// Historial de una sala puntual + ranking acumulado (torneos). Cacheado: ver services/roomHistory.
router.get('/room/:roomId', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.roomId)) return res.status(404).json({ error: 'Sala no encontrada' });
  const json = await getRoomHistoryJson(req.params.roomId);
  res.type('application/json').send(json);
});

// Partida finalizada reconstruida jugada a jugada para el reproductor
router.get('/:matchId/replay', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.matchId)) return res.status(404).json({ error: 'Partida no encontrada' });
  const match = await Match.findById(req.params.matchId).lean();
  if (!match || !['finished', 'aborted'].includes(match.status)) return res.status(404).json({ error: 'Partida no encontrada' });
  const { moves, ...info } = match;
  res.json({ match: info, frames: buildReplayFrames(match) });
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
