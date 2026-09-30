const path = require('path');
const express = require('express');

const { adminAuth } = require('../middleware/adminAuth');
const entitiesRouter = require('./routes/entities');

// Panel de administración, montado por server/index.js en /admin.
const router = express.Router();

router.use(adminAuth);

// Defensa contra CSRF: el navegador reenvía solo las credenciales Basic cacheadas, así que
// un sitio ajeno podría disparar un form POST. Exigir JSON obliga a un preflight CORS,
// que falla porque el panel no responde headers CORS.
router.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'DELETE' && !req.is('application/json')) {
    return res.status(415).json({ error: 'Se esperaba application/json' });
  }
  next();
});

router.use('/api', express.json({ limit: '2mb' })); // holgura para imágenes (escudos) en data URL
router.use('/api/entities', entitiesRouter);
router.use(express.static(path.join(__dirname, 'public')));

module.exports = router;
