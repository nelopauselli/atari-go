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
    const player = computed(() => getPlayer());

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
      <header class="app-bar" v-if="player">
        <span class="app-bar__title" @click="goHome">⚫⚪ Atari-Go Interescolar</span>
        <div class="app-bar__user">
          <span class="chip chip--team">
            <span class="chip__dot" :style="{ background: player.teamColor }"></span>
            {{ player.teamName }}
          </span>
          <span class="chip">{{ player.nickname }}</span>
          <button class="btn btn--outline btn--sm" style="background:transparent; border-color:rgba(255,255,255,.6); color:#fff;" @click="logout">Salir</button>
        </div>
      </header>

      <LoginView v-if="route.name==='login'" />
      <HomeView v-else-if="route.name==='home'" />
      <RoomView v-else-if="route.name==='room'" :key="route.params.roomId" :room-id="route.params.roomId" />
    </div>
  `,
};

createApp(App).mount('#app');
