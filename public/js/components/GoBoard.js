const HOSHI_BY_SIZE = {
  9: [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]],
  13: [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6], [3, 6], [9, 6], [6, 3], [6, 9]],
};

const CELL = 42;
const MARGIN = 30;

export default {
  name: 'GoBoard',
  props: {
    size: { type: Number, required: true },
    board: { type: Array, required: true }, // size x size, 0/1/2
    disabled: { type: Boolean, default: false },
    lastMove: { type: Object, default: null }, // { row, col } o null
  },
  emits: ['play'],
  computed: {
    dimension() {
      return MARGIN * 2 + CELL * (this.size - 1);
    },
    hoshi() {
      return HOSHI_BY_SIZE[this.size] || [];
    },
    intersections() {
      const points = [];
      for (let row = 0; row < this.size; row++) {
        for (let col = 0; col < this.size; col++) {
          points.push({
            row,
            col,
            x: MARGIN + col * CELL,
            y: MARGIN + row * CELL,
            value: this.board[row]?.[col] ?? 0,
          });
        }
      }
      return points;
    },
  },
  methods: {
    onIntersectionClick(point) {
      if (this.disabled || point.value !== 0) return;
      this.$emit('play', { row: point.row, col: point.col });
    },
    isLastMove(point) {
      return this.lastMove && this.lastMove.row === point.row && this.lastMove.col === point.col;
    },
  },
  template: `
    <div class="goban">
      <svg :viewBox="'0 0 ' + dimension + ' ' + dimension" :width="dimension" :height="dimension">
        <defs>
          <radialGradient id="stoneBlackGradient" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stop-color="#4a443c" />
            <stop offset="100%" stop-color="#141110" />
          </radialGradient>
          <radialGradient id="stoneWhiteGradient" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="100%" stop-color="#d9d0ba" />
          </radialGradient>
        </defs>

        <!-- líneas del tablero -->
        <g stroke="#5b4c33" stroke-width="1.1">
          <line v-for="row in size" :key="'h'+row"
                :x1="MARGIN" :y1="MARGIN + (row - 1) * CELL"
                :x2="MARGIN + (size - 1) * CELL" :y2="MARGIN + (row - 1) * CELL" />
          <line v-for="col in size" :key="'v'+col"
                :x1="MARGIN + (col - 1) * CELL" :y1="MARGIN"
                :x2="MARGIN + (col - 1) * CELL" :y2="MARGIN + (size - 1) * CELL" />
        </g>

        <!-- puntos hoshi -->
        <circle v-for="(h, i) in hoshi" :key="'hoshi'+i"
                :cx="MARGIN + h[1] * CELL" :cy="MARGIN + h[0] * CELL" r="3.2" fill="#5b4c33" />

        <!-- piedras + zonas clicables -->
        <g v-for="point in intersections" :key="point.row + '-' + point.col">
          <circle v-if="point.value === 1" class="stone-black"
                  :cx="point.x" :cy="point.y" :r="CELL * 0.46" />
          <circle v-if="point.value === 2" class="stone-white"
                  :cx="point.x" :cy="point.y" :r="CELL * 0.46" />
          <circle v-if="isLastMove(point)" :cx="point.x" :cy="point.y" r="5"
                  :fill="point.value === 1 ? '#f7f3e9' : '#b23a2e'" />
          <rect :x="point.x - CELL / 2" :y="point.y - CELL / 2" :width="CELL" :height="CELL"
                fill="transparent"
                :style="{ cursor: (disabled || point.value !== 0) ? 'default' : 'pointer' }"
                @click="onIntersectionClick(point)" />
        </g>
      </svg>
    </div>
  `,
  data() {
    return { MARGIN, CELL };
  },
};
