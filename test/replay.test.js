/**
 * Reproductor de partidas: reconstrucción de cada posición (tablero, capturas y relojes)
 * a partir de las jugadas guardadas.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildReplayFrames } = require('../server/services/replay');

const T0 = new Date('2026-01-01T10:00:00Z').getTime();
const move = (color, x, y, secs) => ({ color, x, y, pass: false, timestamp: new Date(T0 + secs * 1000) });

describe('reproductor de partidas', () => {
  // Negro captura la piedra blanca de la esquina (0,0) rodeándola en (1,0) y (0,1).
  const match = {
    boardSize: 5,
    clockType: 'fischer-1-3',
    startedAt: new Date(T0),
    moves: [move('black', 1, 0, 10), move('white', 0, 0, 12), move('black', 0, 1, 20)],
  };
  const frames = buildReplayFrames(match);

  it('arma una posición inicial vacía y una por jugada', () => {
    assert.equal(frames.length, 4);
    assert.ok(frames[0].board.every((c) => c === null));
    assert.equal(frames[0].lastMove, null);
    assert.equal(frames[0].turn, 'black');
    assert.deepEqual(frames[1].lastMove, { x: 1, y: 0 });
    assert.equal(frames[1].turn, 'white');
  });

  it('aplica las capturas y acumula el total por color', () => {
    assert.equal(frames[2].board[0], 'white');
    assert.equal(frames[3].board[0], null);
    assert.equal(frames[3].captured, 1);
    assert.equal(frames[3].capturedByBlack, 1);
    assert.equal(frames[3].capturedByWhite, 0);
  });

  it('guarda el momento de cada jugada desde el inicio de la partida', () => {
    assert.deepEqual(frames.map((f) => f.at), [0, 10000, 12000, 20000]);
  });

  it('numera las jugadas', () => {
    assert.deepEqual(frames.map((f) => f.moveNumber), [0, 1, 2, 3]);
  });

  it('agrega una posición de cierre cuando la partida termina por tiempo', () => {
    const timeout = buildReplayFrames({
      ...match, endedAt: new Date(T0 + 30 * 1000), result: { winnerColor: 'black', reason: 'timeout' },
    });
    assert.equal(timeout.length, 5);
    const end = timeout[4];
    assert.equal(end.at, 30000);
    assert.equal(end.moveNumber, 3);
    assert.equal(end.color, null);
    assert.deepEqual(end.board, frames[3].board);
    assert.deepEqual(end.clocks, { black: 48000, white: 61000 - 10000 });
  });

  it('no agrega posición de cierre si la partida terminó por captura', () => {
    const capture = buildReplayFrames({
      ...match, endedAt: new Date(T0 + 30 * 1000), result: { winnerColor: 'black', reason: 'capture' },
    });
    assert.equal(capture.length, 4);
  });

  it('reconstruye los relojes Fischer (tiempo usado + incremento)', () => {
    assert.deepEqual(frames[0].clocks, { black: 60000, white: 60000 });
    assert.deepEqual(frames[1].clocks, { black: 60000 - 10000 + 3000, white: 60000 });
    assert.deepEqual(frames[2].clocks, { black: 53000, white: 60000 - 2000 + 3000 });
    assert.deepEqual(frames[3].clocks, { black: 53000 - 8000 + 3000, white: 61000 });
  });
});
