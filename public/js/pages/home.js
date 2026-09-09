import { api } from '../api.js';
import { socket, ensurePlayerName } from '../socket.js';
import { clockLabel, timeAgo, winReasonLabel } from '../format.js';

export default {
  name: 'HomeApp',
  data() {
    return {
      playerName: '',
      activeMatches: [],
      rooms: [],
      historyItems: [],
      loading: true,
      errorMsg: '',
      showCreateModal: false,
      creating: false,
      clockPresets: [],
      newRoom: {
        name: '',
        boardSize: 9,
        capturesToWin: 5,
        clockPresetKey: 'fischer_10_5',
      },
    };
  },
  async mounted() {
    this.playerName = ensurePlayerName();
    this.clockPresets = await api.clockPresets().catch(() => []);
    await this.refreshAll();
    this.loading = false;

    socket.on('lobby:update', this.refreshAll);
    this._pollId = setInterval(this.refreshAll, 15000);
  },
  beforeUnmount() {
    socket.off('lobby:update', this.refreshAll);
    clearInterval(this._pollId);
  },
  methods: {
    clockLabel,
    timeAgo,
    winReasonLabel,
    async refreshAll() {
      try {
        const [active, rooms, history] = await Promise.all([
          api.activeMatches(),
          api.listRooms(),
          api.history(1),
        ]);
        this.activeMatches = active;
        this.rooms = rooms;
        this.historyItems = history.items;
      } catch (err) {
        this.errorMsg = 'No se pudo conectar con el servidor.';
      }
    },
    openCreateModal() {
      this.showCreateModal = true;
    },
    closeCreateModal() {
      this.showCreateModal = false;
    },
    async submitCreateRoom() {
      if (!this.newRoom.name.trim()) return;
      this.creating = true;
      try {
        const { id } = await api.createRoom({ ...this.newRoom, createdBy: this.playerName });
        window.location.href = `room.html?roomId=${id}`;
      } catch (err) {
        this.errorMsg = 'No se pudo crear la sala: ' + err.message;
      } finally {
        this.creating = false;
      }
    },
    goToRoom(roomId) {
      window.location.href = `room.html?roomId=${roomId}`;
    },
    goToMatch(matchId) {
      window.location.href = `game.html?matchId=${matchId}&spectate=1`;
    },
    goToHistoryMatch(matchId) {
      window.location.href = `game.html?matchId=${matchId}`;
    },
    playerLabel(players) {
      const b = players?.black?.name || '—';
      const w = players?.white?.name || 'esperando rival…';
      return { b, w };
    },
  },
  template: `
    <header class="site-header">
      <div class="brand">
        <span class="stone"></span>
        <h1>Atari-Go Online</h1>
      </div>
      <span class="tagline">jugá al primer objetivo de capturas, en vivo</span>
      <span class="player-name-chip">{{ playerName }}</span>
    </header>

    <main class="page">
      <div class="two-col">
        <section class="panel">
          <div class="panel-header">
            <h2>Partidas activas</h2>
            <span class="badge live">{{ activeMatches.length }} en curso</span>
          </div>
          <div class="panel-body">
            <p v-if="!activeMatches.length" class="empty-note">No hay partidas en curso ahora mismo.</p>
            <a v-for="m in activeMatches" :key="m.id" class="list-row" href="#" @click.prevent="goToMatch(m.id)">
              <div>
                <div class="title">{{ m.roomName }} · tablero {{ m.boardNumber }}</div>
                <div class="player-pair" style="margin-top:4px;">
                  <span class="stone-dot black"></span>{{ playerLabel(m.players).b }}
                  <span style="margin: 0 4px; color: var(--sumi-600);">vs</span>
                  <span class="stone-dot white"></span>{{ playerLabel(m.players).w }}
                </div>
              </div>
              <div style="text-align:right;">
                <div class="badge live">{{ m.captures.black }}–{{ m.captures.white }} capturas</div>
                <div class="meta" style="margin-top:4px;">{{ m.spectatorCount }} mirando</div>
              </div>
            </a>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <h2>Salas activas</h2>
            <button class="btn" @click="openCreateModal">Crear sala</button>
          </div>
          <div class="panel-body">
            <p v-if="!rooms.length" class="empty-note">Todavía no hay salas. ¡Creá la primera!</p>
            <a v-for="r in rooms" :key="r.id" class="list-row" href="#" @click.prevent="goToRoom(r.id)">
              <div>
                <div class="title">{{ r.name }}</div>
                <div class="meta">{{ r.boardSize }}×{{ r.boardSize }} · {{ r.capturesToWin }} capturas para ganar · {{ clockLabel(r.clockPresetKey) }}</div>
              </div>
              <div style="text-align:right;">
                <span class="badge">{{ r.connectedCount }} conectados</span>
                <div class="meta" style="margin-top:4px;">{{ r.boardsEnJuego }}/{{ r.boardsTotal }} tableros en juego</div>
              </div>
            </a>
          </div>
        </section>
      </div>

      <section class="panel" style="margin-top: 28px;">
        <div class="panel-header">
          <h2>Historial de partidas</h2>
        </div>
        <div class="panel-body">
          <p v-if="!historyItems.length" class="empty-note">Todavía no se jugó ninguna partida hasta el final.</p>
          <a v-for="m in historyItems" :key="m.id" class="list-row" href="#" @click.prevent="goToHistoryMatch(m.id)">
            <div>
              <div class="title">{{ m.roomName }} · tablero {{ m.boardNumber }}</div>
              <div class="player-pair" style="margin-top:4px;">
                <span class="stone-dot black"></span>{{ playerLabel(m.players).b }}
                <span style="margin: 0 4px; color: var(--sumi-600);">vs</span>
                <span class="stone-dot white"></span>{{ playerLabel(m.players).w }}
              </div>
            </div>
            <div style="text-align:right;">
              <div class="meta">
                <strong>{{ m.winnerColor === 1 ? playerLabel(m.players).b : (m.winnerColor === 2 ? playerLabel(m.players).w : 'empate') }}</strong>
                gana {{ winReasonLabel(m.winReason) }}
              </div>
              <div class="meta" style="margin-top:4px;">{{ timeAgo(m.endedAt) }}</div>
            </div>
          </a>
        </div>
      </section>
    </main>

    <div v-if="showCreateModal" class="modal-backdrop" @click.self="closeCreateModal">
      <div class="modal">
        <h3>Crear sala nueva</h3>

        <div class="field">
          <label>Nombre de la sala</label>
          <input v-model="newRoom.name" maxlength="60" placeholder="Ej: Sala de los sábados" />
        </div>

        <div class="field">
          <label>Tamaño de tablero</label>
          <select v-model.number="newRoom.boardSize">
            <option :value="5">5×5</option>
            <option :value="7">7×7</option>
            <option :value="9">9×9</option>
            <option :value="13">13×13</option>
          </select>
        </div>

        <div class="field">
          <label>Piedras a capturar para ganar</label>
          <input v-model.number="newRoom.capturesToWin" type="number" min="1" max="60" />
        </div>

        <div class="field">
          <label>Tipo de reloj</label>
          <div class="radio-cards">
            <label v-for="p in clockPresets" :key="p.key" class="radio-card" :class="{ selected: newRoom.clockPresetKey === p.key }">
              <input type="radio" :value="p.key" v-model="newRoom.clockPresetKey" style="display:none;" />
              {{ p.label }}
            </label>
          </div>
        </div>

        <p v-if="errorMsg" style="color: var(--shu-600); font-size: 0.85rem;">{{ errorMsg }}</p>

        <div class="modal-actions">
          <button class="btn secondary" @click="closeCreateModal">Cancelar</button>
          <button class="btn" :disabled="creating || !newRoom.name.trim()" @click="submitCreateRoom">
            {{ creating ? 'Creando…' : 'Crear sala' }}
          </button>
        </div>
      </div>
    </div>
  `,
};
