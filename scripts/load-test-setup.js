/**
 * Prepara (o borra) los datos para la prueba de carga: una institución con usuarios
 * carga001…cargaNNN y una sala amistosa. Escribe directo en la base de MONGO_URI, así que
 * hay que apuntarlo a una base de prueba, nunca a la de producción.
 *
 *   node scripts/load-test-setup.js --users 200 --boards 100 --password carga --yes
 *   node scripts/load-test-setup.js --cleanup --yes
 *
 * O con npm: npm run load-test:setup -- --users 200 --yes · npm run load-test:cleanup -- --yes
 *
 * El servidor toma la sala nueva en la próxima sincronización (ROOM_SYNC_INTERVAL_MS, 30 s)
 * o al reiniciarlo.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Institution = require('../server/models/Institution');
const Room = require('../server/models/Room');
const Player = require('../server/models/Player');
const Match = require('../server/models/Match');

const NAME = 'Prueba de carga';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

async function setup(args) {
  const users = Number(args.users) || 200;
  const prefix = args.prefix || 'carga';
  const password = args.password || 'carga';
  // Tope: el máximo que admite el modelo de sala (así no queda desfasado si cambia).
  const maxBoards = Room.schema.path('boardCount').options.max;
  const boards = Math.min(maxBoards, Number(args.boards) || Math.ceil(users / 2) + 5);
  const nicknames = Array.from({ length: users }, (_, i) => `${prefix}${String(i + 1).padStart(3, '0')}`);

  let institution = await Institution.findOne({ name: NAME });
  if (!institution) institution = new Institution({ name: NAME, order: 999 });
  institution.users = nicknames;
  institution.password = Institution.hashPassword(password);
  await institution.save();

  const roomFields = {
    name: NAME,
    type: 'amistosas',
    boardCount: boards,
    boardSize: Number(args.size) || 7,
    stonesToWin: Number(args.stones) || 5,
    clockType: args.clock || 'fischer-3-5',
    koRuleEnabled: true,
    chooseOpponent: args.choose === true,
    closed: false,
  };
  const room = await Room.findOneAndUpdate({ name: NAME }, roomFields, { upsert: true, new: true, runValidators: true });

  console.log(`Institución "${NAME}" (${institution._id}): ${users} usuarios ${nicknames[0]}…${nicknames[users - 1]}, contraseña "${password}"`);
  console.log(`Sala "${NAME}" (${room._id}): ${boards} tableros ${roomFields.boardSize}x${roomFields.boardSize}, `
    + `${roomFields.stonesToWin} capturas para ganar, ${roomFields.clockType}, elegir rival: ${roomFields.chooseOpponent}`);
}

async function cleanup() {
  const institution = await Institution.findOne({ name: NAME });
  const room = await Room.findOne({ name: NAME });
  const matches = room ? await Match.deleteMany({ room: room._id }) : { deletedCount: 0 };
  const players = institution ? await Player.deleteMany({ institution: institution._id }) : { deletedCount: 0 };
  if (room) await room.deleteOne();
  if (institution) await institution.deleteOne();
  console.log(`Borrados: sala ${room ? 1 : 0}, institución ${institution ? 1 : 0}, `
    + `${players.deletedCount} jugadores, ${matches.deletedCount} partidas`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/atari-go';
  const target = uri.replace(/\/\/[^@/]*@/, '//***@');
  if (!args.yes) {
    console.error(`Base destino: ${target}\nVolvé a correrlo con --yes si es una base de prueba.`);
    process.exit(1);
  }
  console.log(`Base: ${target}`);
  await mongoose.connect(uri);
  try {
    if (args.cleanup) await cleanup();
    else await setup(args);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
