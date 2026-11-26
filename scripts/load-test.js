/**
 * Prueba de carga: simula N usuarios que hacen lo mismo que el navegador (login, entrar a la
 * sala, sentarse, jugar, mirar el historial) y mide latencias y desconexiones.
 * Requiere los datos de `scripts/load-test-setup.js` en el servidor de prueba.
 *
 *   node scripts/load-test.js --url http://localhost:3000 --users 70 --ramp 10 --duration 180
 *
 * Opciones:
 *   --url        servidor (por defecto http://localhost:3000)
 *   --users      usuarios simulados (70)
 *   --ramp       segundos en los que se conectan todos; 0 = todos juntos (10)
 *   --duration   segundos de prueba una vez conectados todos (180)
 *   --watchers   fracción de usuarios que solo observan (0.2)
 *   --history    fracción de usuarios, tomada de los observadores, que en vez de mirar un tablero
 *                tienen abierta la pestaña Historial y la recargan al terminar cada partida (0.05)
 *   --think      demora para jugar en ms, "min-max" (1000-4000)
 *   --prefix     prefijo de los usuarios (carga) · --password contraseña (carga)
 *   --institution / --room   nombre o id (por defecto "Prueba de carga")
 *
 * Correlo desde otra máquina que el servidor: si no, mide su propio consumo de CPU.
 */
const { io } = require('socket.io-client');
const { performance } = require('perf_hooks');
const goEngine = require('../server/services/goEngine');

// ---------- Opciones ----------

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

const args = parseArgs(process.argv.slice(2));
// new URL normaliza variantes como "http:localhost:3000" (fetch las acepta, socket.io-client no).
const URL_BASE = new URL(String(args.url || 'http://localhost:3000')).origin;
const USERS = Number(args.users) || 70;
const RAMP_S = args.ramp === undefined ? 10 : Number(args.ramp);
const DURATION_S = Number(args.duration) || 180;
const WATCHERS = args.watchers === undefined ? 0.2 : Number(args.watchers);
const HISTORY = Math.min(WATCHERS, args.history === undefined ? 0.05 : Number(args.history));
const [THINK_MIN, THINK_MAX] = String(args.think || '1000-4000').split('-').map(Number);
const PREFIX = args.prefix || 'carga';
const PASSWORD = args.password || 'carga';
const INSTITUTION = args.institution || 'Prueba de carga';
const ROOM = args.room || 'Prueba de carga';
const PING_INTERVAL_MS = 5000; // igual que AppFooter
const HTTP_TIMEOUT_MS = 15000;
const ACK_TIMEOUT_MS = 10000;

// ---------- Métricas ----------

const metrics = {
  latency: {}, // nombre -> [ms]
  window: {}, // igual, pero se vacía en cada línea de progreso
  counters: {},
};

function record(name, ms) {
  (metrics.latency[name] ||= []).push(ms);
  (metrics.window[name] ||= []).push(ms);
}

function count(name, n = 1) {
  metrics.counters[name] = (metrics.counters[name] || 0) + n;
}

function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function summarize(values) {
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length, p50: percentile(s, 50), p95: percentile(s, 95), p99: percentile(s, 99), max: s[s.length - 1],
  };
}

// ---------- Utilidades ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);

async function http(name, path, options = {}) {
  const start = performance.now();
  try {
    const res = await fetch(`${URL_BASE}${path}`, { ...options, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    const body = await res.text();
    record(`http ${name}`, performance.now() - start);
    if (!res.ok) {
      count(`http ${name} ${res.status}`);
      return null;
    }
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    return body && isJson ? JSON.parse(body) : null;
  } catch (err) {
    count(`http ${name} ${err.name === 'TimeoutError' ? 'timeout' : 'error'}`);
    return null;
  }
}

/** Emite con ack y mide el round-trip; resuelve null si no hay respuesta a tiempo. */
function emitAck(socket, name, event, payload) {
  const start = performance.now();
  return new Promise((resolve) => {
    // Sin payload, el ack tiene que ser el primer argumento (como espera app:ping en el servidor).
    const args = payload === undefined ? [event] : [event, payload];
    socket.timeout(ACK_TIMEOUT_MS).emit(...args, (err, res) => {
      if (err) {
        // Al cerrar la prueba, los acks en vuelo fallan porque se cierra el socket: no son timeouts reales.
        if (!stopping) count(`ack ${name} timeout`);
        return resolve(null);
      }
      record(`ack ${name}`, performance.now() - start);
      resolve(res);
    });
  });
}

/** Una jugada legal al azar según el estado recibido; null si no hay ninguna. */
function pickMove(state) {
  const { board, boardSize: size, koPoint } = state;
  const empties = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y * size + x] === null && !(koPoint && koPoint.x === x && koPoint.y === y)) empties.push([x, y]);
    }
  }
  for (let i = empties.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [empties[i], empties[j]] = [empties[j], empties[i]];
  }
  return empties.find(([x, y]) => goEngine.playMove(board, size, x, y, state.turn).ok) || null;
}

