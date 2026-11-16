/**
 * Entrada explícita a un tablero desde la sala: "Jugar" (mode 'play') u "Observar" (mode 'watch').
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  makeRoomDoc, makeTeams, makePlayer, setup, startMatch, getBoard,
} = require('./helpers');
const matchManager = require('../server/services/matchManager');

const sit = (roomId, player, socketId, mode, boardNumber = 1) => matchManager.handleSit({
  roomId, boardNumber, player, socketId, mode,
});

describe('jugar u observar un tablero', () => {
  it('observar un tablero esperando rival no sienta al jugador ni arranca la partida', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    sit(roomId, makePlayer('A'), 's1', 'play');

    const result = sit(roomId, makePlayer('B'), 's2', 'watch');
    assert.deepEqual(result, { ok: true, role: 'spectator' });
    const board = getBoard(roomId);
    assert.equal(board.status, 'waiting');
    assert.equal(board.game.players.length, 1);
    assert.ok(board.spectators.has('s2'));
  });

  it('no se puede observar un tablero vacío', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const result = sit(roomId, makePlayer('A'), 's1', 'watch');
    assert.equal(result.ok, false);
    assert.equal(getBoard(roomId).status, 'empty');
  });

  it('si puede elegir rival, jugar en un tablero con partida en curso se rechaza (no entra como espectador)', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc({ chooseOpponent: true }));
    startMatch(roomId);
    const result = sit(roomId, makePlayer('C'), 's3', 'play');
    assert.equal(result.ok, false);
    assert.equal(getBoard(roomId).spectators.has('s3'), false);
  });

  it('un jugador de la partida que pulsa "Observar" retoma su asiento', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const black = makePlayer('Negro');
    startMatch(roomId, 1, black);
    const result = sit(roomId, black, 's-nuevo', 'watch');
    assert.deepEqual(result, { ok: true, role: 'player', color: 'black' });
  });

  it('si puede elegir rival, en torneo jugar contra alguien del mismo equipo se rechaza', async (t) => {
    const a = makePlayer('A');
    const b = makePlayer('B');
    const env = setup(t, { playerInstitutions: { [a.id]: 'inst', [b.id]: 'inst' } });
    const roomId = env.registerRoom(makeRoomDoc({ type: 'torneo', teams: makeTeams('Rojo'), chooseOpponent: true }));
    await matchManager.assignTeamOnJoin(roomId, a.id);
    await matchManager.assignTeamOnJoin(roomId, b.id);
    sit(roomId, a, 's1', 'play');
    const result = sit(roomId, b, 's2', 'play');
    assert.equal(result.ok, false);
    assert.equal(getBoard(roomId).spectators.has('s2'), false);
  });

  it('el resumen de tablero incluye el id de cada jugador', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const a = makePlayer('A');
    sit(roomId, a, 's1', 'play');
    const summary = matchManager.getRoomBoardsSummary(roomId).boards.find((x) => x.number === 1);
    assert.equal(summary.players[0].playerId, a.id);
  });
});

describe('sentarse a jugar sin elegir rival (la sala no lo permite)', () => {
  it('por defecto la sala no permite elegir rival', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    assert.equal(matchManager.getRoomBoardsSummary(roomId).config.chooseOpponent, false);
  });

  it('el servidor ignora el tablero pedido y elige el primero con rival esperando', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    sit(roomId, makePlayer('A'), 's1', 'play', 1);
    const result = sit(roomId, makePlayer('B'), 's2', 'play', 3);
    assert.equal(result.ok, true);
    assert.equal(result.boardNumber, 1);
    assert.equal(getBoard(roomId, 1).status, 'playing');
    assert.equal(getBoard(roomId, 3).status, 'empty');
  });

  it('si no hay rival esperando, se sienta en el primer tablero vacío', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    startMatch(roomId, 1);
    const result = sit(roomId, makePlayer('C'), 's3', 'play', 3);
    assert.deepEqual(result, { ok: true, role: 'player', color: null, boardNumber: 2 });
    assert.equal(getBoard(roomId, 2).status, 'waiting');
  });

  it('en torneo no lo empareja con alguien de su mismo equipo', async (t) => {
    const a = makePlayer('A');
    const b = makePlayer('B');
    const env = setup(t, { playerInstitutions: { [a.id]: 'inst', [b.id]: 'inst' } });
    const roomId = env.registerRoom(makeRoomDoc({ type: 'torneo', teams: makeTeams('Rojo') }));
    await matchManager.assignTeamOnJoin(roomId, a.id);
    await matchManager.assignTeamOnJoin(roomId, b.id);
    sit(roomId, a, 's1', 'play');
    const result = sit(roomId, b, 's2', 'play');
    assert.equal(result.boardNumber, 2);
    assert.equal(getBoard(roomId, 1).status, 'waiting');
    assert.equal(getBoard(roomId, 2).status, 'waiting');
  });

  it('sin tableros libres se rechaza', (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc({ boardCount: 1 }));
    startMatch(roomId, 1);
    const result = sit(roomId, makePlayer('C'), 's3', 'play');
    assert.equal(result.ok, false);
  });
});
