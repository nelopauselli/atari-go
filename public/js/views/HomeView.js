import { ref, onMounted, onUnmounted } from 'vue';
import { api } from '../services/api.js';
import { navigate } from '../router.js';

const CLOCK_LABELS = {
  'fischer-5-3': 'Fischer 5m + 3s',
  'fischer-10-5': 'Fischer 10m + 5s',
  'absolute-10': 'Absoluto 10m',
};

export default {
  name: 'HomeView',
  setup() {
    const tab = ref('rooms');
    const rooms = ref([]);
    const history = ref([]);
    const showCreate = ref(false);
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

    async function createRoom() {
      createError.value = '';
      try {
        const room = await api.createRoom(form.value);
        showCreate.value = false;
        openRoom(room._id);
      } catch (err) {
        createError.value = err.message;
      }
    }

    function resultLabel(m) {
      if (!m.result || !m.result.winnerColor) return 'Sin definir';
      const winner = m.players.find((p) => p.color === m.result.winnerColor);
      return winner ? `Gana ${winner.nickname} (${m.result.reason})` : '-';
    }

    return {
      tab, rooms, history, showCreate, form, createError, CLOCK_LABELS,
      openRoom, createRoom, resultLabel, sgfUrl: api.sgfDownloadUrl,
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
          <button class="btn" @click="showCreate = true">+ Nueva sala</button>
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

      <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate=false">
        <div class="modal">
          <h2>Nueva sala</h2>
          <div class="field">
            <label>Nombre</label>
            <input v-model="form.name" type="text" placeholder="Ej: Copa Interescolar 2026" />
          </div>
          <div class="field">
            <label>Tipo de sala</label>
            <select v-model="form.type">
              <option value="amistosas">Amistosas</option>
              <option value="torneo">Torneo por equipos</option>
            </select>
          </div>
          <div class="field">
            <label>Cantidad de tableros</label>
            <input v-model.number="form.boardCount" type="number" min="1" max="50" />
          </div>
          <div class="field">
            <label>Tamaño de tablero</label>
            <select v-model.number="form.boardSize">
              <option :value="7">7x7</option>
              <option :value="9">9x9</option>
              <option :value="13">13x13</option>
            </select>
          </div>
          <div class="field">
            <label>Piedras capturadas para ganar</label>
            <input v-model.number="form.stonesToWin" type="number" min="1" />
          </div>
          <div class="field">
            <label>Reloj</label>
            <select v-model="form.clockType">
              <option value="fischer-5-3">Fischer 5m + 3s</option>
              <option value="fischer-10-5">Fischer 10m + 5s</option>
              <option value="absolute-10">Absoluto 10m</option>
            </select>
          </div>
          <p v-if="createError" style="color:var(--md-error); font-size:14px;">{{ createError }}</p>
          <div class="toolbar">
            <button class="btn btn--outline" @click="showCreate=false">Cancelar</button>
            <button class="btn" @click="createRoom">Crear sala</button>
          </div>
        </div>
      </div>
    </main>
  `,
};
