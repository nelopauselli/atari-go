import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { api } from '../services/api.js';
import { setTeams } from '../services/teams.js';
import { navigate } from '../router.js';
import { CLOCK_LABELS } from '../services/clocks.js';
import { playStone, playCapture, playGameOver } from '../services/sound.js';
import GoBoard from '../components/GoBoard.js';
import ClockDisplay from '../components/ClockDisplay.js';

// Velocidades de reproducción: con los tiempos reales de la partida o a intervalo fijo por jugada.
const MODES = [
  { id: 'real', label: 'Tiempo real' },
  { id: 1000, label: '1 s / jugada' },
];
const REAL_TICK_MS = 100;

function formatMs(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Reproductor de una partida finalizada: el servidor manda cada posición ya reconstruida (frames).
export default {
  name: 'ReplayView',
  components: { GoBoard, ClockDisplay },
  props: { matchId: { type: String, required: true } },
  setup(props) {
    const match = ref(null);
    const frames = ref([]);
    const error = ref('');
    const index = ref(0);
    const playing = ref(false);
    const mode = ref('real');
    // Tiempo de partida reproducido (ms desde el inicio); solo avanza solo en modo tiempo real.
    const elapsed = ref(0);
    let timer = null;
    let lastTick = 0;

    const last = computed(() => frames.value.length - 1);
    const frame = computed(() => frames.value[index.value] || null);
    const atEnd = computed(() => index.value === last.value);
    const realTime = computed(() => playing.value && mode.value === 'real');

    // En tiempo real el reloj de quien tiene el turno va bajando entre jugada y jugada.
    const clocks = computed(() => {
      const f = frame.value;
      if (!f || !realTime.value || atEnd.value) return f && f.clocks;
      const spent = Math.max(0, elapsed.value - f.at);
      return { ...f.clocks, [f.turn]: Math.max(0, f.clocks[f.turn] - spent) };
    });
    const timeLabel = computed(() => {
      if (!frame.value) return '';
      return `${formatMs(realTime.value ? elapsed.value : frame.value.at)} / ${formatMs(frames.value[last.value].at)}`;
    });

    function stopTimer() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    function schedule() {
      stopTimer();
      if (!playing.value) return;
      if (mode.value === 'real') {
        lastTick = performance.now();
        timer = setInterval(tickReal, REAL_TICK_MS);
      } else {
        timer = setInterval(advance, mode.value);
      }
    }

    function tickReal() {
      const now = performance.now();
      elapsed.value += now - lastTick;
      lastTick = now;
      while (playing.value && !atEnd.value && frames.value[index.value + 1].at <= elapsed.value) advance();
    }

    // Una jugada hacia adelante durante la reproducción; al llegar al final se detiene.
    function advance() {
      if (atEnd.value) return pause();
      show(index.value + 1);
      if (atEnd.value) {
        pause();
        if (match.value.result) playGameOver(match.value.result.winnerColor);
      }
    }

    // Suena la piedra (y la captura) solo al avanzar de a una jugada, no al saltar.
    function show(i) {
      const prev = index.value;
      index.value = Math.max(0, Math.min(last.value, i));
      const f = frames.value[index.value];
      if (index.value === prev + 1 && f.color && f.lastMove) {
        playStone();
        if (f.captured) playCapture();
      }
    }

    function seek(i) {
      show(Number(i));
      elapsed.value = frame.value.at;
      if (playing.value) schedule();
    }

    function pause() {
      playing.value = false;
      stopTimer();
    }

    function togglePlay() {
      if (playing.value) return pause();
      if (atEnd.value) seek(0);
      elapsed.value = frame.value.at;
      playing.value = true;
      schedule();
    }

    watch(mode, () => {
      if (frame.value) elapsed.value = frame.value.at;
      if (playing.value) schedule();
    });

    function onKey(e) {
      if (!frames.value.length || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowLeft') seek(index.value - 1);
      else if (e.key === 'ArrowRight') seek(index.value + 1);
      else if (e.key === ' ') togglePlay();
      else return;
      e.preventDefault();
    }

    onMounted(async () => {
      window.addEventListener('keydown', onKey);
      try {
        const data = await api.getMatchReplay(props.matchId);
        match.value = data.match;
        frames.value = data.frames;
      } catch (err) {
        error.value = err.message;
        return;
      }
      // Al entrar arranca sola, en tiempo real (el modo por defecto).
      togglePlay();
      // TeamShield resuelve el avatar por id/nombre entre los equipos de la sala (si todavía existe).
      api.getRoom(match.value.room).then((d) => setTeams(d.room.teams || [])).catch(() => {});
    });

    onUnmounted(() => {
      stopTimer();
      window.removeEventListener('keydown', onKey);
      setTeams([]);
    });

    function playerLabel(p) {
      return p.teamName ? `${p.nickname} (${p.teamName})` : p.nickname;
    }

    const resultLabel = computed(() => {
      const m = match.value;
      if (!m || !m.result || !m.result.winnerColor) return 'Sin definir';
      const winner = m.players.find((p) => p.color === m.result.winnerColor);
      return `Gana ${m.result.winnerColor === 'black' ? '⚫' : '⚪'} ${winner ? playerLabel(winner) : ''} (${m.result.reason})`;
    });

    return {
      match, frames, error, index, playing, mode, MODES, last, frame, atEnd, clocks, timeLabel, resultLabel, CLOCK_LABELS,
      seek, togglePlay,
      sgfUrl: api.sgfDownloadUrl,
      goBack: () => (match.value ? navigate(`/room/${match.value.room}`) : navigate('/home')),
    };
  },
  template: `
    <main class="container py-4">
      <div class="mb-3">
        <a href="#" class="link-secondary text-decoration-none" @click.prevent="goBack">← {{ match ? match.roomName : 'Salas' }}</a>
        <template v-if="match">
          <h2 class="h4 mt-1 mb-1">Repetición · Tablero #{{ match.boardNumber }}</h2>
          <p class="text-muted mb-0">
            {{ match.boardSize }}x{{ match.boardSize }} ·
            {{ match.stonesToWin }} piedra(s) para ganar ·
            {{ CLOCK_LABELS[match.clockType] || match.clockType }}
            <template v-if="match.endedAt"> · {{ new Date(match.endedAt).toLocaleString() }}</template>
          </p>
        </template>
      </div>

      <div v-if="error" class="alert alert-danger">{{ error }}</div>

      <div v-if="match && frame" class="card shadow-sm">
        <div class="card-body">
          <ClockDisplay :clocks="clocks" :turn="atEnd ? '' : frame.turn" :players="match.players" :captured-by-black="frame.capturedByBlack" :captured-by-white="frame.capturedByWhite" :stones-to-win="match.stonesToWin" />

          <GoBoard class="mt-3" :size="match.boardSize" :board="frame.board" :last-move="frame.lastMove" muted />

          <div class="replay-controls mt-3">
            <div class="d-flex flex-wrap align-items-center justify-content-center gap-2">
              <div class="btn-group" role="group" aria-label="Navegación">
                <button type="button" class="btn btn-outline-secondary" title="Inicio" :disabled="index===0" @click="seek(0)">⏮</button>
                <button type="button" class="btn btn-outline-secondary" title="Jugada anterior (←)" :disabled="index===0" @click="seek(index - 1)">◀</button>
                <button type="button" class="btn btn-primary replay-controls__play" :title="playing ? 'Pausa (espacio)' : 'Reproducir (espacio)'" @click="togglePlay">{{ playing ? '⏸' : '▶' }}</button>
                <button type="button" class="btn btn-outline-secondary" title="Jugada siguiente (→)" :disabled="atEnd" @click="seek(index + 1)">▶|</button>
                <button type="button" class="btn btn-outline-secondary" title="Final" :disabled="atEnd" @click="seek(last)">⏭</button>
              </div>
              <div class="btn-group" role="group" aria-label="Velocidad">
                <template v-for="m in MODES" :key="m.id">
                  <input type="radio" class="btn-check" name="replay-mode" :id="'replay-mode-' + m.id" :value="m.id" v-model="mode" />
                  <label class="btn btn-outline-primary btn-sm d-flex align-items-center" :for="'replay-mode-' + m.id">{{ m.label }}</label>
                </template>
              </div>
            </div>
            <input type="range" class="form-range mt-3" min="0" :max="last" :value="index" @input="seek($event.target.value)" aria-label="Jugada" />
            <div class="d-flex justify-content-between text-muted small">
              <span>Jugada {{ frame.moveNumber }} / {{ frames[last].moveNumber }}</span>
              <span class="font-monospace">{{ timeLabel }}</span>
            </div>
          </div>

          <div v-if="atEnd" class="alert alert-info text-center mt-3 mb-0">
            <strong>Partida finalizada.</strong> {{ resultLabel }}
          </div>

          <div class="d-flex justify-content-end mt-3">
            <a class="btn btn-outline-secondary btn-sm" :href="sgfUrl(match._id)">Descargar SGF</a>
          </div>
        </div>
      </div>
    </main>
  `,
};
