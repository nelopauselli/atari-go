import { ref, onMounted } from 'vue';
import { api } from '../services/api.js';
import { setPlayer, setGuest } from '../services/auth.js';
import { navigate } from '../router.js';

export default {
  name: 'LoginView',
  setup() {
    const institutions = ref([]);
    const institutionId = ref('');
    const nickname = ref('');
    const password = ref('');
    const error = ref('');
    const loading = ref(false);

    onMounted(async () => {
      institutions.value = await api.getInstitutions();
      if (institutions.value.length === 1) institutionId.value = institutions.value[0]._id;
    });

    async function submit() {
      error.value = '';
      if (!institutionId.value || !nickname.value.trim() || !password.value) {
        error.value = 'Elegí tu institución y completá usuario y contraseña';
        return;
      }
      loading.value = true;
      try {
        const player = await api.login({
          institutionId: institutionId.value,
          nickname: nickname.value,
          password: password.value,
        });
        setPlayer(player);
        navigate('/home');
      } catch (err) {
        error.value = err.message;
      } finally {
        loading.value = false;
      }
    }

    function enterAsGuest() {
      setGuest();
      navigate('/home');
    }

    return { institutions, institutionId, nickname, password, error, loading, submit, enterAsGuest };
  },
  template: `
    <main class="container" style="max-width:440px; margin-top:64px;">
      <div class="card shadow-sm">
        <div class="card-body p-4">
          <h1 class="h3">Atari-Go Online</h1>
          <p class="text-muted mb-4">Ingres&aacute; con el usuario y la contrase&ntilde;a de tu instituci&oacute;n para jugar.</p>

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

          <div v-if="error" class="alert alert-danger py-2">{{ error }}</div>

          <button class="btn btn-primary w-100" :disabled="loading" @click="submit">Entrar</button>

          <hr class="my-4" />
          <button class="btn btn-outline-secondary w-100" type="button" @click="enterAsGuest">Entrar como invitado</button>
          <p class="text-muted small text-center mt-2 mb-0">Como invitado pod&eacute;s observar las partidas, pero no jugar ni unirte a un equipo.</p>
        </div>
      </div>
    </main>
  `,
};
