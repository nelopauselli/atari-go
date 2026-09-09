'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { connectDB } = require('./src/config/db');
const { registerSocketHandlers, getConnectedCount } = require('./src/sockets');
const { router: roomsRouter, setConnectedCountFn } = require('./src/routes/rooms');
const matchesRouter = require('./src/routes/matches');

const PORT = process.env.PORT || 3000;

async function main() {
  await connectDB();

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: process.env.CORS_ORIGIN || '*' },
  });

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  setConnectedCountFn(getConnectedCount);
  app.use('/api/rooms', roomsRouter);
  app.use('/api/matches', matchesRouter);

  registerSocketHandlers(io);

  server.listen(PORT, () => {
    console.log(`[server] atari-go escuchando en http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] error fatal al iniciar', err);
  process.exit(1);
});
