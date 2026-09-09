'use strict';

/**
 * Tipos de reloj soportados. Los valores están en milisegundos para
 * evitar errores de conversión al usarlos en el servidor.
 */
const CLOCK_PRESETS = {
  fischer_10_5: { label: 'Fischer 10m + 5s', type: 'fischer', baseMs: 10 * 60 * 1000, incrementMs: 5 * 1000 },
  fischer_5_3: { label: 'Fischer 5m + 3s', type: 'fischer', baseMs: 5 * 60 * 1000, incrementMs: 3 * 1000 },
  absolute_10: { label: 'Absoluto 10m', type: 'absolute', baseMs: 10 * 60 * 1000, incrementMs: 0 },
};

function isValidClockPreset(key) {
  return Object.prototype.hasOwnProperty.call(CLOCK_PRESETS, key);
}

/**
 * Crea el estado inicial de reloj para una partida, con tiempo
 * independiente para negro y blanco.
 */
function createClockState(presetKey) {
  const preset = CLOCK_PRESETS[presetKey];
  if (!preset) throw new Error(`Preset de reloj desconocido: ${presetKey}`);
  return {
    presetKey,
    type: preset.type,
    incrementMs: preset.incrementMs,
    black: { remainingMs: preset.baseMs },
    white: { remainingMs: preset.baseMs },
    turnStartedAt: null, // epoch ms en que empezó a correr el reloj del que tiene el turno
    turnColor: 1, // BLACK empieza siempre
  };
}

/**
 * Devuelve una copia del estado de reloj con el tiempo restante actualizado
 * a "ahora" para el jugador en turno, sin descontar todavía (para mostrar
 * al cliente). No muta el estado original.
 */
function projectClockNow(clockState, nowMs = Date.now()) {
  const state = JSON.parse(JSON.stringify(clockState));
  if (state.turnStartedAt == null) return state;
  const elapsed = Math.max(0, nowMs - state.turnStartedAt);
  const key = state.turnColor === 1 ? 'black' : 'white';
  state[key].remainingMs = Math.max(0, clockState[key].remainingMs - elapsed);
  return state;
}

/**
 * Se llama cuando el jugador en turno completa su jugada (mueve o pasa).
 * Descuenta el tiempo transcurrido, suma el incremento (si es fischer) y
 * pasa el turno al rival. Muta y devuelve el mismo objeto para simplicidad
 * de uso en el servidor (el estado se guarda aparte en Mongo tras cada jugada).
 */
function applyMoveToClock(clockState, nowMs = Date.now()) {
  const key = clockState.turnColor === 1 ? 'black' : 'white';
  if (clockState.turnStartedAt != null) {
    const elapsed = Math.max(0, nowMs - clockState.turnStartedAt);
    clockState[key].remainingMs = Math.max(0, clockState[key].remainingMs - elapsed);
  }
  if (clockState.type === 'fischer') {
    clockState[key].remainingMs += clockState.incrementMs;
  }
  clockState.turnColor = clockState.turnColor === 1 ? 2 : 1;
  clockState.turnStartedAt = nowMs;
  return clockState;
}

/**
 * Chequea si, proyectando el reloj a "ahora", algún jugador se quedó sin
 * tiempo. Devuelve el color perdedor (1 o 2) o null.
 */
function checkFlagFall(clockState, nowMs = Date.now()) {
  const projected = projectClockNow(clockState, nowMs);
  if (projected.black.remainingMs <= 0) return 1;
  if (projected.white.remainingMs <= 0) return 2;
  return null;
}

module.exports = {
  CLOCK_PRESETS,
  isValidClockPreset,
  createClockState,
  projectClockNow,
  applyMoveToClock,
  checkFlagFall,
};
