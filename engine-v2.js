const VALUE = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 20000 };
const MATE = 100000;
const MAX_PLY = 128;
const table = new Map();
const killers = Array.from({ length: MAX_PLY }, () => [null, null]);
const history = Object.create(null);

function moveKey(move) {
  return move.from + move.to + (move.promotion || "");
}

function quietKey(move) {
  return move.color + move.piece + move.to;
}

function isQuiet(move) {
  return !move.captured && !move.promotion;
}

function evaluate(game) {
  const board = game.board();
  const pawns = { w: [], b: [] };
  const files = { w: Array(8).fill(0), b: Array(8).fill(0) };
  const bishops = { w: 0, b: 0 };
  let score = 0;
  let nonPawnMaterial = 0;

  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (!p) continue;
    if (p.type === "p") {
      pawns[p.color].push({ r, c });
      files[p.color][c]++;
    } else if (p.type === "b") bishops[p.color]++;
    if (p.type !== "p" && p.type !== "k") nonPawnMaterial += VALUE[p.type];
  }

  const endgame = nonPawnMaterial <= 2600;
  const passed = (color, pawn) => {
    const enemy = color === "w" ? "b" : "w";
    return !pawns[enemy].some(ep =>
      Math.abs(ep.c - pawn.c) <= 1 &&
      (color === "w" ? ep.r < pawn.r : ep.r > pawn.r)
    );
  };

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
      if (files[piece.color][c] > 1) positional -= 13 * (files[piece.color][c] - 1);
      const isolated = !pawns[piece.color].some(p => p.c === c - 1 || p.c === c + 1);
      if (isolated) positional -= 12;
      if (passed(piece.color, { r, c })) positional += (endgame ? 18 : 10) + Math.max(0, advance) * 7;
    } else if (type === "n") {
      positional = center * 11;
      if (r === 0 || r === 7 || c === 0 || c === 7) positional -= 12;
    } else if (type === "b") positional = center * 7;
    else if (type === "r") {
      if (files[piece.color][c] === 0) positional += files[piece.color === "w" ? "b" : "w"][c] === 0 ? 12 : 20;
      if ((piece.color === "w" && r === 1) || (piece.color === "b" && r === 6)) positional += 14;
    } else if (type === "q") positional = center * 3;
    else if (type === "k") {
      positional = endgame ? center * 9 : -center * 7;
      if (!endgame) {
        const shieldRow = piece.color === "w" ? r - 1 : r + 1;
        if (shieldRow >= 0 && shieldRow < 8) {
          for (let fc = Math.max(0, c - 1); fc <= Math.min(7, c + 1); fc++) {
            if (board[shieldRow][fc]?.type === "p" && board[shieldRow][fc].color === piece.color) positional += 11;
          }
        }
      }
    }
    score += sign * (VALUE[type] + positional);
  }

  if (bishops.w >= 2) score += 28;
  if (bishops.b >= 2) score -= 28;
  return game.turn() === "w" ? score : -score;
}

function terminalScore(game, ply) {
  if (game.isCheckmate()) return -MATE + ply;
  if (game.isDraw() || game.isStalemate() || game.isThreefoldRepetition()) return 0;
  return null;
}

function scoreFromTT(score, ply) {
  if (score > MATE - MAX_PLY) return score - ply;
  if (score < -MATE + MAX_PLY) return score + ply;
  return score;
}

function scoreToTT(score, ply) {
  if (score > MATE - MAX_PLY) return score + ply;
  if (score < -MATE + MAX_PLY) return score - ply;
  return score;
}

function moveScore(move, ttMove, ply) {
  if (ttMove && moveKey(move) === moveKey(ttMove)) return 2_000_000;
  if (move.promotion) return 900_000 + (VALUE[move.promotion] || 0);
  if (move.captured) {
    const victim = VALUE[move.captured] || 0;
    const attacker = VALUE[move.piece] || 0;
    return 800_000 + victim * 10 - attacker;
  }
  const key = moveKey(move);
  if (ply < MAX_PLY && killers[ply][0] === key) return 700_000;
  if (ply < MAX_PLY && killers[ply][1] === key) return 690_000;
  return history[quietKey(move)] || 0;
}

function ordered(moves, ttMove, ply) {
  return moves.sort((a, b) => moveScore(b, ttMove, ply) - moveScore(a, ttMove, ply));
}

function rememberKiller(move, ply) {
  if (ply >= MAX_PLY) return;
  const key = moveKey(move);
  if (killers[ply][0] === key) return;
  killers[ply][1] = killers[ply][0];
  killers[ply][0] = key;
}

