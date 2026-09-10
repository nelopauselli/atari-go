const mongoose = require('mongoose');

const MoveSchema = new mongoose.Schema({
  color: { type: String, enum: ['black', 'white'], required: true },
  x: { type: Number, default: null }, // null = pase
  y: { type: Number, default: null },
  pass: { type: Boolean, default: false },
  captured: { type: Number, default: 0 }, // piedras capturadas en esa jugada
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const MatchPlayerSchema = new mongoose.Schema({
  player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  nickname: { type: String, required: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  teamName: { type: String, required: true },
  color: { type: String, enum: ['black', 'white'], required: true },
}, { _id: false });

const MatchSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  roomName: { type: String, required: true },
  boardNumber: { type: Number, required: true },
  boardSize: { type: Number, required: true },
  stonesToWin: { type: Number, required: true },
  clockType: { type: String, required: true },
  players: { type: [MatchPlayerSchema], default: [] },
  moves: { type: [MoveSchema], default: [] },
  status: { type: String, enum: ['waiting', 'playing', 'finished', 'aborted'], default: 'waiting' },
  result: {
    winnerColor: { type: String, enum: ['black', 'white', null], default: null },
    reason: { type: String, enum: ['capture', 'resign', 'timeout', 'abandoned', null], default: null },
  },
  capturedByBlack: { type: Number, default: 0 },
  capturedByWhite: { type: Number, default: 0 },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Match', MatchSchema);
