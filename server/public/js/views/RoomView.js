import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { api } from '../services/api.js';
import { socketService } from '../services/socket.js';
import { getPlayer, isGuest } from '../services/auth.js';
import { setTeams } from '../services/teams.js';
import { navigate } from '../router.js';
import GoBoard from '../components/GoBoard.js';
import ClockDisplay from '../components/ClockDisplay.js';
import RulesModal from '../components/RulesModal.js';
import TeamShield from '../components/TeamShield.js';
import TeamAssignedModal from '../components/TeamAssignedModal.js';

const STATUS_LABELS = { empty: 'Vacío', waiting: 'Esperando rival', playing: 'En curso', finished: 'Finalizado' };
const STATUS_BADGE_CLASS = { empty: 'text-bg-secondary', waiting: 'text-bg-warning', playing: 'text-bg-success', finished: 'text-bg-info' };

export default {
  name: 'RoomView',
  components: { GoBoard, ClockDisplay, RulesModal, TeamShield, TeamAssignedModal },
  props: { roomId: { type: String, required: true } },
  setup(props) {
    const player = getPlayer();
    const guest = isGuest(player);
    const room = ref(null);
    const boards = ref([]);
    const tab = ref('boards');
    const roomHistory = ref([]);
    const ranking = ref([]);
    const joinError = ref('');
    const showRules = ref(false);

    // Equipos: solo en salas torneo. El servidor le asigna uno al jugador al entrar a la sala.
    const myTeamId = ref('');
    const isTournament = computed(() => !!room.value && room.value.type === 'torneo');
    const roomTeams = computed(() => (isTournament.value ? room.value.teams || [] : []));
    // TeamShield resuelve el avatar por id/nombre entre los equipos de esta sala.
    watch(roomTeams, setTeams, { immediate: true });
    const myTeam = computed(() => roomTeams.value.find((t) => t._id === myTeamId.value) || null);
    // Se avisa con un modal cuando el servidor le asigna equipo en este ingreso (no al volver a entrar).
    const showTeamAssigned = ref(false);

    async function joinLive() {
      const summary = await socketService.joinRoom(props.roomId, player);
      if (!summary || !summary.config) return false;
      room.value = { ...room.value, ...summary.config };
      boards.value = summary.boards;
      myTeamId.value = summary.myTeam ? summary.myTeam._id : '';
      if (summary.teamAssigned) showTeamAssigned.value = true;
      return true;
    }

    const active = reactive({
      boardNumber: null,
      role: null, // 'player' | 'spectator'
      color: null,
      state: null, // último board:state / snapshot
      sitError: '',
    });
    const isPlaying = computed(() => active.boardNumber != null && active.role === 'player');

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

      if (!(await joinLive())) joinError.value = 'No se pudo unir a la sala en vivo';

      unsubs.push(socketService.on('room:update', (summary2) => {
        room.value = { ...room.value, ...summary2.config };
        boards.value = summary2.boards;
        // Si el admin agregó equipos o quitó el del jugador, se vuelve a pedir la asignación.
        if (!guest && isTournament.value && roomTeams.value.length && !myTeam.value) joinLive();
        if (active.boardNumber != null) {
          const fresh = summary2.boards.find((b) => b.number === active.boardNumber);
          // Al liberarse el tablero (partida terminada o se fue quien esperaba rival), se vuelve a la sala.
          if (fresh && fresh.status === 'empty' && active.state && active.state.status !== 'empty') closeActiveBoard();
          else if (fresh) active.state = fresh;
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
      closeActiveBoard();
      setTeams([]);
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
      if (active.boardNumber != null) socketService.leaveBoard(props.roomId, active.boardNumber);
      active.boardNumber = null;
      active.role = null;
      active.color = null;
      active.state = null;
      active.sitError = '';
    }

    async function playAt({ x, y }) {
      await socketService.move(props.roomId, active.boardNumber, player.id, x, y);
    }
    async function doResign() {
      if (!confirm('¿Seguro que querés abandonar la partida?')) return;
      await socketService.resign(props.roomId, active.boardNumber, player.id);
    }

    function playerLabel(p) {
      return p.teamName ? `${p.nickname} (${p.teamName})` : p.nickname;
    }

    function resultLabel(m) {
      if (!m.result || !m.result.winnerColor) return 'Sin definir';
      const winner = m.players.find((p) => p.color === m.result.winnerColor);
      return winner ? `Gana ${playerLabel(winner)} (${m.result.reason})` : '-';
    }

    return {
      room, boards, tab, roomHistory, ranking, active, joinError, showRules, STATUS_LABELS, STATUS_BADGE_CLASS,
      isTournament, roomTeams, myTeam, showTeamAssigned, guest, isPlaying,
      openBoard, closeActiveBoard, playAt, doResign, resultLabel, playerLabel,
      sgfUrl: api.sgfDownloadUrl, player,
      goBack: () => (active.boardNumber ? closeActiveBoard() : navigate('/home')),
    };
  },
  template: `
    <main class="container py-4" v-if="room">
      <div class="mb-3">
        <a href="#" class="link-secondary text-decoration-none" @click.prevent="goBack">← {{ active.boardNumber ? room.name : 'Salas' }}</a>
        <div class="d-flex justify-content-between align-items-center gap-2 mt-1 mb-1">
          <h2 class="h4 mb-0">{{ room.name }}</h2>
          <button type="button" class="btn btn-outline-info btn-sm" @click="showRules = true">Reglas</button>
        </div>
        <p class="text-muted mb-0">
          {{ room.type==='torneo' ? 'Torneo por equipos' : 'Amistosas' }} ·
          {{ room.boardSize }}x{{ room.boardSize }} ·
          {{ room.stonesToWin }} piedra(s) para ganar ·
          Ko {{ room.koRuleEnabled === false ? 'deshabilitado' : 'habilitado' }}
        </p>
        <p v-if="isTournament && myTeam" class="mb-0 mt-1 d-flex align-items-center gap-2">
          <span class="text-muted">Tu equipo:</span>
          <TeamShield :team="myTeam._id" :name="myTeam.name" :size="24" />
          <strong>{{ myTeam.name }}</strong>
        </p>
      </div>

      <div v-if="joinError" class="alert alert-danger">{{ joinError }}</div>

      <div v-if="guest" class="alert alert-info">Est&aacute;s como invitado: pod&eacute;s observar las partidas en curso, pero no jugar ni unirte a un equipo.</div>
      <div v-if="!guest && isTournament && !roomTeams.length" class="alert alert-secondary">Esta sala todav&iacute;a no tiene equipos asignados.</div>
      <div v-if="!active.boardNumber && active.sitError" class="alert alert-warning">{{ active.sitError }}</div>

      <RulesModal v-if="showRules" :room="room" @close="showRules = false" />
      <TeamAssignedModal v-if="showTeamAssigned && myTeam" :team="myTeam" @close="showTeamAssigned = false" />

      <!-- Tablero activo (jugando o espectando) -->
      <div v-if="active.boardNumber && active.state" class="card shadow-sm mb-4">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h3 class="h5 mb-0">Tablero #{{ active.boardNumber }}</h3>
            <span class="badge" :class="active.role==='spectator' ? 'text-bg-light' : 'text-bg-primary'">
              {{ active.role==='spectator' ? 'Observando' : ('Jugás con ' + (active.color==='black' ? 'negras ⚫' : 'blancas ⚪')) }}
            </span>
          </div>

          <div v-if="active.sitError" class="alert alert-secondary py-2">{{ active.sitError }}</div>

          <ClockDisplay v-if="active.state.clocks" :clocks="active.state.clocks" :turn="active.state.turn" :players="active.state.players" :captured-by-black="active.state.capturedByBlack" :captured-by-white="active.state.capturedByWhite" />

          <GoBoard
            class="mt-3"
            :size="active.state.boardSize || room.boardSize"
            :board="active.state.board || []"
            :last-move="active.state.lastMove"
            :interactive="active.role==='player' && active.state.status==='playing' && active.state.turn===active.color"
            :my-color="active.color"
            @play="playAt"
          />

          <div v-if="active.state.status==='finished' && active.state.lastResult" class="alert alert-info text-center mt-3 mb-0">
            <strong>Partida finalizada.</strong>
            Gana {{ active.state.lastResult.winnerColor==='black' ? '⚫' : '⚪' }}
            ({{ active.state.lastResult.reason }})
          </div>

          <div class="d-flex justify-content-between align-items-center mt-3">
            <div class="d-flex gap-2">
              <button v-if="active.role==='player' && active.state.status==='playing'" class="btn btn-danger btn-sm" @click="doResign">Abandonar</button>
            </div>
            <button class="btn btn-outline-secondary btn-sm" @click="closeActiveBoard">Volver a la Sala</button>
          </div>
        </div>
      </div>

      <!-- Mientras se juega, solo se muestra el tablero propio (sin otros tableros, historial ni ranking) -->
      <template v-if="!isPlaying">
      <ul class="nav nav-tabs mb-3">
        <li class="nav-item">
          <a class="nav-link" href="#" :class="{ active: tab==='boards' }" @click.prevent="tab='boards'">Tableros</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="#" :class="{ active: tab==='history' }" @click.prevent="tab='history'">Historial</a>
        </li>
        <li class="nav-item" v-if="room.type==='torneo'">
          <a class="nav-link" href="#" :class="{ active: tab==='ranking' }" @click.prevent="tab='ranking'">Ranking</a>
        </li>
      </ul>

      <div v-if="tab==='boards'" class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">
        <div class="col" v-for="b in boards" :key="b.number">
          <div class="card h-100 shadow-sm board-card" @click="openBoard(b.number)">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <strong>Tablero #{{ b.number }}</strong>
                <span class="badge" :class="STATUS_BADGE_CLASS[b.status]">{{ STATUS_LABELS[b.status] }}</span>
              </div>
              <div v-if="b.players && b.players.length" class="text-muted small mb-1 d-flex flex-wrap align-items-center justify-content-center gap-3">
                <template v-for="(p, i) in b.players" :key="p.nickname">
                  <span v-if="i > 0">vs</span>
                  <span class="d-inline-flex flex-column align-items-center text-center gap-1">
                    <TeamShield v-if="p.team" :team="p.team" :name="p.teamName" :size="40" />
                    <span>{{ playerLabel(p) }}</span>
                  </span>
                </template>
              </div>
              <p v-else class="text-muted small mb-1">Sin jugadores</p>
              <p v-if="b.spectatorCount" class="text-muted small mb-0">👁 {{ b.spectatorCount }} observando</p>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="tab==='history'" class="table-responsive">
        <table class="table table-hover align-middle">
          <thead><tr><th>Tablero</th><th>Jugadores</th><th>Resultado</th><th>Fecha</th><th>SGF</th></tr></thead>
          <tbody>
            <tr v-for="m in roomHistory" :key="m._id">
              <td>#{{ m.boardNumber }}</td>
              <td>
                <span class="d-inline-flex flex-wrap align-items-center gap-3">
                  <template v-for="(p, i) in m.players" :key="p.nickname">
                    <span v-if="i > 0">vs</span>
                    <span class="d-inline-flex flex-column align-items-center text-center gap-1">
                      <TeamShield v-if="p.team" :team="p.team" :name="p.teamName" :size="32" />
                      <span>{{ playerLabel(p) }}</span>
                    </span>
                  </template>
                </span>
              </td>
              <td>{{ resultLabel(m) }}</td>
              <td>{{ m.endedAt ? new Date(m.endedAt).toLocaleString() : '-' }}</td>
              <td><a class="link-primary" :href="sgfUrl(m._id)">Descargar</a></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="tab==='ranking'" class="table-responsive">
        <table class="table table-hover align-middle">
          <thead><tr><th>Equipo</th><th>Victorias</th></tr></thead>
          <tbody>
            <tr v-for="r in ranking" :key="r.team">
              <td><span class="d-inline-flex align-items-center gap-2"><TeamShield :team="r.team" :name="r.teamName" :size="24" />{{ r.teamName }}</span></td>
              <td>{{ r.wins }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      </template>
    </main>
  `,
};
