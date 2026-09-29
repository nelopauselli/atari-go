import { reactive } from 'vue';
import { api } from './api.js';

// Cache compartido de equipos (nombre, color, escudo) para resolverlos por id o por nombre.
const state = reactive({ byId: {}, byName: {} });
let loading = null;

export function loadTeams(force = false) {
  if (loading && !force) return loading;
  loading = api.getTeams().then((teams) => {
    state.byId = Object.fromEntries(teams.map((t) => [t._id, t]));
    state.byName = Object.fromEntries(teams.map((t) => [t.name, t]));
    return teams;
  }).catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

export function findTeam(id, name) {
  return (id && state.byId[String(id)]) || (name && state.byName[name]) || null;
}
