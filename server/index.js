'use strict';

require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const { connectDB } = require('./config/db');
const dojoManager = require('./managers/dojoManager');
const apiRouter = require('./routes/api');
const { registerSocketHandlers } = require('./sockets/index');

const PORT = process.env.PORT || 3000;

async function main() {
  await connectDB();
  await dojoManager.init();

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', apiRouter);
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' },
  });

  registerSocketHandlers(io);

  server.listen(PORT, () => {
    console.log(`[server] Atari-Go escuchando en http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] Error fatal al iniciar:', err);
  process.exit(1);
});
