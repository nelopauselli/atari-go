import { computed, ref } from 'vue';

const CELL = 44;
const MARGIN = 32;

export default {
  name: 'GoBoard',
  props: {
    size: { type: Number, required: true },
    board: { type: Array, required: true }, // array plano size*size: 'black' | 'white' | null
    interactive: { type: Boolean, default: false },
    myColor: { type: String, default: null },
  },
  emits: ['play'],
  setup(props, { emit }) {
    const hover = ref(null);
    const dim = computed(() => MARGIN * 2 + CELL * (props.size - 1));

    function pos(i) {
      return MARGIN + i * CELL;
    }

    function cellAt(x, y) {
      return props.board[y * props.size + x];
    }

    function onCellClick(x, y) {
      if (!props.interactive) return;
      if (cellAt(x, y)) return;
      emit('play', { x, y });
    }

    function starPoints() {
      const s = props.size;
      if (s === 9) return [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]];
      if (s === 13) return [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]];
      return [];
    }

    return { hover, dim, pos, cellAt, onCellClick, starPoints, CELL, MARGIN };
  },
  template: `
    <div class="go-board-wrap">
      <svg class="go-board" :width="dim" :height="dim" :viewBox="'0 0 ' + dim + ' ' + dim">
        <!-- líneas de la grilla -->
        <g stroke="#5D4A2E" stroke-width="1.2">
          <line v-for="i in size" :key="'h'+i"
                :x1="pos(0)" :y1="pos(i-1)" :x2="pos(size-1)" :y2="pos(i-1)" />
          <line v-for="i in size" :key="'v'+i"
                :x1="pos(i-1)" :y1="pos(0)" :x2="pos(i-1)" :y2="pos(size-1)" />
        </g>
        <!-- puntos de estrella -->
        <circle v-for="(p,idx) in starPoints()" :key="'star'+idx"
                :cx="pos(p[0])" :cy="pos(p[1])" r="3.5" fill="#5D4A2E" />
        <!-- celdas clicables + piedras -->
        <g v-for="y in size" :key="'row'+y">
          <g v-for="x in size" :key="'cell'+x+'-'+y">
            <rect
              :x="pos(x-1) - CELL/2" :y="pos(y-1) - CELL/2" :width="CELL" :height="CELL"
              fill="transparent"
              @click="onCellClick(x-1, y-1)"
              @mouseenter="interactive && !cellAt(x-1,y-1) ? hover = x-1+','+(y-1) : null"
              @mouseleave="hover = null"
              :style="interactive && !cellAt(x-1,y-1) ? 'cursor:pointer' : ''"
            />
            <circle v-if="cellAt(x-1,y-1)"
                    :class="['stone', cellAt(x-1,y-1)==='black' ? 'stone--black' : 'stone--white']"
                    :cx="pos(x-1)" :cy="pos(y-1)" r="19" />
            <circle v-else-if="interactive && myColor && hover === (x-1)+','+(y-1)"
                    class="hover-preview"
                    :class="myColor === 'black' ? 'stone--black' : 'stone--white'"
                    :cx="pos(x-1)" :cy="pos(y-1)" r="19" />
          </g>
        </g>
      </svg>
    </div>
  `,
};
