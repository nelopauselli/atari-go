const crypto = require('crypto');

// Compara en tiempo constante para no filtrar por timing cuántos caracteres coinciden.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * HTTP Basic Auth para el panel admin, con credenciales en ADMIN_USER / ADMIN_PASSWORD.
 * El navegador muestra su propio diálogo de login y reenvía las credenciales en cada
 * request (estáticos y API), así que el frontend del panel no necesita saber nada.
 * En producción tiene que ir detrás de HTTPS: Basic Auth manda la contraseña en base64.
 */
function adminAuth(req, res, next) {
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString();
    const sep = decoded.indexOf(':');
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    // Se evalúan las dos comparaciones siempre, sin cortocircuito.
    const userOk = safeEqual(user, process.env.ADMIN_USER);
    const passOk = safeEqual(pass, process.env.ADMIN_PASSWORD);
    if (sep !== -1 && userOk && passOk) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Atari-Go Admin", charset="UTF-8"');
  res.status(401).json({ error: 'No autorizado' });
}

/** Sin credenciales configuradas el panel no se monta (fail closed). */
function isAdminConfigured() {
  return !!(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD);
}

module.exports = { adminAuth, isAdminConfigured };
