import { socket, emitAck } from '../socket.js';

const CLOCK_LABELS = {
  fischer_5_3: 'Fischer 5m +3s',
  fischer_10_5: 'Fischer 10m +5s',
  absolute_10: 'Absoluto 10m',
};

export default {
  name: 'RoomView',
  props: { roomId: { type: String, required: true } },
  emits: ['back-to-lobby', 'enter-match'],
  data() {
    return {
      room: null,
      presence: [],
      stats: { connectedPlayers: 0, dojosCount: 0 },
      error: '',
      clockLabels: CLOCK_LABELS,
    };
  },
  async mounted() {
    try {
      const res = await emitAck('room:join', { roomId: this.roomId });
      this.room = res.room;
      this.presence = res.presence;
      this.stats = res.stats;
    } catch (err) {
      this.error = err.message;
    }

    this._onRoomState = (payload) => {
      if (String(payload.room._id) !== String(this.roomId)) return;
      this.room = payload.room;
      this.presence = payload.presence;
      this.stats = payload.stats;
    };
    socket.on('room:state', this._onRoomState);
  },
  beforeUnmount() {
    socket.off('room:state', this._onRoomState);
    socket.emit('room:leave', { roomId: this.roomId });
  },
  methods: {
    async selectBoard(board) {
      this.error = '';
  try {
    const res = await emitAck('board:sit', { roomId: this.roomId, boardNumber: board.number });
    this.$emit('enter-match', { matchId: res.match.matchId, mode: 'player' });
  } catch (err) {
    if (err.message === 'tablero_completo') {
      try {
        const res = await emitAck('board:spectate', { roomId: this.roomId, boardNumber: board.number });
        this.$emit('enter-match', { matchId: res.match.matchId, mode: 'spectator' });
      } catch (err2) {
        this.error = err2.message;
      }
    } else {
      this.error = err.message;
    }
  }
    },
  },
  template: `
    <div>
      <div class="top-actions">
        <button class="btn btn-outline" @click="$emit('back-to-lobby')">← Volver al lobby</button>
      </div>

      <div v-if="room" class="card">
        <h1>{{ room.name }}</h1>
        <div class="room-card__stats">
          <span class="stat-pill">Tablero {{ room.boardSize }}×{{ room.boardSize }}</span>
          <span class="stat-pill">{{ room.stonesToCapture }} piedras para ganar</span>
          <span class="stat-pill">{{ clockLabels[room.clockType] || room.clockType }}</span>
          <span class="stat-pill" v-if="!room.allowSameDojo">Sin duelos del mismo dojo</span>
          <span class="stat-pill">👥 {{ stats.connectedPlayers }} conectados</span>
          <span class="stat-pill">🏯 {{ stats.dojosCount }} dojos</span>
        </div>
      </div>

      <p v-if="error" style="color:var(--error)">{{ error }}</p>

      <h2 style="margin-top:24px;">Tableros</h2>
      <div class="grid grid-boards" v-if="room">
        <div
          v-for="board in room.boards"
          :key="board.number"
          class="board-card"
          :class="board.status"
          @click="selectBoard(board)"
        >
          <div class="board-card__number">T{{ board.number }}</div>
          <div class="board-card__status">
            {{ board.status === 'free' ? 'Libre · jugar' : 'En juego · observar' }}
          </div>
        </div>
      </div>
    </div>
  `,
};
