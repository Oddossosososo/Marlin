const VALUE = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 20000 };
const MATE = 100000;
const table = new Map();

function evaluate(game) {
  const board = game.board();
  let score = 0;
  let nonPawnMaterial = 0;
  for (const row of board) for (const piece of row) {
    if (piece && piece.type !== "p" && piece.type !== "k") nonPawnMaterial += VALUE[piece.type];
  }
  const endgame = nonPawnMaterial <= 2600;

  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const piece = board[r][c];
    if (!piece) continue;
    const sign = piece.color === "w" ? 1 : -1;
    const type = piece.type;
    const advance = piece.color === "w" ? 6 - r : r - 1;
    const center = 7 - (Math.abs(3.5 - r) + Math.abs(3.5 - c));
    let positional = 0;
    if (type === "p") {
      positional = advance * 9 + center * 3;
      if ((piece.color === "w" && r === 1) || (piece.color === "b" && r === 6)) positional += 8;
    } else if (type === "n") positional = center * 11;
    else if (type === "b") positional = center * 7;
    else if (type === "q") positional = center * 3;
    else if (type === "k") positional = endgame ? center * 9 : -center * 7;
    score += sign * (VALUE[type] + positional);
  }
  return game.turn() === "w" ? score : -score;
}

function terminalScore(game, ply) {
  if (game.isCheckmate()) return -MATE + ply;
  if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition()) return 0;
  return null;
}

function moveScore(move, ttMove) {
  if (ttMove && move.from === ttMove.from && move.to === ttMove.to && move.promotion === ttMove.promotion) return 1000000;
  if (move.captured) return 100000 + (VALUE[move.captured] || 0) * 10 - (VALUE[move.piece] || 0);
  if (move.promotion) return 90000 + (VALUE[move.promotion] || 0);
  return 0;
}

function ordered(moves, ttMove) {
  return moves.sort((a, b) => moveScore(b, ttMove) - moveScore(a, ttMove));
}

function quiescence(game, alpha, beta, ply, remaining = 5) {
  const terminal = terminalScore(game, ply);
  if (terminal !== null) return terminal;
  const inCheck = game.isCheck();
  let stand = inCheck ? -Infinity : evaluate(game);
  if (!inCheck) {
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (remaining <= 0) return stand;
  }
  let moves = game.moves({ verbose: true });
  if (!inCheck) moves = moves.filter(m => m.captured || m.promotion);
  ordered(moves);
  if (inCheck && moves.length === 0) return -MATE + ply;
  for (const move of moves) {
    game.move(move);
    const score = -quiescence(game, -beta, -alpha, ply + 1, remaining - 1);
    game.undo();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(game, depth, alpha, beta, ply) {
  const terminal = terminalScore(game, ply);
  if (terminal !== null) return terminal;
  if (depth <= 0) return quiescence(game, alpha, beta, ply);
  const originalAlpha = alpha;
  const key = game.fen();
  const cached = table.get(key);
  const ttMove = cached?.move || null;
  if (cached && cached.depth >= depth) {
    if (cached.flag === "exact") return cached.score;
    if (cached.flag === "lower" && cached.score >= beta) return cached.score;
    if (cached.flag === "upper" && cached.score <= alpha) return cached.score;
  }
  let best = -Infinity;
  let bestMove = null;
  const moves = ordered(game.moves({ verbose: true }), ttMove);
  for (const move of moves) {
    game.move(move);
    const score = -negamax(game, depth - 1, -beta, -alpha, ply + 1);
    game.undo();
    if (score > best) {
      best = score;
      bestMove = { from: move.from, to: move.to, promotion: move.promotion };
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  const flag = best <= originalAlpha ? "upper" : best >= beta ? "lower" : "exact";
  table.set(key, { depth, score: best, flag, move: bestMove });
  return best;
}

export function findBestMove(game, maxDepth = 4) {
  const moves = game.moves({ verbose: true });
  if (!moves.length) return null;
  table.clear();
  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (let depth = 1; depth <= maxDepth; depth++) {
    let iterationMove = bestMove;
    let iterationScore = -Infinity;
    let alpha = -Infinity;
    const rootMoves = ordered(game.moves({ verbose: true }), bestMove);
    for (const move of rootMoves) {
      game.move(move);
      const score = -negamax(game, depth - 1, -Infinity, -alpha, 1);
      game.undo();
      if (score > iterationScore) {
        iterationScore = score;
        iterationMove = move;
      }
      if (score > alpha) alpha = score;
    }
    bestMove = iterationMove;
    bestScore = iterationScore;
  }
  return { from: bestMove.from, to: bestMove.to, promotion: bestMove.promotion || "q", score: bestScore };
}
