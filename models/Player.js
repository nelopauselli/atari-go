const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
  nickname: { type: String, required: true, trim: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });

PlayerSchema.index({ nickname: 1, team: 1 }, { unique: true });

module.exports = mongoose.model('Player', PlayerSchema);
