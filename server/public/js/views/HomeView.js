import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api } from '../services/api.js';
import { navigate } from '../router.js';
import { getPlayer } from '../services/auth.js';
import RulesModal from '../components/RulesModal.js';
import TutorialModal from '../components/TutorialModal.js';

const CLOCK_LABELS = {
  'fischer-3-5': 'Fischer 3m + 5s',
  'fischer-5-10': 'Fischer 5m + 10s',
  'fischer-10-20': 'Fischer 10m + 20s',
};

export default {
  name: 'HomeView',
  components: { RulesModal, TutorialModal },
  setup() {
    const tab = ref('rooms');
    const rooms = ref([]);
    const history = ref([]);
    const onlinePlayers = ref([]);
    const institutionNames = ref([]); // en el orden definido en el admin
    const form = ref({ name: '', type: 'amistosas', boardCount: 4, boardSize: 9, stonesToWin: 3, clockType: 'fischer-10-20' });
    const createError = ref('');
    const rulesRoom = ref(null);
    const showTutorial = ref(false);
    const myId = String(getPlayer()?.id ?? '');
    let poller = null;

    async function loadRooms() {
      rooms.value = await api.getRooms();
    }
    async function loadHistory() {
      history.value = await api.getGlobalHistory();
    }

    async function loadOnlinePlayers() {
      onlinePlayers.value = await api.getOnlinePlayers();
    }

    const institutionTotals = computed(() => {
      const totals = new Map();
      for (const p of onlinePlayers.value) {
        if (!p.institutionName) continue;
        totals.set(p.institutionName, (totals.get(p.institutionName) || 0) + 1);
      }
      const pos = (name) => {
        const i = institutionNames.value.indexOf(name);
        return i === -1 ? Infinity : i;
      };
      return [...totals.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => (pos(a.name) - pos(b.name)) || a.name.localeCompare(b.name));
    });

    onMounted(() => {
      loadRooms();
      loadHistory();
      loadOnlinePlayers();
      api.getInstitutions()
        .then((list) => { institutionNames.value = list.map((i) => i.name); })
        .catch(() => {});
      poller = setInterval(() => {
        loadRooms();
        loadOnlinePlayers();
      }, 4000);
    });
    onUnmounted(() => clearInterval(poller));

    function openRoom(roomId) {
      navigate(`/room/${roomId}`);
    }

    function resultLabel(m) {
      if (!m.result || !m.result.winnerColor) return 'Sin definir';
      const winner = m.players.find((p) => p.color === m.result.winnerColor);
      return winner ? `Gana ${winner.nickname} (${m.result.reason})` : '-';
    }

    return {
      tab, rooms, history, onlinePlayers, institutionTotals, form, createError, rulesRoom, showTutorial, CLOCK_LABELS, myId,
      openRoom, resultLabel, sgfUrl: api.sgfDownloadUrl,
    };
  },
  template: `
    <main class="container py-4">
      <ul class="nav nav-tabs mb-3">
        <li class="nav-item">
          <a class="nav-link" href="#" :class="{ active: tab==='rooms' }" @click.prevent="tab='rooms'">Salas activas</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="#" :class="{ active: tab==='history' }" @click.prevent="tab='history'">Historial global</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="#" :class="{ active: tab==='online' }" @click.prevent="tab='online'">
            Usuarios conectados <span class="badge text-bg-secondary">{{ onlinePlayers.length }}</span>
          </a>
        </li>
      </ul>

      <div v-if="tab==='rooms'">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h2 class="h4 mb-0">Salas activas</h2>
          <button type="button" class="btn btn-primary btn-sm" @click="showTutorial = true">&iquest;C&oacute;mo se juega?</button>
        </div>

        <div v-if="rooms.length===0" class="text-center text-muted py-5">No hay salas activas. Cre&aacute; la primera.</div>
        <div class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">
          <div class="col" v-for="r in rooms" :key="r.id">
            <div class="card h-100 shadow-sm room-card" @click="openRoom(r.id)">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start mb-2">
                  <h3 class="h6 mb-0">{{ r.name }}</h3>
                  <span class="badge rounded-pill" :class="r.type==='torneo' ? 'text-bg-success' : 'text-bg-secondary'">
                    {{ r.type==='torneo' ? 'Torneo' : 'Amistosas' }}
                  </span>
                </div>
                <p class="text-muted small mb-1">Tablero {{ r.boardSize }}x{{ r.boardSize }} · {{ CLOCK_LABELS[r.clockType] }}</p>
                <p class="text-muted small mb-1">Tableros libres: {{ r.freeBoards }} / {{ r.totalBoards }}</p>
                <p class="text-muted small mb-0">Jugadores conectados: {{ r.playersOnline }}<template v-if="r.type==='torneo'"> · Equipos jugando: {{ r.teamsPlaying }}</template></p>
                <div class="d-flex gap-2 mt-2">
                  <button type="button" class="btn btn-primary btn-sm" @click.stop="openRoom(r.id)">Unirse a la sala</button>
                  <button type="button" class="btn btn-outline-info btn-sm" @click.stop="rulesRoom = r">Reglas</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <RulesModal v-if="rulesRoom" :room="rulesRoom" @close="rulesRoom = null" />
        <TutorialModal v-if="showTutorial" @close="showTutorial = false" />
      </div>

      <div v-else-if="tab==='online'">
        <h2 class="h4 mb-3">Usuarios conectados</h2>
        <div v-if="onlinePlayers.length===0" class="text-center text-muted py-5">No hay usuarios conectados.</div>
        <div v-if="institutionTotals.length" class="d-flex flex-wrap gap-2 mb-3">
          <span class="badge text-bg-light border" v-for="t in institutionTotals" :key="t.name">{{ t.name }}: {{ t.count }}</span>
        </div>
        <ul class="list-group">
          <li class="list-group-item d-flex align-items-center gap-2" v-for="p in onlinePlayers" :key="p.id">
            <strong>{{ p.nickname }}</strong>
            <span v-if="p.id === myId" class="text-muted small">(t&uacute;)</span>
            <span class="text-muted small">{{ p.institutionName }}</span>
          </li>
        </ul>
      </div>

      <div v-else>
        <h2 class="h4 mb-3">Historial global</h2>
        <div class="table-responsive">
          <table class="table table-hover align-middle">
            <thead>
              <tr><th>Sala</th><th>Tablero</th><th>Jugadores</th><th>Resultado</th><th>Fecha</th><th>SGF</th></tr>
            </thead>
            <tbody>
              <tr v-for="m in history" :key="m._id">
                <td>{{ m.roomName }}</td>
                <td>#{{ m.boardNumber }} ({{ m.boardSize }}x{{ m.boardSize }})</td>
                <td>{{ m.players.map(p => p.nickname).join(' vs ') }}</td>
                <td>{{ resultLabel(m) }}</td>
                <td>{{ m.endedAt ? new Date(m.endedAt).toLocaleString() : '-' }}</td>
                <td><a class="link-primary" :href="sgfUrl(m._id)">Descargar</a></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </main>
  `,
};
