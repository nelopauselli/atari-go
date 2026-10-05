import { computed, onMounted, onUnmounted } from 'vue';

const CLOCK_PRESETS = {
  'fischer-3-5': { base: '3 minutos', increment: '5 segundos' },
  'fischer-5-5': { base: '5 minutos', increment: '5 segundos' },
  'fischer-10-5': { base: '10 minutos', increment: '5 segundos' },
};

export default {
  name: 'RulesModal',
  props: { room: { type: Object, required: true } },
  emits: ['close'],
  setup(props, { emit }) {
    const clock = computed(() => CLOCK_PRESETS[props.room.clockType] || null);
    const koEnabled = computed(() => props.room.koRuleEnabled !== false);
    const stonesLabel = computed(() => (props.room.stonesToWin === 1 ? '1 piedra' : `${props.room.stonesToWin} piedras`));

    function onKey(e) { if (e.key === 'Escape') emit('close'); }
    onMounted(() => document.addEventListener('keydown', onKey));
    onUnmounted(() => document.removeEventListener('keydown', onKey));

    return { clock, koEnabled, stonesLabel };
  },
  template: `
    <div class="modal d-block" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="rules-modal-title" @click.self="$emit('close')">
      <div class="modal-dialog modal-dialog-scrollable modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="rules-modal-title">Reglas de la sala · {{ room.name }}</h5>
            <button type="button" class="btn-close" aria-label="Cerrar" @click="$emit('close')"></button>
          </div>
          <div class="modal-body">
            <h6>Objetivo</h6>
            <p>Gana quien primero capture <strong>{{ stonesLabel }}</strong> del rival. Tambi&eacute;n se gana si el rival se rinde, se le agota el tiempo o se queda sin jugadas posibles.</p>

            <h6>Tablero y jugadas</h6>
            <ul>
              <li>Tablero de <strong>{{ room.boardSize }}x{{ room.boardSize }}</strong>.</li>
              <li>Juega primero negro ⚫ y los turnos se alternan.</li>
              <li>En cada turno se coloca una piedra en una intersecci&oacute;n vac&iacute;a. <strong>No se puede pasar.</strong></li>
            </ul>

            <h6>Libertades y capturas</h6>
            <ul>
              <li>Las libertades de una cadena son las intersecciones vac&iacute;as adyacentes (arriba, abajo, izquierda, derecha).</li>
              <li>Una cadena rival que queda sin libertades se captura completa y sus piedras suman para tu objetivo.</li>
            </ul>

            <h6>Autocaptura</h6>
            <p>No se puede jugar una piedra que deje a tu propia cadena sin libertades, salvo que esa jugada capture piedras rivales.</p>

            <h6>Regla de Ko</h6>
            <p v-if="koEnabled"><span class="badge text-bg-success me-1">Habilitada</span> No se puede jugar una piedra que repita la posici&oacute;n del tablero inmediatamente anterior a tu &uacute;ltima jugada.</p>
            <p v-else><span class="badge text-bg-secondary me-1">Deshabilitada</span> En esta sala no se aplica la restricci&oacute;n de Ko.</p>

            <h6>Reloj</h6>
            <p v-if="clock">Fischer: <strong>{{ clock.base }}</strong> de tiempo base, <strong>+{{ clock.increment }}</strong> por jugada. Si se te agota el tiempo, perd&eacute;s la partida.</p>
            <p v-else>Si se te agota el tiempo, perd&eacute;s la partida.</p>

            <h6>Fin de la partida</h6>
            <ul>
              <li><strong>Captura:</strong> alguien alcanza {{ stonesLabel }} capturada(s).</li>
              <li><strong>Rendici&oacute;n:</strong> una persona abandona; gana la otra.</li>
              <li><strong>Tiempo:</strong> a una persona se le agota el reloj; gana la otra.</li>
              <li><strong>Sin jugadas posibles:</strong> si a quien le toca no le queda ning&uacute;n lugar permitido<template v-if="koEnabled"> (por autocaptura o Ko)</template><template v-else> (por autocaptura)</template>, pierde.</li>
            </ul>

            <template v-if="room.type==='torneo'">
              <h6>Modo torneo</h6>
              <p>Al entrar a la sala se te asigna autom&aacute;ticamente un equipo, buscando que los equipos queden parejos y que los compa&ntilde;eros de una misma instituci&oacute;n queden repartidos.</p>
              <p>Dos jugadores del mismo equipo no pueden enfrentarse en un mismo tablero; quien intente sentarse en esa condici&oacute;n queda como espectador.</p>
              <p class="mb-0">Cada partida que gan&aacute;s suma una victoria al equipo para el que jug&aacute;s.</p>
            </template>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary" @click="$emit('close')">Entendido</button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop show"></div>
  `,
};
