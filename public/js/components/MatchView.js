import { socket, emitAck } from '../socket.js';
import Goban from './Goban.js';

const CLOCK_LABELS = {
  fischer_5_3: 'Fischer 5m +3s',
  fischer_10_5: 'Fischer 10m +5s',
  absolute_10: 'Absoluto 10m',
};

function formatMs(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default {
  name: 'MatchView',
  components: { Goban },
  props: {
    matchId: { type: String, required: true },
    mode: { type: String, required: true }, // 'player' | 'spectator'
    playerNickname: { type: String, default: '' },
  },
  emits: ['back-to-room'],
  data() {
    return {
      match: null,
      error: '',
      clockLabels: CLOCK_LABELS,
    };
  },
  computed: {
    myColor() {
      if (this.mode !== 'player' || !this.match) return null;
      const me = this.match.players.find((p) => p.nickname === this.playerNickname);
      return me ? me.color : null;
    },
    isMyTurn() {
      return this.myColor && this.match && this.match.status === 'active' && this.match.turnColor === this.myColor;
    },
    statusText() {
      if (!this.match) return '';
      if (this.match.status === 'waiting') return 'Esperando rival…';
      if (this.match.status === 'active') {
        return this.match.turnColor === 'black' ? 'Turno: piedras negras' : 'Turno: piedras blancas';
      }
      if (this.match.status === 'finished') {
        if (!this.match.winnerNickname) return `Partida finalizada · empate (${this.match.result})`;
        return `Partida finalizada · gana ${this.match.winnerNickname} (${this.match.result})`;
      }
      return '';
    },
  },
  async mounted() {
    try {
      const res = await emitAck('match:rejoin', { matchId: this.matchId });
      this.match = res.match;
    } catch (err) {
      this.error = err.message;
    }

    this._onUpdate = (payload) => {
      if (payload.matchId !== this.matchId) return;
      this.match = payload;
    };
    this._onFinished = (payload) => {
      if (payload.matchId !== this.matchId) return;
      this.match = payload;
    };
    this._onTick = (payload) => {
      if (payload.matchId !== this.matchId || !this.match) return;
      this.match.players.forEach((p) => {
        if (payload.remaining[p.color] !== undefined) p.remainingMs = payload.remaining[p.color];
      });
    };

    socket.on('match:update', this._onUpdate);
    socket.on('match:finished', this._onFinished);
    socket.on('clock:tick', this._onTick);
  },
  beforeUnmount() {
    socket.off('match:update', this._onUpdate);
    socket.off('match:finished', this._onFinished);
    socket.off('clock:tick', this._onTick);
    socket.emit('match:leave', { matchId: this.matchId });
  },
  methods: {
    formatMs,
    async handlePlay({ x, y }) {
      this.error = '';
      try {
        const res = await emitAck('match:play', { matchId: this.matchId, x, y });
        if (!res.ok) this.error = res.reason;
      } catch (err) {
        this.error = err.message;
      }
    },
    async handlePass() {
      try {
        await emitAck('match:pass', { matchId: this.matchId });
      } catch (err) {
        this.error = err.message;
      }
    },
    async handleResign() {
      if (!confirm('¿Seguro que querés abandonar la partida?')) return;
      try {
        await emitAck('match:resign', { matchId: this.matchId });
      } catch (err) {
        this.error = err.message;
      }
    },
    playerFor(color) {
      if (!this.match) return null;
      return this.match.players.find((p) => p.color === color) || null;
    },
  },
  template: `
    <div>
      <div class="top-actions">
        <button class="btn btn-outline" @click="$emit('back-to-room')">← Volver a la sala</button>
        <span v-if="mode === 'spectator'" class="badge-spectator">👁 Modo espectador</span>
      </div>

      <p v-if="error" style="color:var(--error)">{{ error }}</p>

      <div v-if="match" class="card">
        <div class="status-banner" :class="{ finished: match.status === 'finished' }">{{ statusText }}</div>

        <div class="match-layout" style="margin-top:20px;">
          <div class="match-board-wrap">
            <Goban
              :board="match.board"
              :size="match.boardSize"
              :interactive="mode === 'player' && isMyTurn"
              @play="handlePlay"
            />
          </div>

          <div class="match-side">
            <div
              v-for="color in ['black', 'white']"
              :key="color"
              class="player-panel"
              :class="{ turn: match.status === 'active' && match.turnColor === color }"
            >
              <span class="stone-icon" :class="color"></span>
              <div>
                <div class="player-panel__name">
                  {{ playerFor(color) ? playerFor(color).nickname : 'Esperando…' }}
                </div>
                <div class="player-panel__meta" v-if="playerFor(color)">{{ playerFor(color).dojoName }}</div>
                <div class="player-panel__captures" v-if="playerFor(color)">
                  Capturas: {{ playerFor(color).capturedStones }} / {{ match.stonesToCapture }}
                </div>
              </div>
              <div class="player-panel__clock" v-if="playerFor(color)">
                {{ formatMs(playerFor(color).remainingMs) }}
              </div>
            </div>

            <div class="card" style="padding:14px;">
              <h3 style="margin-bottom:6px;">{{ clockLabels[match.clockType] || match.clockType }}</h3>
              <p style="margin:0; font-size:13px;">👁 {{ match.spectatorsCount }} observando</p>
            </div>

            <div class="action-row" v-if="mode === 'player' && match.status === 'active'">
              <button class="btn btn-outline btn-block" @click="handlePass" :disabled="!isMyTurn">Pasar</button>
              <button class="btn btn-danger btn-block" @click="handleResign">Abandonar</button>
            </div>

            <button v-if="match.status === 'finished'" class="btn btn-primary btn-block" @click="$emit('back-to-room')">
              Volver a la sala
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
};
