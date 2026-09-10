import { createApp } from 'vue';
import { socket, emitAck } from './socket.js';
import { saveSession, loadSession, clearSession } from './session.js';
import LoginScreen from './components/LoginScreen.js';
import Lobby from './components/Lobby.js';
import RoomView from './components/RoomView.js';
import MatchView from './components/MatchView.js';

const App = {
  name: 'App',
  components: { LoginScreen, Lobby, RoomView, MatchView },
  data() {
    return {
      view: 'login', // 'login' | 'lobby' | 'room' | 'match'
      player: null,
      currentRoomId: null,
      currentMatchId: null,
      currentMode: 'player',
      restoring: false,
    };
  },
  async mounted() {
    // Reintenta el login guardado en el navegador (localStorage) contra
    // el socket actual: `player:register` vive por conexión, así que hay
    // que re-emitirlo en cada carga de página / reconexión.
    const session = loadSession();
    if (!session) return;

    this.restoring = true;
    try {
      const res = await emitAck('player:register', session);
      this.player = res.player;
      this.view = 'lobby';
    } catch (err) {
      clearSession(); // el dojo guardado ya no existe u otro error de sesión
    } finally {
      this.restoring = false;
    }

    // Si el socket se reconecta (ej: el server se reinició), el registro
    // en memoria del servidor se perdió: hay que volver a registrarse.
    socket.on('connect', async () => {
      if (!this.player) return;
      try {
        await emitAck('player:register', { nickname: this.player.nickname, dojoId: loadSession()?.dojoId });
      } catch (err) {
        // el dojo pudo haber cambiado; se lo deja resolver desde el login
      }
    });
  },
  methods: {
    onLoggedIn(player, dojoId) {
      this.player = player;
      this.view = 'lobby';
      saveSession({ nickname: player.nickname, dojoId });
    },
    logout() {
      clearSession();
      this.player = null;
      this.currentRoomId = null;
      this.currentMatchId = null;
      this.view = 'login';
    },
    enterRoom(roomId) {
      this.currentRoomId = roomId;
      this.view = 'room';
    },
    backToLobby() {
      this.currentRoomId = null;
      this.view = 'lobby';
    },
    enterMatch({ matchId, mode }) {
      this.currentMatchId = matchId;
      this.currentMode = mode;
      this.view = 'match';
    },
    backToRoom() {
      this.currentMatchId = null;
      this.view = 'room';
    },
  },
  template: `
    <div>
      <header class="app-bar" v-if="view !== 'login'">
        <div class="app-bar__brand"><span class="dot"></span> Atari-Go Online</div>
        <div class="app-bar__player" v-if="player">
          <span class="chip">🏯 {{ player.dojoName }}</span>
          <span>{{ player.nickname }}</span>
          <button class="btn btn-outline" style="padding:4px 14px; font-size:12.5px;" @click="logout">Salir</button>
        </div>
      </header>

      <main class="view">
        <div v-if="restoring" class="center-screen"><p>Restaurando sesión…</p></div>
        <LoginScreen v-else-if="view === 'login'" @logged-in="onLoggedIn" />

        <Lobby v-else-if="view === 'lobby'" @enter-room="enterRoom" />

        <RoomView
          v-else-if="view === 'room'"
          :room-id="currentRoomId"
          @back-to-lobby="backToLobby"
          @enter-match="enterMatch"
        />

        <MatchView
          v-else-if="view === 'match'"
          :match-id="currentMatchId"
          :mode="currentMode"
          :player-nickname="player ? player.nickname : ''"
          @back-to-room="backToRoom"
        />
      </main>
    </div>
  `,
};

createApp(App).mount('#app');
