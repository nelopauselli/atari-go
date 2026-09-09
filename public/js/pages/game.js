import { api } from '../api.js';
import { socket, ensurePlayerName } from '../socket.js';
import { clockLabel, formatMs, winReasonLabel } from '../format.js';
import GoBoard from '../components/GoBoard.js';

const params = new URLSearchParams(window.location.search);
const matchId = params.get('matchId');
const colorHint = params.get('color'); // 'black' | 'white' | null
const spectateFlag = params.get('spectate') === '1';

const LOW_TIME_MS = 20000;
const TICK_MS = 250;

export default {
  name: 'GameApp',
  components: { GoBoard },
  data() {
    return {
      playerName: '',
      match: null, // último estado público recibido del servidor
      myColor: colorHint === 'white' ? 2 : colorHint === 'black' ? 1 : null,
      role: spectateFlag ? 'spectator' : (colorHint ? 'player' : 'spectator'),
      loading: true,
      errorMsg: '',
      actionError: '',
    };
  },
  computed: {
    board() {
      return this.match?.board || [];
    },
    isMyTurn() {
      return this.role === 'player' && this.match?.status === 'en_curso' && this.match?.turnColor === this.myColor;
    },
    statusText() {
      if (!this.match) return '';
      if (this.match.status === 'esperando') return 'Esperando a que se siente el rival…';
      if (this.match.status === 'en_curso') {
        return this.match.turnColor === 1 ? 'Turno de negro' : 'Turno de blanco';
      }
      const winnerName = this.match.winnerColor === 1
        ? this.match.players.black?.name
        : this.match.winnerColor === 2
          ? this.match.players.white?.name
          : null;
      return winnerName
        ? `Ganó ${winnerName} ${winReasonLabel(this.match.winReason)}`
        : `Partida terminada (empate, ${winReasonLabel(this.match.winReason)})`;
    },
  },
  async mounted() {
    if (!matchId) {
      this.errorMsg = 'Falta el identificador de la partida.';
      this.loading = false;
      return;
    }
    this.playerName = ensurePlayerName();

    try {
      const detail = await api.getMatch(matchId);
      this.match = detail;
    } catch (err) {
      this.errorMsg = 'No se encontró la partida.';
      this.loading = false;
      return;
    }
    this.loading = false;

    if (this.match.status !== 'finalizada') {
      if (this.role === 'player') {
        socket.emit('match:rejoin', { matchId, color: colorHint }, (res) => {
          if (res?.ok) this.match = res.match;
          else this.actionError = 'No se pudo confirmar tu asiento; puede que ya haya empezado otra sesión.';
        });
      } else {
        socket.emit('board:spectate', { matchId, name: this.playerName }, (res) => {
          if (res?.ok) this.match = res.match;
        });
      }
    }

    socket.on('match:waiting', this.onMatchPayload);
    socket.on('match:started', this.onMatchPayload);
    socket.on('match:state', this.onMatchPayload);
    socket.on('match:over', this.onMatchOver);
    socket.on('match:clock', this.onClockTick);
    socket.on('match:spectators', this.onSpectators);

    this._localTicker = setInterval(this.localTick, TICK_MS);
  },
  beforeUnmount() {
    socket.off('match:waiting', this.onMatchPayload);
    socket.off('match:started', this.onMatchPayload);
    socket.off('match:state', this.onMatchPayload);
    socket.off('match:over', this.onMatchOver);
    socket.off('match:clock', this.onClockTick);
    socket.off('match:spectators', this.onSpectators);
    clearInterval(this._localTicker);
  },
  methods: {
    clockLabel,
    formatMs,
    onMatchPayload(payload) {
      if (payload.id !== matchId) return;
      this.match = { ...this.match, ...payload };
    },
    onMatchOver(payload) {
      if (payload.id !== matchId) return;
      this.match = { ...this.match, ...payload };
    },
    onClockTick(payload) {
      if (payload.matchId !== matchId || !this.match) return;
      this.match = { ...this.match, clock: payload.clock };
    },
    onSpectators(payload) {
      if (payload.matchId !== matchId || !this.match) return;
      this.match = { ...this.match, spectatorCount: payload.spectatorCount };
    },
    localTick() {
      if (!this.match || this.match.status !== 'en_curso' || !this.match.clock) return;
      const key = this.match.turnColor === 1 ? 'black' : 'white';
      const clock = this.match.clock;
      if (clock[key].remainingMs > 0) {
        clock[key] = { remainingMs: Math.max(0, clock[key].remainingMs - TICK_MS) };
      }
    },
    timeFor(color) {
      if (!this.match?.clock) return '--:--';
      const key = color === 1 ? 'black' : 'white';
      return formatMs(this.match.clock[key]?.remainingMs ?? 0);
    },
    isLowTime(color) {
      if (!this.match?.clock) return false;
      const key = color === 1 ? 'black' : 'white';
      return (this.match.clock[key]?.remainingMs ?? Infinity) < LOW_TIME_MS;
    },
    playMove({ row, col }) {
      if (!this.isMyTurn) return;
      this.actionError = '';
      socket.emit('match:move', { matchId, row, col }, (res) => {
        if (!res?.ok) this.actionError = describeError(res?.error);
      });
    },
    pass() {
      if (!this.isMyTurn) return;
      socket.emit('match:pass', { matchId }, (res) => {
        if (!res?.ok) this.actionError = describeError(res?.error);
      });
    },
    resign() {
      if (this.role !== 'player' || this.match.status !== 'en_curso') return;
      if (!window.confirm('¿Seguro que querés renunciar a la partida?')) return;
      socket.emit('match:resign', { matchId }, (res) => {
        if (!res?.ok) this.actionError = describeError(res?.error);
      });
    },
  },
  template: `
    <header class="site-header">
      <div class="brand">
        <a href="index.html" style="text-decoration:none; display:flex; align-items:baseline; gap:10px;">
          <span class="stone"></span>
          <h1>Atari-Go Online</h1>
        </a>
      </div>
      <span class="tagline" v-if="match">{{ match.roomName }} · tablero {{ match.boardNumber }}</span>
      <span class="player-name-chip">{{ playerName }} <template v-if="role === 'spectator'">(espectador)</template></span>
    </header>

    <main class="page">
      <p v-if="loading" class="empty-note">Cargando partida…</p>
      <p v-else-if="errorMsg" class="empty-note">{{ errorMsg }}</p>

      <div v-else-if="match" class="game-shell">
        <section>
          <div class="board-wrap">
            <go-board
              :size="match.boardSize"
              :board="board"
              :disabled="!isMyTurn"
              @play="playMove"
            />
          </div>
          <p v-if="actionError" style="text-align:center; color: var(--shu-600); font-size: 0.85rem;">{{ actionError }}</p>
        </section>

        <aside class="side-panel">
          <div class="panel">
            <div class="status-line">{{ statusText }}</div>

            <div class="clock-row" :class="{ active: match.status === 'en_curso' && match.turnColor === 1 }">
              <div class="player-pair">
                <span class="stone-dot black"></span>
                <div>
                  <div>{{ match.players.black?.name || '—' }}</div>
                  <div class="capture-count">{{ match.captures.black }} capturas</div>
                </div>
              </div>
              <div class="clock-time" :class="{ low: isLowTime(1) }">{{ timeFor(1) }}</div>
            </div>

            <div class="clock-row" :class="{ active: match.status === 'en_curso' && match.turnColor === 2 }">
              <div class="player-pair">
                <span class="stone-dot white"></span>
                <div>
                  <div>{{ match.players.white?.name || 'esperando…' }}</div>
                  <div class="capture-count">{{ match.captures.white }} capturas</div>
                </div>
              </div>
              <div class="clock-time" :class="{ low: isLowTime(2) }">{{ timeFor(2) }}</div>
            </div>

            <div class="actions-row" v-if="role === 'player' && match.status === 'en_curso'">
              <button class="btn secondary" :disabled="!isMyTurn" @click="pass">Pasar</button>
              <button class="btn danger" @click="resign">Renunciar</button>
            </div>
            <p v-else-if="role === 'spectator'" class="spectator-note">
              Estás mirando esta partida · {{ match.spectatorCount }} espectador(es)
            </p>
          </div>

          <div class="panel">
            <div class="panel-header"><h2 style="font-size:0.95rem;">Configuración de la sala</h2></div>
            <div class="panel-body" style="padding: 10px 18px;">
              <div class="meta">Objetivo: {{ match.capturesToWin }} capturas</div>
              <div class="meta" style="margin-top:4px;">Reloj: {{ clockLabel(match.clockPresetKey) }}</div>
              <div class="meta" style="margin-top:4px;">Tablero: {{ match.boardSize }}×{{ match.boardSize }}</div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  `,
};

function describeError(code) {
  const map = {
    no_es_tu_turno: 'No es tu turno.',
    no_sos_jugador: 'No estás jugando esta partida.',
    casillero_ocupado: 'Ese casillero ya está ocupado.',
    jugada_suicida: 'Esa jugada te dejaría sin libertades.',
    regla_ko: 'Esa jugada repite la posición anterior (regla del ko).',
    partida_no_disponible: 'La partida ya no está disponible.',
  };
  return map[code] || 'No se pudo hacer la jugada.';
}
