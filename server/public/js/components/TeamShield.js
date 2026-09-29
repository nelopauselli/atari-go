import { computed } from 'vue';
import { findTeam, loadTeams } from '../services/teams.js';

// Escudo del equipo; si el equipo no tiene escudo cargado muestra un punto con su color.
export default {
  name: 'TeamShield',
  props: {
    team: { type: String, default: '' }, // id del equipo
    name: { type: String, default: '' }, // nombre, como alternativa al id
    color: { type: String, default: '' },
    size: { type: Number, default: 16 },
  },
  setup(props) {
    loadTeams().catch(() => {});
    const info = computed(() => findTeam(props.team, props.name));
    const shield = computed(() => info.value && info.value.shield);
    const dotColor = computed(() => props.color || (info.value && info.value.color) || 'transparent');
    const dotSize = computed(() => Math.max(8, Math.round(props.size * 0.6)));
    const title = computed(() => props.name || (info.value && info.value.name) || '');
    return { shield, dotColor, dotSize, title };
  },
  template: `
    <img v-if="shield" :src="shield" :alt="title" :title="title" class="team-shield"
      :style="{ width: size + 'px', height: size + 'px' }" />
    <span v-else class="rounded-circle d-inline-block flex-shrink-0" :title="title"
      :style="{ background: dotColor, width: dotSize + 'px', height: dotSize + 'px' }"></span>
  `,
};
