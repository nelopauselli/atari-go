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
  },
  methods: { formatMs },
  computed: {
    blackPlayer() { return this.players.find((p) => p.color === 'black'); },
    whitePlayer() { return this.players.find((p) => p.color === 'white'); },
  },
  template: `
    <div class="row g-3">
      <div class="col-6">
        <div class="card text-center" :class="{ 'clock--active': turn==='black', 'clock--low': clocks.black < 20000 }">
          <div class="card-body py-2">
            <div class="text-muted small">⚫ {{ blackPlayer ? blackPlayer.nickname : 'Negro' }}<span v-if="blackPlayer && blackPlayer.teamName"> <TeamShield :team="blackPlayer.team" :name="blackPlayer.teamName" :size="16" /> ({{ blackPlayer.teamName }})</span></div>
            <div class="text-muted small">{{ capturedByBlack }} capturas</div>
            <div class="clock__time">{{ formatMs(clocks.black) }}</div>
          </div>
        </div>
      </div>
      <div class="col-6">
        <div class="card text-center" :class="{ 'clock--active': turn==='white', 'clock--low': clocks.white < 20000 }">
          <div class="card-body py-2">
            <div class="text-muted small">⚪ {{ whitePlayer ? whitePlayer.nickname : 'Blanco' }}<span v-if="whitePlayer && whitePlayer.teamName"> <TeamShield :team="whitePlayer.team" :name="whitePlayer.teamName" :size="16" /> ({{ whitePlayer.teamName }})</span></div>
            <div class="text-muted small">{{ capturedByWhite }} capturas</div>
            <div class="clock__time">{{ formatMs(clocks.white) }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
};
