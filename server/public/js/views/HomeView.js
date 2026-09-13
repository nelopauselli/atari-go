import { ref, onMounted, onUnmounted } from 'vue';
import { api } from '../services/api.js';
import { navigate } from '../router.js';

const CLOCK_LABELS = {
  'fischer-1-3': 'Fischer 1m + 3s',
  'fischer-5-3': 'Fischer 5m + 3s',
  'fischer-10-5': 'Fischer 10m + 5s',
};

export default {
  name: 'HomeView',
  setup() {
    const tab = ref('rooms');
    const rooms = ref([]);
    const history = ref([]);
    const form = ref({ name: '', type: 'amistosas', boardCount: 4, boardSize: 9, stonesToWin: 3, clockType: 'fischer-10-5' });
    const createError = ref('');
    let poller = null;

    async function loadRooms() {
      rooms.value = await api.getRooms();
    }
    async function loadHistory() {
      history.value = await api.getGlobalHistory();
    }

    onMounted(() => {
      loadRooms();
      loadHistory();
      poller = setInterval(loadRooms, 4000);
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
      tab, rooms, history, form, createError, CLOCK_LABELS,
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
      </ul>

      <div v-if="tab==='rooms'">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h2 class="h4 mb-0">Salas activas</h2>
        </div>

        <div v-if="rooms.length===0" class="text-center text-muted py-5">No hay salas activas. Creá la primera.</div>
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
                <p class="text-muted small mb-0">Jugadores conectados: {{ r.playersOnline }} · Equipos jugando: {{ r.teamsPlaying }}</p>
              </div>
            </div>
          </div>
        </div>
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
