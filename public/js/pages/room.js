import { api } from '../api.js';
import { socket, ensurePlayerName } from '../socket.js';
import { clockLabel } from '../format.js';

const params = new URLSearchParams(window.location.search);
const roomId = params.get('roomId');

export default {
  name: 'RoomApp',
  data() {
    return {
      playerName: '',
      room: null,
      boards: [],
      loading: true,
      errorMsg: '',
      sitting: false,
    };
  },
  async mounted() {
    if (!roomId) {
      this.errorMsg = 'Falta el identificador de la sala.';
      this.loading = false;
      return;
    }
    this.playerName = ensurePlayerName();

    try {
      const detail = await api.getRoom(roomId);
      this.room = detail;
      this.boards = detail.boards;
    } catch (err) {
      this.errorMsg = 'No se encontró la sala.';
      this.loading = false;
      return;
    }
    this.loading = false;

    socket.emit('room:enter', { roomId }, (res) => {
      if (!res?.ok) this.errorMsg = 'No se pudo entrar a la sala.';
    });
    socket.on('room:boards', this.onBoardsUpdate);
  },
  beforeUnmount() {
    socket.emit('room:leave');
    socket.off('room:boards', this.onBoardsUpdate);
  },
  methods: {
    clockLabel,
    onBoardsUpdate(boards) {
      this.boards = boards.map((b) => ({ ...b, match: null }));
      // Volvemos a pedir el detalle completo para tener los nombres de jugadores.
      api.getRoom(roomId).then((detail) => { this.boards = detail.boards; });
    },
    statusLabel(board) {
      if (board.status === 'libre' && !board.match) return 'Libre';
      if (board.match?.status === 'esperando') return 'Esperando rival';
      if (board.match?.status === 'en_curso') return 'En juego';
      return 'Libre';
    },
    createBoard() {
      socket.emit('board:create', {}, (res) => {
        if (!res?.ok) this.errorMsg = 'No se pudo crear el tablero.';
      });
    },
    sitBoard(board) {
      if (this.sitting) return;
      this.sitting = true;
      socket.emit('board:sit', { boardNumber: board.number, name: this.playerName }, (res) => {
        this.sitting = false;
        if (!res?.ok) {
          this.errorMsg = res?.error === 'tablero_ocupado'
            ? 'Ese tablero ya está ocupado.'
            : 'No se pudo entrar al tablero.';
          return;
        }
        window.location.href = `game.html?matchId=${res.matchId}&color=${res.color}`;
      });
    },
    spectateBoard(board) {
      if (!board.match) return;
      window.location.href = `game.html?matchId=${board.match._id || board.match.id}&spectate=1`;
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
      <span class="tagline" v-if="room">{{ room.name }}</span>
      <span class="player-name-chip">{{ playerName }}</span>
    </header>

    <main class="page">
      <p v-if="loading" class="empty-note">Cargando sala…</p>
      <p v-else-if="errorMsg && !room" class="empty-note">{{ errorMsg }}</p>

      <template v-else-if="room">
        <a href="index.html" class="meta" style="text-decoration:none;">&larr; volver a la home</a>

        <section class="panel" style="margin-top:14px;">
          <div class="panel-header">
            <div>
              <h2>{{ room.name }}</h2>
              <div class="meta" style="margin-top:4px;">
                {{ room.boardSize }}×{{ room.boardSize }} · {{ room.capturesToWin }} capturas para ganar · {{ clockLabel(room.clockPresetKey) }} · {{ room.connectedCount }} conectados
              </div>
            </div>
            <button class="btn" @click="createBoard">+ Nuevo tablero</button>
          </div>

          <p v-if="errorMsg" style="color: var(--shu-600); padding: 10px 18px; font-size: 0.85rem;">{{ errorMsg }}</p>

          <div class="boards-grid">
            <div v-for="board in boards" :key="board.number" class="board-card">
              <div class="board-number">Tablero {{ board.number }}</div>
              <div class="board-status">{{ statusLabel(board) }}</div>
              <template v-if="board.match?.status === 'en_curso'">
                <div class="player-pair" style="margin-bottom:10px;">
                  <span class="stone-dot black"></span>{{ board.match.players.black?.name }}
                  <span style="margin:0 4px; color: var(--sumi-600);">vs</span>
                  <span class="stone-dot white"></span>{{ board.match.players.white?.name }}
                </div>
                <button class="btn secondary" @click="spectateBoard(board)">Mirar</button>
              </template>
              <template v-else-if="board.match?.status === 'esperando'">
                <div class="player-pair" style="margin-bottom:10px;">
                  <span class="stone-dot black"></span>{{ board.match.players.black?.name }}
                  <span style="margin:0 4px; color: var(--sumi-600);">espera rival…</span>
                </div>
                <button class="btn" :disabled="sitting" @click="sitBoard(board)">Sumarme como blanco</button>
              </template>
              <template v-else>
                <button class="btn" :disabled="sitting" @click="sitBoard(board)">Sentarme a jugar</button>
              </template>
            </div>
          </div>
        </section>
      </template>
    </main>
  `,
};
