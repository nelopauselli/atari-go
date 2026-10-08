const mongoose = require('mongoose');
const Room = require('../../models/Room');
const Match = require('../../models/Match');
const Player = require('../../models/Player');
const Institution = require('../../models/Institution');

// Exportación/importación de salas con su historial de partidas.
// Se conservan los _id de salas, equipos y partidas: las partidas y el ranking referencian a los
// equipos por _id. Los jugadores viajan aparte (apodo + nombre de institución) porque en la base
// destino pueden existir con otro _id; al importar se los busca y se remapean las referencias.

const ROOM_FIELDS = ['name', 'type', 'boardCount', 'boardSize', 'stonesToWin', 'clockType', 'koRuleEnabled', 'closed', 'createdAt'];
const MATCH_FIELDS = [
  'boardNumber', 'boardSize', 'stonesToWin', 'clockType', 'koRuleEnabled', 'moves', 'status', 'result',
  'capturedByBlack', 'capturedByWhite', 'startedAt', 'endedAt', 'createdAt',
];
// Las partidas en curso viven en memoria; solo se exporta el historial cerrado.
const HISTORY_STATUSES = ['finished', 'aborted'];

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
const str = (id) => (id ? String(id) : null);

// Exporta una sala (se exportan de a una). Devuelve null si no existe.
async function exportOne(id) {
  const room = await Room.findById(id).lean();
  if (!room) return null;
  const rooms = [room];
  const matches = await Match.find({ room: { $in: rooms.map((r) => r._id) }, status: { $in: HISTORY_STATUSES } })
    .sort({ startedAt: 1 }).lean();
  const institutions = new Map((await Institution.find().select('name').lean()).map((i) => [str(i._id), i.name]));

  const playerIds = new Set();
  for (const r of rooms) for (const a of r.teamAssignments || []) playerIds.add(str(a.player));
  for (const m of matches) for (const p of m.players) playerIds.add(str(p.player));
  const players = await Player.find({ _id: { $in: [...playerIds] } }).select('nickname institution').lean();

  const matchesByRoom = new Map();
  for (const m of matches) {
    const key = str(m.room);
    if (!matchesByRoom.has(key)) matchesByRoom.set(key, []);
    matchesByRoom.get(key).push({
      _id: str(m._id),
      ...pick(m, MATCH_FIELDS),
      players: m.players.map((p) => ({ ...p, player: str(p.player), team: str(p.team) })),
    });
  }

  return {
    players: players.map((p) => ({
      _id: str(p._id),
      nickname: p.nickname,
      institution: p.institution ? institutions.get(str(p.institution)) || null : null,
    })),
    items: rooms.map((r) => ({
      _id: str(r._id),
      ...pick(r, ROOM_FIELDS),
      teams: (r.teams || []).map((t) => ({ _id: str(t._id), name: t.name, avatar: t.avatar || '' })),
      teamAssignments: (r.teamAssignments || []).map((a) => ({
        player: str(a.player),
        institution: a.institution ? institutions.get(str(a.institution)) || null : null,
        team: str(a.team),
      })),
      matches: matchesByRoom.get(str(r._id)) || [],
    })),
  };
}

// Devuelve un Map id exportado -> id en esta base, creando los jugadores que falten.
async function resolvePlayers(players, institutionIds, warnings) {
  const map = new Map();
  for (const p of players || []) {
    if (!p || !p._id || !p.nickname) continue;
    let institution = null;
    if (p.institution) {
      institution = institutionIds.get(p.institution) || null;
      if (!institution) warnings.add(`Institución "${p.institution}" inexistente: ${p.nickname} queda sin institución`);
    }
    const valid = mongoose.isValidObjectId(p._id);
    let doc = valid ? await Player.findById(p._id).select('_id').lean() : null;
    if (!doc) doc = await Player.findOne({ nickname: p.nickname, institution }).select('_id').lean();
    if (!doc) doc = await Player.create({ ...(valid ? { _id: p._id } : {}), nickname: p.nickname, institution });
    map.set(String(p._id), doc._id);
  }
  return map;
}

// Crea o actualiza (por _id) conservando el _id exportado. Devuelve el documento y qué hizo.
async function upsert(Model, id, data) {
  const existing = mongoose.isValidObjectId(id) ? await Model.findById(id) : null;
  if (existing) {
    existing.set(data);
    return { doc: await existing.save(), outcome: 'updated' };
  }
  const doc = await Model.create(mongoose.isValidObjectId(id) ? { _id: id, ...data } : data);
  return { doc, outcome: 'created' };
}

async function importAll(payload) {
  const items = Array.isArray(payload) ? payload : payload && payload.items;
  if (!Array.isArray(items)) throw new Error('Formato inválido: se esperaba una lista de salas');

  const institutionIds = new Map((await Institution.find().select('name').lean()).map((i) => [i.name, i._id]));
  const warnings = new Set();
  const players = await resolvePlayers(payload.players, institutionIds, warnings);
  const playerId = (id) => {
    const mapped = players.get(String(id));
    if (!mapped) throw new Error(`Jugador ${id} no incluido en el archivo`);
    return mapped;
  };

  const result = { created: 0, updated: 0, matches: 0, errors: [] };
  for (const [index, item] of items.entries()) {
    const label = (item && item.name) || `#${index + 1}`;
    try {
      if (!item || typeof item !== 'object' || !item.name) throw new Error('Falta el campo "name"');
      const roomData = {
        ...pick(item, ROOM_FIELDS),
        teams: item.teams || [],
        teamAssignments: (item.teamAssignments || []).map((a) => ({
          player: playerId(a.player),
          institution: a.institution ? institutionIds.get(a.institution) || null : null,
          team: a.team,
        })),
      };
      const { doc: room, outcome } = await upsert(Room, item._id, roomData);
      result[outcome] += 1;

      for (const m of item.matches || []) {
        try {
          await upsert(Match, m._id, {
            ...pick(m, MATCH_FIELDS),
            room: room._id,
            roomName: item.name,
            players: (m.players || []).map((p) => ({ ...p, player: playerId(p.player) })),
          });
          result.matches += 1;
        } catch (err) {
          result.errors.push(`${label} / partida ${m && m._id}: ${err.message}`);
        }
      }
    } catch (err) {
      result.errors.push(`${label}: ${err.message}`);
    }
  }
  result.errors.push(...warnings);
  return result;
}

module.exports = { exportOne, importAll };
