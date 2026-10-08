async function request(path, options = {}) {
  const res = await fetch(`api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de red');
  return data;
}

export const api = {
  getEntities: () => request('/entities'),
  getMeta: (entity) => request(`/entities/${entity}/meta`),
  getList: (entity) => request(`/entities/${entity}`),
  create: (entity, payload) => request(`/entities/${entity}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  update: (entity, id, payload) => request(`/entities/${entity}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }),
  exportAll: (entity) => request(`/entities/${entity}/export`),
  importAll: (entity, payload) => request(`/entities/${entity}/import`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  remove: (entity, id) => request(`/entities/${entity}/${id}`, { method: 'DELETE' }),
};
