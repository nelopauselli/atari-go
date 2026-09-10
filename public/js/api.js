const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getDojos: () => request('/dojos'),
  getRooms: () => request('/rooms'),
  getRoom: (id) => request(`/rooms/${id}`),
  createRoom: (payload) => request('/rooms', { method: 'POST', body: JSON.stringify(payload) }),
  getHistory: () => request('/history'),
};
