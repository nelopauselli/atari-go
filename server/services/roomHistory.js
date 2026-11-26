const Match = require('../models/Match');
const Room = require('../models/Room');
const Player = require('../models/Player');

/**
 * Historial de una sala + ranking acumulado, cacheado en memoria ya serializado a JSON.
 *
 * Cada partida terminada hace que muchos clientes de la sala pidan el historial a la vez;
 * sin caché, cada pedido consultaba Mongo y armaba/serializaba la respuesta entera.
 * Con la caché, los pedidos simultáneos comparten una sola consulta (la promesa en curso)
 * y los siguientes reciben el mismo JSON hasta que vence el TTL o se invalida la sala
 * (al terminar una partida). El TTL cubre lo que cambia sin terminar partidas
 * (asignación de equipos, apodos).
 *
 * Las reconstrucciones se espacian al menos MIN_REBUILD_MS: cuando terminan muchas partidas
 * seguidas (fin de ronda), invalidar con cada una obligaba a rearmar el historial completo
 * una vez por partida. Ahora un pedido posterior a la invalidación espera a la próxima
 * reconstrucción (nunca recibe datos viejos), y las partidas que terminan antes de que
 * arranque quedan incluidas en esa misma reconstrucción.
 */
const TTL_MS = 5000;
const MIN_REBUILD_MS = 2000;
// roomId -> { at (inicio de la reconstrucción), started, valid, promise }
const cache = new Map();

function getRoomHistoryJson(roomId) {
  const key = String(roomId);
  const hit = cache.get(key);
  // Vigente: dentro del TTL y sin invalidar, o programada y todavía sin arrancar.
  if (hit && hit.valid && Date.now() - hit.at < TTL_MS) return hit.promise;

  const waitMs = hit ? Math.max(0, hit.at + MIN_REBUILD_MS - Date.now()) : 0;
  const entry = { at: Date.now() + waitMs, started: false, valid: true, promise: null };
  const build = () => {
    entry.at = Date.now();
    entry.started = true;
    return buildRoomHistory(key);
  };
  const start = waitMs > 0 ? new Promise((resolve) => setTimeout(resolve, waitMs)).then(build) : build();
  entry.promise = start
    .then((data) => JSON.stringify(data))
    .catch((err) => {
      if (cache.get(key) === entry) cache.delete(key);
      throw err;
    });
  cache.set(key, entry);
  return entry.promise;
}

function invalidateRoomHistory(roomId) {
  const entry = cache.get(String(roomId));
  // Si la reconstrucción todavía no arrancó, va a leer la partida recién guardada: sigue sirviendo.
  if (entry && entry.started) entry.valid = false;
}

async function buildRoomHistory(roomId) {
  // Sin las jugadas: la lista no las usa y son lo más pesado de cada partida
  // (el reproductor y el SGF las piden por separado).
  const [matches, room] = await Promise.all([
    Match.find({ room: roomId, status: { $in: ['finished', 'aborted'] } })
      .select('-moves').sort({ endedAt: -1 }).lean(),
    Room.findById(roomId).select('teams teamAssignments').lean().catch(() => null),
  ]);
  return { matches, ranking: await buildRanking(room, matches) };
}

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

module.exports = { getRoomHistoryJson, invalidateRoomHistory, buildRanking, TTL_MS, MIN_REBUILD_MS };
