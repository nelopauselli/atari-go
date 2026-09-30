/**
 * Reglas del juego Atari-Go (RULES.md): libertades, capturas, autocaptura, Ko,
 * turnos, reloj Fischer y condiciones de fin de partida.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  START_TIME, makeRoomDoc, makePlayer, setup, flush, startMatch, getBoard, boardFromRows, rowsFromBoard,
} = require('./helpers');
const goEngine = require('../server/services/goEngine');
const matchManager = require('../server/services/matchManager');

describe('motor de Go', () => {
  describe('tablero y libertades', () => {
    it('crea un tablero vacío de size*size', () => {
      const board = goEngine.createEmptyBoard(9);
      assert.equal(board.length, 81);
      assert.ok(board.every((c) => c === null));
    });

    it('una piedra en el centro tiene 4 libertades, en el borde 3 y en la esquina 2', () => {
      const board = boardFromRows([
        'B..B...',
        '.......',
        '.......',
        '...B...',
        '.......',
        '.......',
        '.......',
      ]);
      assert.equal(goEngine.getGroup(board, 7, 3, 3).liberties.size, 4);
      assert.equal(goEngine.getGroup(board, 7, 3, 0).liberties.size, 3);
      assert.equal(goEngine.getGroup(board, 7, 0, 0).liberties.size, 2);
    });

    it('las piedras conectadas ortogonalmente forman una cadena con libertades compartidas', () => {
      const board = boardFromRows([
        '.......',
        '.BB....',
        '..B....',
        '.......',
        '.......',
        '.......',
        '.......',
      ]);
      const group = goEngine.getGroup(board, 7, 1, 1);
      assert.equal(group.stones.size, 3);
      assert.equal(group.liberties.size, 7);
    });

    it('las piedras en diagonal no forman cadena', () => {
      const board = boardFromRows([
        'B......',
        '.B.....',
        '.......',
        '.......',
        '.......',
        '.......',
        '.......',
      ]);
      assert.equal(goEngine.getGroup(board, 7, 0, 0).stones.size, 1);
    });

    it('una intersección vacía no tiene cadena', () => {
      const group = goEngine.getGroup(goEngine.createEmptyBoard(7), 7, 2, 2);
      assert.equal(group.color, null);
      assert.equal(group.stones.size, 0);
    });
  });

  describe('jugadas', () => {
    it('coloca la piedra sin mutar el tablero de entrada', () => {
      const board = goEngine.createEmptyBoard(7);
      const result = goEngine.playMove(board, 7, 2, 3, 'black');
      assert.equal(result.ok, true);
      assert.equal(result.board[goEngine.idx(7, 2, 3)], 'black');
      assert.equal(result.captured, 0);
      assert.ok(board.every((c) => c === null));
    });

    it('rechaza jugadas fuera del tablero', () => {
      const board = goEngine.createEmptyBoard(7);
      for (const [x, y] of [[-1, 0], [0, -1], [7, 0], [0, 7]]) {
        assert.deepEqual(goEngine.playMove(board, 7, x, y, 'black'), { ok: false, error: 'Fuera del tablero' });
      }
    });

    it('rechaza jugar sobre una intersección ocupada', () => {
      const board = goEngine.playMove(goEngine.createEmptyBoard(7), 7, 3, 3, 'black').board;
      assert.deepEqual(goEngine.playMove(board, 7, 3, 3, 'white'), { ok: false, error: 'Casilla ocupada' });
    });
  });

  describe('capturas', () => {
    it('captura una piedra en la esquina al quitarle la última libertad', () => {
      const board = boardFromRows([
        'WB.....',
        '.......',
        '.......',
        '.......',
        '.......',
        '.......',
        '.......',
      ]);
      const result = goEngine.playMove(board, 7, 0, 1, 'black');
      assert.equal(result.ok, true);
      assert.equal(result.captured, 1);
      assert.deepEqual(result.capturedStones, [[0, 0]]);
      assert.equal(result.board[goEngine.idx(7, 0, 0)], null);
    });

    it('captura la cadena completa', () => {
      const board = boardFromRows([
        '.BB....',
        'BWWB...',
        '.B.....',
        '.......',
        '.......',
        '.......',
        '.......',
      ]);
      const result = goEngine.playMove(board, 7, 2, 2, 'black');
      assert.equal(result.captured, 2);
      assert.deepEqual(rowsFromBoard(result.board, 7).slice(0, 3), ['.BB....', 'B..B...', '.BB....']);
    });

    it('captura varias cadenas rivales con una misma jugada', () => {
      const board = boardFromRows([
        'W.WB...',
        'B.B....',
        '.......',
        '.......',
        '.......',
        '.......',
        '.......',
      ]);
      const result = goEngine.playMove(board, 7, 1, 0, 'black');
      assert.equal(result.captured, 2);
      assert.equal(result.board[goEngine.idx(7, 0, 0)], null);
      assert.equal(result.board[goEngine.idx(7, 2, 0)], null);
    });

    it('no captura cadenas rivales que conservan alguna libertad', () => {
      const board = boardFromRows([
        '.......',
        '.BW....',
        '.......',
        '.......',
        '.......',
        '.......',
        '.......',
      ]);
      const result = goEngine.playMove(board, 7, 2, 0, 'black');
      assert.equal(result.captured, 0);
      assert.equal(result.board[goEngine.idx(7, 2, 1)], 'white');
    });
  });

  describe('autocaptura', () => {
    it('no permite jugar donde la propia cadena queda sin libertades', () => {
      const board = boardFromRows([
        '.W.....',
        'W......',
        '.......',
        '.......',
        '.......',
        '.......',
        '.......',
      ]);
      assert.deepEqual(goEngine.playMove(board, 7, 0, 0, 'black'), { ok: false, error: 'Autocaptura no permitida' });
    });

    it('no permite quitarle la última libertad a una cadena propia', () => {
      const board = boardFromRows([
        'B.W....',
        'BW.....',
        'W......',
        '.......',
        '.......',
        '.......',
        '.......',
      ]);
      assert.equal(goEngine.playMove(board, 7, 1, 0, 'black').ok, false);
    });

    it('sí permite la jugada si captura al menos una cadena rival', () => {
      const board = boardFromRows([
        '.WB....',
        'WB.....',
        'B......',
        '.......',
        '.......',
        '.......',
        '.......',
      ]);
      // Negro en (0,0) no tiene libertades propias, pero captura a las blancas (1,0) y (0,1).
      const result = goEngine.playMove(board, 7, 0, 0, 'black');
      assert.equal(result.ok, true);
      assert.equal(result.captured, 2);
    });
  });

  describe('Ko', () => {
    // Negro juega en (2,1) y captura (1,1); si blanco recaptura en (1,1) repite la posición anterior.
    const koRows = [
      '.BW....',
      'BW.W...',
      '.BW....',
      '.......',
      '.......',
      '.......',
      '.......',
    ];

    it('detecta la repetición de la posición previa a la última jugada propia', () => {
      const before = boardFromRows(koRows);
      const afterBlack = goEngine.playMove(before, 7, 2, 1, 'black');
      assert.equal(afterBlack.captured, 1);

      const recapture = goEngine.playMove(afterBlack.board, 7, 1, 1, 'white');
      assert.equal(recapture.ok, true);
      assert.equal(recapture.captured, 1);
      assert.equal(goEngine.violatesSimpleKo(goEngine.boardKey(recapture.board), goEngine.boardKey(before)), true);
    });

    it('sin posición previa no hay Ko', () => {
      assert.equal(goEngine.violatesSimpleKo(goEngine.boardKey(goEngine.createEmptyBoard(7)), null), false);
    });

    it('boardKey codifica cada intersección', () => {
      assert.equal(goEngine.boardKey([null, 'black', 'white', null]), '.BW.');
    });
  });

  describe('jugadas posibles', () => {
    // Todo negro menos dos "ojos": blanco no puede jugar en ninguno (autocaptura sin captura).
    const twoEyes = boardFromRows([
      '.BBBBBB',
      'BBBBBBB',
      'BBBBBBB',
      'BBBBBBB',
      'BBBBBBB',
      'BBBBBBB',
      'BBBBBB.',
    ]);

    it('detecta cuando no queda ningún lugar permitido', () => {
      assert.equal(goEngine.hasLegalMove(twoEyes, 7, 'white', null, true), false);
      assert.equal(goEngine.hasLegalMove(twoEyes, 7, 'black', null, true), true);
    });

    it('con Ko habilitado, la única jugada que repite la posición no cuenta como posible', () => {
      // Negro captura en (3,3). A blanco solo le queda recapturar en (2,3) (Ko): (0,0) y (6,6)
      // son ojos negros y (5,3) es la última libertad de su propia cadena.
      const before = boardFromRows([
        '.BBBBBB',
        'BBBBBBB',
        'BBBWWBB',
        'BBW.W.B',
        'BBBWWBB',
        'BBBBBBB',
        'BBBBBB.',
      ]);
      const afterBlack = goEngine.playMove(before, 7, 3, 3, 'black');
      assert.equal(afterBlack.captured, 1);
      const prevKey = goEngine.boardKey(before);
      assert.equal(goEngine.hasLegalMove(afterBlack.board, 7, 'white', prevKey, true), false);
      assert.equal(goEngine.hasLegalMove(afterBlack.board, 7, 'white', prevKey, false), true);
    });
  });
});

describe('partida de Atari-Go', () => {
  function playMoves(roomId, players, moves, firstColor = 'black') {
    let color = firstColor;
    for (const [x, y] of moves) {
      const result = matchManager.handleMove({ roomId, boardNumber: 1, playerId: players[color].id, x, y });
      assert.deepEqual(result, { ok: true }, `jugada ${color} (${x},${y})`);
      color = color === 'black' ? 'white' : 'black';
    }
  }

  // Secuencia que arma el Ko de arriba: al final negro captura en (2,1) y le toca a blanco.
  const koSetup = [[1, 0], [2, 0], [0, 1], [3, 1], [1, 2], [2, 2], [6, 6], [1, 1], [2, 1]];

  describe('turnos', () => {
    it('empieza negro y los turnos se alternan', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc());
      const players = startMatch(roomId);

      assert.equal(getBoard(roomId).game.turn, 'black');
      assert.deepEqual(matchManager.handleMove({ roomId, boardNumber: 1, playerId: players.white.id, x: 0, y: 0 }),
        { ok: false, error: 'No es tu turno' });
      playMoves(roomId, players, [[0, 0]]);
      assert.equal(getBoard(roomId).game.turn, 'white');
      assert.deepEqual(matchManager.handleMove({ roomId, boardNumber: 1, playerId: players.black.id, x: 1, y: 1 }),
        { ok: false, error: 'No es tu turno' });
      playMoves(roomId, players, [[1, 1]], 'white');
      assert.equal(getBoard(roomId).game.turn, 'black');
    });

    it('no se puede jugar si la partida no empezó', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc());
      const black = makePlayer('Negro');
      matchManager.handleSit({ roomId, boardNumber: 1, player: black, socketId: 's1' });
      assert.deepEqual(matchManager.handleMove({ roomId, boardNumber: 1, playerId: black.id, x: 0, y: 0 }),
        { ok: false, error: 'La partida no está en curso' });
    });

    it('solo juegan los participantes de la partida', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc());
      startMatch(roomId);
      assert.deepEqual(matchManager.handleMove({ roomId, boardNumber: 1, playerId: 'intruso', x: 0, y: 0 }),
        { ok: false, error: 'No participás de esta partida' });
    });

    it('rechaza coordenadas no enteras y jugadas ilegales sin cambiar el turno', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc());
      const players = startMatch(roomId);
      const move = (x, y) => matchManager.handleMove({ roomId, boardNumber: 1, playerId: players.black.id, x, y });

      assert.deepEqual(move(1.5, 0), { ok: false, error: 'Jugada inválida' });
      assert.deepEqual(move('1', 0), { ok: false, error: 'Jugada inválida' });
      assert.deepEqual(move(7, 0), { ok: false, error: 'Fuera del tablero' });
      assert.equal(getBoard(roomId).game.turn, 'black');
      assert.equal(getBoard(roomId).game.moves.length, 0);
    });

    it('registra cada jugada y la última jugada, y la emite a la sala', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc());
      const players = startMatch(roomId);
      playMoves(roomId, players, [[3, 3], [4, 4]]);

      const g = getBoard(roomId).game;
      assert.deepEqual(g.moves.map((m) => [m.color, m.x, m.y, m.pass]),
        [['black', 3, 3, false], ['white', 4, 4, false]]);
      assert.deepEqual(g.lastMove, { x: 4, y: 4 });
      const states = env.events.filter((e) => e.event === 'board:state');
      assert.equal(states.length, 2);
      assert.equal(states[1].payload.moveCount, 2);
    });
  });

  describe('fin por captura', () => {
    it('gana quien alcanza la cantidad de piedras capturadas de la sala', async (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc({ stonesToWin: 1 }));
      const players = startMatch(roomId);
      await flush();

      playMoves(roomId, players, [[1, 0], [0, 0], [0, 1]]);
      const board = getBoard(roomId);
      assert.equal(board.status, 'finished');
      assert.equal(board.game.capturedByBlack, 1);
      assert.deepEqual({ winnerColor: board.lastResult.winnerColor, reason: board.lastResult.reason },
        { winnerColor: 'black', reason: 'capture' });

      await flush();
      assert.equal(env.db.matchUpdates.length, 1);
      const { update } = env.db.matchUpdates[0];
      assert.equal(update.status, 'finished');
      assert.deepEqual(update.result, { winnerColor: 'black', reason: 'capture' });
      assert.equal(update.moves.length, 3);
      assert.equal(update.moves[2].captured, 1);
      assert.ok(env.events.some((e) => e.event === 'board:finished'));
    });

    it('la partida sigue mientras no se llegue al objetivo', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc({ stonesToWin: 2 }));
      const players = startMatch(roomId);

      playMoves(roomId, players, [[1, 0], [0, 0], [0, 1]]);
      const board = getBoard(roomId);
      assert.equal(board.status, 'playing');
      assert.equal(board.game.capturedByBlack, 1);
      assert.equal(board.game.turn, 'white');
    });

    it('las capturas cuentan para quien jugó la piedra', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc({ stonesToWin: 1 }));
      const players = startMatch(roomId);

      playMoves(roomId, players, [[0, 0], [1, 0], [5, 5], [0, 1]]);
      const board = getBoard(roomId);
      assert.equal(board.game.capturedByWhite, 1);
      assert.equal(board.game.capturedByBlack, 0);
      assert.equal(board.lastResult.winnerColor, 'white');
    });
  });

  describe('Ko en la partida', () => {
    it('con Ko habilitado rechaza la recaptura inmediata', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc({ koRuleEnabled: true }));
      const players = startMatch(roomId);
      playMoves(roomId, players, koSetup);

      assert.deepEqual(matchManager.handleMove({ roomId, boardNumber: 1, playerId: players.white.id, x: 1, y: 1 }),
        { ok: false, error: 'Jugada inválida: regla de Ko' });
      assert.equal(getBoard(roomId).game.turn, 'white');
    });

    it('con Ko habilitado la recaptura se permite después de jugar en otro lado', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc({ koRuleEnabled: true }));
      const players = startMatch(roomId);
      playMoves(roomId, players, koSetup);
      // blanco juega en otro lado, negro también, y recién ahí blanco recaptura
      playMoves(roomId, players, [[5, 0], [5, 5], [1, 1]], 'white');
      assert.equal(getBoard(roomId).game.capturedByWhite, 1);
    });

    it('con Ko deshabilitado la recaptura inmediata está permitida', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc({ koRuleEnabled: false }));
      const players = startMatch(roomId);
      playMoves(roomId, players, koSetup);

      assert.deepEqual(matchManager.handleMove({ roomId, boardNumber: 1, playerId: players.white.id, x: 1, y: 1 }),
        { ok: true });
      assert.equal(getBoard(roomId).game.capturedByWhite, 1);
    });
  });

  describe('fin sin jugadas posibles', () => {
    it('pierde quien tiene el turno y no puede jugar en ningún lugar', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc({ stonesToWin: 50 }));
      const players = startMatch(roomId);
      const g = getBoard(roomId).game;
      // Posición preparada: al jugar negro en (3,3) le quedan dos ojos que blanco no puede ocupar.
      g.board = boardFromRows([
        '.BBBBBB',
        'BBBBBBB',
        'BBBBBBB',
        'BBB.BBB',
        'BBBBBBB',
        'BBBBBBB',
        'BBBBBB.',
      ]);

      playMoves(roomId, players, [[3, 3]]);
      const board = getBoard(roomId);
      assert.equal(board.status, 'finished');
      assert.equal(board.lastResult.winnerColor, 'black');
      assert.equal(board.lastResult.reason, 'no-moves');
    });
  });

  describe('rendición', () => {
    it('gana la otra persona', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc());
      const players = startMatch(roomId);

      assert.deepEqual(matchManager.handleResign({ roomId, boardNumber: 1, playerId: players.black.id }), { ok: true });
      const board = getBoard(roomId);
      assert.equal(board.status, 'finished');
      assert.equal(board.lastResult.winnerColor, 'white');
      assert.equal(board.lastResult.reason, 'resign');
    });

    it('solo se rinden participantes de una partida en curso', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc());
      assert.deepEqual(matchManager.handleResign({ roomId, boardNumber: 1, playerId: 'x' }),
        { ok: false, error: 'La partida no está en curso' });
      startMatch(roomId);
      assert.deepEqual(matchManager.handleResign({ roomId, boardNumber: 1, playerId: 'intruso' }),
        { ok: false, error: 'No participás de esta partida' });
    });
  });

  describe('reloj Fischer', () => {
    for (const [clockType, baseMs, incrementMs] of [
      ['fischer-1-3', 60_000, 3_000],
      ['fischer-5-3', 300_000, 3_000],
      ['fischer-10-5', 600_000, 5_000],
    ]) {
      it(`${clockType}: arranca con ${baseMs / 1000}s y suma ${incrementMs / 1000}s por jugada`, (t) => {
        const env = setup(t);
        const roomId = env.registerRoom(makeRoomDoc({ clockType }));
        const players = startMatch(roomId);
        const g = getBoard(roomId).game;
        assert.deepEqual(g.clocks, { black: baseMs, white: baseMs });

        t.mock.timers.tick(10_000);
        playMoves(roomId, players, [[0, 0]]);
        assert.equal(g.clocks.black, baseMs - 10_000 + incrementMs);
        assert.equal(g.clocks.white, baseMs);
      });
    }

    it('emite el tiempo restante de quien tiene el turno cada segundo', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc());
      startMatch(roomId);

      t.mock.timers.tick(3_000);
      const clockEvents = env.events.filter((e) => e.event === 'board:clock');
      assert.equal(clockEvents.length, 3);
      assert.deepEqual(clockEvents[2].payload, { boardNumber: 1, turn: 'black', clocks: { black: 57_000, white: 60_000 } });
    });

    it('pierde por tiempo quien agota su reloj', async (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc({ clockType: 'fischer-1-3' }));
      const players = startMatch(roomId);
      await flush();

      playMoves(roomId, players, [[0, 0]]);
      t.mock.timers.tick(59_000);
      assert.equal(getBoard(roomId).status, 'playing');
      t.mock.timers.tick(1_000);

      const board = getBoard(roomId);
      assert.equal(board.status, 'finished');
      assert.equal(board.game.clocks.white, 0);
      assert.equal(board.lastResult.winnerColor, 'black');
      assert.equal(board.lastResult.reason, 'timeout');
      await flush();
      assert.deepEqual(env.db.matchUpdates[0].update.result, { winnerColor: 'black', reason: 'timeout' });
    });

    it('el reloj arranca recién cuando se sienta el segundo jugador', (t) => {
      const env = setup(t);
      const roomId = env.registerRoom(makeRoomDoc({ clockType: 'fischer-1-3' }));
      matchManager.handleSit({ roomId, boardNumber: 1, player: makePlayer('A'), socketId: 's1' });
      t.mock.timers.tick(120_000);
      assert.equal(getBoard(roomId).status, 'waiting');
      assert.equal(env.events.filter((e) => e.event === 'board:clock').length, 0);

      matchManager.handleSit({ roomId, boardNumber: 1, player: makePlayer('B'), socketId: 's2' });
      assert.equal(getBoard(roomId).game.lastMoveAt, START_TIME + 120_000);
      t.mock.timers.tick(1_000);
      const [clock] = env.events.filter((e) => e.event === 'board:clock');
      assert.deepEqual(clock.payload.clocks, { black: 59_000, white: 60_000 });
    });
  });
});
