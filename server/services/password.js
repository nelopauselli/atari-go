const crypto = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(crypto.scrypt);

// Hashes con scrypt, guardados como "salt:hash" (hex).
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function parse(stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return null;
  return { salt, expected: Buffer.from(hash, 'hex') };
}

// Async a propósito: scrypt tarda ~100 ms y la versión sync bloquearía el event loop
// (con muchos logins juntos, el servidor deja de atender pings y jugadas).
async function checkPasswordAsync(plain, stored) {
  const parsed = parse(stored);
  if (!parsed || !plain) return false;
  const actual = await scryptAsync(String(plain), parsed.salt, parsed.expected.length);
  return crypto.timingSafeEqual(parsed.expected, actual);
}

module.exports = { hashPassword, checkPasswordAsync };
