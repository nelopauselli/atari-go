const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
  nickname: { type: String, required: true, trim: true },
  institution: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });

// El equipo ya no es parte del jugador: se elige al entrar a cada sala torneo.
PlayerSchema.index({ nickname: 1, institution: 1 });

module.exports = mongoose.model('Player', PlayerSchema);
