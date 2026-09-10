const Team = require('../models/Team');

const FIXED_TEAMS = [
  { name: 'Tierra', colorHex: '#6D4C41' },
  { name: 'Agua', colorHex: '#1E88E5' },
  { name: 'Aire', colorHex: '#B0BEC5' },
  { name: 'Fuego', colorHex: '#E53935' },
];

async function seedTeams() {
  for (const t of FIXED_TEAMS) {
    await Team.findOneAndUpdate(
      { name: t.name },
      { $setOnInsert: t },
      { upsert: true, new: true },
    );
  }
  console.log('[seed] Equipos verificados: Tierra, Agua, Aire, Fuego');
}

module.exports = { seedTeams, FIXED_TEAMS };
