const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  color: { type: String, default: '#6200EE' },
  // Escudo del equipo como data URL (imagen ya redimensionada desde el panel admin).
  shield: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Team', TeamSchema);
