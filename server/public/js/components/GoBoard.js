import { computed, ref, watch } from 'vue';
import { playStone, preloadSounds } from '../services/sound.js';

const CELL = 44;
const MARGIN = 32;
// Capas de la piedra blanca, de abajo hacia arriba.
const WHITE_LAYERS = ['white-base', 'white-veins1', 'white-veins2', 'white-volume', 'white-shine'];
// Opacidad de sombra interior y proyectada por color.
const SHADOWS = [
  { color: 'black', inset: 0.6, drop: 0.45 },
  { color: 'white', inset: 0.12, drop: 0.3 },
];
let boardSeq = 0;

export default {
  name: 'GoBoard',
  props: {
    size: { type: Number, required: true },
    board: { type: Array, required: true }, // array plano size*size: 'black' | 'white' | null
    lastMove: { type: Object, default: null }, // { x, y } | null
    interactive: { type: Boolean, default: false },
    myColor: { type: String, default: null },
    marks: { type: Array, default: () => [] }, // [{ x, y, type: 'liberty' | 'forbidden' }]
    muted: { type: Boolean, default: false }, // sin sonido de piedra (el reproductor maneja el suyo)
  },
  emits: ['play'],
  setup(props, { emit }) {
    const hover = ref(null);
    // Prefijo único para los ids de <defs>: puede haber varios tableros en la misma página.
    const uid = 'gb' + ++boardSeq;
    preloadSounds();
    const dim = computed(() => MARGIN * 2 + CELL * (props.size - 1));

    // Sonar al aparecer una nueva última jugada (propia o del rival); no al montar el tablero.
    watch(
      () => (props.lastMove ? props.lastMove.x + ',' + props.lastMove.y : null),
      (key, prev) => {
        if (key && key !== prev && !props.muted) playStone();
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

    // Piedra a dibujar en la intersección: la colocada o, si está vacía, la previsualización bajo el cursor.
    function stoneAt(x, y) {
      const c = cellAt(x, y);
      if (c) return c;
      if (props.interactive && props.myColor && hover.value === x + ',' + y) return props.myColor;
      return null;
    }

    function paint(name) {
      return `url(#${uid}-${name})`;
    }

    return { hover, dim, pos, cellAt, stoneAt, paint, uid, isLastMove, onCellClick, starPoints, CELL, MARGIN, WHITE_LAYERS, SHADOWS };
  },
  template: `
    <div class="go-board-wrap">
      <svg class="go-board" :width="dim" :height="dim" :viewBox="'0 0 ' + dim + ' ' + dim">
        <!-- estética de piedras (misma que .clock__stone en custom.css) -->
        <defs>
          <radialGradient :id="uid + '-black'" cx="0.3" cy="0.28" fx="0.3" fy="0.28" r="1">
            <stop offset="0" stop-color="#6b6b6b" />
            <stop offset="0.28" stop-color="#2a2a2a" />
            <stop offset="0.62" stop-color="#111" />
            <stop offset="1" stop-color="#000" />
          </radialGradient>
          <!-- base nacarada -->
          <linearGradient :id="uid + '-white-base'" x1="0.41" y1="0.01" x2="0.59" y2="0.99">
            <stop offset="0" stop-color="#fbfaf6" />
            <stop offset="0.45" stop-color="#f3f1ea" />
            <stop offset="1" stop-color="#ece9e0" />
          </linearGradient>
          <!-- betas de concha (arcos finos e irregulares) -->
          <radialGradient :id="uid + '-white-veins1'" cx="0.5" cy="1.7" fx="0.5" fy="1.7" r="0.225" spreadMethod="repeat">
            <stop offset="0" stop-color="#fff" stop-opacity="0" />
            <stop offset="0.333" stop-color="#fff" stop-opacity="0" />
            <stop offset="0.4" stop-color="rgb(226,222,212)" stop-opacity=".55" />
            <stop offset="0.511" stop-color="#fff" stop-opacity="0" />
            <stop offset="0.689" stop-color="#fff" stop-opacity="0" />
            <stop offset="0.756" stop-color="rgb(236,233,225)" stop-opacity=".45" />
            <stop offset="0.844" stop-color="#fff" stop-opacity="0" />
            <stop offset="1" stop-color="#fff" stop-opacity="0" />
          </radialGradient>
          <radialGradient :id="uid + '-white-veins2'" cx="0.46" cy="1.9" fx="0.46" fy="1.9" r="0.35" spreadMethod="repeat">
            <stop offset="0" stop-color="#fff" stop-opacity="0" />
            <stop offset="0.786" stop-color="#fff" stop-opacity="0" />
            <stop offset="0.857" stop-color="rgb(214,208,196)" stop-opacity=".35" />
            <stop offset="1" stop-color="#fff" stop-opacity="0" />
          </radialGradient>
          <!-- brillo y volumen -->
          <radialGradient :id="uid + '-white-volume'" cx="0.3" cy="0.28" fx="0.3" fy="0.28" r="1">
            <stop offset="0.55" stop-color="#000" stop-opacity="0" />
            <stop offset="0.8" stop-color="rgb(120,115,105)" stop-opacity=".18" />
            <stop offset="1" stop-color="rgb(90,85,78)" stop-opacity=".38" />
          </radialGradient>
          <radialGradient :id="uid + '-white-shine'" cx="0.3" cy="0.28" fx="0.3" fy="0.28" r="1">
            <stop offset="0" stop-color="#fff" stop-opacity=".95" />
            <stop offset="0.22" stop-color="#fff" stop-opacity=".35" />
            <stop offset="0.45" stop-color="#fff" stop-opacity="0" />
          </radialGradient>
          <!-- sombra proyectada + sombra interior (equivalente a los box-shadow del reloj) -->
          <filter v-for="s in SHADOWS" :key="s.color" :id="uid + '-' + s.color + '-shadow'"
                  x="-30%" y="-30%" width="170%" height="170%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="-3" dy="-4" />
            <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="insetMask" />
            <feFlood flood-color="#000" :flood-opacity="s.inset" />
            <feComposite in2="insetMask" operator="in" />
            <feComposite in2="SourceGraphic" operator="over" result="withInset" />
            <feDropShadow in="withInset" dx="2" dy="3" stdDeviation="2.5" flood-color="#000" :flood-opacity="s.drop" />
          </filter>
        </defs>
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
            <g v-if="stoneAt(x-1,y-1)"
               :class="cellAt(x-1,y-1) ? 'stone' : 'hover-preview'"
               :filter="paint(stoneAt(x-1,y-1) + '-shadow')">
              <circle v-if="stoneAt(x-1,y-1)==='black'" :fill="paint('black')" :cx="pos(x-1)" :cy="pos(y-1)" r="19" />
              <template v-else>
                <circle v-for="layer in WHITE_LAYERS" :key="layer" :fill="paint(layer)" :cx="pos(x-1)" :cy="pos(y-1)" r="19" />
              </template>
            </g>
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
