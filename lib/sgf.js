const { TIME_CONTROLS } = require('./clock');

function sgfCoord(x, y) {
  return String.fromCharCode(97 + x) + String.fromCharCode(97 + y);
}

// data: { salaCode, partidaNumber, size, captureTarget, moveHistory,
//         captures, winner, winReason, gameOver, timeControlId, createdAt }
// Sirve tanto para una room en memoria como para un documento leído de Mongo.
function buildSgf(data) {
  const dateStr = (data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt)).toISOString().slice(0, 10);

  function resultSuffix(color) {
    if (data.winReason === 'resign') return 'R';
    if (data.winReason === 'timeout') return 'T';
    return String(data.captures[color]);
  }

  let resultTag = '';
  if (data.winner === 'black') resultTag = `RE[B+${resultSuffix('black')}]`;
  else if (data.winner === 'white') resultTag = `RE[W+${resultSuffix('white')}]`;
  else if (data.gameOver) resultTag = 'RE[Void]';

  const tc = TIME_CONTROLS[data.timeControlId];
  const timeTags = tc
    ? [`TM[${tc.initialSeconds}]`, tc.type === 'fischer' ? `OT[Fischer +${tc.incrementSeconds}s por jugada]` : '']
    : [];

  const header = [
    'FF[4]', 'GM[1]', `SZ[${data.size}]`,
    'PB[Negro]', 'PW[Blanco]',
    `GN[Atari-Go online - sala ${data.salaCode} - partida ${data.partidaNumber}]`,
    `RU[Atari-Go: gana quien capture ${data.captureTarget} piedra(s)]`,
    `DT[${dateStr}]`,
    'AP[AtariGoOnline:1.0]',
    ...timeTags,
    resultTag,
  ].filter(Boolean).join('');

  const moves = data.moveHistory
    .map(m => `;${m.color === 'black' ? 'B' : 'W'}[${sgfCoord(m.x, m.y)}]`)
    .join('');

  return `(;${header}${moves})`;
}

module.exports = { sgfCoord, buildSgf };
