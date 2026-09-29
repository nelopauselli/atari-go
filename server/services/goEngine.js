/**
 * Motor de reglas de Go aplicado a Atari-Go.
 * Tablero representado como array plano de tamaño size*size.
 * Valores de celda: null (vacía), 'black', 'white'.
 */

function createEmptyBoard(size) {
  return new Array(size * size).fill(null);
}

function idx(size, x, y) {
  return y * size + x;
}

function inBounds(size, x, y) {
  return x >= 0 && x < size && y >= 0 && y < size;
}

function neighbors(size, x, y) {
  const result = [];
  if (inBounds(size, x - 1, y)) result.push([x - 1, y]);
  if (inBounds(size, x + 1, y)) result.push([x + 1, y]);
  if (inBounds(size, x, y - 1)) result.push([x, y - 1]);
  if (inBounds(size, x, y + 1)) result.push([x, y + 1]);
  return result;
}

/** Devuelve { stones: Set("x,y"), liberties: Set("x,y") } de la cadena que contiene (x,y). */
function getGroup(board, size, x, y) {
  const color = board[idx(size, x, y)];
  const stones = new Set();
  const liberties = new Set();
  if (!color) return { stones, liberties, color: null };

  const stack = [[x, y]];
  const visited = new Set([`${x},${y}`]);

  while (stack.length) {
    const [cx, cy] = stack.pop();
    stones.add(`${cx},${cy}`);
    for (const [nx, ny] of neighbors(size, cx, cy)) {
      const key = `${nx},${ny}`;
      const cell = board[idx(size, nx, ny)];
      if (cell === null) {
        liberties.add(key);
      } else if (cell === color && !visited.has(key)) {
        visited.add(key);
        stack.push([nx, ny]);
      }
    }
  }
  return { stones, liberties, color };
}

/**
 * Intenta jugar una piedra. No muta el board de entrada; devuelve un nuevo estado.
 * @returns {{ok:boolean, error?:string, board?:Array, captured?:number, capturedStones?:Array}}
 */
function playMove(board, size, x, y, color) {
  if (!inBounds(size, x, y)) return { ok: false, error: 'Fuera del tablero' };
  if (board[idx(size, x, y)] !== null) return { ok: false, error: 'Casilla ocupada' };

  const next = board.slice();
  next[idx(size, x, y)] = color;

  const opponent = color === 'black' ? 'white' : 'black';
  let capturedStones = [];

  // Capturar cadenas rivales adyacentes sin libertades
  for (const [nx, ny] of neighbors(size, x, y)) {
    if (next[idx(size, nx, ny)] === opponent) {
      const group = getGroup(next, size, nx, ny);
      if (group.liberties.size === 0) {
        for (const key of group.stones) {
          const [gx, gy] = key.split(',').map(Number);
          next[idx(size, gx, gy)] = null;
          capturedStones.push([gx, gy]);
        }
      }
    }
  }

  // Regla de autocaptura: si la propia cadena queda sin libertades y no capturó nada, movimiento ilegal
  const ownGroup = getGroup(next, size, x, y);
  if (ownGroup.liberties.size === 0 && capturedStones.length === 0) {
    return { ok: false, error: 'Autocaptura no permitida' };
  }

  return { ok: true, board: next, captured: capturedStones.length, capturedStones };
}

/** Ko simple: compara el board resultante con el board previo a la jugada anterior. */
function violatesSimpleKo(newBoardKey, previousBoardKey) {
  return previousBoardKey !== null && newBoardKey === previousBoardKey;
}

function boardKey(board) {
  return board.map((c) => (c === null ? '.' : c === 'black' ? 'B' : 'W')).join('');
}

/**
 * Indica si `color` tiene al menos una jugada legal (casilla vacía, sin autocaptura
 * y, si corresponde, que no viole el Ko simple).
 */
function hasLegalMove(board, size, color, previousBoardKey, koRuleEnabled) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[idx(size, x, y)] !== null) continue;
      const result = playMove(board, size, x, y, color);
      if (!result.ok) continue;
      if (koRuleEnabled && violatesSimpleKo(boardKey(result.board), previousBoardKey)) continue;
      return true;
    }
  }
  return false;
}

module.exports = {
  createEmptyBoard,
  idx,
  inBounds,
  getGroup,
  playMove,
  violatesSimpleKo,
  boardKey,
  hasLegalMove,
};
