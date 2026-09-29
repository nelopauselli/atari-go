import { ref, onMounted } from 'vue';
import { api } from '../services/api.js';
import { loadTeams } from '../services/teams.js';
import TeamShield from '../components/TeamShield.js';
import { setPlayer } from '../services/auth.js';
import { navigate } from '../router.js';

export default {
  name: 'LoginView',
  components: { TeamShield },
  setup() {
    const teams = ref([]);
    const nickname = ref('');
    const teamId = ref('');
    const error = ref('');
    const loading = ref(false);

    onMounted(async () => {
      teams.value = await loadTeams(true);
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
    <main class="container" style="max-width:440px; margin-top:64px;">
      <div class="card shadow-sm">
        <div class="card-body p-4">
          <h1 class="h3">Atari-Go Online</h1>
          <p class="text-muted mb-4">Ingres&aacute; tu nickname y eleg&iacute; tu equipo para jugar.</p>

          <div class="mb-3">
            <label class="form-label">Nickname</label>
            <input v-model="nickname" type="text" class="form-control" placeholder="Tu nombre en el torneo" @keyup.enter="submit" />
          </div>

          <div class="mb-3">
            <label class="form-label">Equipo</label>
            <div class="d-flex align-items-center gap-2">
              <TeamShield v-if="teamId" :team="teamId" :size="38" />
              <select v-model="teamId" class="form-select">
                <option v-for="t in teams" :key="t._id" :value="t._id">{{ t.name }}</option>
              </select>
            </div>
          </div>

          <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>

          <button class="btn btn-primary w-100" :disabled="loading" @click="submit">Entrar</button>
        </div>
      </div>
    </main>
  `,
};
