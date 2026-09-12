const express = require('express');
const Player = require('../../models/Player');
const Team = require('../../models/Team');

const router = express.Router();

// Login: nickname + equipo obligatorios. Crea el jugador si no existe (regla A).
router.post('/login', async (req, res) => {
  try {
    const { nickname, teamId } = req.body;
    if (!nickname || !nickname.trim() || !teamId) {
      return res.status(400).json({ error: 'Nickname y equipo son obligatorios' });
    }
    const team = await Team.findById(teamId);
    if (!team) return res.status(400).json({ error: 'Equipo inválido' });

    let player = await Player.findOne({ nickname: nickname.trim(), team: team._id });
    if (!player) {
      player = await Player.create({ nickname: nickname.trim(), team: team._id });
    } else {
      player.lastSeenAt = new Date();
      await player.save();
    }

    res.json({
      id: player._id,
      nickname: player.nickname,
      team: team._id,
      teamName: team.name,
      teamColor: team.color,
    });
  } catch (err) {
    console.error('[routes/players] error en login', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

module.exports = router;
