const COLS = 'abcdefghijklmnopqrstuvwxyz';

function coordToSgf(x, y) {
  return `${COLS[x]}${COLS[y]}`;
}

/**
 * Genera el contenido SGF de una partida finalizada (documento Match de Mongo).
 */
function matchToSgf(match) {
  const black = match.players.find((p) => p.color === 'black');
  const white = match.players.find((p) => p.color === 'white');

  const header = [
    'GM[1]', 'FF[4]', 'CA[UTF-8]',
    `SZ[${match.boardSize}]`,
    `GN[${escapeSgf(match.roomName)} - Tablero ${match.boardNumber}]`,
    black ? `PB[${escapeSgf(black.nickname)}]` : '',
    white ? `PW[${escapeSgf(white.nickname)}]` : '',
    `RU[Atari-Go, captura ${match.stonesToWin} piedra(s) para ganar]`,
    match.result && match.result.winnerColor
      ? `RE[${match.result.winnerColor === 'black' ? 'B' : 'W'}+${match.result.reason || ''}]`
      : '',
    match.startedAt ? `DT[${new Date(match.startedAt).toISOString().slice(0, 10)}]` : '',
  ].filter(Boolean).join('');

  const moves = match.moves.map((m) => {
    const tag = m.color === 'black' ? 'B' : 'W';
    if (m.pass || m.x === null || m.y === null) return `;${tag}[]`;
    return `;${tag}[${coordToSgf(m.x, m.y)}]`;
  }).join('');

  return `(;${header}${moves})`;
}

function escapeSgf(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

module.exports = { matchToSgf };
