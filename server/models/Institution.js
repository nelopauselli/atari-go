const mongoose = require('mongoose');
const { hashPassword, checkPassword } = require('../services/password');

const InstitutionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  // Posición al mostrarlas (login, totales, etc.): menor primero; a igual orden, por nombre.
  order: { type: Number, default: 0 },
  // Contraseña compartida por todos los usuarios de la institución, guardada como "salt:hash" (scrypt).
  password: { type: String, required: true, select: false },
  // Nicknames habilitados para ingresar con esta institución.
  users: { type: [{ type: String, trim: true }], default: [] },
}, { timestamps: true });

InstitutionSchema.statics.hashPassword = function (plain) {
  return hashPassword(plain);
};

InstitutionSchema.methods.checkPassword = function (plain) {
  return checkPassword(plain, this.password);
};

// Devuelve el nickname tal como figura en la lista (comparación sin distinguir mayúsculas), o null.
InstitutionSchema.methods.findUser = function findUser(nickname) {
  const wanted = String(nickname || '').trim().toLowerCase();
  if (!wanted) return null;
  return this.users.find((u) => u.toLowerCase() === wanted) || null;
};

module.exports = mongoose.model('Institution', InstitutionSchema);
