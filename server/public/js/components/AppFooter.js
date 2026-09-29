import { ref, computed, onMounted, onUnmounted } from 'vue';
import { socketService } from '../services/socket.js';

const PING_INTERVAL_MS = 5000;

export default {
  name: 'AppFooter',
  setup() {
    const latency = ref(null);
    const online = ref(null);
    let timer = null;
    const offs = [];

    async function refresh() {
      const res = await socketService.ping();
      latency.value = res ? res.latency : null;
      if (res) online.value = res.online;
    }

    const status = computed(() => {
      if (latency.value === null) return { color: 'var(--bs-danger)', label: 'Sin conexión' };
      if (latency.value < 150) return { color: 'var(--bs-success)', label: `${latency.value} ms` };
      if (latency.value < 400) return { color: 'var(--bs-warning)', label: `${latency.value} ms` };
      return { color: 'var(--bs-danger)', label: `${latency.value} ms` };
    });

    onMounted(() => {
      refresh();
      timer = setInterval(refresh, PING_INTERVAL_MS);
      offs.push(socketService.on('connect', refresh));
      offs.push(socketService.on('disconnect', () => { latency.value = null; }));
    });

    onUnmounted(() => {
      clearInterval(timer);
      offs.forEach((off) => off());
    });

    return { online, status };
  },
  template: `
    <footer class="app-footer fixed-bottom border-top py-1 text-body-secondary bg-body">
      <div class="container-fluid d-flex flex-nowrap justify-content-between align-items-center gap-2">
        <span class="text-truncate"></span>
        <span class="d-flex align-items-center gap-3 text-nowrap">
          <span title="Latencia al servidor">
            <span class="app-footer__dot me-1" :style="{ background: status.color }"></span>{{ status.label }}
          </span>
          <span title="Usuarios conectados">👥 {{ online ?? '–' }} conectados</span>
        </span>
      </div>
    </footer>
  `,
};
