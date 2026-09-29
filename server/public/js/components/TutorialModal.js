import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import GoBoard from './GoBoard.js';

const SIZE = 5;

// Construye un tablero plano a partir de filas de texto: 'B' negra, 'W' blanca, '.' vacía.
function parse(rows) {
  return rows.join('').split('').map((c) => (c === 'B' ? 'black' : c === 'W' ? 'white' : null));
}

const STEPS = [
  {
    title: '¿Qué es Atari-Go?',
    text: [
      'Atari-Go es una versión simplificada del Go, ideal para aprender. Dos personas colocan piedras negras y blancas sobre las intersecciones de un tablero.',
      'El objetivo es simple: <strong>gana quien primero captura la cantidad de piedras rivales</strong> que indique la sala.',
    ],
    board: parse(['.....', '.B.W.', '..B..', '.W...', '.....']),
  },
  {
    title: 'Turnos y jugadas',
    text: [
      'Juega primero <strong>negro</strong> ⚫ y los turnos se alternan.',
      'En tu turno colocás una piedra en cualquier intersección vacía. Las piedras no se mueven una vez colocadas.',
      '<strong>No se puede pasar:</strong> en cada turno es obligatorio jugar.',
    ],
    practice: {
      prompt: 'Probá: hacé click en cualquier intersección vacía para colocar una piedra negra.',
      any: true,
      success: '¡Bien! Así de simple es jugar una piedra.',
    },
    board: parse(['.....', '.....', '.....', '.....', '.....']),
  },
  {
    title: 'Libertades',
    text: [
      'Las <strong>libertades</strong> de una piedra son las intersecciones vacías pegadas a ella: arriba, abajo, izquierda y derecha (las diagonales no cuentan).',
      'Las piedras del mismo color conectadas en línea forman un <strong>grupo</strong> y comparten sus libertades.',
    ],
    board: parse(['.....', '.....', '..B..', '.....', '.....']),
    marks: [{ x: 2, y: 1, type: 'liberty' }, { x: 1, y: 2, type: 'liberty' }, { x: 3, y: 2, type: 'liberty' }, { x: 2, y: 3, type: 'liberty' }],
    caption: 'La piedra negra tiene 4 libertades (marcadas en azul).',
  },
  {
    title: 'Capturar',
    text: [
      'Si un grupo rival se queda <strong>sin libertades</strong>, se captura: se retira del tablero y esas piedras suman para tu objetivo.',
    ],
    board: parse(['.....', '..B..', '.BW..', '..B..', '.....']),
    practice: {
      prompt: 'La piedra blanca tiene una sola libertad. Jugá negro ahí para capturarla.',
      answer: { x: 3, y: 2 },
      after: parse(['.....', '..B..', '.B.B.', '..B..', '.....']),
      success: '¡Captura! La piedra blanca se retira y suma 1 a tu cuenta.',
    },
  },
  {
    title: 'Capturar un grupo',
    text: [
      'Un grupo se captura completo cuando se le tapa la última libertad compartida, sin importar cuántas piedras tenga.',
    ],
    board: parse(['.....', '.BB..', 'BWWB.', '.B...', '.....']),
    practice: {
      prompt: 'Las dos piedras blancas comparten una única libertad. Encontrala y capturá el grupo.',
      answer: { x: 2, y: 3 },
      after: parse(['.....', '.BB..', 'B..B.', '.BB..', '.....']),
      success: '¡Excelente! Capturaste 2 piedras de una sola vez.',
    },
  },
  {
    title: 'Atari: ¡salvá tu piedra!',
    text: [
      'Cuando un grupo tiene <strong>una sola libertad</strong> se dice que está en <em>atari</em>: el rival lo puede capturar en la próxima jugada.',
      'Para escapar, podés extender el grupo y así ganar libertades nuevas.',
    ],
    board: parse(['.....', '..W..', '.WB..', '..W..', '.....']),
    practice: {
      prompt: 'Tu piedra negra está en atari. Jugá en su última libertad para escapar.',
      answer: { x: 3, y: 2 },
      after: parse(['.....', '..W..', '.WBB.', '..W..', '.....']),
      afterMarks: [{ x: 3, y: 1, type: 'liberty' }, { x: 4, y: 2, type: 'liberty' }, { x: 3, y: 3, type: 'liberty' }],
      success: '¡Salvada! Ahora el grupo negro tiene 3 libertades.',
    },
  },
  {
    title: 'Autocaptura',
    text: [
      'No se puede jugar una piedra que deje a tu propio grupo sin libertades.',
      '<strong>Excepción:</strong> sí se permite si esa jugada captura piedras rivales, porque la captura le devuelve libertades.',
    ],
    board: parse(['.W...', 'W.W..', '.W...', '.....', '.....']),
    marks: [{ x: 1, y: 1, type: 'forbidden' }],
    caption: 'Negro no puede jugar en la X: quedaría sin libertades sin capturar nada.',
  },
  {
    title: 'Regla de Ko',
    text: [
      'Si la sala tiene Ko habilitado, no podés jugar una piedra que repita la posición del tablero que había justo antes de tu última jugada.',
      'Así se evita capturar y recapturar en el mismo lugar para siempre: primero hay que jugar en otro lado.',
    ],
    board: parse(['.....', '.BW..', 'BW.W.', '.BW..', '.....']),
    lastMove: { x: 1, y: 2 },
    marks: [{ x: 2, y: 2, type: 'forbidden' }],
    caption: 'Blanco acaba de capturar una piedra negra. Negro no puede recapturar de inmediato en la X.',
  },
  {
    title: 'Fin de la partida',
    text: [
      'La partida termina y hay ganador cuando:',
      '<ul class="mb-2">'
        + '<li><strong>Captura:</strong> alguien alcanza las piedras capturadas que pide la sala.</li>'
        + '<li><strong>Rendición:</strong> una persona abandona; gana la otra.</li>'
        + '<li><strong>Tiempo:</strong> cada partida usa reloj Fischer (tiempo base + incremento por jugada). Si se te agota, perdés.</li>'
        + '<li><strong>Sin jugadas posibles:</strong> si en tu turno no te queda ningún lugar permitido, perdés.</li>'
        + '</ul>',
      'Cada sala puede tener su propio tamaño de tablero, reloj y cantidad de capturas: revisá el botón <strong>Reglas</strong> de la sala antes de sentarte. ¡A jugar!',
    ],
  },
];

