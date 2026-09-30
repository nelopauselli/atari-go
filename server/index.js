require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const { connectDB } = require('../config/db');
const { initSockets } = require('./sockets/index');
const matchManager = require('./services/matchManager');
const Player = require('../models/Player');

const playersRouter = require('./routes/players');
const roomsRouter = require('./routes/rooms');
const historyRouter = require('./routes/history');
const institutionsRouter = require('./routes/institutions');

const ROOM_SYNC_INTERVAL_MS = Number(process.env.ROOM_SYNC_INTERVAL_MS) || 30 * 1000;

async function bootstrap() {
  await connectDB();

  // Quita índices viejos que ya no están en el esquema (p. ej. el único por
  // nickname+equipo de cuando el equipo se elegía en el login).
  await Player.syncIndexes();
  
  // Registrar en matchManager las salas no cerradas ya existentes en Mongo
  await matchManager.syncRoomsWithDB();

  // El backend administrativo puede crear/cerrar salas en Mongo mientras este
  // server sigue corriendo; se resincroniza periódicamente para reflejarlas.
  setInterval(() => {
    matchManager.syncRoomsWithDB().catch((err) => console.error('[server] error sincronizando salas', err));
  }, ROOM_SYNC_INTERVAL_MS);

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api/institutions', institutionsRouter);
  app.use('/api/players', playersRouter);
  app.use('/api/rooms', roomsRouter);
  app.use('/api/history', historyRouter);

  app.get('/health', (req, res) => res.json({ ok: true }));

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  initSockets(io);

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`[server] Atari-Go escuchando en http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('[server] Error fatal en el arranque:', err);
  process.exit(1);
});
