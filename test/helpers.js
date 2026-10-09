/**
 * Utilidades compartidas por los tests. Los modelos de Mongoose se reemplazan por
 * stubs (no hace falta MongoDB) y los timers/Date se simulan para controlar el reloj.
 * Este módulo se tiene que requerir antes que cualquier modelo.
 */
const mongoose = require('mongoose');

// Sin conexión, el init() de cada modelo (índices/colecciones) quedaría esperando a Mongo
// y demoraría la salida del proceso.
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const Match = require('../server/models/Match');
const Room = require('../server/models/Room');
const Player = require('../server/models/Player');
const matchManager = require('../server/services/matchManager');

const START_TIME = 1_000_000;

function oid() {
  return new mongoose.Types.ObjectId();
}

/** Documento de sala tal como lo devolvería Mongo (solo los campos que usa matchManager). */
function makeRoomDoc(overrides = {}) {
  return {
    _id: oid(),
    name: 'Sala de prueba',
    type: 'amistosas',
    boardCount: 3,
    boardSize: 7,
    stonesToWin: 5,
    clockType: 'fischer-3-5',
    koRuleEnabled: true,
    teams: [],
    teamAssignments: [],
    closed: false,
    ...overrides,
  };
}

function makeTeams(...names) {
  return names.map((name) => ({ _id: oid(), name, avatar: '' }));
}

function makePlayer(nickname) {
  return { id: String(oid()), nickname };
}

/**
 * Prepara el entorno de un test: stubs de Mongo, timers simulados y captura de eventos.
 * `playerInstitutions` mapea playerId -> institución (lo que devuelve Player.findById).
 * `activeMatches` son los Match "playing" que devuelve Match.find (restauración tras reinicio).
 */
function setup(t, { playerInstitutions = {}, openRooms = [], activeMatches = [] } = {}) {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: START_TIME });
  // Los avisos de sincronización de salas ensucian la salida de los tests.
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});

  const db = {
    matchesCreated: [],
    matchUpdates: [],
    matchWrites: [],
    activeMatches,
    roomUpdates: [],
    playerLookups: [],
    openRooms,
  };

  t.mock.method(Match, 'create', async (doc) => {
    const created = { _id: oid(), ...doc };
    db.matchesCreated.push(created);
    return created;
  });
  t.mock.method(Match, 'findByIdAndUpdate', async (id, update) => {
    db.matchUpdates.push({ id, update });
    return null;
  });
  t.mock.method(Match, 'updateOne', async (filter, update) => {
    db.matchWrites.push({ filter, update });
    return { acknowledged: true };
  });
  t.mock.method(Match, 'find', async () => db.activeMatches);
  t.mock.method(Room, 'updateOne', async (filter, update) => {
    db.roomUpdates.push({ filter, update });
    return { acknowledged: true };
  });
  t.mock.method(Room, 'find', async () => db.openRooms);
  t.mock.method(Player, 'findById', (id) => {
    db.playerLookups.push(String(id));
    const institution = playerInstitutions[String(id)];
    const doc = institution === undefined ? null : { _id: id, institution };
    return { select: () => ({ lean: () => Promise.resolve(doc) }) };
  });

  const events = [];
  matchManager.setBroadcastHandler((event, roomId, payload) => events.push({ event, roomId, payload }));

  const registered = [];
  t.after(() => {
    // También las salas que haya registrado syncRoomsWithDB.
    for (const id of [...registered, ...db.openRooms.map((r) => String(r._id))]) matchManager.unregisterRoom(id);
    matchManager.setBroadcastHandler(null);
  });

  return {
    db,
    events,
    /** Registra la sala en matchManager y devuelve su id (string). */
    registerRoom(roomDoc) {
      matchManager.registerRoom(roomDoc);
      const id = String(roomDoc._id);
      registered.push(id);
      return id;
    },
  };
}

/** Espera a que se resuelvan las promesas pendientes (persistencias asíncronas). */
function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Sienta a dos jugadores en un tablero y deja la partida en curso. */
function startMatch(roomId, boardNumber = 1, black = makePlayer('Negro'), white = makePlayer('Blanco')) {
  const r1 = matchManager.handleSit({ roomId, boardNumber, player: black, socketId: `s-${black.id}` });
  const r2 = matchManager.handleSit({ roomId, boardNumber, player: white, socketId: `s-${white.id}` });
  if (r1.color !== 'black' || r2.color !== 'white') throw new Error('No se pudo iniciar la partida');
  return { black, white };
}

function getBoard(roomId, boardNumber = 1) {
  return matchManager.getRoom(roomId).boards.get(boardNumber);
}

/**
 * Construye un tablero a partir de filas de texto: '.' vacía, 'B' negra, 'W' blanca.
 * La fila i es la coordenada y = i; la columna j es x = j.
 */
function boardFromRows(rows) {
  const cells = { '.': null, B: 'black', W: 'white' };
  return rows.flatMap((row) => [...row].map((c) => cells[c]));
}

function rowsFromBoard(board, size) {
  const chars = board.map((c) => (c === null ? '.' : c === 'black' ? 'B' : 'W'));
  const rows = [];
  for (let y = 0; y < size; y++) rows.push(chars.slice(y * size, (y + 1) * size).join(''));
  return rows;
}

module.exports = {
  START_TIME,
  oid,
  makeRoomDoc,
  makeTeams,
  makePlayer,
  setup,
  flush,
  startMatch,
  getBoard,
  boardFromRows,
  rowsFromBoard,
};
