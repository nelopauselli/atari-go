'use strict';

const { Schema, model, Types } = require('mongoose');

const PlayerRefSchema = new Schema(
  {
    nickname: { type: String, required: true },
    dojoId: { type: Types.ObjectId, ref: 'Dojo', required: true },
    dojoName: { type: String, required: true },
    color: { type: String, enum: ['black', 'white'], required: true },
    capturedStones: { type: Number, default: 0 },
    remainingMs: { type: Number, default: 0 },
  },
  { _id: false }
);

const MoveSchema = new Schema(
  {
    color: { type: String, enum: ['black', 'white'], required: true },
    x: { type: Number, default: null },
    y: { type: Number, default: null },
    pass: { type: Boolean, default: false },
    capturedCount: { type: Number, default: 0 },
    playedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MatchSchema = new Schema(
  {
    roomId: { type: Types.ObjectId, ref: 'Room', required: true },
    roomName: { type: String, required: true },
    boardNumber: { type: Number, required: true },
    boardSize: { type: Number, required: true },
    stonesToCapture: { type: Number, required: true },
    clockType: { type: String, required: true },
    allowSameDojo: { type: Boolean, default: true },

    players: { type: [PlayerRefSchema], default: [] },
    moves: { type: [MoveSchema], default: [] },

    status: {
      type: String,
      enum: ['waiting', 'active', 'finished'],
      default: 'waiting',
    },

    winnerColor: { type: String, enum: ['black', 'white', null], default: null },
    winnerNickname: { type: String, default: null },
    result: { type: String, default: null }, // ej: 'captura', 'tiempo', 'abandono'

    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = model('Match', MatchSchema);
