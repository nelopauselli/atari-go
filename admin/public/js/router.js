import { reactive } from 'vue';

// Ruta soportada: #/:entity (ej: #/teams, #/players)
export const route = reactive({ entity: '' });

function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  route.entity = hash || '';
}

export function navigate(entity) {
  window.location.hash = `/${entity}`;
}

window.addEventListener('hashchange', parseHash);
parseHash();
