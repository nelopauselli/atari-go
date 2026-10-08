export const CLOCK_LABELS = {
  'fischer-1-3': 'Fischer 1m + 3s',
  'fischer-3-5': 'Fischer 3m + 5s',
  'fischer-5-10': 'Fischer 5m + 10s',
  'fischer-10-20': 'Fischer 10m + 20s',
};

// Detalle legible de cada reloj (tiempo base e incremento Fischer por jugada).
export const CLOCK_PRESETS = {
  'fischer-1-3': { base: '1 minuto', increment: '3 segundos' },
  'fischer-3-5': { base: '3 minutos', increment: '5 segundos' },
  'fischer-5-10': { base: '5 minutos', increment: '10 segundos' },
  'fischer-10-20': { base: '10 minutos', increment: '20 segundos' },
};
