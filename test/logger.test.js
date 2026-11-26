const test = require('node:test');
const assert = require('node:assert');
const { Types } = require('mongoose');
const log = require('../server/services/logger');

function captureLine(t, fn) {
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(line));
  fn();
  return lines[0];
}

test('logger: los ObjectId salen como su hex, sin comillas (para poder hacer grep por id)', (t) => {
  const id = new Types.ObjectId('6b088b228accbaea336a44b9');
  const line = captureLine(t, () => log.info('match.start', { matchId: id }));
  assert.match(line, / match\.start matchId=6b088b228accbaea336a44b9$/);
});

test('logger: los textos con espacios van entre comillas y los objetos como JSON', (t) => {
  const line = captureLine(t, () => log.info('room.join', { room: 'Prueba de carga', n: 3, obj: { a: 1 } }));
  assert.match(line, / room\.join room="Prueba de carga" n=3 obj="\{\\"a\\":1\}"$/);
});
