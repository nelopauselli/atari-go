'use strict';

const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/atari-go';
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log(`[mongo] conectado a ${uri}`);
  return mongoose.connection;
}

module.exports = { connectDB };
