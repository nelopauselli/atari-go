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

test('historial: al invalidar la sala (partida terminada) se vuelve a consultar', async (t) => {
  const roomId = String(new mongoose.Types.ObjectId());
  roomHistory.invalidateRoomHistory(roomId);
  let matches = [];
  const calls = stubModels(t, () => matches);

  assert.strictEqual(JSON.parse(await roomHistory.getRoomHistoryJson(roomId)).matches.length, 0);
  matches = [{ _id: 'm1', boardNumber: 1, players: [], result: { winnerColor: null } }];
  // Dentro del TTL y sin invalidar, se sirve lo cacheado
  assert.strictEqual(JSON.parse(await roomHistory.getRoomHistoryJson(roomId)).matches.length, 0);
  roomHistory.invalidateRoomHistory(roomId);
  assert.strictEqual(JSON.parse(await roomHistory.getRoomHistoryJson(roomId)).matches.length, 1);
  assert.strictEqual(calls.find, 2);
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
