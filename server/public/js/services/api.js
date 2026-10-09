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
  getInstitutions: () => request('/institutions'),
  login: ({ institutionId, nickname, password }) => request('/players/login', {
    method: 'POST',
    body: JSON.stringify({ institutionId, nickname, password }),
  }),
  getOnlinePlayers: () => request('/players/online'),
  getRooms: () => request('/rooms'),
  getClosedRooms: () => request('/rooms/closed'),
  getRoom: (roomId) => request(`/rooms/${roomId}`),
  getRoomHistory: (roomId) => request(`/history/room/${roomId}`),
  getMatchReplay: (matchId) => request(`/history/${matchId}/replay`),
  sgfDownloadUrl: (matchId) => `/api/history/${matchId}/sgf`,
};
