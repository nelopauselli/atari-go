const mongoose = require('mongoose');

const RoomSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['torneo', 'amistosas'], required: true },
  boardCount: { type: Number, required: true, min: 1, max: 50 },
  boardSize: { type: Number, enum: [7, 9, 13], required: true },
  stonesToWin: { type: Number, required: true, min: 1 },
  clockType: {
    type: String,
    enum: ['fischer-5-3', 'fischer-10-5', 'absolute-10'],
    required: true,
  },
  closed: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Room', RoomSchema);
