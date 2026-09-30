import { reactive } from 'vue';

// Equipos (nombre + avatar) de la sala abierta, para resolverlos por id o por nombre.
// Los carga RoomView a partir de room.teams.
const state = reactive({ byId: {}, byName: {} });

export function setTeams(teams) {
  state.byId = Object.fromEntries((teams || []).map((t) => [t._id, t]));
  state.byName = Object.fromEntries((teams || []).map((t) => [t.name, t]));
}

export function findTeam(id, name) {
  return (id && state.byId[String(id)]) || (name && state.byName[name]) || null;
}