function updateHistory(move, depth, bonus) {
  const key = quietKey(move);
  const old = history[key] || 0;
  const change = bonus * depth * depth;
  history[key] = Math.max(-20000, Math.min(20000, old + change - old * Math.abs(change) / 20000));
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
  ordered(moves, null, ply);

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

function makeNullPosition(game) {
  // A null move passes the turn without moving a piece. En-passant rights
  // expire, while castling rights and the half-move clock are preserved.
  const fields = game.fen().split(" ");
  fields[1] = fields[1] === "w" ? "b" : "w";
  fields[3] = "-";
  return new game.constructor(fields.join(" "));
}

function sideHasNullMoveMaterial(game) {
  const board = game.board();
  const side = game.turn();
  let material = 0;
  for (const row of board) for (const piece of row) {
    if (piece && piece.color === side && piece.type !== "p" && piece.type !== "k") {
      material += VALUE[piece.type];
    }
  }
  return material >= VALUE.r;
}

function negamax(game, depth, alpha, beta, ply, allowNull = true) {
  const terminal = terminalScore(game, ply);
  if (terminal !== null) return terminal;
  if (depth <= 0) return quiescence(game, alpha, beta, ply);
  if (ply >= MAX_PLY - 1) return evaluate(game);

  const originalAlpha = alpha;
  const key = game.fen();
  const cached = table.get(key);
  const ttMove = cached?.move || null;
  if (cached && cached.depth >= depth) {
    const ttScore = scoreFromTT(cached.score, ply);
    if (cached.flag === "exact") return ttScore;
    if (cached.flag === "lower" && ttScore >= beta) return ttScore;
    if (cached.flag === "upper" && ttScore <= alpha) return ttScore;
  }

  const inCheck = game.isCheck();
  // Null-move pruning: if passing the turn still scores above beta,
  // the real position is very likely good enough to cause a beta cutoff.
  // Disable consecutive nulls and avoid likely zugzwang positions.
  if (allowNull && depth >= 3 && !inCheck && beta < MATE - MAX_PLY &&
      sideHasNullMoveMaterial(game)) {
    const reduction = 2 + Math.floor(depth / 4);
    const nullPosition = makeNullPosition(game);
    const nullScore = -negamax(
      nullPosition,
      depth - 1 - reduction,
      -beta,
      -beta + 1,
      ply + 1,
      false
    );
    if (nullScore >= beta) return beta;
  }

  const moves = ordered(game.moves({ verbose: true }), ttMove, ply);
  if (!moves.length) return inCheck ? -MATE + ply : 0;

  let best = -Infinity;
  let bestMove = null;
  const quietTried = [];

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const quiet = isQuiet(move);
    if (quiet) quietTried.push(move);

    game.move(move);
    let score;

    if (i === 0) {
      score = -negamax(game, depth - 1, -beta, -alpha, ply + 1);
    } else {
      let reduction = 0;
      if (!inCheck && depth >= 3 && i >= 3 && quiet && !game.isCheck()) {
        reduction = Math.min(depth - 2, 1 + Math.floor(Math.log(depth) * Math.log(i + 1) / 2.2));
      }

      score = -negamax(game, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1);

      if (reduction > 0 && score > alpha) {
        score = -negamax(game, depth - 1, -alpha - 1, -alpha, ply + 1);
      }
      if (score > alpha && score < beta) {
        score = -negamax(game, depth - 1, -beta, -alpha, ply + 1);
      }
    }
    game.undo();

    if (score > best) {
      best = score;
      bestMove = { from: move.from, to: move.to, promotion: move.promotion };
    }
    if (score > alpha) alpha = score;

    if (alpha >= beta) {
      if (quiet) {
        rememberKiller(move, ply);
        updateHistory(move, depth, 1);
        for (const tried of quietTried) {
          if (moveKey(tried) !== moveKey(move)) updateHistory(tried, depth, -0.5);
        }
      }
      break;
    }
  }

  const flag = best <= originalAlpha ? "upper" : best >= beta ? "lower" : "exact";
  table.set(key, { depth, score: scoreToTT(best, ply), flag, move: bestMove });
  return best;
}

export function findBestMove(game, maxDepth = 4) {
  const moves = game.moves({ verbose: true });
  if (!moves.length) return null;

  table.clear();
  for (const k of killers) { k[0] = null; k[1] = null; }
  for (const key of Object.keys(history)) delete history[key];

  let bestMove = moves[0];
  let bestScore = -Infinity;

  for (let depth = 1; depth <= maxDepth; depth++) {
    let iterationMove = bestMove;
    let iterationScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;
    const rootMoves = ordered(game.moves({ verbose: true }), bestMove, 0);

    for (let i = 0; i < rootMoves.length; i++) {
      const move = rootMoves[i];
      game.move(move);
      let score;
      if (i === 0) {
        score = -negamax(game, depth - 1, -beta, -alpha, 1);
      } else {
        score = -negamax(game, depth - 1, -alpha - 1, -alpha, 1);
        if (score > alpha && score < beta) {
          score = -negamax(game, depth - 1, -beta, -alpha, 1);
        }
      }
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
