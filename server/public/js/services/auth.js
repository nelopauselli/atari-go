const STORAGE_KEY = 'atarigo_player';

export function getPlayer() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const player = JSON.parse(raw);
    // Sesiones previas a las instituciones: obligan a volver a ingresar.
    return player && player.institution ? player : null;
  } catch {
    return null;
  }
}

export function setPlayer(player) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(player));
}

export function clearPlayer() {
  localStorage.removeItem(STORAGE_KEY);
}
