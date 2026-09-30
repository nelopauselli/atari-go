const mongoose = require('mongoose');

// Equipo de una sala torneo. Conserva su _id para que las partidas (y el ranking)
// lo sigan identificando aunque se le cambie el nombre.
const TeamSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  // Avatar del equipo como data URL (imagen ya redimensionada desde el panel admin).
  avatar: { type: String, default: '' },
});

const RoomSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['torneo', 'amistosas'], required: true },
  boardCount: { type: Number, required: true, min: 1, max: 50 },
  boardSize: { type: Number, enum: [7, 9, 13], required: true },
  stonesToWin: { type: Number, required: true, min: 1 },
  clockType: {
    type: String,
    enum: ['fischer-1-3', 'fischer-5-3', 'fischer-10-5'],
    required: true,
  },
  koRuleEnabled: { type: Boolean, default: true },
  // Equipos que participan (solo aplica a salas de tipo torneo; las amistosas no tienen equipos).
  teams: {
    type: [TeamSchema],
    default: [],
    validate: {
      validator: (teams) => new Set(teams.map((t) => (t.name || '').toLowerCase())).size === teams.length,
      message: 'Hay equipos con el mismo nombre en la sala',
    },
  },
  closed: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Room', RoomSchema);
