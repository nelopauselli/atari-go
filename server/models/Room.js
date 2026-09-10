'use strict';

const { Schema, model, Types } = require('mongoose');

const CLOCK_TYPES = ['fischer_5_3', 'fischer_10_5', 'absolute_10'];
const BOARD_SIZES = [5, 7, 9, 13];

const BoardSlotSchema = new Schema(
  {
    number: { type: Number, required: true },
    status: {
      type: String,
      enum: ['free', 'occupied'],
      default: 'free',
    },
    matchId: { type: Types.ObjectId, ref: 'Match', default: null },
  },
  { _id: false }
);

const RoomSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    boardsCount: { type: Number, required: true, min: 1, max: 100 },
    stonesToCapture: { type: Number, required: true, min: 1, max: 50 },
    boardSize: { type: Number, required: true, enum: BOARD_SIZES },
    clockType: { type: String, required: true, enum: CLOCK_TYPES },
    allowSameDojo: { type: Boolean, default: true },
    boards: { type: [BoardSlotSchema], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

RoomSchema.statics.CLOCK_TYPES = CLOCK_TYPES;
RoomSchema.statics.BOARD_SIZES = BOARD_SIZES;

module.exports = model('Room', RoomSchema);