// ---------- Usuario simulado ----------

let stopping = false;
let institutionId = null;
let roomId = null;

class Bot {
  constructor(index, watcher, historyTab) {
    this.nickname = `${PREFIX}${String(index).padStart(3, '0')}`;
    this.watcher = watcher;
    this.historyTab = historyTab; // observador con la pestaña Historial abierta (no mira tableros)
    this.historyTimer = null;
    this.player = null;
    this.socket = null;
    this.boardNumber = null;
    this.color = null;
    this.movePending = null; // moveCount sobre el que se programó la jugada
    this.gameSeq = 0; // sube con cada partida terminada: invalida jugadas programadas de la anterior
    this.moveSentAt = null;
    this.sitting = false;
  }

  async start() {
    await http('index', '/');
    await http('institutions', '/api/institutions');
    const player = await http('login', '/api/players/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ institutionId, nickname: this.nickname, password: PASSWORD }),
    });
    if (!player) return;
    this.player = { id: String(player.id), nickname: player.nickname };
    await http('rooms', '/api/rooms');

    // Mismas opciones de transporte que el cliente real (server/public/js/services/socket.js).
    const socket = io(URL_BASE, {
      reconnection: true, timeout: 20000, transports: ['websocket', 'polling'], tryAllTransports: true,
    });
    this.socket = socket;
    let connectedOnce = false;
    const connectStart = performance.now();

    socket.on('connect', async () => {
      if (!connectedOnce) record('socket connect', performance.now() - connectStart);
      else count('reconnects');
      connectedOnce = true;
      socket.emit('presence:identify', { player: this.player });
      const summary = await emitAck(socket, 'room:join', 'room:join', { roomId, player: this.player });
      if (!summary || summary.error) {
        count('room:join error');
        return;
      }
      this.lastBoards = summary.boards;
      if (this.boardNumber != null && !this.watcher) {
        // Reconexión: el servidor decide el rol, como el cliente real.
        await emitAck(socket, 'board:sit', 'board:sit', { roomId, boardNumber: this.boardNumber, player: this.player });
        const mine = summary.boards.find((b) => b.number === this.boardNumber);
        if (mine) this.onBoard(mine);
      } else {
        this.next(summary.boards);
      }
    });
    socket.on('connect_error', (err) => count(`connect_error ${err.message}`));
    socket.on('disconnect', (reason) => {
      if (!stopping) count(`disconnect ${reason}`);
    });

    socket.on('room:update', (update) => {
      if (!update || !update.boards) return;
      this.lastBoards = update.boards;
      const mine = this.boardNumber != null && update.boards.find((b) => b.number === this.boardNumber);
      if (mine) this.onBoard(mine);
    });
    // Un tablero que cambió: se reemplaza en la lista, como RoomView.
    socket.on('room:board', (fresh) => {
      if (!fresh || !this.lastBoards) return;
      const i = this.lastBoards.findIndex((b) => b.number === fresh.number);
      if (i !== -1) this.lastBoards[i] = fresh;
      if (fresh.number === this.boardNumber) this.onBoard(fresh);
    });
    socket.on('board:state', (state) => {
      if (state.boardNumber !== this.boardNumber) return;
      if (this.moveSentAt && state.moveCount === this.movePending + 1) {
        record('move → board:state', performance.now() - this.moveSentAt);
        this.moveSentAt = null;
      }
      this.onBoard(state);
    });
    socket.on('board:finished', (state) => {
      if (this.historyTab) this.scheduleHistoryReload();
      if (state.boardNumber !== this.boardNumber) return;
      this.onFinished();
    });

