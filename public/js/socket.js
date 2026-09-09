import { io } from 'socket.io-client';

export const socket = io({ autoConnect: true });

const NAME_KEY = 'atari-go:playerName';

export function getPlayerName() {
  return localStorage.getItem(NAME_KEY) || '';
}

export function setPlayerName(name) {
  localStorage.setItem(NAME_KEY, name);
}

/** Pide (con un prompt simple) un nombre de jugador si todavía no hay uno guardado. */
export function ensurePlayerName() {
  let name = getPlayerName();
  if (!name) {
    name = (window.prompt('¿Cómo te llamás?', '') || 'Jugador').trim().slice(0, 30) || 'Jugador';
    setPlayerName(name);
  }
  return name;
}
