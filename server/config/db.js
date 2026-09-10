'use strict';

const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/atari-go';

async function connectDB() {
  mongoose.set('strictQuery', true);

  await mongoose.connect(MONGODB_URI);

  console.log(`[db] Conectado a MongoDB: ${MONGODB_URI}`);

  mongoose.connection.on('error', (err) => {
    console.error('[db] Error de conexión MongoDB:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB desconectado');
  });

  return mongoose.connection;
}

module.exports = { connectDB, mongoose };
