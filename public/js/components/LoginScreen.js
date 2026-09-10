import { api } from '../api.js';
import { emitAck } from '../socket.js';

export default {
  name: 'LoginScreen',
  emits: ['logged-in'],
  data() {
    return {
      nickname: '',
      dojoId: '',
      dojos: [],
      error: '',
      loading: false,
    };
  },
  async mounted() {
    try {
      this.dojos = await api.getDojos();
      if (this.dojos.length) this.dojoId = String(this.dojos[0]._id);
    } catch (err) {
      this.error = 'No se pudo cargar la lista de dojos.';
    }
  },
  methods: {
    async submit() {
      this.error = '';
      if (!this.nickname.trim()) {
        this.error = 'Ingresá un apodo.';
        return;
      }
      if (!this.dojoId) {
        this.error = 'Seleccioná un dojo.';
        return;
      }
      this.loading = true;
      try {
        const res = await emitAck('player:register', {
          nickname: this.nickname.trim(),
          dojoId: this.dojoId,
        });
        this.$emit('logged-in', res.player, this.dojoId);
      } catch (err) {
        this.error = err.message;
      } finally {
        this.loading = false;
      }
    },
  },
  template: `
    <div class="center-screen">
      <div class="card login-card">
        <div class="logo">⚫⚪</div>
        <h1 style="text-align:center">Atari-Go Online</h1>
        <p style="text-align:center; margin-bottom: 24px;">Torneo interescolar</p>

        <form @submit.prevent="submit">
          <div class="field">
            <label for="nickname">Apodo</label>
            <input id="nickname" type="text" v-model="nickname" maxlength="24" placeholder="Ej: KenshiRojo" autofocus />
          </div>

          <div class="field">
            <label for="dojo">Dojo</label>
            <select id="dojo" v-model="dojoId">
              <option v-for="d in dojos" :key="d._id" :value="String(d._id)">{{ d.name }}</option>
            </select>
          </div>

          <p v-if="error" style="color:var(--error); font-size:13px; margin-top:-8px;">{{ error }}</p>

          <button class="btn btn-primary btn-block" type="submit" :disabled="loading">
            {{ loading ? 'Ingresando…' : 'Ingresar' }}
          </button>
        </form>
      </div>
    </div>
  `,
};
