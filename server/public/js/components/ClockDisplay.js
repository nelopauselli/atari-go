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
  },
  computed: {
    // Con muchas capturas para ganar, las piedras no entran: se muestran números
    showStones() { return !!this.stonesToWin && this.stonesToWin <= 10; },
  },
  methods: {
    formatMs,
    opponent(color) { return color === 'black' ? 'white' : 'black'; },
    player(color) { return this.players.find((p) => p.color === color); },
    captured(color) { return color === 'black' ? this.capturedByBlack : this.capturedByWhite; },
  },
  template: `
    <div class="row g-2 g-sm-3">
      <div class="col-6" v-for="color in ['black', 'white']" :key="color">
        <div class="card h-100" :class="{ 'clock--active': turn===color, 'clock--low': clocks[color] < 20000 }">
          <div class="card-body py-2 clock__body" :class="'clock__body--' + color">
            <div class="clock__stone" :class="'clock__stone--' + color"></div>
            <div class="fw-semibold d-flex align-items-center justify-content-center gap-2 text-truncate clock__name">
              <TeamShield v-if="player(color) && player(color).teamName" :team="player(color).team" :name="player(color).teamName" :size="24" />
              <span class="text-truncate">{{ player(color) ? player(color).nickname : (color==='black' ? 'Negro' : 'Blanco') }}<span v-if="player(color) && player(color).teamName" class="text-muted fw-normal"> ({{ player(color).teamName }})</span></span>
            </div>
            <div class="clock__caps-wrap">
              <div v-if="showStones" class="d-none d-lg-flex justify-content-center gap-1 clock__caps" :title="captured(color) + ' / ' + stonesToWin + ' capturas'">
                <span v-for="i in stonesToWin" :key="i" class="clock__cap" :class="i <= captured(color) ? 'clock__stone--' + opponent(color) : 'clock__cap--empty'"></span>
              </div>
              <div class="text-muted small text-nowrap" :class="{ 'd-lg-none': showStones }">{{ captured(color) }}<span v-if="stonesToWin"> / {{ stonesToWin }}</span><span class="d-none d-md-inline"> capturas</span></div>
            </div>
            <div class="clock__time">{{ formatMs(clocks[color]) }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
};
