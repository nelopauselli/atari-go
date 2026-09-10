export default {
  name: 'Goban',
  props: {
    board: { type: Array, required: true },
    size: { type: Number, required: true },
    interactive: { type: Boolean, default: false },
  },
  emits: ['play'],
  computed: {
    cell() {
      return 46;
    },
    padding() {
      return 30;
    },
    dimension() {
      return this.padding * 2 + this.cell * (this.size - 1);
    },
    lines() {
      const result = [];
      for (let i = 0; i < this.size; i += 1) {
        const pos = this.padding + i * this.cell;
        result.push({ x1: this.padding, y1: pos, x2: this.dimension - this.padding, y2: pos });
        result.push({ x1: pos, y1: this.padding, x2: pos, y2: this.dimension - this.padding });
      }
      return result;
    },
    stones() {
      const result = [];
      for (let x = 0; x < this.size; x += 1) {
        for (let y = 0; y < this.size; y += 1) {
          const value = this.board[x][y];
          if (value !== 0) {
            result.push({
              x,
              y,
              color: value === 1 ? 'black' : 'white',
              cx: this.padding + x * this.cell,
              cy: this.padding + y * this.cell,
            });
          }
        }
      }
      return result;
    },
  },
  methods: {
    handleClick(x, y) {
      if (!this.interactive) return;
      if (this.board[x][y] !== 0) return;
      this.$emit('play', { x, y });
    },
  },
  template: `
    <div class="goban-wrap">
      <svg :viewBox="\`0 0 \${dimension} \${dimension}\`" :width="dimension" :height="dimension">
        <line v-for="(l, i) in lines" :key="i" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" stroke="#5c4322" stroke-width="1.5" />

        <g v-for="x in size" :key="'col'+x">
          <g v-for="y in size" :key="'row'+y">
            <circle
              :cx="padding + (x-1) * cell"
              :cy="padding + (y-1) * cell"
              :r="cell/2 - 2"
              fill="transparent"
              :style="interactive ? 'cursor:pointer' : ''"
              @click="handleClick(x-1, y-1)"
            />
          </g>
        </g>

        <circle
          v-for="s in stones"
          :key="s.x + '-' + s.y"
          :cx="s.cx"
          :cy="s.cy"
          :r="cell/2 - 3"
          :fill="s.color === 'black' ? 'url(#gradBlack)' : 'url(#gradWhite)'"
          :stroke="s.color === 'white' ? '#9c9c9c' : 'none'"
          stroke-width="1"
        />

        <defs>
          <radialGradient id="gradBlack" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stop-color="#5a5a5a" />
            <stop offset="100%" stop-color="#050505" />
          </radialGradient>
          <radialGradient id="gradWhite" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="100%" stop-color="#d4d4d4" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  `,
};
