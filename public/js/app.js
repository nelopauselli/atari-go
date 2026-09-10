import { createApp } from 'vue';
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
    };
  },
  methods: {
    onLoggedIn(player) {
      this.player = player;
      this.view = 'lobby';
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
        </div>
      </header>

      <main class="view">
        <LoginScreen v-if="view === 'login'" @logged-in="onLoggedIn" />

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
