const goEngine = require('./goEngine');
const { getClockPreset } = require('./matchManager');

// Finales sin jugada que los cierre: hay tiempo transcurrido después de la última jugada.
const END_FRAME_REASONS = ['timeout', 'resign', 'abandoned'];

/**
 * Reconstruye una partida jugada a jugada para el reproductor: una posición inicial vacía y
 * una más por cada jugada, con el tablero, las capturas acumuladas y los relojes Fischer
 * tal como quedaron. `at` son los ms transcurridos desde el inicio de la partida.
 * Si terminó sin una jugada final (tiempo, abandono, retiro) se agrega una posición de cierre
 * en el momento en que terminó, con el reloj de quien tenía el turno descontado.
 */
function buildReplayFrames(match) {
  const size = match.boardSize;
  const preset = getClockPreset(match.clockType);
  const start = match.startedAt ? new Date(match.startedAt).getTime() : null;

  let board = goEngine.createEmptyBoard(size);
  let capturedByBlack = 0;
  let capturedByWhite = 0;
  const clocks = { black: preset.baseMs, white: preset.baseMs };
  let prevTs = start;
  let at = 0;

  const frames = [{ moveNumber: 0, board, lastMove: null, color: null, captured: 0, capturedByBlack, capturedByWhite, clocks: { ...clocks }, turn: 'black', at }];

  for (const move of match.moves) {
    const ts = move.timestamp ? new Date(move.timestamp).getTime() : null;
    // Sin timestamps confiables (partidas viejas) se avanza de a 1 s para no romper la reproducción.
    const elapsed = ts != null && prevTs != null ? Math.max(0, ts - prevTs) : 1000;
    at += elapsed;
    if (ts != null) prevTs = ts;

    clocks[move.color] = Math.max(0, clocks[move.color] - elapsed) + preset.incrementMs;

    let captured = 0;
    let lastMove = null;
    if (!move.pass && move.x != null && move.y != null) {
      const result = goEngine.playMove(board, size, move.x, move.y, move.color);
      if (result.ok) {
        board = result.board;
        captured = result.captured;
      }
      lastMove = { x: move.x, y: move.y };
    }
    if (move.color === 'black') capturedByBlack += captured;
    else capturedByWhite += captured;

    frames.push({
      moveNumber: frames.length, board, lastMove, color: move.color, captured, capturedByBlack, capturedByWhite,
      clocks: { ...clocks }, turn: move.color === 'black' ? 'white' : 'black', at,
    });
  }

  const end = match.endedAt && start != null ? new Date(match.endedAt).getTime() - start : null;
  const final = frames[frames.length - 1];
  if (END_FRAME_REASONS.includes(match.result && match.result.reason) && end > final.at) {
    const spent = end - final.at;
    frames.push({
      ...final, color: null, captured: 0, at: end,
      clocks: { ...final.clocks, [final.turn]: Math.max(0, final.clocks[final.turn] - spent) },
    });
  }

  return frames;
}

module.exports = { buildReplayFrames };
