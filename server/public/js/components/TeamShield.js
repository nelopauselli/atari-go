import { computed } from 'vue';
import { findTeam } from '../services/teams.js';

// Avatar del equipo; si el equipo no tiene avatar cargado muestra un círculo con su inicial.
export default {
  name: 'TeamShield',
  props: {
    team: { type: String, default: '' }, // id del equipo
    name: { type: String, default: '' }, // nombre, como alternativa al id
    size: { type: Number, default: 16 },
  },
  setup(props) {
    const info = computed(() => findTeam(props.team, props.name));
    const avatar = computed(() => info.value && info.value.avatar);
    const title = computed(() => props.name || (info.value && info.value.name) || '');
    const initial = computed(() => title.value.trim().charAt(0).toUpperCase());
    return { avatar, title, initial };
  },
  template: `
    <img v-if="avatar" :src="avatar" :alt="title" :title="title" class="team-shield"
      :style="{ width: size + 'px', height: size + 'px' }" />
    <span v-else class="rounded-circle d-inline-flex align-items-center justify-content-center flex-shrink-0 text-bg-secondary fw-semibold" :title="title"
      :style="{ width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.5) + 'px' }">{{ initial }}</span>
  `,
};
