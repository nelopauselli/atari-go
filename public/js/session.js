const STORAGE_KEY = 'atarigo_session';

export function saveSession({ nickname, dojoId }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nickname, dojoId }));
  } catch (err) {
    // localStorage no disponible (modo privado, etc.) — se ignora silenciosamente
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    // no-op
  }
}
