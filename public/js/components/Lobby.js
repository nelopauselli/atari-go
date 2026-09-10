import { api } from '../api.js';
import { socket, emitAck } from '../socket.js';

const CLOCK_LABELS = {
  fischer_5_3: 'Fischer 5m +3s',
  fischer_10_5: 'Fischer 10m +5s',
  absolute_10: 'Absoluto 10m',
};

export default {
  name: 'Lobby',
  emits: ['enter-room'],
  data() {
    return {
      rooms: [],
      history: [],
      showCreateModal: false,
      creating: false,
      createError: '',
      form: {
        name: '',
        boardsCount: 6,
        stonesToCapture: 3,
        boardSize: 9,
        clockType: 'fischer_5_3',
        allowSameDojo: true,
      },
      clockLabels: CLOCK_LABELS,
    };
  },
  async mounted() {
    const res = await emitAck('lobby:subscribe');
    this.rooms = res.rooms;
    this.history = await api.getHistory();

    this._onLobbyUpdate = (rooms) => { this.rooms = rooms; };
    socket.on('lobby:update', this._onLobbyUpdate);

    this._historyTimer = setInterval(async () => {
      this.history = await api.getHistory();
    }, 15000);
  },
  beforeUnmount() {
    socket.off('lobby:update', this._onLobbyUpdate);
    socket.emit('lobby:unsubscribe');
    clearInterval(this._historyTimer);
  },
  methods: {
    clockLabel(type) {
      return this.clockLabels[type] || type;
    },
    openCreateModal() {
      this.createError = '';
      this.showCreateModal = true;
    },
    async submitCreate() {
      this.createError = '';
      if (!this.form.name.trim()) {
        this.createError = 'Ingresá un nombre de sala.';
        return;
      }
      this.creating = true;
      try {
        await api.createRoom({
          name: this.form.name.trim(),
          boardsCount: Number(this.form.boardsCount),
          stonesToCapture: Number(this.form.stonesToCapture),
          boardSize: Number(this.form.boardSize),
          clockType: this.form.clockType,
          allowSameDojo: this.form.allowSameDojo,
        });
        this.showCreateModal = false;
        this.form.name = '';
      } catch (err) {
        this.createError = err.message;
      } finally {
        this.creating = false;
      }
    },
  },
  template: `
    <div>
      <div class="top-actions">
        <h1>Salas activas</h1>
        <button class="btn btn-primary" @click="openCreateModal">+ Crear sala</button>
      </div>

      <div v-if="!rooms.length" class="card empty-state">No hay salas activas todavía. ¡Creá la primera!</div>

      <div class="grid grid-rooms">
        <div class="room-card" v-for="room in rooms" :key="room._id" @click="$emit('enter-room', room._id)">
          <h3>{{ room.name }}</h3>
          <p style="margin:0; font-size:13px;">
            Tablero {{ room.boardSize }}×{{ room.boardSize }} · {{ room.stonesToCapture }} piedras para ganar · {{ clockLabel(room.clockType) }}
          </p>
          <div class="room-card__stats">
            <span class="stat-pill">👥 {{ room.connectedPlayers }} jugadores</span>
            <span class="stat-pill">🏯 {{ room.dojosCount }} dojos</span>
            <span class="stat-pill">🎲 {{ room.freeBoards }}/{{ room.totalBoards }} tableros libres</span>
            <span class="stat-pill" v-if="!room.allowSameDojo">Sin duelos del mismo dojo</span>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:28px;">
        <h2>Historial de partidas</h2>
        <table class="history-table" v-if="history.length">
          <thead>
            <tr><th>Sala</th><th>Dojos</th><th>Jugadores</th><th>Resultado</th></tr>
          </thead>
          <tbody>
            <tr v-for="m in history" :key="m._id">
              <td>{{ m.roomName }} · T{{ m.boardNumber }}</td>
              <td>{{ (m.players || []).map(p => p.dojoName).join(' vs ') }}</td>
              <td>{{ (m.players || []).map(p => p.nickname).join(' vs ') }}</td>
              <td>
                <span v-if="m.winnerNickname">🏆 {{ m.winnerNickname }} ({{ m.result }})</span>
                <span v-else>Empate ({{ m.result }})</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else>Todavía no hay partidas finalizadas.</p>
      </div>

      <div v-if="showCreateModal" class="center-screen" style="position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:50;">
        <div class="card" style="width:100%; max-width:440px;">
          <h2>Crear sala</h2>
          <form @submit.prevent="submitCreate">
            <div class="field">
              <label>Nombre de la sala</label>
              <input type="text" v-model="form.name" maxlength="40" placeholder="Ej: Ronda clasificatoria A" />
            </div>
            <div class="field">
              <label>Cantidad de tableros</label>
              <input type="number" v-model="form.boardsCount" min="1" max="40" />
            </div>
            <div class="field">
              <label>Piedras a capturar para ganar</label>
              <input type="number" v-model="form.stonesToCapture" min="1" max="30" />
            </div>
            <div class="field">
              <label>Tamaño de tablero</label>
              <select v-model="form.boardSize">
                <option :value="5">5×5</option>
                <option :value="7">7×7</option>
                <option :value="9">9×9</option>
                <option :value="13">13×13</option>
              </select>
            </div>
            <div class="field">
              <label>Tipo de reloj</label>
              <select v-model="form.clockType">
                <option value="fischer_5_3">Fischer 5m +3s</option>
                <option value="fischer_10_5">Fischer 10m +5s</option>
                <option value="absolute_10">Absoluto 10m</option>
              </select>
            </div>
            <div class="field">
              <label class="checkbox-row">
                <input type="checkbox" v-model="form.allowSameDojo" />
                Admitir partidas entre jugadores del mismo dojo
              </label>
            </div>

            <p v-if="createError" style="color:var(--error); font-size:13px;">{{ createError }}</p>

            <div class="action-row">
              <button type="button" class="btn btn-outline btn-block" @click="showCreateModal=false">Cancelar</button>
              <button type="submit" class="btn btn-primary btn-block" :disabled="creating">
                {{ creating ? 'Creando…' : 'Crear sala' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
};
