import { createApp, computed, watchEffect } from 'vue';
import { route, navigate } from './router.js';
import { getPlayer, clearPlayer } from './services/auth.js';
import LoginView from './views/LoginView.js';
import HomeView from './views/HomeView.js';
import RoomView from './views/RoomView.js';

const App = {
  name: 'App',
  components: { LoginView, HomeView, RoomView },
  setup() {
    const player = computed(() => { route.name; return getPlayer(); });

    watchEffect(() => {
      const hasPlayer = !!getPlayer();
      if (!hasPlayer && route.name !== 'login') navigate('/login');
      if (hasPlayer && route.name === 'login') navigate('/home');
    });

    function logout() {
      //TODO: resignar partidas activas
      clearPlayer();
      navigate('/login');
    }

    return { route, player, logout, goHome: () => navigate('/home') };
  },
  template: `
    <div>
      <nav class="navbar navbar-dark bg-primary shadow-sm sticky-top" v-if="player">
        <div class="container-fluid">
          <span class="navbar-brand app-bar__title mb-0" @click="goHome">⚫⚪ Atari-Go Online</span>
          <div class="d-flex align-items-center gap-2">
            <span class="badge text-bg-light d-inline-flex align-items-center gap-1">
              <span class="rounded-circle d-inline-block" :style="{ background: player.teamColor, width: '8px', height: '8px' }"></span>
              {{ player.teamName }}
            </span>
            <span class="badge text-bg-secondary">{{ player.nickname }}</span>
            <button class="btn btn-outline-light btn-sm" @click="logout">Salir</button>
          </div>
        </div>
      </nav>

      <LoginView v-if="route.name==='login'" />
      <HomeView v-else-if="route.name==='home'" />
      <RoomView v-else-if="route.name==='room'" :key="route.params.roomId" :room-id="route.params.roomId" />
    </div>
  `,
};

createApp(App).mount('#app');