    this.pingTimer = setInterval(() => {
      if (socket.connected) emitAck(socket, 'app:ping', 'app:ping');
    }, PING_INTERVAL_MS);
  }

  /** Decide qué hacer al estar libre: sentarse a jugar u observar alguna partida. */
  async next(boards) {
    if (stopping || this.sitting || !this.socket.connected) return;
    this.sitting = true;
    try {
      if (this.historyTab) {
        // Abre la pestaña Historial: la pide una vez y después solo al terminar partidas.
        await http('history', `/api/history/room/${roomId}`);
        return;
      }
      if (this.watcher) {
        const playing = (boards || this.lastBoards || []).filter((b) => b.status === 'playing');
        if (!playing.length) {
          setTimeout(() => this.next(), 3000);
          return;
        }
        const target = playing[Math.floor(Math.random() * playing.length)];
        const res = await emitAck(this.socket, 'board:sit', 'board:sit', {
          roomId, boardNumber: target.number, player: this.player, mode: 'watch',
        });
        this.boardNumber = res && res.ok ? target.number : null;
        if (!this.boardNumber) setTimeout(() => this.next(), 3000);
        return;
      }
      const free = (boards || this.lastBoards || []).find((b) => b.status === 'waiting') ||
        (boards || this.lastBoards || []).find((b) => b.status === 'empty');
      const res = await emitAck(this.socket, 'board:sit', 'board:sit', {
        roomId, boardNumber: free ? free.number : 1, player: this.player, mode: 'play',
      });
      if (!res || !res.ok) {
        count(`sit rejected: ${res ? res.error : 'timeout'}`);
        setTimeout(() => this.next(), rand(2000, 5000));
        return;
      }
      this.boardNumber = res.boardNumber || (free && free.number);
      this.color = res.color || null;
      const mine = this.lastBoards && this.lastBoards.find((b) => b.number === this.boardNumber);
      if (mine) this.onBoard(mine);
    } finally {
      this.sitting = false;
    }
  }

  onBoard(state) {
    if (this.watcher || state.status !== 'playing' || !state.board) return;
    const me = state.players.find((p) => p.playerId === this.player.id);
    if (!me) return;
    if (me.color) this.color = me.color;
    if (state.turn !== this.color || this.movePending === state.moveCount) return;
    if (state.moveCount === 0) count('matches started');
    this.movePending = state.moveCount;
    const boardNumber = this.boardNumber;
    const gameSeq = this.gameSeq;
    setTimeout(async () => {
      // Se compara la partida, no solo el tablero: con la revancha en el mismo tablero, una jugada
      // programada en la partida anterior se mandaría en la nueva ("No es tu turno").
      if (stopping || this.gameSeq !== gameSeq || this.boardNumber !== boardNumber || !this.socket.connected) return;
      const move = pickMove(state);
      if (!move) {
        await emitAck(this.socket, 'board:resign', 'board:resign', { roomId, boardNumber, playerId: this.player.id });
        return;
      }
      this.moveSentAt = performance.now();
      const res = await emitAck(this.socket, 'board:move', 'board:move', {
        roomId, boardNumber, playerId: this.player.id, x: move[0], y: move[1],
      });
      if (res && res.ok) count('moves');
      else if (res) count(`move rejected: ${res.error}`);
    }, rand(THINK_MIN, THINK_MAX));
  }

  async onFinished() {
    const finishedBoard = this.boardNumber;
    this.gameSeq += 1;
    this.boardNumber = null;
    this.color = null;
    this.movePending = null;
    if (stopping) return; // fin causado por el cierre de la prueba: no cuenta ni vuelve a sentarse
    if (!this.watcher) count('matches finished (por jugador)');
    this.socket.emit('board:leave', { roomId, boardNumber: finishedBoard });
    setTimeout(() => this.next(), rand(2000, 6000));
  }

  /** Igual que RoomView: con la pestaña abierta, recarga tras una demora al azar de 1 a 5 s. */
  scheduleHistoryReload() {
    if (this.historyTimer || stopping) return;
    this.historyTimer = setTimeout(async () => {
      this.historyTimer = null;
      if (!stopping) await http('history', `/api/history/room/${roomId}`);
    }, rand(1000, 5000));
  }

  /** Abandona la partida (o deja el tablero) antes de desconectar, para no dejar partidas huérfanas en el servidor. */
  async stop() {
    clearInterval(this.pingTimer);
    clearTimeout(this.historyTimer);
    if (!this.socket) return;
    const boardNumber = this.boardNumber;
    if (boardNumber != null && this.socket.connected) {
      // Abandona solo negro: si abandonaran los dos, el segundo recibiría "La partida no está en curso".
      if (!this.watcher && this.color === 'black') {
        await emitAck(this.socket, 'board:resign', 'board:resign', { roomId, boardNumber, playerId: this.player.id });
      }
      this.socket.emit('board:leave', { roomId, boardNumber });
    }
    this.socket.disconnect();
  }
}

