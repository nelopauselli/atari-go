import { computed, onMounted, ref } from 'vue';
import { CLOCK_LABELS, CLOCK_PRESETS } from '../services/clocks.js';

// Aviso al ingresar a una sala: configuración del reloj y piedras a capturar para ganar.
// Solo se cierra con el botón Aceptar, para asegurarse de que se lea.
export default {
  name: 'RoomSettingsModal',
  props: { room: { type: Object, required: true } },
  emits: ['close'],
  setup(props) {
    const clock = computed(() => CLOCK_PRESETS[props.room.clockType] || null);
    const clockLabel = computed(() => CLOCK_LABELS[props.room.clockType] || props.room.clockType);
    const stonesLabel = computed(() => (props.room.stonesToWin === 1 ? 'piedra' : 'piedras'));
    const acceptBtn = ref(null);
    onMounted(() => acceptBtn.value && acceptBtn.value.focus());
    return { clock, clockLabel, stonesLabel, acceptBtn };
  },
  template: `
    <div class="modal d-block" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="room-settings-modal-title">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="room-settings-modal-title">Configuración de la sala · {{ room.name }}</h5>
          </div>
          <div class="modal-body text-center">
            <p class="text-muted mb-3">Antes de jugar, tené en cuenta:</p>
            <div class="row g-3">
              <div class="col-12 col-sm-6">
                <div class="border rounded p-3 h-100">
                  <div class="text-muted small text-uppercase mb-1">Para ganar</div>
                  <div class="display-5 fw-bold lh-1">{{ room.stonesToWin }}</div>
                  <div class="fs-5">{{ stonesLabel }} capturada{{ room.stonesToWin === 1 ? '' : 's' }}</div>
                </div>
              </div>
              <div class="col-12 col-sm-6">
                <div class="border rounded p-3 h-100">
                  <div class="text-muted small text-uppercase mb-1">Reloj</div>
                  <template v-if="clock">
                    <div class="fs-4 fw-bold">{{ clock.base }}</div>
                    <div class="fs-5">+{{ clock.increment }} por jugada</div>
                  </template>
                  <div v-else class="fs-4 fw-bold">{{ clockLabel }}</div>
                </div>
              </div>
            </div>
            <p class="text-muted small mt-3 mb-0">Si se te agota el tiempo, perdés la partida.</p>
          </div>
          <div class="modal-footer">
            <button ref="acceptBtn" type="button" class="btn btn-primary" @click="$emit('close')">Aceptar</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop show"></div>
  `,
};
