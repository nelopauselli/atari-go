// Registro de usuarios conectados: socketId -> jugador identificado.
const sockets = new Map();

function identify(socketId, player) {
  if (player && player.id && player.nickname) {
    sockets.set(socketId, {
      id: String(player.id),
      nickname: player.nickname,
      teamName: player.teamName || '',
      teamColor: player.teamColor || '',
    });
  } else {
    sockets.delete(socketId);
  }
}

function remove(socketId) {
  sockets.delete(socketId);
}

// Un jugador con varias pestañas/sockets se cuenta una sola vez.
function listOnline() {
  const byId = new Map();
  for (const p of sockets.values()) byId.set(p.id, p);
  return [...byId.values()].sort((a, b) => a.nickname.localeCompare(b.nickname));
}

module.exports = { identify, remove, listOnline };
