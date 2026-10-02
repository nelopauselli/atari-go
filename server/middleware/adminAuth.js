const crypto = require('crypto');
const { checkPasswordAsync } = require('../services/password');

// Compara en tiempo constante para no filtrar por timing cuántos caracteres coinciden.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest();
}

// El navegador reenvía las credenciales en cada request; para no correr scrypt en
// cada estático se recuerda el digest del último header Authorization válido.
let lastValidDigest = null;

/**
 * HTTP Basic Auth para el panel admin, con credenciales en ADMIN_USER / ADMIN_PASSWORD_HASH
 * (hash "salt:hash" scrypt, generado con `npm run hash-password`).
 * El navegador muestra su propio diálogo de login y reenvía las credenciales en cada
 * request (estáticos y API), así que el frontend del panel no necesita saber nada.
 * En producción tiene que ir detrás de HTTPS: Basic Auth manda la contraseña en base64.
 */
async function adminAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const headerDigest = digest(header);
      if (lastValidDigest && crypto.timingSafeEqual(headerDigest, lastValidDigest)) return next();

      const decoded = Buffer.from(encoded, 'base64').toString();
      const sep = decoded.indexOf(':');
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      // Se evalúan las dos comparaciones siempre, sin cortocircuito.
      const userOk = safeEqual(user, process.env.ADMIN_USER);
      const passOk = await checkPasswordAsync(pass, process.env.ADMIN_PASSWORD_HASH);
      if (sep !== -1 && userOk && passOk) {
        lastValidDigest = headerDigest;
        return next();
      }
    }
  } catch (err) {
    console.error('[admin] error verificando credenciales', err);
  }
  res.set('WWW-Authenticate', 'Basic realm="Atari-Go Admin", charset="UTF-8"');
  res.status(401).json({ error: 'No autorizado' });
}

/** Sin credenciales configuradas el panel no se monta (fail closed). */
function isAdminConfigured() {
  return !!(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD_HASH);
}

module.exports = { adminAuth, isAdminConfigured };
