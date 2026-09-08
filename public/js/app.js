import { AtariBoard } from './atari-board.js';
import { boardAtStep } from './go-replay.js';

const { createApp, ref, reactive, computed, onMounted } = Vue;

// ---------- reloj: etiquetas legibles ----------
const TIME_CONTROL_LABELS = {
  none: 'Sin reloj',
  'fischer-5-10': 'Fischer 5m+10s',
  'fischer-10-5': 'Fischer 10m+5s',
  'absolute-10': 'Absoluto 10m',
};
function timeControlLabel(id) {
  return TIME_CONTROL_LABELS[id] || 'Sin reloj';
}

// ---------- app raíz ----------
const App = {
  components: { AtariBoard },
  setup() {
    const socket = io();

    const joined = ref(false);
    const myColor = ref(null);
    const roomCode = ref(null);
    const lobbyError = ref('');

    const screen = ref('main'); // 'main' | 'historial'
    const sizeChoice = ref('7');
    const targetChoice = ref('1');
    const timeControlChoice = ref('none');
    const codeFilter = ref('');
    const copyFeedback = ref('');
    const copyWatchFeedback = ref(false);

    const state = reactive({
      code: null, size: 7, captureTarget: 1, board: [], current: 'black',
      captures: { black: 0, white: 0 }, gameOver: false, winner: null, winReason: null,
      message: '', hasBlack: false, hasWhite: false, spectatorCount: 0, moveCount: 0,
      partidaId: null, partidaNumber: 1,
    });

    // ---------- historial global ----------
    const historialItems = ref([]);
    const historialPage = ref(1);
    const historialTotalPages = ref(1);
    const historialFilter = ref('');
    const HISTORIAL_LIMIT = 10;

    async function fetchGlobalHistorial() {
      try {
        const params = new URLSearchParams({ page: historialPage.value, limit: HISTORIAL_LIMIT });
        if (historialFilter.value.trim()) params.set('sala', historialFilter.value.trim().toUpperCase());
        const res = await fetch(`/api/partidas?${params.toString()}`);
        if (!res.ok) { historialItems.value = []; historialTotalPages.value = 1; return; }
        const data = await res.json();
        historialItems.value = data.items;
        historialTotalPages.value = data.totalPages;
      } catch (e) {
        historialItems.value = [];
        historialTotalPages.value = 1;
      }
    }
    function goToHistorial() {
      screen.value = 'historial';
      fetchGlobalHistorial();
    }
    function searchHistorial() {
      historialPage.value = 1;
      fetchGlobalHistorial();
    }
    function clearHistorialFilter() {
      historialFilter.value = '';
      historialPage.value = 1;
      fetchGlobalHistorial();
    }
    function changeHistorialPage(page) {
      if (page < 1 || page > historialTotalPages.value) return;
      historialPage.value = page;
      fetchGlobalHistorial();
    }

    const replay = reactive({ visible: false, data: null, step: 0, timer: null });

    // ---------- reloj en vivo ----------
    const clockTick = ref(Date.now());
    function remainingMs(color) {
      if (!state.clock) return null;
      const base = state.clock[color];
      if (state.clock.running && state.current === color) {
        void clockTick.value; // dependencia reactiva: recalcula en cada tick
        return Math.max(0, base - (Date.now() - state.clock.turnStartedAt));
      }
      return base;
    }
    function formatClock(ms) {
      if (ms === null) return '';
      const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `${m}:${String(s).padStart(2, '0')}`;
    }
    function clockLow(color) {
      const ms = remainingMs(color);
      return ms !== null && ms <= 20000;
    }
    function clockRunningFor(color) {
      return !!(state.clock && state.clock.running && state.current === color);
    }
    function clockLabel(color) {
      return formatClock(remainingMs(color));
    }

    // ---------- salas activas ----------
    const activeRooms = ref([]); // [{ status: 'waiting'|'in_progress', ... }]
    socket.on('active_rooms', (list) => { activeRooms.value = list; });

    const waitingRooms = computed(() => activeRooms.value.filter(r => r.status === 'waiting'));
    const inProgressRooms = computed(() => activeRooms.value.filter(r => r.status === 'in_progress'));

    const filteredWaitingRooms = computed(() => {
      const filter = codeFilter.value.trim().toUpperCase();
      if (!filter) return waitingRooms.value;
      return waitingRooms.value.filter(r => r.code.includes(filter));
    });
    const filteredInProgressRooms = computed(() => {
      const filter = codeFilter.value.trim().toUpperCase();
      if (!filter) return inProgressRooms.value;
      return inProgressRooms.value.filter(r => r.code.includes(filter));
    });
    const exactMatchExists = computed(() => {
      const filter = codeFilter.value.trim().toUpperCase();
      if (!filter) return false;
      return activeRooms.value.some(r => r.code === filter);
    });

    const tick = ref(0); // fuerza recalcular "hace cuánto" cada 30s
    function waitingSince(iso) {
      void tick.value;
      const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes} min`;
      const hours = Math.floor(minutes / 60);
      return `${hours} h`;
    }

    function joinWaitingRoom(code) {
      lobbyError.value = '';
      socket.emit('join_room', { code });
    }
    function watchByCode(code) {
      const normalized = (code || codeFilter.value).trim().toUpperCase();
      if (!normalized) return;
      lobbyError.value = '';
      socket.emit('watch_room', { code: normalized });
    }

    const bothPresent = computed(() => state.hasBlack && state.hasWhite);
    const isPlayer = computed(() => myColor.value === 'black' || myColor.value === 'white');
    const canPlay = computed(() => !state.gameOver && bothPresent.value && isPlayer.value && state.current === myColor.value);
    const youAreText = computed(() => {
      if (myColor.value === 'spectator') return 'Estás mirando la partida como espectador.';
      if (isPlayer.value) return `Jugás con: ${myColor.value === 'black' ? 'Negro' : 'Blanco'}`;
      return '';
    });
    const waitingHint = computed(() => bothPresent.value
      ? 'La sala ya tiene dos jugadores — podés seguir compartiendo el link de espectador.'
      : 'Esperando que se una el segundo jugador…');
    const turnLabel = computed(() => state.gameOver ? 'Partida finalizada' : ('Turno: ' + (state.current === 'black' ? 'Negro' : 'Blanco')));
    const capturesLabel = computed(() => `Capturas (meta: ${state.captureTarget}) — Negro: ${state.captures.black} · Blanco: ${state.captures.white}`);
    const spectatorLabel = computed(() => state.spectatorCount > 0 ? `${state.spectatorCount} persona${state.spectatorCount === 1 ? '' : 's'} mirando` : '');
    const downloadHref = computed(() => (state.partidaId && state.moveCount > 0) ? `/api/partidas/id/${state.partidaId}/sgf` : null);

    function resultLabel(item) {
      if (!item.gameOver) return 'En curso';
      if (item.winner === null) return 'Empate';
      const winnerLabel = item.winner === 'black' ? 'Negro' : 'Blanco';
      if (item.winReason === 'resign') return `${winnerLabel} gana (rendición)`;
      if (item.winReason === 'timeout') return `${winnerLabel} gana (tiempo)`;
      return `${winnerLabel} gana (${item.captures[item.winner]}/${item.captureTarget} capturas)`;
    }
    function formatDate(iso) {
      try { return new Date(iso).toLocaleString(); } catch (e) { return ''; }
    }

    function createRoom() {
      lobbyError.value = '';
      socket.emit('create_room', {
        size: parseInt(sizeChoice.value, 10),
        captureTarget: parseInt(targetChoice.value, 10),
        timeControl: timeControlChoice.value,
      });
    }
    function playCell({ x, y }) { socket.emit('move', { x, y }); }
    function resign() {
      if (confirm('¿Seguro que querés rendirte? Le da la victoria a tu rival.')) socket.emit('resign');
    }
    function revancha() { socket.emit('revancha'); }

    function copyCode() {
      if (!roomCode.value) return;
      navigator.clipboard?.writeText(roomCode.value).then(() => {
        copyFeedback.value = 'code';
        setTimeout(() => { copyFeedback.value = ''; }, 1500);
      });
    }
    function copyWatchLink() {
      if (!roomCode.value) return;
      const link = `${location.origin}${location.pathname}?watch=${roomCode.value}`;
      navigator.clipboard?.writeText(link).then(() => {
        copyWatchFeedback.value = true;
        setTimeout(() => { copyWatchFeedback.value = false; }, 1500);
      });
    }

    function applyState(s) {
      Object.assign(state, s);
      roomCode.value = s.code;
    }

    socket.on('joined', ({ color, state: s }) => {
      myColor.value = color;
      joined.value = true;
      applyState(s);
    });
    socket.on('state', (s) => applyState(s));
    socket.on('error_msg', (msg) => { lobbyError.value = msg; });
    // La revancha invierte los colores: el servidor nos avisa cuál nos toca ahora.
    socket.on('color_changed', ({ color }) => { myColor.value = color; });

    // ---------- replay ----------
    const replayBoard = computed(() => {
      if (!replay.data) return [];
      return boardAtStep(replay.data.moveHistory, replay.data.size, replay.step);
    });

    function stopReplayTimer() {
      if (replay.timer) { clearInterval(replay.timer); replay.timer = null; }
    }
    async function openReplay(id) {
      try {
        const res = await fetch(`/api/partidas/id/${id}`);
        if (!res.ok) return;
        const doc = await res.json();
        stopReplayTimer();
        replay.data = doc;
        replay.step = doc.moveHistory.length;
        replay.visible = true;
      } catch (e) { /* no interrumpe la app */ }
    }
    function closeReplay() { stopReplayTimer(); replay.visible = false; replay.data = null; }
    function replayFirst() { stopReplayTimer(); replay.step = 0; }
    function replayPrev() { stopReplayTimer(); replay.step = Math.max(0, replay.step - 1); }
    function replayNext() { stopReplayTimer(); replay.step = Math.min(replay.data.moveHistory.length, replay.step + 1); }
    function replayLast() { stopReplayTimer(); replay.step = replay.data.moveHistory.length; }
    function replayToggle() {
      if (!replay.data) return;
      if (replay.timer) { stopReplayTimer(); return; }
      if (replay.step >= replay.data.moveHistory.length) replay.step = 0;
      replay.timer = setInterval(() => {
        if (replay.step >= replay.data.moveHistory.length) { stopReplayTimer(); return; }
        replay.step++;
      }, 650);
    }

    onMounted(() => {
      const params = new URLSearchParams(location.search);
      const watchParam = params.get('watch');
      if (watchParam) socket.emit('watch_room', { code: watchParam.toUpperCase() });

      setInterval(() => { tick.value++; }, 30000);
      setInterval(() => { clockTick.value = Date.now(); }, 250);
    });

    return {
      joined, myColor, roomCode, lobbyError, sizeChoice, targetChoice, timeControlChoice, codeFilter,
      copyFeedback, copyWatchFeedback, state, replay,
      screen, historialItems, historialPage, historialTotalPages, historialFilter,
      goToHistorial, searchHistorial, clearHistorialFilter, changeHistorialPage,
      filteredWaitingRooms, filteredInProgressRooms, exactMatchExists, waitingSince, joinWaitingRoom, watchByCode,
      formatClock, clockLow, clockRunningFor, clockLabel,
      bothPresent, isPlayer, canPlay, youAreText, waitingHint, turnLabel, capturesLabel,
      spectatorLabel, downloadHref, resultLabel, formatDate, timeControlLabel,
      createRoom, playCell, resign, revancha, copyCode, copyWatchLink,
      replayBoard, openReplay, closeReplay, replayFirst, replayPrev, replayNext, replayLast, replayToggle,
    };
  },
};

createApp(App).mount('#app');
