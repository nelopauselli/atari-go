// Componente reutilizable: tablero SVG. Lo usan tanto el juego en vivo
// como el visor de reproducción del historial.
const { ref, computed } = Vue;

export const AtariBoard = {
  props: {
    size: { type: Number, required: true },
    board: { type: Array, required: true },
    canPlay: { type: Boolean, default: false },
    hintColor: { type: String, default: 'black' },
    idPrefix: { type: String, default: 'b' },
  },
  emits: ['cell-click'],
  setup(props, { emit }) {
    const hoverKey = ref(null);

    const metrics = computed(() => {
      let cell, margin;
      if (props.size <= 5) cell = 56;
      else if (props.size <= 7) cell = 50;
      else if (props.size <= 9) cell = 42;
      else cell = 30;
      margin = cell * 0.72;
      return { cell, margin };
    });

    const px = computed(() => metrics.value.margin * 2 + metrics.value.cell * (props.size - 1));
    const viewBox = computed(() => `0 0 ${px.value} ${px.value}`);
    function coord(i) { return metrics.value.margin + i * metrics.value.cell; }

    const gridLines = computed(() => {
      const lines = [];
      for (let i = 0; i < props.size; i++) {
        lines.push({ x1: coord(i), y1: coord(0), x2: coord(i), y2: coord(props.size - 1) });
        lines.push({ x1: coord(0), y1: coord(i), x2: coord(props.size - 1), y2: coord(i) });
      }
      return lines;
    });

    const starPoints = computed(() => {
      if (props.size !== 9 && props.size !== 13) return [];
      const pts = props.size === 9 ? [2, 4, 6] : [3, 6, 9];
      const out = [];
      for (const a of pts) for (const b of pts) out.push({ x: coord(a), y: coord(b) });
      return out;
    });

    const cells = computed(() => {
      const out = [];
      for (let x = 0; x < props.size; x++) {
        for (let y = 0; y < props.size; y++) {
          out.push({
            x, y,
            key: x + '-' + y,
            transform: `translate(${coord(x)},${coord(y)})`,
            stone: props.board[x] ? props.board[x][y] : null,
            gradId: props.idPrefix + '-g-' + x + '-' + y,
          });
        }
      }
      return out;
    });

    const halfCell = computed(() => metrics.value.cell / 2);
    const stoneR = computed(() => metrics.value.cell * 0.42);
    const hintR = computed(() => metrics.value.cell * 0.38);
    const hintFill = computed(() => (props.hintColor === 'black' ? '#1a1a1a' : '#f5f1e8'));

    function handleClick(cell) {
      if (!props.canPlay || cell.stone) return;
      emit('cell-click', { x: cell.x, y: cell.y });
    }

    return { px, viewBox, gridLines, starPoints, cells, hoverKey, halfCell, stoneR, hintR, hintFill, handleClick };
  },
  template: `
    <svg :viewBox="viewBox" :width="px" :height="px">
      <line v-for="(l,i) in gridLines" :key="'l'+i" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" stroke="var(--line)" stroke-width="1.4" />
      <circle v-for="(p,i) in starPoints" :key="'s'+i" :cx="p.x" :cy="p.y" r="3" fill="var(--line)" />
      <g v-for="cell in cells" :key="cell.key" class="intersection" :transform="cell.transform"
         @click="handleClick(cell)"
         @mouseenter="hoverKey = cell.key" @mouseleave="hoverKey = null">
        <circle :r="halfCell" fill="transparent" />
        <template v-if="cell.stone">
          <defs>
            <radialGradient :id="cell.gradId" cx="35%" cy="30%">
              <stop offset="0%" :stop-color="cell.stone === 'black' ? '#5a5a5a' : '#ffffff'" />
              <stop offset="100%" :stop-color="cell.stone === 'black' ? '#0a0a0a' : '#cfc7b4'" />
            </radialGradient>
          </defs>
          <circle :r="stoneR" :fill="'url(#' + cell.gradId + ')'" :stroke="cell.stone === 'black' ? '#000' : '#b5ac96'" stroke-width="0.6" />
        </template>
        <circle v-else-if="canPlay" :r="hintR" :fill="hintFill" :opacity="hoverKey === cell.key ? 0.35 : 0" style="transition: opacity 0.1s" />
      </g>
    </svg>
  `,
};
