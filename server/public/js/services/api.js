async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de red');
  return data;
}

export const api = {
  getTeams: () => request('/teams'),
  login: (nickname, teamId) => request('/players/login', {
    method: 'POST',
    body: JSON.stringify({ nickname, teamId }),
  }),
  getRooms: () => request('/rooms'),
  createRoom: (payload) => request('/rooms', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  getRoom: (roomId) => request(`/rooms/${roomId}`),
  getGlobalHistory: () => request('/history/global'),
  getRoomHistory: (roomId) => request(`/history/room/${roomId}`),
  sgfDownloadUrl: (matchId) => `/api/history/${matchId}/sgf`,
};
