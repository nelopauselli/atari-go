const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const MONGODB_DB = process.env.MONGODB_DB || 'atarigo';

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

function getPartidasCollection() {
  return partidasCollection;
}

async function persistNewPartida(room) {
  if (!partidasCollection) return null;
  try {
    const doc = {
      salaCode: room.salaCode,
      partidaNumber: room.partidaNumber,
      size: room.size,
      captureTarget: room.captureTarget,
      timeControlId: room.timeControlId,
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

// Se usa cuando una sala se cancela porque nunca apareció un segundo
// jugador — no tiene sentido dejar en el historial una partida sin
// ninguna jugada, así que se borra directamente.
async function cancelEmptyPartida(partidaId) {
  if (!partidasCollection || !partidaId) return;
  try {
    await partidasCollection.deleteOne({ _id: partidaId });
  } catch (err) {
    console.warn('No se pudo eliminar la partida cancelada de MongoDB:', err.message);
  }
}

module.exports = {
  ObjectId,
  connectMongo,
  getPartidasCollection,
  persistNewPartida,
  persistMove,
  persistFinish,
  cancelEmptyPartida,
};
