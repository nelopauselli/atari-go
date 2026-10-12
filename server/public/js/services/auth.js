const STORAGE_KEY = 'atarigo_player';
// La sesión vence a las 12 horas de iniciada: al volver otro día hay que ingresar de nuevo.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function getPlayer() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const player = JSON.parse(raw);
    // Sesiones previas a las instituciones: obligan a volver a ingresar.
    if (!player || !(player.institution || player.guest)) return null;
    // Sesiones vencidas o sin fecha de ingreso (anteriores al vencimiento): se descartan.
    if (!(Date.now() - player.loggedInAt < SESSION_TTL_MS)) {
      clearPlayer();
      return null;
    }
    return player;
  } catch {
    return null;
  }
}

export function setPlayer(player) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...player, loggedInAt: Date.now() }));
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
