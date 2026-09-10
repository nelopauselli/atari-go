const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/atari-go';
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log(`[db] Conectado a MongoDB: ${uri}`);

  mongoose.connection.on('error', (err) => {
    console.error('[db] Error de conexión:', err);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB desconectado');
  });
}

module.exports = { connectDB };
