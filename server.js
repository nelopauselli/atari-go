const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const ALLOWED_SIZES = [5, 7, 9, 13];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos

const rooms = new Map();

function generateCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

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

function makeRoom(size, captureTarget) {
  size = ALLOWED_SIZES.includes(size) ? size : 7;
  captureTarget = Number.isInteger(captureTarget) && captureTarget >= 1 && captureTarget <= 25 ? captureTarget : 1;
  return {
    size,
    captureTarget,
    board: createEmptyBoard(size),
    current: 'black',
    captures: { black: 0, white: 0 },
    gameOver: false,
    message: '',
    winner: null,
    players: { black: null, white: null },
    sockets: new Map(), // socketId -> role ('black' | 'white' | 'spectator')
  };
}

function resetRoom(room) {
  room.board = createEmptyBoard(room.size);
  room.current = 'black';
  room.captures = { black: 0, white: 0 };
  room.gameOver = false;
  room.message = '';
  room.winner = null;
}

function doMove(room, color, x, y) {
  const { size } = room;
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  if (room.board[x][y] !== null) return;

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
    return;
  }

  if (capturedStones.length > 0) {
    room.captures[color] += capturedStones.length;
    const label = color === 'black' ? 'Negro' : 'Blanco';
    if (room.captures[color] >= room.captureTarget) {
      room.gameOver = true;
      room.winner = color;
      room.message = `¡${label} gana con ${room.captures[color]} piedra(s) capturada(s)!`;
      return;
    }
    room.message = `${label} capturó ${capturedStones.length} piedra(s) (${room.captures[color]}/${room.captureTarget}).`;
    room.current = opp;
    return;
  }

  room.message = '';
  room.current = opp;

  const isFull = room.board.every(row => row.every(cell => cell !== null));
  if (isFull) {
    room.gameOver = true;
    room.winner = null;
    room.message = 'Tablero lleno sin capturas — partida empatada.';
  }
}

function publicState(room, code) {
  return {
    code,
    size: room.size,
    captureTarget: room.captureTarget,
    board: room.board,
    current: room.current,
    captures: room.captures,
    gameOver: room.gameOver,
    winner: room.winner,
    message: room.message,
    hasBlack: !!room.players.black,
    hasWhite: !!room.players.white,
  };
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ size, captureTarget } = {}) => {
    const code = generateCode();
    const room = makeRoom(Number(size), Number(captureTarget));
    room.players.black = socket.id;
    room.sockets.set(socket.id, 'black');
    rooms.set(code, room);

    socket.join(code);
    socket.data.code = code;
    socket.data.role = 'black';

    socket.emit('joined', { color: 'black', state: publicState(room, code) });
  });

  socket.on('join_room', ({ code } = {}) => {
    const normalized = String(code || '').trim().toUpperCase();
    const room = rooms.get(normalized);
    if (!room) {
      socket.emit('error_msg', 'Esa sala no existe o ya terminó. Revisá el código.');
      return;
    }

    let role;
    if (!room.players.black) { role = 'black'; room.players.black = socket.id; }
    else if (!room.players.white) { role = 'white'; room.players.white = socket.id; }
    else { role = 'spectator'; }

    room.sockets.set(socket.id, role);
    socket.join(normalized);
    socket.data.code = normalized;
    socket.data.role = role;

    socket.emit('joined', { color: role, state: publicState(room, normalized) });
    socket.to(normalized).emit('state', publicState(room, normalized));
  });

  socket.on('move', ({ x, y } = {}) => {
    const code = socket.data.code;
    const room = rooms.get(code);
    if (!room) return;
    const role = socket.data.role;
    if (role !== 'black' && role !== 'white') return;
    if (room.gameOver) return;
    if (!room.players.black || !room.players.white) return;
    if (room.current !== role) return;

    doMove(room, role, Number(x), Number(y));
    io.to(code).emit('state', publicState(room, code));
  });

  socket.on('reset', () => {
    const code = socket.data.code;
    const room = rooms.get(code);
    if (!room) return;
    if (socket.data.role !== 'black' && socket.data.role !== 'white') return;
    resetRoom(room);
    io.to(code).emit('state', publicState(room, code));
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    const room = rooms.get(code);
    if (!room) return;

    room.sockets.delete(socket.id);
    if (room.players.black === socket.id) room.players.black = null;
    if (room.players.white === socket.id) room.players.white = null;

    io.to(code).emit('state', publicState(room, code));

    if (!room.players.black && !room.players.white) {
      setTimeout(() => {
        const r = rooms.get(code);
        if (r && !r.players.black && !r.players.white) rooms.delete(code);
      }, 60000);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Atari-Go online escuchando en el puerto ${PORT}`);
});