// ---------- Ejecución ----------

async function resolveTargets() {
  const institutions = await http('institutions', '/api/institutions');
  const inst = institutions && institutions.find((i) => i._id === INSTITUTION || i.name === INSTITUTION);
  if (!inst) throw new Error(`No encontré la institución "${INSTITUTION}" en ${URL_BASE} (¿corriste load-test-setup?)`);
  const rooms = await http('rooms', '/api/rooms');
  const room = rooms && rooms.find((r) => r.id === ROOM || r.name === ROOM);
  if (!room) throw new Error(`No encontré la sala "${ROOM}" en ${URL_BASE} (si recién la creaste, esperá 30 s o reiniciá el servidor)`);
  institutionId = inst._id;
  roomId = room.id;
  console.log(`Sala "${room.name}": ${room.totalBoards} tableros, elegir rival: ${room.chooseOpponent}`);
}

function fmt(v) {
  return Number.isNaN(v) || v === undefined ? '-' : Math.round(v);
}

function progress(bots, startedAt) {
  const connected = bots.filter((b) => b.socket && b.socket.connected).length;
  const ws = bots.filter((b) => b.socket && b.socket.io.engine && b.socket.io.engine.transport.name === 'websocket').length;
  const ping = summarize(metrics.window['ack app:ping'] || []);
  const move = summarize(metrics.window['move → board:state'] || []);
  const timeouts = Object.entries(metrics.counters).filter(([k]) => k.includes('timeout')).reduce((a, [, v]) => a + v, 0);
  const disconnects = Object.entries(metrics.counters).filter(([k]) => k.startsWith('disconnect')).reduce((a, [, v]) => a + v, 0);
  console.log(`[${Math.round((Date.now() - startedAt) / 1000)}s] conectados ${connected}/${bots.length} (ws ${ws}) · `
    + `jugadas ${metrics.counters.moves || 0} · ping p95 ${fmt(ping.p95)} máx ${fmt(ping.max)} ms · `
    + `jugada→estado p95 ${fmt(move.p95)} ms · timeouts ${timeouts} · desconexiones ${disconnects}`);
  metrics.window = {};
}

function report() {
  console.log('\n=== Latencias (ms) ===');
  const rows = Object.entries(metrics.latency).map(([name, values]) => {
    const s = summarize(values);
    return {
      métrica: name, n: s.n, p50: fmt(s.p50), p95: fmt(s.p95), p99: fmt(s.p99), máx: fmt(s.max),
    };
  });
  console.table(rows);
  console.log('=== Contadores ===');
  console.table(Object.entries(metrics.counters).sort().map(([k, v]) => ({ evento: k, cantidad: v })));
}

async function main() {
  await resolveTargets();
  const watcherCount = Math.round(USERS * WATCHERS);
  const historyCount = Math.round(USERS * HISTORY);
  console.log(`${USERS} usuarios (${USERS - watcherCount} juegan, ${watcherCount - historyCount} observan tableros, `
    + `${historyCount} con el historial abierto), `
    + `conexión en ${RAMP_S} s, duración ${DURATION_S} s, demora por jugada ${THINK_MIN}-${THINK_MAX} ms`);

  const bots = [];
  activeBots = bots;
  const startedAt = Date.now();
  const progressTimer = setInterval(() => progress(bots, startedAt), 5000);
  const starts = [];
  for (let i = 1; i <= USERS; i++) {
    const bot = new Bot(i, i > USERS - watcherCount, i > USERS - historyCount);
    bots.push(bot);
    starts.push(bot.start().catch((err) => count(`bot error ${err.message}`)));
    if (RAMP_S > 0 && i < USERS) await sleep((RAMP_S * 1000) / USERS);
  }
  await Promise.all(starts);
  console.log(`Todos los usuarios iniciados en ${Math.round((Date.now() - startedAt) / 1000)} s`);

  await sleep(DURATION_S * 1000);
  clearInterval(progressTimer);
  await shutdown();
}

let activeBots = [];

/** Cierra la prueba: los bots abandonan sus partidas, se desconectan y se imprime el informe. */
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('Cerrando: abandonando partidas en curso...');
  await Promise.all(activeBots.map((b) => b.stop().catch(() => {})));
  await sleep(500); // deja salir los board:leave y disconnect antes de terminar el proceso
  report();
  process.exit(0);
}

process.on('SIGINT', () => {
  if (stopping) process.exit(1); // segundo Ctrl+C: salir ya
  shutdown();
});

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
