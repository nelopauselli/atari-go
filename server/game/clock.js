'use strict';

/**
 * Definición de los tipos de reloj soportados.
 * mainMs: tiempo principal en milisegundos
 * incrementMs: incremento tipo fischer (0 para reloj absoluto)
 */
const CLOCK_PRESETS = {
  fischer_5_3: { mainMs: 5 * 60 * 1000, incrementMs: 3 * 1000, label: 'Fischer 5m +3s' },
  fischer_10_5: { mainMs: 10 * 60 * 1000, incrementMs: 5 * 1000, label: 'Fischer 10m +5s' },
  absolute_10: { mainMs: 10 * 60 * 1000, incrementMs: 0, label: 'Absoluto 10m' },
};

function getPreset(clockType) {
  const preset = CLOCK_PRESETS[clockType];
  if (!preset) throw new Error(`Tipo de reloj desconocido: ${clockType}`);
  return preset;
}

function initialRemainingMs(clockType) {
  return getPreset(clockType).mainMs;
}

function applyIncrement(clockType, remainingMs) {
  const { incrementMs } = getPreset(clockType);
  return remainingMs + incrementMs;
}

module.exports = { CLOCK_PRESETS, getPreset, initialRemainingMs, applyIncrement };
