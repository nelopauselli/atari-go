const express = require('express');
const Team = require('../models/Team');

const router = express.Router();

router.get('/', async (req, res) => {
  const teams = await Team.find().sort({ name: 1 });
  res.json(teams);
});

module.exports = router;
