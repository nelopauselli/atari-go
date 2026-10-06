import { computed, ref, watch } from 'vue';
import { playStone, preloadSounds } from '../services/sound.js';

const CELL = 44;
const MARGIN = 32;

export default {
  name: 'GoBoard',
  props: {
    size: { type: Number, required: true },
    board: { type: Array, required: true }, // array plano size*size: 'black' | 'white' | null
    lastMove: { type: Object, default: null }, // { x, y } | null
    interactive: { type: Boolean, default: false },
    myColor: { type: String, default: null },
    marks: { type: Array, default: () => [] }, // [{ x, y, type: 'liberty' | 'forbidden' }]
  },
  emits: ['play'],
  setup(props, { emit }) {
    const hover = ref(null);
    preloadSounds();
    const dim = computed(() => MARGIN * 2 + CELL * (props.size - 1));

    // Sonar al aparecer una nueva última jugada (propia o del rival); no al montar el tablero.
    watch(
      () => (props.lastMove ? props.lastMove.x + ',' + props.lastMove.y : null),
      (key, prev) => {
        if (key && key !== prev) playStone();
      },
    );

    function pos(i) {
      return MARGIN + i * CELL;
    }

    function cellAt(x, y) {
      return props.board[y * props.size + x];
    }

    function isLastMove(x, y) {
      return !!props.lastMove && props.lastMove.x === x && props.lastMove.y === y;
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

    return { hover, dim, pos, cellAt, isLastMove, onCellClick, starPoints, CELL, MARGIN };
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
            <rect v-if="cellAt(x-1,y-1) && isLastMove(x-1,y-1)"
                  class="last-move-marker"
                  :fill="cellAt(x-1,y-1)==='black' ? '#fff' : '#000'"
                  style="pointer-events:none"
                  :x="pos(x-1) - 5" :y="pos(y-1) - 5" width="10" height="10" />
          </g>
        </g>
        <!-- marcas ilustrativas (tutorial) -->
        <g v-for="(m,idx) in marks" :key="'mark'+idx" style="pointer-events:none">
          <circle v-if="m.type==='liberty'" class="mark-liberty" :cx="pos(m.x)" :cy="pos(m.y)" r="8" />
          <g v-else-if="m.type==='forbidden'" class="mark-forbidden">
            <line :x1="pos(m.x)-9" :y1="pos(m.y)-9" :x2="pos(m.x)+9" :y2="pos(m.y)+9" />
            <line :x1="pos(m.x)-9" :y1="pos(m.y)+9" :x2="pos(m.x)+9" :y2="pos(m.y)-9" />
          </g>
        </g>
      </svg>
    </div>
  `,
};
