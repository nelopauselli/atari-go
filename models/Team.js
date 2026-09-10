const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  colorHex: { type: String, default: '#6200EE' },
}, { timestamps: true });

module.exports = mongoose.model('Team', TeamSchema);