export default {
  name: 'TutorialModal',
  components: { GoBoard },
  emits: ['close'],
  setup(props, { emit }) {
    const index = ref(0);
    const played = ref(null); // { x, y } de la jugada de práctica correcta
    const feedback = ref('');

    const step = computed(() => STEPS[index.value]);
    const isFirst = computed(() => index.value === 0);
    const isLast = computed(() => index.value === STEPS.length - 1);
    const progress = computed(() => ((index.value + 1) / STEPS.length) * 100);

    const currentBoard = computed(() => {
      const s = step.value;
      if (!played.value) return s.board;
      if (s.practice.after) return s.practice.after;
      const b = [...s.board];
      b[played.value.y * SIZE + played.value.x] = 'black';
      return b;
    });
    const currentMarks = computed(() => {
      const s = step.value;
      if (played.value) return s.practice.afterMarks || [];
      return s.marks || [];
    });
    const currentLastMove = computed(() => played.value || step.value.lastMove || null);

    watch(index, () => {
      played.value = null;
      feedback.value = '';
    });

    function onPlay(p) {
      const practice = step.value.practice;
      if (!practice || played.value) return;
      if (practice.any || (p.x === practice.answer.x && p.y === practice.answer.y)) {
        played.value = p;
        feedback.value = '';
      } else {
        feedback.value = 'Esa no es. Mirá las libertades de las piedras y probá otra vez.';
      }
    }

    function retry() {
      played.value = null;
      feedback.value = '';
    }
    function next() { if (!isLast.value) index.value++; }
    function prev() { if (!isFirst.value) index.value--; }

    function onKey(e) {
      if (e.key === 'Escape') emit('close');
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    }
    onMounted(() => document.addEventListener('keydown', onKey));
    onUnmounted(() => document.removeEventListener('keydown', onKey));

    return {
      SIZE, STEPS, index, step, played, feedback, isFirst, isLast, progress,
      currentBoard, currentMarks, currentLastMove, onPlay, retry, next, prev,
    };
  },
  template: `
    <div class="modal d-block" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="tutorial-modal-title" @click.self="$emit('close')">
      <div class="modal-dialog modal-dialog-scrollable modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="tutorial-modal-title">Cómo se juega · {{ step.title }}</h5>
            <button type="button" class="btn-close" aria-label="Cerrar" @click="$emit('close')"></button>
          </div>
          <div class="progress rounded-0 tutorial-progress" role="progressbar" :aria-valuenow="index + 1" aria-valuemin="1" :aria-valuemax="STEPS.length">
            <div class="progress-bar" :style="{ width: progress + '%' }"></div>
          </div>
          <div class="modal-body">
            <div class="row g-4 align-items-center">
              <div :class="step.board ? 'col-md-6' : 'col-12'">
                <p v-for="(t, i) in step.text" :key="i" v-html="t"></p>
              </div>
              <div class="col-md-6" v-if="step.board">
                <GoBoard :size="SIZE" :board="currentBoard" :marks="currentMarks" :last-move="currentLastMove"
                         :interactive="!!step.practice && !played" my-color="black" @play="onPlay" />
                <p v-if="step.caption" class="small text-muted text-center mt-2 mb-0">{{ step.caption }}</p>
                <template v-if="step.practice">
                  <div v-if="played" class="alert alert-success small mt-2 mb-0 d-flex justify-content-between align-items-center gap-2">
                    <span>{{ step.practice.success }}</span>
                    <button type="button" class="btn btn-sm btn-outline-success" @click="retry">Reintentar</button>
                  </div>
                  <div v-else-if="feedback" class="alert alert-warning small mt-2 mb-0">{{ feedback }}</div>
                  <div v-else class="alert alert-info small mt-2 mb-0">{{ step.practice.prompt }}</div>
                </template>
              </div>
            </div>
          </div>
          <div class="modal-footer justify-content-between">
            <span class="text-muted small">Paso {{ index + 1 }} de {{ STEPS.length }}</span>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-outline-secondary" :disabled="isFirst" @click="prev">Anterior</button>
              <button v-if="!isLast" type="button" class="btn btn-primary" @click="next">Siguiente</button>
              <button v-else type="button" class="btn btn-success" @click="$emit('close')">¡A jugar!</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop show"></div>
  `,
};
