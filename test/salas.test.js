/**
 * Reglas de las salas: asiento en tableros (jugador/espectador), enfrentamientos en
 * torneo, desconexiones, liberación de tableros, resúmenes y sincronización con la base.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  oid, makeRoomDoc, makeTeams, makePlayer, setup, flush, startMatch, getBoard,
} = require('./helpers');
const matchManager = require('../server/services/matchManager');
const Room = require('../server/models/Room');

const TEAM_REQUIRED_ERROR = 'No tenés equipo asignado en esta sala (todavía no tiene equipos)';

function sit(roomId, player, boardNumber = 1, socketId = `s-${player.id}`) {
  return matchManager.handleSit({ roomId, boardNumber, player, socketId });
}

function spectatorCount(roomId, boardNumber = 1) {
  return matchManager.getRoomBoardsSummary(roomId).boards.find((b) => b.number === boardNumber).spectatorCount;
}

describe('asiento en tableros', () => {
  it('rechaza salas y tableros inexistentes', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc({ boardCount: 2 }));
    const player = makePlayer('Ana');
    assert.deepEqual(sit(String(oid()), player), { ok: false, error: 'Sala inexistente' });
    assert.deepEqual(sit(roomId, player, 3), { ok: false, error: 'Tablero inexistente' });
  });

  it('crea un tablero por cada uno configurado en la sala, todos vacíos', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc({ boardCount: 4 }));
    const { boards } = matchManager.getRoomBoardsSummary(roomId);
    assert.deepEqual(boards.map((b) => [b.number, b.status]), [[1, 'empty'], [2, 'empty'], [3, 'empty'], [4, 'empty']]);
  });

  it('quien se sienta en un tablero vacío juega con negras y espera rival', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc({ boardSize: 9, stonesToWin: 3, clockType: 'fischer-5-5' }));
    const ana = makePlayer('Ana');

    assert.deepEqual(sit(roomId, ana), { ok: true, role: 'player', color: 'black' });
    const board = getBoard(roomId);
    assert.equal(board.status, 'waiting');
    assert.equal(board.game.size, 9);
    assert.equal(board.game.board.length, 81);
    assert.equal(board.game.stonesToWin, 3);
    assert.equal(board.game.clockType, 'fischer-5-5');
    assert.ok(env.events.some((e) => e.event === 'room:update' && e.roomId === roomId));
  });

  it('si quien espera vuelve a hacer click, conserva su lugar', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const ana = makePlayer('Ana');
    sit(roomId, ana);
    assert.deepEqual(sit(roomId, ana), { ok: true, role: 'player', color: 'black' });
    assert.equal(getBoard(roomId).status, 'waiting');
    assert.equal(getBoard(roomId).game.players.length, 1);
  });

  it('el segundo jugador juega con blancas, empieza la partida y se guarda en la base', async (t) => {
    const env = setup(t);
    const roomDoc = makeRoomDoc({ name: 'Amistosa', stonesToWin: 3, koRuleEnabled: false });
    const roomId = env.registerRoom(roomDoc);
    const ana = makePlayer('Ana');
    const beto = makePlayer('Beto');
    sit(roomId, ana);

    assert.deepEqual(sit(roomId, beto), { ok: true, role: 'player', color: 'white' });
    assert.equal(getBoard(roomId).status, 'playing');

    await flush();
    assert.equal(env.db.matchesCreated.length, 1);
    const match = env.db.matchesCreated[0];
    assert.equal(match.roomName, 'Amistosa');
    assert.equal(match.boardNumber, 1);
    assert.equal(match.status, 'playing');
    assert.equal(match.stonesToWin, 3);
    assert.equal(match.koRuleEnabled, false);
    assert.deepEqual(match.players.map((p) => [p.nickname, p.color, p.team, p.teamName]),
      [['Ana', 'black', null, ''], ['Beto', 'white', null, '']]);
    assert.equal(String(getBoard(roomId).matchId), String(match._id));
  });

  it('con la partida en curso, el resto entra como espectador', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    startMatch(roomId);
    const caro = makePlayer('Caro');

    assert.deepEqual(sit(roomId, caro, 1, 'socket-caro'), { ok: true, role: 'spectator' });
    assert.equal(getBoard(roomId).game.players.length, 2);
    assert.equal(spectatorCount(roomId), 1);

    matchManager.handleLeaveBoard({ roomId, boardNumber: 1, socketId: 'socket-caro', playerId: caro.id });
    assert.equal(spectatorCount(roomId), 0);
  });

  it('un jugador de la partida en curso que vuelve a entrar retoma su lugar', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const { white } = startMatch(roomId);

    assert.deepEqual(sit(roomId, white, 1, 'socket-nuevo'), { ok: true, role: 'player', color: 'white' });
    const seat = getBoard(roomId).game.players.find((p) => p.playerId === white.id);
    assert.equal(seat.socketId, 'socket-nuevo');
    assert.equal(getBoard(roomId).spectators.size, 0);
  });

  it('las partidas de distintos tableros son independientes', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc({ boardCount: 2 }));
    startMatch(roomId, 1);
    const dani = makePlayer('Dani');
    assert.deepEqual(sit(roomId, dani, 2), { ok: true, role: 'player', color: 'black' });
    assert.equal(getBoard(roomId, 1).status, 'playing');
    assert.equal(getBoard(roomId, 2).status, 'waiting');
  });
});

describe('invitados', () => {
  const GUEST = { guest: true, nickname: 'Invitado' };

  it('no pueden ocupar un tablero vacío', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    assert.deepEqual(sit(roomId, GUEST, 1, 's-guest'), { ok: false, error: 'Los invitados no pueden jugar partidas' });
    assert.equal(getBoard(roomId).status, 'empty');
  });

  it('no se suman como rival: observan al jugador que espera', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const ana = makePlayer('Ana');
    sit(roomId, ana);
    assert.deepEqual(sit(roomId, GUEST, 1, 's-guest'), { ok: true, role: 'spectator' });
    assert.equal(getBoard(roomId).status, 'waiting');
    assert.equal(getBoard(roomId).game.players.length, 1);
    assert.equal(spectatorCount(roomId), 1);
  });

  it('observan partidas en curso y no pueden jugar ni abandonar', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    startMatch(roomId);
    assert.deepEqual(sit(roomId, GUEST, 1, 's-guest'), { ok: true, role: 'spectator' });
    assert.equal(matchManager.handleMove({ roomId, boardNumber: 1, playerId: undefined, x: 0, y: 0 }).ok, false);
    assert.equal(matchManager.handleResign({ roomId, boardNumber: 1, playerId: undefined }).ok, false);
    assert.equal(getBoard(roomId).status, 'playing');
  });

  it('no se les asigna equipo en salas torneo', async (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc({ type: 'torneo', teams: makeTeams('Rojo') }));
    assert.equal(matchManager.isGuest(GUEST), true);
    assert.equal(await matchManager.assignTeamOnJoin(roomId, null), null);
    assert.equal(matchManager.getRoom(roomId).assignments.size, 0);
  });
});

describe('fin de partida y liberación del tablero', () => {
  it('el tablero finalizado muestra el resultado y se libera a los 15 segundos', async (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const { black } = startMatch(roomId);
    sit(roomId, makePlayer('Caro'));
    matchManager.handleResign({ roomId, boardNumber: 1, playerId: black.id });
    await flush();

    const board = getBoard(roomId);
    assert.equal(board.status, 'finished');
    assert.deepEqual(board.lastResult.players.map((p) => p.nickname), ['Negro', 'Blanco']);
    // Quien hace click en un tablero finalizado queda como espectador
    assert.equal(sit(roomId, makePlayer('Eli')).role, 'spectator');

    t.mock.timers.tick(14_999);
    assert.equal(board.status, 'finished');
    t.mock.timers.tick(1);
    assert.equal(board.status, 'empty');
    assert.equal(board.game, null);
    assert.equal(board.matchId, null);
    assert.equal(board.spectators.size, 0);

    assert.deepEqual(sit(roomId, makePlayer('Fede')), { ok: true, role: 'player', color: 'black' });
  });

  it('una partida finalizada no se puede volver a terminar ni seguir jugando', async (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const { black, white } = startMatch(roomId);
    await flush();
    matchManager.handleResign({ roomId, boardNumber: 1, playerId: black.id });

    assert.deepEqual(matchManager.handleResign({ roomId, boardNumber: 1, playerId: white.id }),
      { ok: false, error: 'La partida no está en curso' });
    assert.deepEqual(matchManager.handleMove({ roomId, boardNumber: 1, playerId: white.id, x: 0, y: 0 }),
      { ok: false, error: 'La partida no está en curso' });
    await flush();
    assert.equal(env.db.matchUpdates.length, 1);
    assert.equal(env.db.matchUpdates[0].update.status, 'finished');
  });
});

describe('desconexiones', () => {
  it('si se desconecta quien espera rival, el tablero se libera', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const ana = makePlayer('Ana');
    sit(roomId, ana);

    matchManager.handleDisconnect({ socketId: `s-${ana.id}`, playerId: ana.id });
    assert.equal(getBoard(roomId).status, 'empty');
    assert.equal(getBoard(roomId).game, null);
  });

  it('si sale del tablero quien espera rival, el tablero se libera', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const ana = makePlayer('Ana');
    sit(roomId, ana);

    matchManager.handleLeaveBoard({ roomId, boardNumber: 1, socketId: `s-${ana.id}`, playerId: ana.id });
    assert.equal(getBoard(roomId).status, 'empty');
    assert.equal(getBoard(roomId).game, null);
  });

  it('si sale del tablero un jugador en plena partida, la partida sigue', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const { black } = startMatch(roomId);

    matchManager.handleLeaveBoard({ roomId, boardNumber: 1, socketId: `s-${black.id}`, playerId: black.id });
    assert.equal(getBoard(roomId).status, 'playing');
  });

  it('si se desconecta un jugador en plena partida, la partida sigue y su reloj corre', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc({ clockType: 'fischer-1-3' }));
    const { black } = startMatch(roomId);

    matchManager.handleDisconnect({ socketId: `s-${black.id}`, playerId: black.id });
    assert.equal(getBoard(roomId).status, 'playing');

    t.mock.timers.tick(60_000);
    assert.equal(getBoard(roomId).lastResult.reason, 'timeout');
    assert.equal(getBoard(roomId).lastResult.winnerColor, 'white');
  });

  it('la desconexión de alguien que no está sentado no afecta a los tableros', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    sit(roomId, makePlayer('Ana'));
    matchManager.handleDisconnect({ socketId: 'x', playerId: 'otro' });
    matchManager.handleDisconnect({ socketId: 'y', playerId: null });
    assert.equal(getBoard(roomId).status, 'waiting');
  });
});

describe('salas torneo: enfrentamientos', () => {
  async function tournament(env, teamNames = ['Rojo', 'Azul']) {
    const teams = makeTeams(...teamNames);
    const roomId = env.registerRoom(makeRoomDoc({ type: 'torneo', teams }));
    return { roomId, teams };
  }

  // Asigna un equipo concreto al jugador cargándolo como asignación previa de la sala.
  function withTeam(roomId, player, team) {
    matchManager.getRoom(roomId).assignments.set(player.id, { institution: null, team: String(team._id) });
    return player;
  }

  it('dos jugadores del mismo equipo no pueden enfrentarse: el segundo queda como espectador', async (t) => {
    const env = setup(t);
    const { roomId, teams } = await tournament(env);
    const ana = withTeam(roomId, makePlayer('Ana'), teams[0]);
    const beto = withTeam(roomId, makePlayer('Beto'), teams[0]);

    sit(roomId, ana);
    assert.deepEqual(sit(roomId, beto),
      { ok: true, role: 'spectator', error: 'No pueden enfrentarse jugadores del mismo equipo' });
    const board = getBoard(roomId);
    assert.equal(board.status, 'waiting');
    assert.equal(board.game.players.length, 1);
    assert.equal(board.spectators.size, 1);
  });

  it('jugadores de distintos equipos se enfrentan y la partida guarda sus equipos', async (t) => {
    const env = setup(t);
    const { roomId, teams } = await tournament(env);
    const ana = withTeam(roomId, makePlayer('Ana'), teams[0]);
    const beto = withTeam(roomId, makePlayer('Beto'), teams[1]);

    sit(roomId, ana);
    assert.deepEqual(sit(roomId, beto), { ok: true, role: 'player', color: 'white' });
    await flush();
    assert.deepEqual(env.db.matchesCreated[0].players.map((p) => [p.nickname, String(p.team), p.teamName]),
      [['Ana', String(teams[0]._id), 'Rojo'], ['Beto', String(teams[1]._id), 'Azul']]);
    const summary = matchManager.getRoomBoardsSummary(roomId).boards.find((b) => b.number === 1);
    assert.deepEqual(summary.players.map((p) => p.teamName), ['Rojo', 'Azul']);
  });

  it('no se puede sentar quien no tiene equipo asignado en la sala', async (t) => {
    const env = setup(t);
    const { roomId } = await tournament(env);
    assert.deepEqual(sit(roomId, makePlayer('Ana')), { ok: false, error: TEAM_REQUIRED_ERROR });
    assert.equal(getBoard(roomId).status, 'empty');
  });

  it('en una sala torneo sin equipos nadie puede sentarse', async (t) => {
    const env = setup(t);
    const { roomId } = await tournament(env, []);
    const ana = makePlayer('Ana');
    assert.equal(await matchManager.assignTeamOnJoin(roomId, ana.id), null);
    assert.deepEqual(sit(roomId, ana), { ok: false, error: TEAM_REQUIRED_ERROR });
  });

  it('en amistosas no hay equipos y cualquiera puede enfrentarse', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc({ type: 'amistosas', teams: makeTeams('Rojo') }));
    assert.deepEqual(matchManager.getRoomBoardsSummary(roomId).config.teams, []);
    startMatch(roomId);
    assert.deepEqual(getBoard(roomId).game.players.map((p) => p.team), [null, null]);
  });
});

describe('resúmenes de salas', () => {
  it('el listado de salas informa tableros libres, jugadores y equipos jugando, sin avatares', async (t) => {
    const env = setup(t);
    const teams = makeTeams('Rojo', 'Azul');
    const roomId = env.registerRoom(makeRoomDoc({ name: 'Torneo', type: 'torneo', boardCount: 3, teams }));
    const room = matchManager.getRoom(roomId);
    const players = ['Ana', 'Beto', 'Caro'].map(makePlayer);
    room.assignments.set(players[0].id, { institution: null, team: String(teams[0]._id) });
    room.assignments.set(players[1].id, { institution: null, team: String(teams[1]._id) });
    room.assignments.set(players[2].id, { institution: null, team: String(teams[0]._id) });
    sit(roomId, players[0], 1);
    sit(roomId, players[1], 1);
    sit(roomId, players[2], 2);

    const summary = matchManager.getActiveRoomsSummary().find((r) => r.id === roomId);
    assert.equal(summary.name, 'Torneo');
    assert.equal(summary.totalBoards, 3);
    assert.equal(summary.freeBoards, 2); // uno vacío y uno esperando rival
    assert.equal(summary.playersOnline, 3);
    assert.equal(summary.teamsPlaying, 2);
    assert.equal(summary.teams, undefined);
  });

  it('los tableros se ordenan: esperando rival, vacíos, en juego y finalizados', async (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc({ boardCount: 5 }));
    const p1 = startMatch(roomId, 1);
    startMatch(roomId, 2);
    sit(roomId, makePlayer('Solo'), 4);
    matchManager.handleResign({ roomId, boardNumber: 1, playerId: p1.black.id });

    const { boards } = matchManager.getRoomBoardsSummary(roomId);
    assert.deepEqual(boards.map((b) => [b.number, b.status]),
      [[4, 'waiting'], [3, 'empty'], [5, 'empty'], [2, 'playing'], [1, 'finished']]);
  });

  it('sala inexistente no tiene resumen', () => {
    assert.equal(matchManager.getRoomBoardsSummary(String(oid())), null);
  });
});

describe('sincronización con la base (cambios desde el panel admin)', () => {
  it('registra las salas abiertas nuevas', async (t) => {
    const doc = makeRoomDoc({ name: 'Nueva' });
    const env = setup(t, { openRooms: [doc] });
    await matchManager.syncRoomsWithDB();
    assert.equal(matchManager.getRoomBoardsSummary(String(doc._id)).config.name, 'Nueva');
    assert.equal(env.db.openRooms.length, 1);
  });

  it('los cambios de configuración aplican a tableros vacíos y esperando rival, no a partidas en curso', async (t) => {
    const doc = makeRoomDoc({ boardSize: 7, stonesToWin: 5, clockType: 'fischer-1-3', koRuleEnabled: true });
    const env = setup(t, { openRooms: [doc] });
    const roomId = env.registerRoom(doc);
    startMatch(roomId, 1);
    sit(roomId, makePlayer('Solo'), 2);

    env.db.openRooms = [{ ...doc, boardSize: 13, stonesToWin: 2, clockType: 'fischer-10-5', koRuleEnabled: false }];
    await matchManager.syncRoomsWithDB();

    const playing = getBoard(roomId, 1).game;
    assert.equal(playing.size, 7);
    assert.equal(playing.stonesToWin, 5);
    assert.equal(playing.koRuleEnabled, true);

    const waiting = getBoard(roomId, 2).game;
    assert.equal(waiting.size, 13);
    assert.equal(waiting.board.length, 169);
    assert.equal(waiting.stonesToWin, 2);
    assert.equal(waiting.koRuleEnabled, false);
    assert.deepEqual(waiting.clocks, { black: 600_000, white: 600_000 });

    // Una partida nueva usa la configuración actualizada
    startMatch(roomId, 3);
    assert.equal(getBoard(roomId, 3).game.size, 13);
    assert.ok(env.events.some((e) => e.event === 'room:update'));
  });

  it('sin cambios no emite actualizaciones', async (t) => {
    const doc = makeRoomDoc();
    const env = setup(t, { openRooms: [doc] });
    env.registerRoom(doc);
    await matchManager.syncRoomsWithDB();
    assert.equal(env.events.length, 0);
  });

  it('agrega tableros y quita los sobrantes solo si están vacíos', async (t) => {
    const doc = makeRoomDoc({ boardCount: 3 });
    const env = setup(t, { openRooms: [doc] });
    const roomId = env.registerRoom(doc);
    sit(roomId, makePlayer('Solo'), 3);

    env.db.openRooms = [{ ...doc, boardCount: 5 }];
    await matchManager.syncRoomsWithDB();
    assert.equal(matchManager.getRoom(roomId).boards.size, 5);

    env.db.openRooms = [{ ...doc, boardCount: 1 }];
    await matchManager.syncRoomsWithDB();
    assert.deepEqual([...matchManager.getRoom(roomId).boards.keys()].sort(), [1, 3]);

    // Cuando el tablero ocupado se libera, se quita en el próximo ciclo
    const solo = getBoard(roomId, 3).game.players[0];
    matchManager.handleDisconnect({ socketId: solo.socketId, playerId: solo.playerId });
    await matchManager.syncRoomsWithDB();
    assert.deepEqual([...matchManager.getRoom(roomId).boards.keys()], [1]);
  });

  it('da de baja las salas cerradas, pero pospone la baja si tienen partidas activas', async (t) => {
    const idle = makeRoomDoc({ name: 'Sin actividad' });
    const busy = makeRoomDoc({ name: 'Con partida' });
    const env = setup(t, { openRooms: [idle, busy] });
    const idleId = env.registerRoom(idle);
    const busyId = env.registerRoom(busy);
    const { black } = startMatch(busyId);

    env.db.openRooms = [];
    await matchManager.syncRoomsWithDB();
    assert.equal(matchManager.getRoom(idleId), undefined);
    assert.ok(matchManager.getRoom(busyId));

    matchManager.handleResign({ roomId: busyId, boardNumber: 1, playerId: black.id });
    await matchManager.syncRoomsWithDB();
    assert.equal(matchManager.getRoom(busyId), undefined);
  });
});

describe('validación del modelo de sala', () => {
  const valid = {
    name: 'Sala', type: 'torneo', boardCount: 4, boardSize: 9, stonesToWin: 3, clockType: 'fischer-5-5',
  };

  function errorsOf(fields) {
    const err = new Room({ ...valid, ...fields }).validateSync();
    return err ? Object.keys(err.errors) : [];
  }

  it('acepta una sala válida con valores por defecto', () => {
    const room = new Room(valid);
    assert.equal(room.validateSync(), undefined);
    assert.equal(room.koRuleEnabled, true);
    assert.equal(room.closed, false);
    assert.deepEqual(room.teams.toObject(), []);
  });

  it('solo admite tipos torneo y amistosas', () => {
    assert.deepEqual(errorsOf({ type: 'amistosas' }), []);
    assert.deepEqual(errorsOf({ type: 'liga' }), ['type']);
  });

  it('solo admite tableros de 7, 9 y 13', () => {
    for (const boardSize of [7, 9, 13]) assert.deepEqual(errorsOf({ boardSize }), []);
    for (const boardSize of [5, 8, 19]) assert.deepEqual(errorsOf({ boardSize }), ['boardSize']);
  });

  it('admite entre 1 y 50 tableros', () => {
    assert.deepEqual(errorsOf({ boardCount: 1 }), []);
    assert.deepEqual(errorsOf({ boardCount: 50 }), []);
    assert.deepEqual(errorsOf({ boardCount: 0 }), ['boardCount']);
    assert.deepEqual(errorsOf({ boardCount: 51 }), ['boardCount']);
  });

  it('exige al menos una piedra para ganar', () => {
    assert.deepEqual(errorsOf({ stonesToWin: 0 }), ['stonesToWin']);
  });

  it('solo admite los relojes Fischer configurados', () => {
    for (const clockType of ['fischer-1-3', 'fischer-3-5', 'fischer-5-5', 'fischer-10-5']) assert.deepEqual(errorsOf({ clockType }), []);
    assert.deepEqual(errorsOf({ clockType: 'byoyomi' }), ['clockType']);
  });

  it('no admite equipos con el mismo nombre, sin distinguir mayúsculas', () => {
    assert.deepEqual(errorsOf({ teams: [{ name: 'Rojo' }, { name: 'Azul' }] }), []);
    assert.deepEqual(errorsOf({ teams: [{ name: 'Rojo' }, { name: 'rojo' }] }), ['teams']);
  });

  it('los equipos requieren nombre', () => {
    assert.ok(errorsOf({ teams: [{ name: '' }] }).some((k) => k.startsWith('teams')));
  });
});
