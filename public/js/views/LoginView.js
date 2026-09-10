import { ref, onMounted } from 'vue';
import { api } from '../services/api.js';
import { setPlayer } from '../services/auth.js';
import { navigate } from '../router.js';

export default {
  name: 'LoginView',
  setup() {
    const teams = ref([]);
    const nickname = ref('');
    const teamId = ref('');
    const error = ref('');
    const loading = ref(false);

    onMounted(async () => {
      teams.value = await api.getTeams();
      if (teams.value[0]) teamId.value = teams.value[0]._id;
    });

    async function submit() {
      error.value = '';
      if (!nickname.value.trim() || !teamId.value) {
        error.value = 'Completá tu nickname y elegí un equipo';
        return;
      }
      loading.value = true;
      try {
        const player = await api.login(nickname.value, teamId.value);
        setPlayer(player);
        navigate('/home');
      } catch (err) {
        error.value = err.message;
      } finally {
        loading.value = false;
      }
    }

    return { teams, nickname, teamId, error, loading, submit };
  },
  template: `
    <main style="max-width:440px; margin:64px auto;">
      <div class="card">
        <h1>Atari-Go Interescolar</h1>
        <p class="muted" style="margin-bottom:24px;">Ingresá tu nickname y elegí tu equipo para jugar.</p>

        <div class="field">
          <label>Nickname</label>
          <input v-model="nickname" type="text" placeholder="Tu nombre en el torneo" @keyup.enter="submit" />
        </div>

        <div class="field">
          <label>Equipo</label>
          <select v-model="teamId">
            <option v-for="t in teams" :key="t._id" :value="t._id">{{ t.name }}</option>
          </select>
        </div>

        <p v-if="error" style="color:var(--md-error); font-size:14px; margin-bottom:16px;">{{ error }}</p>

        <button class="btn btn--block" :disabled="loading" @click="submit">Entrar</button>
      </div>
    </main>
  `,
};
