const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const { connectMongo } = require('./lib/persistence');
const { registerSocketHandlers } = require('./lib/sockets');
const partidasRouter = require('./routes/partidas');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/partidas', partidasRouter);

connectMongo();
registerSocketHandlers(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Atari-Go online escuchando en el puerto ${PORT}`);
});
