const express = require('express');
const Institution = require('../models/Institution');

const router = express.Router();

// Solo id y nombre, para el selector del login (ni usuarios ni contraseña).
router.get('/', async (req, res) => {
  try {
    const institutions = await Institution.find().select('name').sort({ order: 1, name: 1 });
    res.json(institutions.map((i) => ({ _id: i._id, name: i.name })));
  } catch (err) {
    console.error('[routes/institutions] error listando instituciones', err);
    res.status(500).json({ error: 'Error al obtener instituciones' });
  }
});

module.exports = router;
