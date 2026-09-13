const STORAGE_KEY = 'atarigo_theme';

function apply(theme) {
  document.documentElement.setAttribute('data-bs-theme', theme);
}

export function getTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  apply(theme);
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

apply(getTheme());
