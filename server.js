const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const ALLOWED_SIZES = [5, 7, 9, 13];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'atarigo';

const rooms = new Map(); // salas en memoria (código -> estado en vivo)
let partidasCollection = null;

async function connectMongo() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    partidasCollection = client.db(MONGODB_DB).collection('partidas');
    await partidasCollection.createIndex({ salaCode: 1, partidaNumber: 1 });
    await partidasCollection.createIndex({ createdAt: -1 });
    console.log(`Conectado a MongoDB (${MONGODB_URI}/${MONGODB_DB}). El historial de partidas va a persistir.`);
  } catch (err) {
    console.warn('No se pudo conectar a MongoDB — el juego funciona igual, pero sin historial persistente:', err.message);
  }
}
connectMongo();

// ---------- lógica del tablero (Go / Atari-Go) ----------

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

function makeRoom(code, size, captureTarget) {
  size = ALLOWED_SIZES.includes(size) ? size : 7;
  captureTarget = Number.isInteger(captureTarget) && captureTarget >= 1 && captureTarget <= 25 ? captureTarget : 1;
  return {
    salaCode: code,
    size,
    captureTarget,
    board: createEmptyBoard(size),
    current: 'black',
    captures: { black: 0, white: 0 },
    gameOver: false,
    message: '',
    winner: null,
    winReason: null, // 'capture' | 'resign' | 'draw'
    players: { black: null, white: null },
    sockets: new Map(), // socketId -> role ('black' | 'white' | 'spectator')
    moveHistory: [], // { color, x, y }
    createdAt: new Date(),
    partidaNumber: 1,
    partidaId: null, // ObjectId en Mongo de la partida actual
  };
}

function startNewPartida(room) {
  room.board = createEmptyBoard(room.size);
  room.current = 'black';
  room.captures = { black: 0, white: 0 };
  room.gameOver = false;
  room.message = '';
  room.winner = null;
  room.winReason = null;
  room.moveHistory = [];
  room.createdAt = new Date();
  room.partidaId = null;
}

// Devuelve true si la jugada fue válida y quedó registrada.
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

// ---------- SGF ----------

function sgfCoord(x, y) {
  return String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
}

// data: { salaCode, partidaNumber, size, captureTarget, moveHistory, captures, winner, winReason, createdAt }
function buildSgf(data) {
  const dateStr = (data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt)).toISOString().slice(0, 10);

  let resultTag = '';
  if (data.winner === 'black') resultTag = `RE[B+${data.winReason === 'resign' ? 'R' : data.captures.black}]`;
  else if (data.winner === 'white') resultTag = `RE[W+${data.winReason === 'resign' ? 'R' : data.captures.white}]`;
  else if (data.gameOver) resultTag = 'RE[Void]';

  const header = [
    'FF[4]', 'GM[1]', `SZ[${data.size}]`,
    'PB[Negro]', 'PW[Blanco]',
    `GN[Atari-Go online - sala ${data.salaCode} - partida ${data.partidaNumber}]`,
    `RU[Atari-Go: gana quien capture ${data.captureTarget} piedra(s)]`,
    `DT[${dateStr}]`,
    'AP[AtariGoOnline:1.0]',
    resultTag,
  ].filter(Boolean).join('');

  const moves = data.moveHistory
    .map(m => `;${m.color === 'black' ? 'B' : 'W'}[${sgfCoord(m.x, m.y)}]`)
    .join('');

  return `(;${header}${moves})`;
}

// ---------- persistencia en MongoDB (best-effort) ----------

async function persistNewPartida(room) {
  if (!partidasCollection) return null;
  try {
    const doc = {
      salaCode: room.salaCode,
      partidaNumber: room.partidaNumber,
      size: room.size,
      captureTarget: room.captureTarget,
      moveHistory: [],
      captures: { black: 0, white: 0 },
      gameOver: false,
      winner: null,
      winReason: null,
      createdAt: room.createdAt,
      finishedAt: null,
    };
    const result = await partidasCollection.insertOne(doc);
    return result.insertedId;
  } catch (err) {
    console.warn('No se pudo guardar la partida nueva en MongoDB:', err.message);
    return null;
  }
}

