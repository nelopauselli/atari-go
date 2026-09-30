const STORAGE_KEY = 'atarigo_player';
// Equipo elegido en cada sala torneo: { [roomId]: teamId }.
const ROOM_TEAMS_KEY = 'atarigo_room_teams';

export function getPlayer() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const player = JSON.parse(raw);
    // Sesiones previas a las instituciones: obligan a volver a ingresar.
    return player && player.institution ? player : null;
  } catch {
    return null;
  }
}

export function setPlayer(player) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(player));
}

export function clearPlayer() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ROOM_TEAMS_KEY);
}

function readRoomTeams() {
  try {
    return JSON.parse(localStorage.getItem(ROOM_TEAMS_KEY)) || {};
  } catch {
    return {};
  }
}

export function getRoomTeam(roomId) {
  return readRoomTeams()[roomId] || '';
}

export function setRoomTeam(roomId, teamId) {
  try {
    localStorage.setItem(ROOM_TEAMS_KEY, JSON.stringify({ ...readRoomTeams(), [roomId]: teamId }));
  } catch {
    // Sin storage: la elección vale solo mientras la vista esté abierta.
  }
}
