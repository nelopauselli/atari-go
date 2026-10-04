/**
 * Reglas de asignación automática de equipos al entrar a una sala torneo (RULES.md, "Modo torneo"):
 * reparto equilibrado por institución y por total, estabilidad y persistencia de la asignación.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  oid, makeRoomDoc, makeTeams, makePlayer, setup, flush, getBoard,
} = require('./helpers');
const matchManager = require('../server/services/matchManager');

const INST_X = String(oid());
const INST_Y = String(oid());

function tournamentDoc(teams, overrides = {}) {
  return makeRoomDoc({ type: 'torneo', teams, ...overrides });
}

/** Asignaciones ya guardadas en la sala: [[teamIndex, institution], ...] */
function savedAssignments(teams, entries) {
  return entries.map(([teamIndex, institution]) => ({
    player: oid(), institution, team: teams[teamIndex]._id,
  }));
}

describe('asignación de equipos', () => {
  describe('cuándo se asigna', () => {
    it('las salas amistosas no asignan equipo', async (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc({ type: 'amistosas', teams: makeTeams('Rojo') }));
      assert.equal(await matchManager.assignTeamOnJoin(roomId, makePlayer('Ana').id), null);
      await flush();
      assert.equal(env.db.playerLookups.length, 0);
      assert.equal(env.db.roomUpdates.length, 0);
    });

    it('no asigna en salas inexistentes ni sin jugador identificado', async (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(tournamentDoc(makeTeams('Rojo')));
      assert.equal(await matchManager.assignTeamOnJoin(String(oid()), makePlayer('Ana').id), null);
      assert.equal(await matchManager.assignTeamOnJoin(roomId, null), null);
      assert.equal(matchManager.getRoom(roomId).assignments.size, 0);
    });

    it('al entrar a una sala torneo se le asigna uno de los equipos de la sala', async (t) => {
      const ana = makePlayer('Ana');
      const env = setup(t, { playerInstitutions: { [ana.id]: INST_X } });
      const teams = makeTeams('Rojo', 'Azul');
      const roomId = env.registerRoom(tournamentDoc(teams));

      const team = await matchManager.assignTeamOnJoin(roomId, ana.id);
      assert.ok(['Rojo', 'Azul'].includes(team.name));
      assert.deepEqual(Object.keys(team).sort(), ['_id', 'avatar', 'name']);
      assert.deepEqual(matchManager.getRoom(roomId).assignments.get(ana.id), { institution: INST_X, team: team._id });
    });

    it('getAssignedTeamId distingue el primer ingreso de los siguientes', async (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(tournamentDoc(makeTeams('Rojo')));
      const ana = makePlayer('Ana');
      assert.equal(matchManager.getAssignedTeamId(roomId, ana.id), null);
      const team = await matchManager.assignTeamOnJoin(roomId, ana.id);
      assert.equal(matchManager.getAssignedTeamId(roomId, ana.id), team._id);
      assert.equal(matchManager.getAssignedTeamId(roomId, null), null);
    });

    it('el jugador se sienta con el equipo asignado', async (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(tournamentDoc(makeTeams('Rojo')));
      const ana = makePlayer('Ana');
      await matchManager.assignTeamOnJoin(roomId, ana.id);

      matchManager.handleSit({ roomId, boardNumber: 1, player: ana, socketId: 's1' });
      assert.equal(getBoard(roomId).game.players[0].teamName, 'Rojo');
    });
  });

  describe('persistencia y estabilidad', () => {
    it('guarda la asignación en la sala reemplazando cualquier asignación previa del jugador', async (t) => {
      const ana = makePlayer('Ana');
      const env = setup(t, { playerInstitutions: { [ana.id]: INST_X } });
      const roomId = env.registerRoom(tournamentDoc(makeTeams('Rojo')));

      const team = await matchManager.assignTeamOnJoin(roomId, ana.id);
      await flush();
      assert.equal(env.db.roomUpdates.length, 2);
      const [pull, push] = env.db.roomUpdates;
      assert.deepEqual(pull.filter, { _id: roomId });
      assert.deepEqual(pull.update, { $pull: { teamAssignments: { player: ana.id } } });
      assert.deepEqual(push.filter, { _id: roomId });
      assert.deepEqual(push.update, {
        $push: { teamAssignments: { player: ana.id, institution: INST_X, team: team._id } },
      });
    });

    it('al volver a entrar conserva el mismo equipo sin volver a consultar ni guardar', async (t) => {
      const ana = makePlayer('Ana');
      const env = setup(t, { playerInstitutions: { [ana.id]: INST_X } });
      const roomId = env.registerRoom(tournamentDoc(makeTeams('Rojo', 'Azul', 'Verde')));

      const first = await matchManager.assignTeamOnJoin(roomId, ana.id);
      await flush();
      const lookups = env.db.playerLookups.length;
      const updates = env.db.roomUpdates.length;
      for (let i = 0; i < 5; i++) {
        assert.equal((await matchManager.assignTeamOnJoin(roomId, ana.id))._id, first._id);
      }
      await flush();
      assert.equal(env.db.playerLookups.length, lookups);
      assert.equal(env.db.roomUpdates.length, updates);
    });

    it('respeta las asignaciones guardadas en la sala (por ejemplo, tras reiniciar el servidor)', async (t) => {
      const env = setup(t);
      const teams = makeTeams('Rojo', 'Azul');
      const playerId = oid();
      const roomId = env.registerRoom(tournamentDoc(teams, {
        teamAssignments: [{ player: playerId, institution: oid(), team: teams[1]._id }],
      }));

      const team = await matchManager.assignTeamOnJoin(roomId, String(playerId));
      assert.equal(team.name, 'Azul');
      assert.equal(env.db.playerLookups.length, 0);
    });

    it('si le cambian el nombre al equipo desde el panel, el jugador lo conserva con el nombre nuevo', async (t) => {
      const teams = makeTeams('Rojo', 'Azul');
      const doc = tournamentDoc(teams);
      const env = setup(t, { openRooms: [doc] });
      const roomId = env.registerRoom(doc);
      const ana = makePlayer('Ana');
      const before = await matchManager.assignTeamOnJoin(roomId, ana.id);

      env.db.openRooms = [{ ...doc, teams: teams.map((tm) => ({ ...tm, name: `${tm.name} renovado` })) }];
      await matchManager.syncRoomsWithDB();
      const after = await matchManager.assignTeamOnJoin(roomId, ana.id);
      assert.equal(after._id, before._id);
      assert.equal(after.name, `${before.name} renovado`);
    });

    it('si su equipo fue quitado de la sala, se le asigna otro conservando su institución', async (t) => {
      const teams = makeTeams('Rojo', 'Azul');
      const playerId = String(oid());
      const doc = tournamentDoc(teams, {
        teamAssignments: [{ player: playerId, institution: INST_X, team: teams[0]._id }],
      });
      const env = setup(t, { openRooms: [doc] });
      const roomId = env.registerRoom(doc);

      env.db.openRooms = [{ ...doc, teams: [teams[1]] }];
      await matchManager.syncRoomsWithDB();

      const team = await matchManager.assignTeamOnJoin(roomId, playerId);
      assert.equal(team.name, 'Azul');
      assert.deepEqual(matchManager.getRoom(roomId).assignments.get(playerId), { institution: INST_X, team: team._id });
      assert.equal(env.db.playerLookups.length, 0);
      await flush();
      assert.equal(env.db.roomUpdates.length, 2);
    });

    it('al sentarse, quien perdió su equipo recibe uno nuevo', async (t) => {
      const teams = makeTeams('Rojo', 'Azul');
      const ana = makePlayer('Ana');
      const doc = tournamentDoc(teams, {
        teamAssignments: [{ player: ana.id, institution: null, team: teams[0]._id }],
      });
      const env = setup(t, { openRooms: [doc] });
      const roomId = env.registerRoom(doc);
      env.db.openRooms = [{ ...doc, teams: [teams[1]] }];
      await matchManager.syncRoomsWithDB();

      matchManager.handleSit({ roomId, boardNumber: 1, player: ana, socketId: 's1' });
      assert.equal(getBoard(roomId).game.players[0].teamName, 'Azul');
    });
  });

  describe('reparto equilibrado', () => {
    it('la institución se toma de la base de datos', async (t) => {
      const ana = makePlayer('Ana');
      const env = setup(t, { playerInstitutions: { [ana.id]: INST_Y } });
      const roomId = env.registerRoom(tournamentDoc(makeTeams('Rojo')));
      await matchManager.assignTeamOnJoin(roomId, ana.id);
      assert.deepEqual(env.db.playerLookups, [ana.id]);
      assert.equal(matchManager.getRoom(roomId).assignments.get(ana.id).institution, INST_Y);
    });

    it('un jugador que no está en la base igual recibe equipo, sin institución', async (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(tournamentDoc(makeTeams('Rojo')));
      const ana = makePlayer('Ana');
      const team = await matchManager.assignTeamOnJoin(roomId, ana.id);
      assert.equal(team.name, 'Rojo');
      assert.equal(matchManager.getRoom(roomId).assignments.get(ana.id).institution, null);
    });

    it('los jugadores de una misma institución quedan en equipos distintos', async (t) => {
      const players = ['Ana', 'Beto', 'Caro', 'Dani'].map(makePlayer);
      const env = setup(t, { playerInstitutions: Object.fromEntries(players.map((p) => [p.id, INST_X])) });
      for (let trial = 0; trial < 10; trial++) {
        const roomId = env.registerRoom(tournamentDoc(makeTeams('Rojo', 'Azul', 'Verde', 'Negro')));
        const assigned = [];
        for (const p of players) assigned.push((await matchManager.assignTeamOnJoin(roomId, p.id)).name);
        assert.equal(new Set(assigned).size, 4, `reparto: ${assigned.join(', ')}`);
      }
    });

    it('con más compañeros de institución que equipos, se reparten de forma pareja', async (t) => {
      const players = Array.from({ length: 7 }, (_, i) => makePlayer(`P${i}`));
      const env = setup(t, { playerInstitutions: Object.fromEntries(players.map((p) => [p.id, INST_X])) });
      const roomId = env.registerRoom(tournamentDoc(makeTeams('Rojo', 'Azul', 'Verde')));

      const counts = {};
      for (const p of players) {
        const { name } = await matchManager.assignTeamOnJoin(roomId, p.id);
        counts[name] = (counts[name] || 0) + 1;
      }
      assert.deepEqual(Object.values(counts).sort(), [2, 2, 3]);
    });

    it('prioriza el equipo con menos jugadores de su institución aunque tenga más jugadores en total', async (t) => {
      const ana = makePlayer('Ana');
      const env = setup(t, { playerInstitutions: { [ana.id]: INST_X } });
      const teams = makeTeams('Rojo', 'Azul');
      // Rojo: 3 jugadores de Y. Azul: 1 jugador de X.
      const roomId = env.registerRoom(tournamentDoc(teams, {
        teamAssignments: savedAssignments(teams, [[0, INST_Y], [0, INST_Y], [0, INST_Y], [1, INST_X]]),
      }));
      assert.equal((await matchManager.assignTeamOnJoin(roomId, ana.id)).name, 'Rojo');
    });

    it('a igualdad de compañeros de institución, elige el equipo con menos jugadores en total', async (t) => {
      const ana = makePlayer('Ana');
      const env = setup(t, { playerInstitutions: { [ana.id]: INST_X } });
      const teams = makeTeams('Rojo', 'Azul', 'Verde');
      // Ningún equipo tiene jugadores de X. Rojo: 2, Azul: 1, Verde: 2.
      const roomId = env.registerRoom(tournamentDoc(teams, {
        teamAssignments: savedAssignments(teams, [[0, INST_Y], [0, INST_Y], [1, INST_Y], [2, null], [2, INST_Y]]),
      }));
      assert.equal((await matchManager.assignTeamOnJoin(roomId, ana.id)).name, 'Azul');
    });

    it('los jugadores sin institución se reparten entre sí como si fueran de la misma', async (t) => {
      const players = ['Ana', 'Beto'].map(makePlayer);
      const env = setup(t);
      const roomId = env.registerRoom(tournamentDoc(makeTeams('Rojo', 'Azul')));
      const names = [];
      for (const p of players) names.push((await matchManager.assignTeamOnJoin(roomId, p.id)).name);
      assert.notEqual(names[0], names[1]);
    });

    it('ignora asignaciones guardadas a equipos que ya no están en la sala', async (t) => {
      const ana = makePlayer('Ana');
      const env = setup(t, { playerInstitutions: { [ana.id]: INST_X } });
      const teams = makeTeams('Rojo', 'Azul');
      const removed = makeTeams('Viejo');
      const roomId = env.registerRoom(tournamentDoc(teams, {
        // Muchos de X en un equipo quitado: no deben pesar. Rojo tiene 1 de Y.
        teamAssignments: [
          ...savedAssignments(removed, [[0, INST_X], [0, INST_X]]),
          ...savedAssignments(teams, [[0, INST_Y]]),
        ],
      }));
      assert.equal((await matchManager.assignTeamOnJoin(roomId, ana.id)).name, 'Azul');
    });

    it('ante un empate completo desempata al azar', async (t) => {
      const env = setup(t);
      const teams = makeTeams('Rojo', 'Azul', 'Verde');

      t.mock.method(Math, 'random', () => 0);
      let roomId = env.registerRoom(tournamentDoc(teams));
      assert.equal((await matchManager.assignTeamOnJoin(roomId, makePlayer('Ana').id)).name, 'Rojo');

      Math.random.mock.mockImplementation(() => 0.99);
      roomId = env.registerRoom(tournamentDoc(teams));
      assert.equal((await matchManager.assignTeamOnJoin(roomId, makePlayer('Beto').id)).name, 'Verde');
    });
  });
});
