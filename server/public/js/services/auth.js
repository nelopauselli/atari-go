const STORAGE_KEY = 'atarigo_player';

export function getPlayer() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const player = JSON.parse(raw);
    // Sesiones previas a las instituciones: obligan a volver a ingresar.
    return player && (player.institution || player.guest) ? player : null;
  } catch {
    return null;
  }
}

export function setPlayer(player) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(player));
}

// Invitado: ingresa sin autenticarse y sin id; solo puede observar partidas.
export function setGuest() {
  setPlayer({ guest: true, nickname: 'Invitado' });
}

export function isGuest(player = getPlayer()) {
  return !!player && player.guest === true;
}

export function clearPlayer() {
  localStorage.removeItem(STORAGE_KEY);
}
