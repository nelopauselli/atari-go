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
    enum: ['fischer-3-5', 'fischer-5-10', 'fischer-10-20'],
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
  // Equipo asignado automáticamente a cada jugador que entró a la sala torneo. Lo mantiene
  // el servidor de juego (el panel admin no lo edita) para que la asignación sea estable.
  teamAssignments: {
    type: [{
      _id: false,
      player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
      institution: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null },
      team: { type: mongoose.Schema.Types.ObjectId, required: true },
    }],
    default: [],
  },
  closed: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Room', RoomSchema);
