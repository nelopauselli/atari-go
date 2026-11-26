const express = require('express');
const mongoose = require('mongoose');
const Player = require('../models/Player');
const Institution = require('../models/Institution');
const presence = require('../services/presence');
const log = require('../services/logger');

const router = express.Router();

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Login: institución + usuario (debe figurar en la lista de la institución) + contraseña
// de la institución. Crea el jugador si no existe (regla A). El equipo no se elige acá:
// solo las salas torneo tienen equipos y se asigna automáticamente al entrar a cada una.
router.post('/login', async (req, res) => {
  try {
    const { institutionId, nickname, password } = req.body;
    if (!institutionId || !nickname || !nickname.trim() || !password) {
      return res.status(400).json({ error: 'Institución, usuario y contraseña son obligatorios' });
    }
    if (!mongoose.isValidObjectId(institutionId)) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    const institution = await Institution.findById(institutionId).select('+password');
    const username = institution && institution.findUser(nickname);
    // Mismo mensaje para usuario inexistente y contraseña incorrecta.
    if (!username || !(await institution.checkPassword(password))) {
      // El motivo real queda solo en el log; al cliente se le responde lo mismo en ambos casos.
      let reason = 'contraseña incorrecta';
      if (!institution) reason = 'institución inexistente';
      else if (!username) reason = 'usuario no habilitado';
      log.warn('player.login_failed', { institutionId, institution: institution && institution.name, nickname: nickname.trim(), reason });
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    // El usuario no distingue mayúsculas: se reutiliza el jugador aunque haya cambiado cómo
    // figura en la lista, y se le actualiza el nickname a la forma de la lista.
    const nicknameRegex = new RegExp(`^${escapeRegExp(username)}$`, 'i');
    let player = await Player.findOne({ nickname: nicknameRegex, institution: institution._id }).sort({ lastSeenAt: -1 });
    const isNew = !player;
    if (isNew) {
      player = await Player.create({ nickname: username, institution: institution._id });
    } else {
      player.nickname = username;
      player.lastSeenAt = new Date();
      await player.save();
    }
    log.info('player.login', { playerId: player._id, nickname: player.nickname, institution: institution.name, new: isNew });

    res.json({
      id: player._id,
      nickname: player.nickname,
      institution: institution._id,
      institutionName: institution.name,
    });
  } catch (err) {
    console.error('[routes/players] error en login', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

router.get('/online', (req, res) => {
  res.json(presence.listOnline());
});

module.exports = router;
