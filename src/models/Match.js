'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const PlayerRefSchema = new Schema(
  {
    socketId: { type: String, default: null }, // se limpia si se desconecta; no identifica jugador de forma permanente
    name: { type: String, required: true, trim: true, maxlength: 30 },
  },
  { _id: false }
);

const MoveSchema = new Schema(
  {
    color: { type: Number, enum: [1, 2], required: true }, // 1 negro, 2 blanco
    row: { type: Number, default: null }, // null si fue "pasar"
    col: { type: Number, default: null },
    pass: { type: Boolean, default: false },
    capturedCount: { type: Number, default: 0 },
    playedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MatchSchema = new Schema({
  room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  roomName: { type: String, required: true }, // denormalizado para el historial
  boardNumber: { type: Number, required: true },
  boardSize: { type: Number, required: true },
  capturesToWin: { type: Number, required: true },
  clockPresetKey: { type: String, required: true },

  players: {
    black: { type: PlayerRefSchema, default: null },
    white: { type: PlayerRefSchema, default: null },
  },

  status: {
    type: String,
    enum: ['esperando', 'en_curso', 'finalizada'],
    default: 'esperando',
  },

  board: { type: [[Number]], default: [] }, // estado actual del tablero
  moves: { type: [MoveSchema], default: [] },
  captures: {
    black: { type: Number, default: 0 }, // piedras blancas capturadas por negro
    white: { type: Number, default: 0 }, // piedras negras capturadas por blanco
  },

  clock: { type: Schema.Types.Mixed, default: null },
  turnColor: { type: Number, enum: [1, 2], default: 1 },
  koForbiddenPosition: { type: String, default: null },
  consecutivePasses: { type: Number, default: 0 },

  winnerColor: { type: Number, enum: [1, 2, null], default: null },
  winReason: {
    type: String,
    enum: ['capturas', 'tiempo', 'renuncia', 'doble_pase', null],
    default: null,
  },

  spectatorCount: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
});

MatchSchema.index({ status: 1, createdAt: -1 });
MatchSchema.index({ room: 1, boardNumber: 1 });

module.exports = mongoose.model('Match', MatchSchema);
