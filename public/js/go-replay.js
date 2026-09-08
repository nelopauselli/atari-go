// Recalcula capturas del lado del cliente para reproducir una partida
// guardada, sin depender de una conexión en vivo al servidor.

export function neighborsC(size, x, y) {
  const list = [];
  if (x > 0) list.push([x - 1, y]);
  if (x < size - 1) list.push([x + 1, y]);
  if (y > 0) list.push([x, y - 1]);
  if (y < size - 1) list.push([x, y + 1]);
  return list;
}

export function groupLibsC(board, size, x, y) {
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
    for (const [nx, ny] of neighborsC(size, cx, cy)) {
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

export function boardAtStep(moveHistory, size, uptoCount) {
  const board = Array.from({ length: size }, () => Array(size).fill(null));
  for (let i = 0; i < uptoCount; i++) {
    const { color, x, y } = moveHistory[i];
    board[x][y] = color;
    const opp = color === 'black' ? 'white' : 'black';
    for (const [nx, ny] of neighborsC(size, x, y)) {
      if (board[nx][ny] === opp) {
        const { group, liberties } = groupLibsC(board, size, nx, ny);
        if (liberties === 0) for (const [gx, gy] of group) board[gx][gy] = null;
      }
    }
  }
  return board;
}
