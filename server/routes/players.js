const express = require('express');
const mongoose = require('mongoose');
const Player = require('../../models/Player');
const Team = require('../../models/Team');
const Institution = require('../../models/Institution');
const presence = require('../services/presence');

const router = express.Router();

// Login: institución + usuario (debe figurar en la lista de la institución) + contraseña
// de la institución + equipo. Crea el jugador si no existe (regla A).
router.post('/login', async (req, res) => {
  try {
    const { institutionId, nickname, password, teamId } = req.body;
    if (!institutionId || !nickname || !nickname.trim() || !password || !teamId) {
      return res.status(400).json({ error: 'Institución, usuario, contraseña y equipo son obligatorios' });
    }
    if (!mongoose.isValidObjectId(institutionId) || !mongoose.isValidObjectId(teamId)) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }

    const institution = await Institution.findById(institutionId).select('+password');
    const username = institution && institution.findUser(nickname);
    // Mismo mensaje para usuario inexistente y contraseña incorrecta.
    if (!username || !institution.checkPassword(password)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const team = await Team.findById(teamId);
    if (!team) return res.status(400).json({ error: 'Equipo inválido' });

    let player = await Player.findOne({ nickname: username, team: team._id });
    if (!player) {
      player = await Player.create({ nickname: username, team: team._id, institution: institution._id });
    } else {
      player.lastSeenAt = new Date();
      player.institution = institution._id;
      await player.save();
    }

    res.json({
      id: player._id,
      nickname: player.nickname,
      team: team._id,
      teamName: team.name,
      teamColor: team.color,
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
