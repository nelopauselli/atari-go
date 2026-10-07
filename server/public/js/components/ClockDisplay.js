import TeamShield from './TeamShield.js';

function formatMs(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default {
  name: 'ClockDisplay',
  components: { TeamShield },
  props: {
    clocks: { type: Object, required: true }, // { black: ms, white: ms }
    turn: { type: String, required: true },
    players: { type: Array, default: () => [] },
    capturedByBlack: { type: Number, default: 0 },
    capturedByWhite: { type: Number, default: 0 },
    stonesToWin: { type: Number, default: null },
    myColor: { type: String, default: null }, // color del usuario conectado si juega en este tablero
  },
  methods: {
    formatMs,
    player(color) { return this.players.find((p) => p.color === color); },
    captured(color) { return color === 'black' ? this.capturedByBlack : this.capturedByWhite; },
    colorLabel(color) {
      const verb = color === this.myColor ? 'Jugás' : 'Juega';
      return `${verb} con ${color === 'black' ? 'negras' : 'blancas'}`;
    },
  },
  template: `
    <div class="row g-3">
      <div class="col-12 col-md-6" v-for="color in ['black', 'white']" :key="color">
        <div class="card h-100" :class="{ 'clock--active': turn===color, 'clock--low': clocks[color] < 20000 }">
          <div class="card-body py-2 d-flex align-items-stretch gap-3">
            <div class="clock__stone" :class="'clock__stone--' + color"></div>
            <div class="flex-grow-1 d-flex flex-column justify-content-center text-truncate">
              <div class="fw-semibold d-flex align-items-center gap-2 text-truncate">
                <TeamShield v-if="player(color) && player(color).teamName" :team="player(color).team" :name="player(color).teamName" :size="24" />
                <span class="text-truncate">{{ player(color) ? player(color).nickname : (color==='black' ? 'Negro' : 'Blanco') }}<span v-if="player(color) && player(color).teamName" class="text-muted fw-normal"> ({{ player(color).teamName }})</span></span>
              </div>
              <div class="text-muted small">{{ colorLabel(color) }}</div>
            </div>
            <div class="d-flex flex-column justify-content-center text-end">
              <div class="text-muted small text-nowrap">{{ captured(color) }}<span v-if="stonesToWin"> / {{ stonesToWin }}</span> capturas</div>
              <div class="clock__time">{{ formatMs(clocks[color]) }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
};
