/**
 * Reinicio del servidor: cada jugada se guarda en Mongo y, al arrancar, las partidas
 * que estaban en curso se retoman desde lo guardado (sin descontar el tiempo caído).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  START_TIME, oid, makeRoomDoc, makePlayer, setup, flush, startMatch, getBoard, rowsFromBoard,
} = require('./helpers');
const matchManager = require('../server/services/matchManager');

const move = (color, x, y, secs) => ({ color, x, y, pass: false, captured: 0, timestamp: new Date(START_TIME - 60000 + secs * 1000) });

/** Match "playing" tal como quedaría en Mongo: negro capturó la blanca de (0,0) y le toca a blanco. */
function makeActiveMatch(roomId, overrides = {}) {
  return {
    _id: oid(),
    room: roomId,
    boardNumber: 2,
    boardSize: 7,
    stonesToWin: 5,
    clockType: 'fischer-3-5',
    koRuleEnabled: true,
    players: [
      { player: oid(), nickname: 'Negro', team: null, teamName: '', color: 'black' },
      { player: oid(), nickname: 'Blanco', team: null, teamName: '', color: 'white' },
    ],
    moves: [move('black', 1, 0, 10), move('white', 0, 0, 20), move('black', 0, 1, 30)],
    clocks: { black: 170000, white: 175000 },
    status: 'playing',
    ...overrides,
  };
}

describe('persistencia de jugadas', () => {
  it('guarda cada jugada con los relojes y las capturas', async (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const { black } = startMatch(roomId);
    await flush();
    assert.deepEqual(env.db.matchesCreated[0].clocks, { black: 180000, white: 180000 });

    t.mock.timers.tick(4000);
    assert.equal(matchManager.handleMove({ roomId, boardNumber: 1, playerId: black.id, x: 3, y: 3 }).ok, true);
    await flush();

    assert.equal(env.db.matchWrites.length, 1);
    const { filter, update } = env.db.matchWrites[0];
    assert.equal(filter._id, env.db.matchesCreated[0]._id);
    assert.equal(update.$push.moves.color, 'black');
    assert.deepEqual([update.$push.moves.x, update.$push.moves.y], [3, 3]);
    assert.deepEqual(update.$set.clocks, { black: 180000 - 4000 + 5000, white: 180000 });
  });

  it('una jugada hecha antes de que se termine de crear el Match igual se guarda', async (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const { black } = startMatch(roomId);
    matchManager.handleMove({ roomId, boardNumber: 1, playerId: black.id, x: 3, y: 3 });
    await flush();
    assert.equal(env.db.matchWrites.length, 1);
    assert.equal(env.db.matchWrites[0].filter._id, env.db.matchesCreated[0]._id);
  });
});

describe('restauración de partidas al arrancar', () => {
  it('reconstruye tablero, turno, capturas y relojes', async (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const match = makeActiveMatch(roomId);
    env.db.activeMatches = [match];

    assert.equal(await matchManager.restoreActiveMatches(), 1);
    const board = getBoard(roomId, 2);
    assert.equal(board.status, 'playing');
    assert.equal(board.matchId, match._id);
    const g = board.game;
    assert.deepEqual(rowsFromBoard(g.board, 7).slice(0, 2), ['.B.....', 'B......']);
    assert.equal(g.turn, 'white');
    assert.equal(g.capturedByBlack, 1);
    assert.equal(g.capturedByWhite, 0);
    assert.deepEqual(g.lastMove, { x: 0, y: 1 });
    assert.deepEqual(g.clocks, { black: 170000, white: 175000 });
    assert.equal(g.moves.length, 3);
  });

  it('no descuenta el tiempo que el servidor estuvo caído', async (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    env.db.activeMatches = [makeActiveMatch(roomId)];
    await matchManager.restoreActiveMatches();

    t.mock.timers.tick(5000);
    const clockEvents = env.events.filter((e) => e.event === 'board:clock');
    assert.deepEqual(clockEvents.at(-1).payload.clocks, { black: 170000, white: 170000 });
  });

  it('los jugadores vuelven a sentarse como jugadores y pueden seguir jugando', async (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const match = makeActiveMatch(roomId);
    env.db.activeMatches = [match];
    await matchManager.restoreActiveMatches();

    const white = { id: String(match.players[1].player), nickname: 'Blanco' };
    const sit = matchManager.handleSit({ roomId, boardNumber: 2, player: white, socketId: 'nuevo' });
    assert.deepEqual(sit, { ok: true, role: 'player', color: 'white' });

    assert.equal(matchManager.handleMove({ roomId, boardNumber: 2, playerId: white.id, x: 5, y: 5 }).ok, true);
    await flush();
    assert.equal(env.db.matchWrites.at(-1).filter._id, match._id);
    assert.equal(getBoard(roomId, 2).game.turn, 'black');
  });

  it('respeta el Ko con la posición anterior a la última jugada', async (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    // Negro captura en (2,1) la blanca de (1,1); blanco no puede recapturar de inmediato en (1,1).
    env.db.activeMatches = [makeActiveMatch(roomId, {
      moves: [
        move('black', 1, 0, 1), move('white', 2, 0, 2),
        move('black', 0, 1, 3), move('white', 3, 1, 4),
        move('black', 1, 2, 5), move('white', 2, 2, 6),
        move('black', 6, 6, 7), move('white', 1, 1, 8),
        move('black', 2, 1, 9),
      ],
    })];
    await matchManager.restoreActiveMatches();
    const g = getBoard(roomId, 2).game;
    assert.equal(g.capturedByBlack, 1);
    const whiteId = g.players.find((p) => p.color === 'white').playerId;
    const result = matchManager.handleMove({ roomId, boardNumber: 2, playerId: whiteId, x: 1, y: 1 });
    assert.deepEqual(result, { ok: false, error: 'Jugada inválida: regla de Ko' });
  });

  it('cierra la partida si la última jugada guardada ya la había decidido', async (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc());
    const match = makeActiveMatch(roomId, { stonesToWin: 1 });
    env.db.activeMatches = [match];
    await matchManager.restoreActiveMatches();

    assert.equal(getBoard(roomId, 2).status, 'finished');
    assert.equal(env.db.matchUpdates.length, 1);
    assert.equal(env.db.matchUpdates[0].id, match._id);
    assert.deepEqual(env.db.matchUpdates[0].update.result, { winnerColor: 'black', reason: 'capture' });
  });

  it('marca como abortadas las partidas que no se pueden retomar', async (t) => {
    const env = setup(t);
    const roomId = env.registerRoom(makeRoomDoc({ boardCount: 2 }));
    const closedRoom = makeActiveMatch(oid());
    const missingBoard = makeActiveMatch(roomId, { boardNumber: 5 });
    const legacy = makeActiveMatch(roomId, { clocks: null, moves: [] });
    env.db.activeMatches = [closedRoom, missingBoard, legacy];

    assert.equal(await matchManager.restoreActiveMatches(), 0);
    const aborted = env.db.matchWrites.filter((w) => w.update.status === 'aborted').map((w) => w.filter._id);
    assert.deepEqual(aborted, [closedRoom._id, missingBoard._id, legacy._id]);
    assert.equal(getBoard(roomId, 2).status, 'empty');
  });
});
