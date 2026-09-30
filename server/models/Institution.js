const crypto = require('crypto');
const mongoose = require('mongoose');

const InstitutionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  // Posición al mostrarlas (login, totales, etc.): menor primero; a igual orden, por nombre.
  order: { type: Number, default: 0 },
  // Contraseña compartida por todos los usuarios de la institución, guardada como "salt:hash" (scrypt).
  password: { type: String, required: true, select: false },
  // Nicknames habilitados para ingresar con esta institución.
  users: { type: [{ type: String, trim: true }], default: [] },
}, { timestamps: true });

InstitutionSchema.statics.hashPassword = function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

InstitutionSchema.methods.checkPassword = function checkPassword(plain) {
  if (!this.password || !plain) return false;
  const [salt, hash] = this.password.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(plain), salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
};

// Devuelve el nickname tal como figura en la lista (comparación sin distinguir mayúsculas), o null.
InstitutionSchema.methods.findUser = function findUser(nickname) {
  const wanted = String(nickname || '').trim().toLowerCase();
  if (!wanted) return null;
  return this.users.find((u) => u.toLowerCase() === wanted) || null;
};

module.exports = mongoose.model('Institution', InstitutionSchema);
