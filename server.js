require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const { connectDB } = require('./config/db');
const { seedTeams } = require('./seed/seedTeams');
const { initSockets } = require('./sockets/index');
const matchManager = require('./services/matchManager');
const Room = require('./models/Room');

const teamsRouter = require('./routes/teams');
const playersRouter = require('./routes/players');
const roomsRouter = require('./routes/rooms');
const historyRouter = require('./routes/history');

async function bootstrap() {
  await connectDB();
  await seedTeams();

  // Registrar en matchManager las salas no cerradas ya existentes en Mongo
  const openRooms = await Room.find({ closed: false });
  for (const room of openRooms) {
    matchManager.registerRoom(room);
  }
  console.log(`[server] ${openRooms.length} sala(s) registradas en memoria`);

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.use('/api/teams', teamsRouter);
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
