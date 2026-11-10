const VALUE = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 20000 };

function evaluate(game) {
  const board = game.board();
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const sign = piece.color === "w" ? 1 : -1;
      const type = piece.type;
      const advance = piece.color === "w" ? 6 - r : r - 1;
      const center = 3.5 - (Math.abs(3.5 - r) + Math.abs(3.5 - c)) / 2;
      let positional = 0;
      if (type === "p") positional = advance * 7 + center * 2;
      if (type === "n" || type === "b") positional = center * 9;
      if (type === "q") positional = center * 2;
      if (type === "k" && game.isEndgame?.()) positional = center * 4;
      score += sign * (VALUE[type] + positional);
    }
  }
  return game.turn() === "w" ? score : -score;
}

function moveOrder(moves) {
  return moves.sort((a, b) => {
    const av = a.captured ? VALUE[a.captured] - VALUE[a.piece] / 10 : 0;
    const bv = b.captured ? VALUE[b.captured] - VALUE[b.piece] / 10 : 0;
    return bv - av || (b.promotion ? 800 : 0) - (a.promotion ? 800 : 0);
  });
}

function negamax(game, depth, alpha, beta, ply) {
  if (game.isCheckmate()) return -100000 + ply;
  if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition()) return 0;
  if (depth === 0) return evaluate(game);

  let best = -Infinity;
  const moves = moveOrder(game.moves({ verbose: true }));
  for (const move of moves) {
    game.move(move);
    const score = -negamax(game, depth - 1, -beta, -alpha, ply + 1);
    game.undo();
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

export function findBestMove(game, depth = 3) {
  const moves = moveOrder(game.moves({ verbose: true }));
  if (!moves.length) return null;
  let bestMove = moves[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  for (const move of moves) {
    game.move(move);
    const score = -negamax(game, depth - 1, -beta, -alpha, 1);
    game.undo();
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
  }
  return { from: bestMove.from, to: bestMove.to, promotion: bestMove.promotion || "q", score: bestScore };
}
