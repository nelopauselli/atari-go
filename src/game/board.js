'use strict';

/**
 * Motor de reglas de Go aplicado a Atari-Go.
 * Representación de tablero: array de arrays de tamaño size x size.
 * Valores de celda: 0 = vacío, 1 = negro, 2 = blanco.
 *
 * El motor es puro (no side effects sobre los argumentos) para que sea
 * fácil de testear y de usar tanto en el servidor como, potencialmente,
 * en el cliente para previsualizar jugadas.
 */

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

function otherColor(color) {
  return color === BLACK ? WHITE : BLACK;
}

function createEmptyBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(EMPTY));
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function inBounds(size, row, col) {
  return row >= 0 && row < size && col >= 0 && col < size;
}

function neighborsOf(size, row, col) {
  const deltas = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const result = [];
  for (const [dr, dc] of deltas) {
    const r = row + dr;
    const c = col + dc;
    if (inBounds(size, r, c)) result.push([r, c]);
  }
  return result;
}

/**
 * Devuelve el grupo (cadena) conectado a (row,col) y sus libertades.
 * Si la celda está vacía, devuelve un grupo vacío.
 */
function getGroup(board, row, col) {
  const size = board.length;
  const color = board[row][col];
  const stones = [];
  const liberties = new Set();
  if (color === EMPTY) return { color, stones, liberties };

  const seen = new Set();
  const key = (r, c) => `${r},${c}`;
  const stack = [[row, col]];
  seen.add(key(row, col));

  while (stack.length) {
    const [r, c] = stack.pop();
    stones.push([r, c]);
    for (const [nr, nc] of neighborsOf(size, r, c)) {
      const nColor = board[nr][nc];
      if (nColor === EMPTY) {
        liberties.add(key(nr, nc));
      } else if (nColor === color && !seen.has(key(nr, nc))) {
        seen.add(key(nr, nc));
        stack.push([nr, nc]);
      }
    }
  }

  return { color, stones, liberties };
}

function serializeBoard(board) {
  return board.map((row) => row.join('')).join('/');
}

/**
 * Intenta aplicar una jugada. No muta el tablero recibido.
 *
 * @param {number[][]} board
 * @param {number} row
 * @param {number} col
 * @param {number} color BLACK o WHITE
 * @param {string|null} koForbiddenPosition Serialización de la posición
 *   prohibida por la regla del ko (la posición resultante de la jugada
 *   anterior del rival), o null si no aplica.
 * @returns {{legal: boolean, reason?: string, board?: number[][],
 *   captured?: number[][], capturedCount?: number, resultingPosition?: string}}
 */
function applyMove(board, row, col, color, koForbiddenPosition = null) {
  const size = board.length;

  if (!inBounds(size, row, col)) {
    return { legal: false, reason: 'fuera_de_tablero' };
  }
  if (board[row][col] !== EMPTY) {
    return { legal: false, reason: 'casillero_ocupado' };
  }

  const next = cloneBoard(board);
  next[row][col] = color;

  // 1) Remover grupos rivales sin libertades.
  const opponent = otherColor(color);
  const captured = [];
  const removedGroups = new Set();
  for (const [nr, nc] of neighborsOf(size, row, col)) {
    if (next[nr][nc] !== opponent) continue;
    const groupKey = `${nr},${nc}`;
    if (removedGroups.has(groupKey)) continue;
    const group = getGroup(next, nr, nc);
    if (group.liberties.size === 0) {
      for (const [gr, gc] of group.stones) {
        next[gr][gc] = EMPTY;
        captured.push([gr, gc]);
        removedGroups.add(`${gr},${gc}`);
      }
    }
  }

  // 2) Verificar suicidio: el grupo propio recién formado debe tener
  //    libertades, salvo que la jugada haya capturado algo.
  const ownGroup = getGroup(next, row, col);
  if (ownGroup.liberties.size === 0 && captured.length === 0) {
    return { legal: false, reason: 'jugada_suicida' };
  }

  const resultingPosition = serializeBoard(next);

  // 3) Regla de ko (ko simple/posicional de un paso): no se puede repetir
  //    exactamente la posición que dejó la jugada anterior del rival.
  if (koForbiddenPosition && resultingPosition === koForbiddenPosition) {
    return { legal: false, reason: 'regla_ko' };
  }

  return {
    legal: true,
    board: next,
    captured,
    capturedCount: captured.length,
    resultingPosition,
  };
}

/**
 * Determina si un jugador tiene al menos una jugada legal disponible.
 * Se usa para UX (avisar "no tenés jugadas") aunque pasar siempre es legal.
 */
function hasLegalMove(board, color, koForbiddenPosition) {
  const size = board.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== EMPTY) continue;
      const result = applyMove(board, r, c, color, koForbiddenPosition);
      if (result.legal) return true;
    }
  }
  return false;
}

module.exports = {
  EMPTY,
  BLACK,
  WHITE,
  otherColor,
  createEmptyBoard,
  cloneBoard,
  getGroup,
  applyMove,
  serializeBoard,
  hasLegalMove,
};
