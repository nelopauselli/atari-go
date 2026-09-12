const express = require('express');
const teamManager = require('../services/teamManager');

const router = express.Router();

router.get('/', async (req, res) => {
  res.json(teamManager.getAllTeams());
});

module.exports = router;
