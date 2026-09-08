// Lógica pura del tablero: tamaños permitidos, libertades, capturas y
// validación de jugadas. No sabe nada de sockets, reloj ni persistencia.

const ALLOWED_SIZES = [5, 7, 9, 13];

function createEmptyBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function neighbors(size, x, y) {
  const list = [];
  if (x > 0) list.push([x - 1, y]);
  if (x < size - 1) list.push([x + 1, y]);
  if (y > 0) list.push([x, y - 1]);
  if (y < size - 1) list.push([x, y + 1]);
  return list;
}

function groupAndLiberties(board, size, x, y) {
  const color = board[x][y];
  const visited = new Set();
  const stack = [[x, y]];
  const group = [];
  const libSeen = new Set();
  let liberties = 0;
  while (stack.length) {
    const [cx, cy] = stack.pop();
    const key = cx + ',' + cy;
    if (visited.has(key)) continue;
    visited.add(key);
    group.push([cx, cy]);
    for (const [nx, ny] of neighbors(size, cx, cy)) {
      const nkey = nx + ',' + ny;
      if (board[nx][ny] === null) {
        if (!libSeen.has(nkey)) { libSeen.add(nkey); liberties++; }
      } else if (board[nx][ny] === color && !visited.has(nkey)) {
        stack.push([nx, ny]);
      }
    }
  }
  return { group, liberties };
}

function opponent(c) { return c === 'black' ? 'white' : 'black'; }

// Devuelve true si la jugada fue válida y quedó registrada en room.moveHistory.
// Muta room.board, room.captures, room.current, room.gameOver, room.winner,
// room.winReason y room.message según corresponda.
function doMove(room, color, x, y) {
  const { size } = room;
  if (x < 0 || y < 0 || x >= size || y >= size) return false;
  if (room.board[x][y] !== null) return false;

  room.board[x][y] = color;
  const opp = opponent(color);

  let capturedStones = [];
  for (const [nx, ny] of neighbors(size, x, y)) {
    if (room.board[nx][ny] === opp) {
      const { group, liberties } = groupAndLiberties(room.board, size, nx, ny);
      if (liberties === 0) {
        for (const [gx, gy] of group) room.board[gx][gy] = null;
        capturedStones = capturedStones.concat(group);
      }
    }
  }

  const { liberties: ownLiberties } = groupAndLiberties(room.board, size, x, y);
  if (ownLiberties === 0 && capturedStones.length === 0) {
    room.board[x][y] = null; // jugada ilegal (suicida), se revierte
    room.message = 'Jugada ilegal: esa piedra quedaría sin libertades.';
    return false;
  }

  room.moveHistory.push({ color, x, y });

  if (capturedStones.length > 0) {
    room.captures[color] += capturedStones.length;
    const label = color === 'black' ? 'Negro' : 'Blanco';
    if (room.captures[color] >= room.captureTarget) {
      room.gameOver = true;
      room.winner = color;
      room.winReason = 'capture';
      room.message = `¡${label} gana con ${room.captures[color]} piedra(s) capturada(s)!`;
      return true;
    }
    room.message = `${label} capturó ${capturedStones.length} piedra(s) (${room.captures[color]}/${room.captureTarget}).`;
    room.current = opp;
    return true;
  }

  room.message = '';
  room.current = opp;

  const isFull = room.board.every(row => row.every(cell => cell !== null));
  if (isFull) {
    room.gameOver = true;
    room.winner = null;
    room.winReason = 'draw';
    room.message = 'Tablero lleno sin capturas — partida empatada.';
  }
  return true;
}

module.exports = {
  ALLOWED_SIZES,
  createEmptyBoard,
  neighbors,
  groupAndLiberties,
  opponent,
  doMove,
};
