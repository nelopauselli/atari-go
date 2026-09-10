import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { api } from '../services/api.js';
import { socketService } from '../services/socket.js';
import { getPlayer } from '../services/auth.js';
import { navigate } from '../router.js';
import GoBoard from '../components/GoBoard.js';
import ClockDisplay from '../components/ClockDisplay.js';

const STATUS_LABELS = { empty: 'Vacío', waiting: 'Esperando rival', playing: 'En curso', finished: 'Finalizado' };

export default {
  name: 'RoomView',
  components: { GoBoard, ClockDisplay },
  props: { roomId: { type: String, required: true } },
  setup(props) {
    const player = getPlayer();
    const room = ref(null);
    const boards = ref([]);
    const tab = ref('boards');
    const roomHistory = ref([]);
    const ranking = ref([]);
    const joinError = ref('');

    const active = reactive({
      boardNumber: null,
      role: null, // 'player' | 'spectator'
      color: null,
      state: null, // último board:state / snapshot
      sitError: '',
    });

    let unsubs = [];

    async function loadRoomAndBoards() {
      const data = await api.getRoom(props.roomId);
      room.value = data.room;
      boards.value = data.boards;
    }

    async function loadHistory() {
      const data = await api.getRoomHistory(props.roomId);
      roomHistory.value = data.matches;
      ranking.value = data.ranking;
    }

    onMounted(async () => {
      await loadRoomAndBoards();
      await loadHistory();

      const summary = await socketService.joinRoom(props.roomId, player);
      if (summary && summary.config) {
        room.value = { ...room.value, ...summary.config };
        boards.value = summary.boards;
      } else {
        joinError.value = 'No se pudo unir a la sala en vivo';
      }

      unsubs.push(socketService.on('room:update', (summary2) => {
        boards.value = summary2.boards;
        if (active.boardNumber != null) {
          const fresh = summary2.boards.find((b) => b.number === active.boardNumber);
          if (fresh) active.state = fresh;
        }
      }));
      unsubs.push(socketService.on('board:state', (payload) => {
        if (payload.boardNumber === active.boardNumber) active.state = payload;
      }));
      unsubs.push(socketService.on('board:clock', (payload) => {
        if (payload.boardNumber === active.boardNumber && active.state) {
          active.state = { ...active.state, turn: payload.turn, clocks: payload.clocks };
        }
      }));
      unsubs.push(socketService.on('board:finished', (payload) => {
        if (payload.boardNumber === active.boardNumber) active.state = payload;
        loadHistory();
      }));
    });

    onUnmounted(() => {
      unsubs.forEach((u) => u());
      socketService.leaveRoom(props.roomId);
    });

    async function openBoard(boardNumber) {
      active.sitError = '';
      const result = await socketService.sitBoard(props.roomId, boardNumber, player);
      if (!result.ok) {
        active.sitError = result.error || 'No se pudo entrar al tablero';
        return;
      }
      active.boardNumber = boardNumber;
      active.role = result.role;
      active.color = result.color || null;
      if (result.error) active.sitError = result.error; // espectador por conflicto de equipo
      const found = boards.value.find((b) => b.number === boardNumber);
      active.state = found || null;
    }

    function closeActiveBoard() {
      if (active.role === 'spectator' && active.boardNumber != null) {
        socketService.leaveSpectator(props.roomId, active.boardNumber);
      }
      active.boardNumber = null;
      active.role = null;
      active.color = null;
      active.state = null;
      active.sitError = '';
    }

    async function playAt({ x, y }) {
      await socketService.move(props.roomId, active.boardNumber, player.id, x, y);
    }
    async function doPass() {
      await socketService.pass(props.roomId, active.boardNumber, player.id);
    }
    async function doResign() {
      if (!confirm('¿Seguro que querés abandonar la partida?')) return;
      await socketService.resign(props.roomId, active.boardNumber, player.id);
    }

    function resultLabel(m) {
      if (!m.result || !m.result.winnerColor) return 'Sin definir';
      const winner = m.players.find((p) => p.color === m.result.winnerColor);
      return winner ? `Gana ${winner.nickname} (${m.result.reason})` : '-';
    }

    return {
      room, boards, tab, roomHistory, ranking, active, joinError, STATUS_LABELS,
      openBoard, closeActiveBoard, playAt, doPass, doResign, resultLabel,
      sgfUrl: api.sgfDownloadUrl, backHome: () => navigate('/home'), player,
    };
  },
  template: `
    <main v-if="room">
      <div class="toolbar">
        <div>
          <a class="link" @click="backHome" style="cursor:pointer;">← Salas</a>
          <h2 style="margin-top:4px;">{{ room.name }}</h2>
          <p class="muted">
            {{ room.type==='torneo' ? 'Torneo por equipos' : 'Amistosas' }} ·
            {{ room.boardSize }}x{{ room.boardSize }} ·
            {{ room.stonesToWin }} piedra(s) para ganar
          </p>
        </div>
      </div>

      <p v-if="joinError" style="color:var(--md-error);">{{ joinError }}</p>

      <!-- Tablero activo (jugando o espectando) -->
      <div v-if="active.boardNumber && active.state" class="card" style="margin-bottom:24px;">
        <div class="toolbar">
          <h3 style="margin:0;">Tablero #{{ active.boardNumber }}</h3>
          <span class="chip" :class="active.role==='spectator' ? '' : 'chip--team'">
            {{ active.role==='spectator' ? 'Observando' : ('Jugás con ' + (active.color==='black' ? 'negras ⚫' : 'blancas ⚪')) }}
          </span>
        </div>

        <div v-if="active.sitError" class="spectator-banner">{{ active.sitError }}</div>

        <ClockDisplay v-if="active.state.clocks" :clocks="active.state.clocks" :turn="active.state.turn" :players="active.state.players" />

        <GoBoard
          style="margin-top:16px;"
          :size="active.state.boardSize || room.boardSize"
          :board="active.state.board || []"
          :interactive="active.role==='player' && active.state.status==='playing' && active.state.turn===active.color"
          :my-color="active.color"
          @play="playAt"
        />

        <div v-if="active.state.status==='finished' && active.state.lastResult" class="empty-state">
          <strong>Partida finalizada.</strong>
          Gana {{ active.state.lastResult.winnerColor==='black' ? '⚫' : '⚪' }}
          ({{ active.state.lastResult.reason }})
        </div>

        <div class="toolbar" style="margin-top:16px;">
          <div style="display:flex; gap:8px;">
            <button v-if="active.role==='player' && active.state.status==='playing'" class="btn btn--outline btn--sm" @click="doPass">Pasar</button>
            <button v-if="active.role==='player' && active.state.status==='playing'" class="btn btn--danger btn--sm" @click="doResign">Abandonar</button>
          </div>
          <button class="btn btn--sm" @click="closeActiveBoard">Volver a la Sala</button>
        </div>
      </div>

      <div class="tabs">
        <div class="tab" :class="{ 'tab--active': tab==='boards' }" @click="tab='boards'">Tableros</div>
        <div class="tab" :class="{ 'tab--active': tab==='history' }" @click="tab='history'">Historial</div>
        <div v-if="room.type==='torneo'" class="tab" :class="{ 'tab--active': tab==='ranking' }" @click="tab='ranking'">Ranking</div>
      </div>

      <div v-if="tab==='boards'" class="grid grid--boards">
        <div class="board-card" v-for="b in boards" :key="b.number" @click="openBoard(b.number)">
          <div class="toolbar" style="margin-bottom:8px;">
            <strong>Tablero #{{ b.number }}</strong>
            <span class="status-badge" :class="'status-badge--' + b.status">{{ STATUS_LABELS[b.status] }}</span>
          </div>
          <p v-if="b.players && b.players.length" class="muted">
            {{ b.players.map(p => p.nickname).join(' vs ') || 'Sin jugadores' }}
          </p>
          <p v-else class="muted">Sin jugadores</p>
          <p v-if="b.spectatorCount" class="muted">👁 {{ b.spectatorCount }} observando</p>
        </div>
      </div>

      <div v-else-if="tab==='history'">
        <table>
          <thead><tr><th>Tablero</th><th>Jugadores</th><th>Resultado</th><th>Fecha</th><th>SGF</th></tr></thead>
          <tbody>
            <tr v-for="m in roomHistory" :key="m._id">
              <td>#{{ m.boardNumber }}</td>
              <td>{{ m.players.map(p => p.nickname).join(' vs ') }}</td>
              <td>{{ resultLabel(m) }}</td>
              <td>{{ m.endedAt ? new Date(m.endedAt).toLocaleString() : '-' }}</td>
              <td><a class="link" :href="sgfUrl(m._id)">Descargar</a></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="tab==='ranking'">
        <table>
          <thead><tr><th>Equipo</th><th>Victorias</th></tr></thead>
          <tbody>
            <tr v-for="r in ranking" :key="r.team"><td>{{ r.teamName }}</td><td>{{ r.wins }}</td></tr>
          </tbody>
        </table>
      </div>
    </main>
  `,
};
