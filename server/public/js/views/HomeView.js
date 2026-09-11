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
    <main>
      <div class="tabs">
        <div class="tab" :class="{ 'tab--active': tab==='rooms' }" @click="tab='rooms'">Salas activas</div>
        <div class="tab" :class="{ 'tab--active': tab==='history' }" @click="tab='history'">Historial global</div>
      </div>

      <div v-if="tab==='rooms'">
        <div class="toolbar">
          <h2>Salas activas</h2>
        </div>

        <div v-if="rooms.length===0" class="empty-state">No hay salas activas. Creá la primera.</div>
        <div class="grid grid--rooms">
          <div class="room-card" v-for="r in rooms" :key="r.id" @click="openRoom(r.id)">
            <div class="toolbar" style="margin-bottom:8px;">
              <h3 style="margin:0;">{{ r.name }}</h3>
              <span class="status-badge" :class="r.type==='torneo' ? 'status-badge--playing' : 'status-badge--empty'">
                {{ r.type==='torneo' ? 'Torneo' : 'Amistosas' }}
              </span>
            </div>
            <p class="muted">Tablero {{ r.boardSize }}x{{ r.boardSize }} · {{ CLOCK_LABELS[r.clockType] }}</p>
            <p class="muted">Tableros libres: {{ r.freeBoards }} / {{ r.totalBoards }}</p>
            <p class="muted">Jugadores conectados: {{ r.playersOnline }} · Equipos jugando: {{ r.teamsPlaying }}</p>
          </div>
        </div>
      </div>

      <div v-else>
        <h2>Historial global</h2>
        <table>
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
              <td><a class="link" :href="sgfUrl(m._id)">Descargar</a></td>
            </tr>
          </tbody>
        </table>
      </div>

    </main>
  `,
};
