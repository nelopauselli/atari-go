function formatMs(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default {
  name: 'ClockDisplay',
  props: {
    clocks: { type: Object, required: true }, // { black: ms, white: ms }
    turn: { type: String, required: true },
    players: { type: Array, default: () => [] },
  },
  methods: { formatMs },
  computed: {
    blackPlayer() { return this.players.find((p) => p.color === 'black'); },
    whitePlayer() { return this.players.find((p) => p.color === 'white'); },
  },
  template: `
    <div class="clocks">
      <div class="clock" :class="{ 'clock--active': turn==='black', 'clock--low': clocks.black < 20000 }">
        <div class="clock__label">⚫ {{ blackPlayer ? blackPlayer.nickname : 'Negro' }}</div>
        <div class="clock__time">{{ formatMs(clocks.black) }}</div>
      </div>
      <div class="clock" :class="{ 'clock--active': turn==='white', 'clock--low': clocks.white < 20000 }">
        <div class="clock__label">⚪ {{ whitePlayer ? whitePlayer.nickname : 'Blanco' }}</div>
        <div class="clock__time">{{ formatMs(clocks.white) }}</div>
      </div>
    </div>
  `,
};
