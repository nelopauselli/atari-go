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
    const institutions = ref([]);
    const institutionId = ref('');
    const nickname = ref('');
    const password = ref('');
    const teamId = ref('');
    const error = ref('');
    const loading = ref(false);

    onMounted(async () => {
      const [teamList, institutionList] = await Promise.all([loadTeams(true), api.getInstitutions()]);
      teams.value = teamList;
      institutions.value = institutionList;
      if (teams.value[0]) teamId.value = teams.value[0]._id;
      if (institutions.value.length === 1) institutionId.value = institutions.value[0]._id;
    });

    async function submit() {
      error.value = '';
      if (!institutionId.value || !nickname.value.trim() || !password.value || !teamId.value) {
        error.value = 'Elegí tu institución, completá usuario y contraseña y elegí un equipo';
        return;
      }
      loading.value = true;
      try {
        const player = await api.login({
          institutionId: institutionId.value,
          nickname: nickname.value,
          password: password.value,
          teamId: teamId.value,
        });
        setPlayer(player);
        navigate('/home');
      } catch (err) {
        error.value = err.message;
      } finally {
        loading.value = false;
      }
    }

    return { teams, institutions, institutionId, nickname, password, teamId, error, loading, submit };
  },
  template: `
    <main class="container" style="max-width:440px; margin-top:64px;">
      <div class="card shadow-sm">
        <div class="card-body p-4">
          <h1 class="h3">Atari-Go Online</h1>
          <p class="text-muted mb-4">Ingres&aacute; con el usuario y la contrase&ntilde;a de tu instituci&oacute;n y eleg&iacute; tu equipo para jugar.</p>

          <div class="mb-3">
            <label class="form-label">Instituci&oacute;n</label>
            <select v-model="institutionId" class="form-select">
              <option value="" disabled>Seleccion&aacute; tu instituci&oacute;n</option>
              <option v-for="i in institutions" :key="i._id" :value="i._id">{{ i.name }}</option>
            </select>
          </div>

          <div class="mb-3">
            <label class="form-label">Usuario</label>
            <input v-model="nickname" type="text" class="form-control" autocomplete="username" placeholder="Tu nombre en el torneo" @keyup.enter="submit" />
          </div>

          <div class="mb-3">
            <label class="form-label">Contrase&ntilde;a</label>
            <input v-model="password" type="password" class="form-control" autocomplete="current-password" placeholder="Contrase&ntilde;a de la instituci&oacute;n" @keyup.enter="submit" />
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
