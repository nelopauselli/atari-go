export const CLOCK_LABELS = {
  fischer_10_5: 'Fischer 10m + 5s',
  fischer_5_3: 'Fischer 5m + 3s',
  absolute_10: 'Absoluto 10m',
};

export function clockLabel(key) {
  return CLOCK_LABELS[key] || key;
}

export function formatMs(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'recién';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export function winReasonLabel(reason) {
  return {
    capturas: 'por capturas',
    tiempo: 'por tiempo',
    renuncia: 'por renuncia',
    doble_pase: 'por doble pase',
  }[reason] || '';
}
