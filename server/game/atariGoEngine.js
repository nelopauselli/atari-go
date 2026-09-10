'use strict';

/**
 * Motor de reglas de Atari-Go.
 * Representa el tablero como una matriz de tamaño size x size con valores:
 *   0 = vacío, 1 = negro, 2 = blanco
 *
 * El estado del juego se maneja como objeto plano para poder
 * serializarlo fácilmente y guardarlo/reconstruirlo desde Mongo.
 */

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

function colorToValue(color) {
  return color === 'black' ? BLACK : WHITE;
}

function opponentValue(value) {
  return value === BLACK ? WHITE : BLACK;
}

function createEmptyBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(EMPTY));
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function inBounds(size, x, y) {
  return x >= 0 && x < size && y >= 0 && y < size;
}

function neighbors(size, x, y) {
  const result = [];
  const deltas = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dx, dy] of deltas) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(size, nx, ny)) result.push([nx, ny]);
  }
  return result;
}

/**
 * Devuelve el grupo (lista de coordenadas) y sus libertades para
 * la piedra ubicada en (x, y).
 */
function getGroup(board, size, x, y) {
  const value = board[x][y];
  if (value === EMPTY) return { stones: [], liberties: new Set() };

  const visited = new Set();
  const stones = [];
  const liberties = new Set();
  const stack = [[x, y]];

  while (stack.length) {
    const [cx, cy] = stack.pop();
    const key = `${cx},${cy}`;
    if (visited.has(key)) continue;
    visited.add(key);
    stones.push([cx, cy]);

    for (const [nx, ny] of neighbors(size, cx, cy)) {
      const nVal = board[nx][ny];
      if (nVal === EMPTY) {
        liberties.add(`${nx},${ny}`);
      } else if (nVal === value) {
        const nKey = `${nx},${ny}`;
        if (!visited.has(nKey)) stack.push([nx, ny]);
      }
    }
  }

  return { stones, liberties };
}

/**
 * Intenta jugar una piedra. No muta el board recibido; devuelve un
 * nuevo estado con el resultado.
 *
 * @returns {{ok:boolean, reason?:string, board?:number[][], capturedCount?:number, capturedStones?:Array}}
 */
function playMove(board, size, x, y, color) {
  if (!inBounds(size, x, y)) return { ok: false, reason: 'fuera_de_rango' };
  if (board[x][y] !== EMPTY) return { ok: false, reason: 'casillero_ocupado' };

  const value = colorToValue(color);
  const rival = opponentValue(value);
  const working = cloneBoard(board);
  working[x][y] = value;

  // 1. Capturar grupos rivales sin libertades
  const capturedStones = [];
  const checkedRivalGroups = new Set();

  for (const [nx, ny] of neighbors(size, x, y)) {
    if (working[nx][ny] !== rival) continue;
    const groupKey = `${nx},${ny}`;
    if (checkedRivalGroups.has(groupKey)) continue;

    const { stones, liberties } = getGroup(working, size, nx, ny);
    stones.forEach(([sx, sy]) => checkedRivalGroups.add(`${sx},${sy}`));

    if (liberties.size === 0) {
      for (const [sx, sy] of stones) {
        working[sx][sy] = EMPTY;
        capturedStones.push([sx, sy]);
      }
    }
  }

  // 2. Regla de suicidio: si el grupo propio queda sin libertades
  //    y no capturó nada, el movimiento es ilegal.
  const ownGroup = getGroup(working, size, x, y);
  if (ownGroup.liberties.size === 0 && capturedStones.length === 0) {
    return { ok: false, reason: 'movimiento_suicida' };
  }

  return {
    ok: true,
    board: working,
    capturedCount: capturedStones.length,
    capturedStones,
  };
}

module.exports = {
  EMPTY,
  BLACK,
  WHITE,
  colorToValue,
  opponentValue,
  createEmptyBoard,
  cloneBoard,
  getGroup,
  playMove,
};