async function persistMove(room) {
  if (!partidasCollection || !room.partidaId) return;
  try {
    const lastMove = room.moveHistory[room.moveHistory.length - 1];
    await partidasCollection.updateOne(
      { _id: room.partidaId },
      { $push: { moveHistory: lastMove }, $set: { captures: room.captures } }
    );
  } catch (err) {
    console.warn('No se pudo guardar la jugada en MongoDB:', err.message);
  }
}

async function persistFinish(room) {
  if (!partidasCollection || !room.partidaId) return;
  try {
    await partidasCollection.updateOne(
      { _id: room.partidaId },
      { $set: { gameOver: true, winner: room.winner, winReason: room.winReason, finishedAt: new Date() } }
    );
  } catch (err) {
    console.warn('No se pudo guardar el resultado en MongoDB:', err.message);
  }
}

// ---------- estado público (lo que ve el cliente) ----------

function countSpectators(room) {
  let count = 0;
  for (const role of room.sockets.values()) if (role === 'spectator') count++;
  return count;
}

// Salas con exactamente un jugador conectado (esperando rival).
function getWaitingRooms() {
  const list = [];
  for (const [code, room] of rooms.entries()) {
    const hasBlack = !!room.players.black;
    const hasWhite = !!room.players.white;
    if (hasBlack !== hasWhite) {
      list.push({
        code,
        size: room.size,
        captureTarget: room.captureTarget,
        waitingSince: room.createdAt,
      });
    }
  }
  list.sort((a, b) => new Date(a.waitingSince) - new Date(b.waitingSince));
  return list;
}

function broadcastLobbyRooms() {
  io.emit('lobby_rooms', getWaitingRooms());
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
    winReason: room.winReason,
    message: room.message,
    hasBlack: !!room.players.black,
    hasWhite: !!room.players.white,
    spectatorCount: countSpectators(room),
    moveCount: room.moveHistory.length,
    partidaId: room.partidaId ? room.partidaId.toString() : null,
    partidaNumber: room.partidaNumber,
  };
}

// ---------- rutas REST del historial ----------

app.get('/api/partidas', async (req, res) => {
  if (!partidasCollection) { res.json({ items: [], page: 1, limit: 10, total: 0, totalPages: 1 }); return; }
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const filter = {};
    if (req.query.sala) filter.salaCode = String(req.query.sala).trim().toUpperCase();

    const total = await partidasCollection.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const docs = await partidasCollection
      .find(filter)
      .project({ moveHistory: 0 })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    res.json({
      items: docs.map(d => ({
        id: d._id.toString(),
        salaCode: d.salaCode,
        partidaNumber: d.partidaNumber,
        size: d.size,
        captureTarget: d.captureTarget,
        captures: d.captures,
        gameOver: d.gameOver,
        winner: d.winner,
        winReason: d.winReason,
        createdAt: d.createdAt,
        finishedAt: d.finishedAt,
      })),
      page,
      limit,
      total,
      totalPages,
    });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer el historial.' });
  }
});

app.get('/api/partidas/id/:id', async (req, res) => {
  if (!partidasCollection) { res.status(404).json({ error: 'El historial no está disponible en este servidor.' }); return; }
  try {
    const doc = await partidasCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!doc) { res.status(404).json({ error: 'Partida no encontrada.' }); return; }
    res.json({
      id: doc._id.toString(),
      salaCode: doc.salaCode,
      partidaNumber: doc.partidaNumber,
      size: doc.size,
      captureTarget: doc.captureTarget,
      moveHistory: doc.moveHistory,
      captures: doc.captures,
      gameOver: doc.gameOver,
      winner: doc.winner,
      winReason: doc.winReason,
      createdAt: doc.createdAt,
      finishedAt: doc.finishedAt,
    });
  } catch (err) {
    res.status(400).json({ error: 'Id de partida inválido.' });
  }
});

