/**
 * teamManager.js
 * Mantiene en memoria la lista de equipos, reflejando lo que el backend
 * administrativo tenga cargado en Mongo, de la misma forma en que
 * matchManager sincroniza las salas.
 */

const Team = require('../../models/Team');

/** teams: Map<teamId, { _id, name, color }> */
const teams = new Map();

function registerTeam(teamDoc) {
  teams.set(String(teamDoc._id), {
    _id: String(teamDoc._id),
    name: teamDoc.name,
    color: teamDoc.color,
  });
}

function unregisterTeam(teamId) {
  teams.delete(String(teamId));
}

function getTeam(teamId) {
  return teams.get(String(teamId));
}

function getAllTeams() {
  return [...teams.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Recarga la lista de equipos desde Mongo: registra los nuevos, actualiza
 * nombre/color de los existentes y da de baja los que ya no figuran (el
 * backend administrativo puede crear/editar/eliminar equipos mientras este
 * server sigue corriendo).
 */
async function syncTeamsWithDB() {
  const allTeams = await Team.find();
  const currentIds = new Set(allTeams.map((t) => String(t._id)));

  for (const teamDoc of allTeams) {
    const id = String(teamDoc._id);
    if (!teams.has(id)) {
      registerTeam(teamDoc);
      console.log(`[teamManager] equipo nuevo registrado: ${teamDoc.name} (${id})`);
    }
  }

  for (const id of [...teams.keys()]) {
    if (!currentIds.has(id)) {
      unregisterTeam(id);
      console.log(`[teamManager] equipo dado de baja: ${id}`);
    }
  }
}

module.exports = {
  syncTeamsWithDB,
  getTeam,
  getAllTeams,
};
