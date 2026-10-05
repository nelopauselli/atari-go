import { createApp, computed, ref, watchEffect } from 'vue';
import { route, navigate } from './router.js';
import { getPlayer, clearPlayer } from './services/auth.js';
import { socketService } from './services/socket.js';
import { getTheme, toggleTheme } from './services/theme.js';
import LoginView from './views/LoginView.js';
import HomeView from './views/HomeView.js';
import RoomView from './views/RoomView.js';
import RankingView from './views/RankingView.js';
import AppFooter from './components/AppFooter.js';

const App = {
  name: 'App',
  components: { LoginView, HomeView, RoomView, RankingView, AppFooter },
  setup() {
    const player = computed(() => { route.name; return getPlayer(); });
    const theme = ref(getTheme());

    watchEffect(() => {
      const hasPlayer = !!getPlayer();
      socketService.identify(getPlayer());
      if (!hasPlayer && route.name !== 'login') navigate('/login');
      if (hasPlayer && route.name === 'login') navigate('/home');
    });

    function logout() {
      //TODO: resignar partidas activas
      clearPlayer();
      navigate('/login');
    }

    function onToggleTheme() {
      theme.value = toggleTheme();
    }

    return { route, player, logout, theme, onToggleTheme, goHome: () => navigate('/home') };
  },
  template: `
    <div>
      <nav class="navbar navbar-dark bg-primary shadow-sm sticky-top" v-if="player">
        <div class="container-fluid">
          <span class="navbar-brand app-bar__title mb-0" @click="goHome">⚫⚪ Atari-Go Online</span>
          <div class="d-flex align-items-center gap-2">
            <span v-if="player.institutionName" class="badge text-bg-light">{{ player.institutionName }}</span>
            <span class="badge text-bg-secondary">{{ player.nickname }}</span>
            <button class="btn btn-outline-light btn-sm" type="button" @click="onToggleTheme" :title="theme === 'dark' ? 'Modo claro' : 'Modo oscuro'">
              {{ theme === 'dark' ? '☀️' : '🌙' }}
            </button>
            <button class="btn btn-outline-light btn-sm" @click="logout">Salir</button>
          </div>
        </div>
      </nav>
      <button v-else class="btn btn-outline-secondary btn-sm position-fixed top-0 end-0 m-2" type="button" @click="onToggleTheme" :title="theme === 'dark' ? 'Modo claro' : 'Modo oscuro'">
        {{ theme === 'dark' ? '☀️' : '🌙' }}
      </button>

      <LoginView v-if="route.name==='login'" />
      <HomeView v-else-if="route.name==='home'" />
      <RoomView v-else-if="route.name==='room'" :key="route.params.roomId" :room-id="route.params.roomId" />
      <RankingView v-else-if="route.name==='ranking'" :key="'ranking-' + route.params.roomId" :room-id="route.params.roomId" />

      <AppFooter />
    </div>
  `,
};

createApp(App).mount('#app');
