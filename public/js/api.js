const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let body = {};
    try { body = await res.json(); } catch (_) { /* respuesta sin json */ }
    throw new Error(body.error || `Error HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listRooms: () => request('/rooms'),
  getRoom: (id) => request(`/rooms/${id}`),
  createRoom: (payload) => request('/rooms', { method: 'POST', body: JSON.stringify(payload) }),
  clockPresets: () => request('/rooms/clock-presets'),

  activeMatches: () => request('/matches/active'),
  history: (page = 1) => request(`/matches/history?page=${page}`),
  getMatch: (id) => request(`/matches/${id}`),
};
