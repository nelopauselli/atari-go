const express = require('express');
const Match = require('../models/Match');
const Room = require('../models/Room');
const Player = require('../models/Player');
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
  const room = await Room.findById(req.params.roomId).select('teams teamAssignments').lean().catch(() => null);

  res.json({ matches, ranking: await buildRanking(room, matches) });
});

// Ranking por equipo con el detalle de sus jugadores: partidas jugadas, ganadas y perdidas.
// Solo cuentan las partidas con ganador (las abortadas sin resultado no suman).
async function buildRanking(room, matches) {
  const teams = new Map();
  const ensureTeam = (id, name) => {
    const key = String(id);
    if (!teams.has(key)) teams.set(key, { team: key, teamName: name || '', played: 0, wins: 0, losses: 0, players: new Map() });
    return teams.get(key);
  };
  const ensurePlayer = (team, id, nickname) => {
    const key = String(id);
    if (!team.players.has(key)) team.players.set(key, { player: key, nickname: '', played: 0, wins: 0, losses: 0, games: [] });
    const p = team.players.get(key);
    if (nickname) p.nickname = nickname;
    return p;
  };

  // Equipos actuales de la sala y sus jugadores asignados (aunque todavía no hayan jugado)
  if (room) {
    for (const t of room.teams || []) ensureTeam(t._id, t.name);
    const assigned = (room.teamAssignments || []).filter((a) => teams.has(String(a.team)));
    const players = await Player.find({ _id: { $in: assigned.map((a) => a.player) } }).select('nickname').lean();
    const nicknames = new Map(players.map((p) => [String(p._id), p.nickname]));
    for (const a of assigned) ensurePlayer(teams.get(String(a.team)), a.player, nicknames.get(String(a.player)));
  }

  for (const m of matches) {
    if (!m.result || !m.result.winnerColor) continue;
    for (const mp of m.players) {
      if (!mp.team) continue; // amistosas: sin equipos
      const won = mp.color === m.result.winnerColor;
      const team = ensureTeam(mp.team, mp.teamName);
      const p = ensurePlayer(team, mp.player);
      if (!p.nickname) p.nickname = mp.nickname;
      // Historial del jugador: contra quién jugó y el resultado (las partidas vienen de la más reciente a la más vieja)
      const opponent = m.players.find((o) => o.color !== mp.color);
      p.games.push({
        match: String(m._id),
        boardNumber: m.boardNumber,
        color: mp.color,
        opponent: opponent ? { nickname: opponent.nickname, team: opponent.team ? String(opponent.team) : '', teamName: opponent.teamName || '' } : null,
        won,
        reason: m.result.reason || '',
        endedAt: m.endedAt,
      });
      for (const stats of [team, p]) {
        stats.played += 1;
        if (won) stats.wins += 1;
        else stats.losses += 1;
      }
    }
  }

  // Institución de cada jugador (los invitados no tienen)
  const playerIds = [...teams.values()].flatMap((t) => [...t.players.keys()]);
  const playerDocs = await Player.find({ _id: { $in: playerIds } })
    .select('institution').populate('institution', 'name').lean();
  const institutionNames = new Map(playerDocs.map((p) => [String(p._id), p.institution ? p.institution.name : '']));
  for (const t of teams.values()) {
    for (const p of t.players.values()) p.institutionName = institutionNames.get(p.player) || '';
  }

  const byRecord = (a, b) => b.wins - a.wins || a.losses - b.losses;
  return [...teams.values()]
    .map((t) => ({
      ...t,
      players: [...t.players.values()].sort((a, b) => byRecord(a, b) || a.nickname.localeCompare(b.nickname)),
    }))
    .sort((a, b) => byRecord(a, b) || a.teamName.localeCompare(b.teamName));
}

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
