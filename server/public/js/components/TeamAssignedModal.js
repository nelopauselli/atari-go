import { onMounted, onUnmounted } from 'vue';
import TeamShield from './TeamShield.js';

// Aviso al jugador del equipo que se le asignó al entrar a una sala torneo.
export default {
  name: 'TeamAssignedModal',
  components: { TeamShield },
  props: { team: { type: Object, required: true } },
  emits: ['close'],
  setup(props, { emit }) {
    function onKey(e) { if (e.key === 'Escape') emit('close'); }
    onMounted(() => document.addEventListener('keydown', onKey));
    onUnmounted(() => document.removeEventListener('keydown', onKey));
  },
  template: `
    <div class="modal d-block" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="team-modal-title" @click.self="$emit('close')">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="team-modal-title">Te asignamos un equipo</h5>
            <button type="button" class="btn-close" aria-label="Cerrar" @click="$emit('close')"></button>
          </div>
          <div class="modal-body text-center">
            <p class="mb-3">En esta sala vas a jugar para el equipo:</p>
            <div class="d-flex flex-column align-items-center gap-2 mb-3">
              <TeamShield :team="team._id" :name="team.name" :size="72" />
              <strong class="fs-4">{{ team.name }}</strong>
            </div>
            <p class="text-muted small mb-0">Cada partida que ganes suma una victoria para tu equipo.</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary" @click="$emit('close')">¡Vamos!</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop show"></div>
  `,
};
