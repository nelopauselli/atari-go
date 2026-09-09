'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Un "tablero" dentro de una sala. Persiste entre partidas: cuando una
 * partida termina, el tablero vuelve a status "libre" y puede ser
 * ocupado por otro par de jugadores. `currentMatchId` sólo tiene valor
 * mientras el tablero está en uso.
 */
const BoardSlotSchema = new Schema(
  {
    number: { type: Number, required: true },
    status: { type: String, enum: ['libre', 'jugando'], default: 'libre' },
    currentMatchId: { type: Schema.Types.ObjectId, ref: 'Match', default: null },
  },
  { _id: false }
);

const RoomSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  boardSize: { type: Number, required: true, enum: [5, 7, 9, 13] },
  capturesToWin: { type: Number, required: true, min: 1, max: 60 },
  clockPresetKey: {
    type: String,
    required: true,
    enum: ['fischer_10_5', 'fischer_5_3', 'absolute_10'],
  },
  boards: { type: [BoardSlotSchema], default: [] },
  nextBoardNumber: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: String, default: null }, // nombre de quien creó la sala (sin cuentas de usuario)
});

RoomSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Room', RoomSchema);
