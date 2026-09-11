import { reactive } from 'vue';

// Rutas soportadas: #/login, #/home, #/room/:id
export const route = reactive({ name: 'login', params: {} });

function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = hash.split('/').filter(Boolean);

  if (!name || name === 'login') {
    route.name = 'login';
    route.params = {};
  } else if (name === 'home') {
    route.name = 'home';
    route.params = {};
  } else if (name === 'room' && rest[0]) {
    route.name = 'room';
    route.params = { roomId: rest[0] };
  } else {
    route.name = 'home';
    route.params = {};
  }
}

export function navigate(path) {
  window.location.hash = path;
}

window.addEventListener('hashchange', parseHash);
parseHash();