app.get('/api/partidas/id/:id/sgf', async (req, res) => {
  if (!partidasCollection) { res.status(404).send('El historial no está disponible en este servidor.'); return; }
  try {
    const doc = await partidasCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!doc) { res.status(404).send('Partida no encontrada.'); return; }
    const sgf = buildSgf(doc);
    res.setHeader('Content-Type', 'application/x-go-sgf');
    res.setHeader('Content-Disposition', `attachment; filename="atari-go-${doc.salaCode}-p${doc.partidaNumber}.sgf"`);
    res.send(sgf);
  } catch (err) {
    res.status(400).send('Id de partida inválido.');
  }
});

// ---------- socket.io ----------

io.on('connection', (socket) => {
  socket.emit('lobby_rooms', getWaitingRooms());

  socket.on('create_room', async ({ size, captureTarget } = {}) => {
    const code = generateCode();
    const room = makeRoom(code, Number(size), Number(captureTarget));
    room.players.black = socket.id;
    room.sockets.set(socket.id, 'black');
    rooms.set(code, room);

    socket.join(code);
    socket.data.code = code;
    socket.data.role = 'black';

    room.partidaId = await persistNewPartida(room);

    socket.emit('joined', { color: 'black', state: publicState(room, code) });
    broadcastLobbyRooms();
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
    if (role === 'black' || role === 'white') broadcastLobbyRooms();
  });

  socket.on('watch_room', ({ code } = {}) => {
    const normalized = String(code || '').trim().toUpperCase();
    const room = rooms.get(normalized);
    if (!room) {
      socket.emit('error_msg', 'Esa sala no existe o ya terminó. Revisá el código.');
      return;
    }

    room.sockets.set(socket.id, 'spectator');
    socket.join(normalized);
    socket.data.code = normalized;
    socket.data.role = 'spectator';

    socket.emit('joined', { color: 'spectator', state: publicState(room, normalized) });
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

    const legal = doMove(room, role, Number(x), Number(y));
    io.to(code).emit('state', publicState(room, code));

    if (legal) {
      persistMove(room).catch(() => {});
      if (room.gameOver) {
        persistFinish(room).catch(() => {});
        io.to(code).emit('history_updated');
      }
    }
  });

  socket.on('resign', () => {
    const code = socket.data.code;
    const room = rooms.get(code);
    if (!room) return;
    const role = socket.data.role;
    if (role !== 'black' && role !== 'white') return;
    if (room.gameOver) return;

    room.gameOver = true;
    room.winner = opponent(role);
    room.winReason = 'resign';
    const loserLabel = role === 'black' ? 'Negro' : 'Blanco';
    const winnerLabel = room.winner === 'black' ? 'Negro' : 'Blanco';
    room.message = `${loserLabel} se rindió — ¡${winnerLabel} gana!`;

    io.to(code).emit('state', publicState(room, code));
    persistFinish(room).catch(() => {});
    io.to(code).emit('history_updated');
  });

  socket.on('revancha', async () => {
    const code = socket.data.code;
    const room = rooms.get(code);
    if (!room) return;
    const role = socket.data.role;
    if (role !== 'black' && role !== 'white') return;
    if (!room.gameOver) return;

    room.partidaNumber += 1;
    startNewPartida(room);
    room.partidaId = await persistNewPartida(room);

    io.to(code).emit('state', publicState(room, code));
    io.to(code).emit('history_updated');
  });

  socket.on('disconnect', () => {
    const code = socket.data.code;
    const room = rooms.get(code);
    if (!room) return;

    const wasPlayer = socket.data.role === 'black' || socket.data.role === 'white';

    room.sockets.delete(socket.id);
    if (room.players.black === socket.id) room.players.black = null;
    if (room.players.white === socket.id) room.players.white = null;

    io.to(code).emit('state', publicState(room, code));
    if (wasPlayer) broadcastLobbyRooms();

    if (!room.players.black && !room.players.white) {
      setTimeout(() => {
        const r = rooms.get(code);
        if (r && !r.players.black && !r.players.white) rooms.delete(code);
        broadcastLobbyRooms();
      }, 60000);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Atari-Go online escuchando en el puerto ${PORT}`);
});
