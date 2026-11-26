require('./helpers');
const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

const Match = require('../server/models/Match');
const Room = require('../server/models/Room');
const Player = require('../server/models/Player');
const roomHistory = require('../server/services/roomHistory');

// Query encadenable de Mongoose simulada: registra lo que se le pide y resuelve con `result`.
function fakeQuery(result, calls) {
  const q = {
    select(arg) { calls.select = arg; return q; },
    sort() { return q; },
    populate() { return q; },
    lean() { return Promise.resolve(typeof result === 'function' ? result() : result); },
    catch() { return q; },
  };
  return q;
}

function stubModels(t, matchesFn) {
  const calls = { find: 0 };
  t.mock.method(Match, 'find', () => { calls.find += 1; return fakeQuery(matchesFn, calls); });
  t.mock.method(Room, 'findById', () => fakeQuery(null, {}));
  t.mock.method(Player, 'find', () => fakeQuery([], {}));
  return calls;
}

test('historial: pedidos simultáneos comparten una sola consulta y no traen las jugadas', async (t) => {
  const roomId = String(new mongoose.Types.ObjectId());
  roomHistory.invalidateRoomHistory(roomId);
  const calls = stubModels(t, () => [{ _id: 'm1', boardNumber: 1, players: [], result: { winnerColor: null } }]);

  const results = await Promise.all(Array.from({ length: 50 }, () => roomHistory.getRoomHistoryJson(roomId)));

  assert.strictEqual(calls.find, 1);
  assert.strictEqual(calls.select, '-moves');
  assert.ok(results.every((r) => r === results[0]));
  assert.strictEqual(JSON.parse(results[0]).matches.length, 1);
});

const match = (id) => ({ _id: id, boardNumber: 1, players: [], result: { winnerColor: null } });

test('historial: al invalidar la sala (partida terminada) se vuelve a consultar', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const roomId = String(new mongoose.Types.ObjectId());
  let matches = [];
  const calls = stubModels(t, () => matches);

  assert.strictEqual(JSON.parse(await roomHistory.getRoomHistoryJson(roomId)).matches.length, 0);
  matches = [match('m1')];
  // Dentro del TTL y sin invalidar, se sirve lo cacheado
  assert.strictEqual(JSON.parse(await roomHistory.getRoomHistoryJson(roomId)).matches.length, 0);
  roomHistory.invalidateRoomHistory(roomId);
  // Después de invalidar nunca se sirven datos viejos: se espera la próxima reconstrucción.
  const pending = roomHistory.getRoomHistoryJson(roomId);
  t.mock.timers.tick(roomHistory.MIN_REBUILD_MS);
  assert.strictEqual(JSON.parse(await pending).matches.length, 1);
  assert.strictEqual(calls.find, 2);
});

test('historial: muchas partidas terminadas seguidas comparten una sola reconstrucción', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const roomId = String(new mongoose.Types.ObjectId());
  let matches = [];
  const calls = stubModels(t, () => matches);

  await roomHistory.getRoomHistoryJson(roomId);
  const pedidos = [];
  for (let i = 1; i <= 5; i++) {
    matches = [...matches, match(`m${i}`)];
    roomHistory.invalidateRoomHistory(roomId);
    pedidos.push(roomHistory.getRoomHistoryJson(roomId));
    t.mock.timers.tick(100);
  }
  t.mock.timers.tick(roomHistory.MIN_REBUILD_MS);
  const results = await Promise.all(pedidos);

  assert.strictEqual(calls.find, 2);
  assert.ok(results.every((r) => JSON.parse(r).matches.length === 5));
});

test('historial: un error no queda cacheado', async (t) => {
  const roomId = String(new mongoose.Types.ObjectId());
  roomHistory.invalidateRoomHistory(roomId);
  let fail = true;
  stubModels(t, () => {
    if (fail) throw new Error('boom');
    return [];
  });

  await assert.rejects(roomHistory.getRoomHistoryJson(roomId));
  fail = false;
  assert.strictEqual(JSON.parse(await roomHistory.getRoomHistoryJson(roomId)).matches.length, 0);
});
