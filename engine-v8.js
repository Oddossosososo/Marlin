import { evaluateNnue, loadNnueWeights, hasNnueWeights } from "./nnue-v7.js";
import { evaluateHceV8 } from "./evaluation-v8.js";

const VALUE = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 20000 };
const MATE = 100000;
const MAX_PLY = 128;
const LMR_REDUCTIONS = Array.from({ length: MAX_PLY }, (_, depth) =>
  Array.from({ length: 256 }, (_, moveIndex) =>
    depth >= 3 && moveIndex >= 3
      ? Math.min(depth - 2, 1 + Math.floor(Math.log(depth) * Math.log(moveIndex + 1) / 2.0))
      : 0
  )
);

// Deterministic split 32-bit Zobrist keys. Combining the two halves into
// an exact 53-bit Number avoids BigInt arithmetic in every search node while
// retaining a very large transposition-key space.
let zobristSeed = 0x4d41524e;
function nextZobrist32() {
  zobristSeed = (zobristSeed + 0x9e3779b9) >>> 0;
  let z = zobristSeed;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}
function nextZobristKey() {
  return [nextZobrist32(), nextZobrist32()];
}
const PIECE_INDEX = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };
const Z_PIECES = Array.from({ length: 64 }, () =>
  Array.from({ length: 12 }, nextZobristKey)
);
const Z_SIDE = nextZobristKey();
const Z_CASTLING = Array.from({ length: 4 }, nextZobristKey);
const Z_EP_FILE = Array.from({ length: 8 }, nextZobristKey);
const Z_HALFMOVE = Array.from({ length: 101 }, nextZobristKey);
// Fixed-size direct-mapped transposition table (~44 MiB across typed arrays).
// The larger table retains more useful positions between search branches and
// games while keeping per-node lookups allocation-free.
const TT_BITS = 21;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const TT_KEYS = new Float64Array(TT_SIZE);
const TT_DEPTH = new Uint8Array(TT_SIZE);
const TT_SCORE = new Int32Array(TT_SIZE);
const TT_FLAG = new Uint8Array(TT_SIZE); // 1 exact, 2 lower, 3 upper
const TT_FROM = new Int8Array(TT_SIZE);
const TT_TO = new Int8Array(TT_SIZE);
const TT_PROMOTION = new Uint8Array(TT_SIZE); // 0 none, 1 queen, 2 rook, 3 bishop, 4 knight
const TT_GENERATIONS = new Uint32Array(TT_SIZE);
const TT_VALID = new Uint8Array(TT_SIZE);
TT_FROM.fill(-1);

const PROMOTION_CODES = { q: 1, r: 2, b: 3, n: 4 };
const PROMOTION_NAMES = [null, "q", "r", "b", "n"];

function ttIndex(key) {
  return Math.imul(key >>> 0, 0x9e3779b1) >>> (32 - TT_BITS);
}

function squareToIndex(square) {
  return (square.charCodeAt(1) - 49) * 8 + square.charCodeAt(0) - 97;
}

function indexToSquare(index) {
  return String.fromCharCode(97 + (index & 7), 49 + (index >>> 3));
}

function ttMoveAt(index) {
  const from = TT_FROM[index];
  if (from < 0) return null;
  const promotionCode = TT_PROMOTION[index];
  return {
    from: indexToSquare(from),
    to: indexToSquare(TT_TO[index]),
    promotion: PROMOTION_NAMES[promotionCode] || null
  };
}

let searchNodes = 0;
let activeSearchDepth = 0;
let searchProgressCallback = null;
let searchStartedAt = 0;
let nextProgressNode = 50000;
let ttGeneration = 0;

function reportSearchProgress(details = {}) {
  if (typeof searchProgressCallback !== "function") return;
  try {
    const elapsedMs = searchStartedAt ? Math.max(1, Date.now() - searchStartedAt) : 0;
    searchProgressCallback({
      depth: activeSearchDepth,
      nodes: searchNodes,
      elapsedMs,
      nps: elapsedMs ? Math.round(searchNodes * 1000 / elapsedMs) : 0,
      ...details
    });
  } catch {
    // UI progress reporting must never interrupt the chess search.
  }
}

function countSearchNode() {
  searchNodes++;
  if (searchProgressCallback && searchNodes >= nextProgressNode) {
    nextProgressNode += 50000;
    reportSearchProgress({ stage: "searching" });
  }
}

function zobristHashFen(fenString) {
  const fen = fenString.split(" ");
  const placement = fen[0];
  let low = 0;
  let high = 0;
  let square = 0;

  for (let i = 0; i < placement.length && square < 64; i++) {
    const token = placement[i];
    if (token === "/") continue;
    if (token >= "1" && token <= "8") {
      square += token.charCodeAt(0) - 48;
      continue;
    }
    const pieceType = PIECE_INDEX[token.toLowerCase()];
    if (pieceType === undefined) continue;
    const sideOffset = token === token.toUpperCase() ? 0 : 6;
    const key = Z_PIECES[square][sideOffset + pieceType];
    low ^= key[0];
    high ^= key[1];
    square++;
  }

  if (fen[1] === "b") { low ^= Z_SIDE[0]; high ^= Z_SIDE[1]; }
  const castling = fen[2] || "-";
  if (castling.includes("K")) { low ^= Z_CASTLING[0][0]; high ^= Z_CASTLING[0][1]; }
  if (castling.includes("Q")) { low ^= Z_CASTLING[1][0]; high ^= Z_CASTLING[1][1]; }
  if (castling.includes("k")) { low ^= Z_CASTLING[2][0]; high ^= Z_CASTLING[2][1]; }
  if (castling.includes("q")) { low ^= Z_CASTLING[3][0]; high ^= Z_CASTLING[3][1]; }
  if (fen[3] && fen[3] !== "-") {
    const file = fen[3].charCodeAt(0) - 97;
    if (file >= 0 && file < 8) { low ^= Z_EP_FILE[file][0]; high ^= Z_EP_FILE[file][1]; }
  }
  const halfmove = Math.min(100, Math.max(0, Number(fen[4]) || 0));
  low ^= Z_HALFMOVE[halfmove][0];
  high ^= Z_HALFMOVE[halfmove][1];
  return (high & 0x1fffff) * 4294967296 + (low >>> 0);
}

function zobristHash(game) {
  return zobristHashFen(game.fen());
}

function sideHasNullMoveMaterialFen(fen) {
  const sideIndex = fen.indexOf(" ");
  const side = fen[sideIndex + 1];
  let material = 0;
  for (let i = 0; i < sideIndex; i++) {
    const token = fen[i];
    if (token === "/" || (token >= "1" && token <= "8")) continue;
    const type = token.toLowerCase();
    if (type === "p" || type === "k" || VALUE[type] === undefined) continue;
    const isWhite = token === token.toUpperCase();
    if ((side === "w" && isWhite) || (side === "b" && !isWhite)) {
      material += VALUE[type];
      if (material >= VALUE.r) return true;
    }
  }
  return false;
}

function storeTT(key, entry) {
  const index = ttIndex(key);
  if (TT_VALID[index] && TT_KEYS[index] === key &&
      TT_GENERATIONS[index] === ttGeneration &&
      TT_DEPTH[index] > entry.depth) return;

  TT_KEYS[index] = key;
  TT_DEPTH[index] = Math.max(0, Math.min(255, entry.depth));
  TT_SCORE[index] = Math.round(entry.score);
  TT_FLAG[index] = entry.flag === "exact" ? 1 : entry.flag === "lower" ? 2 : 3;
  if (entry.move) {
    TT_FROM[index] = squareToIndex(entry.move.from);
    TT_TO[index] = squareToIndex(entry.move.to);
    TT_PROMOTION[index] = PROMOTION_CODES[entry.move.promotion] || 0;
  } else {
    TT_FROM[index] = -1;
    TT_TO[index] = -1;
    TT_PROMOTION[index] = 0;
  }
  TT_GENERATIONS[index] = ttGeneration;
  TT_VALID[index] = 1;
}

const killers = Array.from({ length: MAX_PLY }, () => [null, null]);
const history = Object.create(null);
const counterMoves = Object.create(null);

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
  const neural = evaluateNnue(game);
  return neural === null ? evaluateHceV8(game) : neural;
}

export async function initialiseV8() {
  try { await loadNnueWeights(); } catch (error) {
    console.warn("MARLIN V8: Stockfish-trained NNUE weights not installed; V7 handcrafted evaluation active.", error);
  }
  return { nnue: hasNnueWeights() };
}
export { hasNnueWeights };

function isRepeatedPosition(game, halfmoveClock) {
  // Three occurrences require at least eight reversible plies. Avoid the
  // repetition-history scan during the opening and early middlegame.
  return halfmoveClock >= 8 && game.isThreefoldRepetition();
}

function isAutomaticDraw(game) {
  // Called after the legal-move check, so this never generates moves itself.
  return game.isDrawByFiftyMoves() || game.isInsufficientMaterial();
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


/**
 * Static exchange estimate for a capture on one square.
 * It follows legal recaptures using the least valuable attacker and
 * returns the material balance after optimal stop/continue choices.
 */
function staticExchange(game, move) {
  if (!move.captured) return 0;
  const gains = [VALUE[move.captured] || 0];
  let depth = 0;
  let madeMoves = 0;

  // Walk the exchange on the active position and undo it afterwards. This
  // avoids constructing a new Chess instance and serialising a FEN for every
  // candidate capture in quiescence.
  try {
    game.move(move);
    madeMoves++;
    while (depth < 15) {
      const targetPiece = game.get(move.to);
      if (!targetPiece) break;

      const replies = game.moves({ verbose: true });
      let leastValuable = null;
      let leastValue = Infinity;
      for (let i = 0; i < replies.length; i++) {
        const candidate = replies[i];
        if (candidate.to !== move.to || !candidate.captured) continue;
        const value = VALUE[candidate.piece] || 0;
        if (value < leastValue) {
          leastValue = value;
          leastValuable = candidate;
        }
      }
      if (!leastValuable) break;

      depth++;
      gains[depth] = (VALUE[targetPiece.type] || 0) - gains[depth - 1];
      game.move(leastValuable);
      madeMoves++;
    }

    while (depth > 0) {
      gains[depth - 1] = -Math.max(-gains[depth - 1], gains[depth]);
      depth--;
    }
    return gains[0];
  } catch {
    return 0;
  } finally {
    while (madeMoves > 0) {
      game.undo();
      madeMoves--;
    }
  }
}

function staticExchangeScore(move) { return move.captured ? (VALUE[move.captured] || 0) - (VALUE[move.piece] || 0) : 0; }

function moveScore(move, ttMove, ply, counterMove) {
  if (ttMove && moveKey(move) === moveKey(ttMove)) return 2_000_000;
  if (move.promotion) return 900_000 + (VALUE[move.promotion] || 0);
  if (move.captured) {
    const victim = VALUE[move.captured] || 0;
    const attacker = VALUE[move.piece] || 0;
    return 800_000 + victim * 10 - attacker + staticExchangeScore(move);
  }
  const key = moveKey(move);
  if (ply < MAX_PLY && killers[ply][0] === key) return 700_000;
  if (ply < MAX_PLY && killers[ply][1] === key) return 690_000;
  if (counterMove && key === counterMove) return 680_000;
  return history[quietKey(move)] || 0;
}

function ordered(moves, ttMove, ply, counterMove = null) {
  for (let i = 0; i < moves.length; i++) {
    moves[i]._marlinOrderScore = moveScore(moves[i], ttMove, ply, counterMove);
  }
  return moves.sort((a, b) => b._marlinOrderScore - a._marlinOrderScore);
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

function quiescence(game, alpha, beta, ply, remaining = 5, precomputedMoves = null, precomputedCheck = null) {
  countSearchNode();
  const inCheck = precomputedCheck === null ? game.isCheck() : precomputedCheck;
  let moves = precomputedMoves || game.moves({ verbose: true });
  // Check mate/stalemate before draw claims, matching chess game-end priority.
  if (moves.length === 0) return inCheck ? -MATE + ply : 0;
  if (isAutomaticDraw(game)) return 0;
  // Bound checking sequences at the global search horizon. In-check
  // quiescence must still test for mate/stalemate first, then stop safely.
  if (ply >= MAX_PLY - 1) return evaluate(game);

  let stand = inCheck ? -Infinity : evaluate(game);
  if (!inCheck) {
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (remaining <= 0) return stand;
    moves = moves.filter(m => m.captured || m.promotion);
    // Cheaply eliminate obviously losing non-checking captures with SEE.
    // Checks and promotions remain searchable; exact SEE mutates/undoes the
    // current position instead of cloning it.
    moves = moves.filter(m =>
      !m.captured || m.promotion || /[+#]$/.test(m.san || "") || staticExchange(game, m) >= 0
    );
  }

  ordered(moves, null, ply);
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

function negamax(game, depth, alpha, beta, ply, allowNull = true, previousMove = null) {
  countSearchNode();
  if (ply >= MAX_PLY - 1) return evaluate(game);

  // Mate-distance pruning: a side cannot force mate sooner than the
  // distance already implied by the current ply.
  alpha = Math.max(alpha, -MATE + ply);
  beta = Math.min(beta, MATE - ply - 1);
  if (alpha >= beta) return alpha;

  if (depth <= 0) return quiescence(game, alpha, beta, ply);

  const originalAlpha = alpha;
  const fen = game.fen();
  const fenFields = fen.split(" ");
  const halfmoveClock = Number(fenFields[4]) || 0;
  const repetitionDraw = isRepeatedPosition(game, halfmoveClock);
  const key = zobristHashFen(fen);
  const ttSlot = ttIndex(key);
  const ttHit = TT_VALID[ttSlot] && TT_KEYS[ttSlot] === key;
  const ttMove = ttHit ? ttMoveAt(ttSlot) : null;

  // Most transposition hits can now return before chess.js builds a full
  // verbose legal-move list. Draw candidates still verify mate/stalemate first.
  if (!repetitionDraw && ttHit && TT_DEPTH[ttSlot] >= depth) {
    const ttScore = scoreFromTT(TT_SCORE[ttSlot], ply);
    const ttFlag = TT_FLAG[ttSlot];
    if (ttFlag === 1) return ttScore;
    if (ttFlag === 2 && ttScore >= beta) return ttScore;
    if (ttFlag === 3 && ttScore <= alpha) return ttScore;
  }

  const inCheck = game.isCheck();
  // V8 check extension: spend one extra ply resolving checks, with MAX_PLY
  // protecting against pathological checking sequences.
  if (inCheck && depth < MAX_PLY - ply - 2) depth++;
  const legalMoves = game.moves({ verbose: true });
  // Check mate/stalemate before declaring a 50-move or repetition draw.
  if (legalMoves.length === 0) return inCheck ? -MATE + ply : 0;
  if (repetitionDraw || isAutomaticDraw(game)) return 0;

  const staticEval = !inCheck && depth <= 3 ? evaluate(game) : 0;
  // Reverse futility pruning (static null-move pruning). Restrict it to
  // shallow, non-check nodes with sufficient non-pawn material to reduce
  // zugzwang risk. The margin grows with depth.
  if (!inCheck && depth <= 3 && beta < MATE - MAX_PLY &&
      sideHasNullMoveMaterialFen(fen) &&
      staticEval - (95 * depth) >= beta) {
    return staticEval - (95 * depth);
  }

  const counterKey = previousMove && isQuiet(previousMove) ? quietKey(previousMove) : null;
  const counterMove = counterKey ? counterMoves[counterKey] : null;
  // Null-move pruning: if passing the turn still scores above beta,
  // the real position is very likely good enough to cause a beta cutoff.
  // Disable consecutive nulls and avoid likely zugzwang positions.
  if (allowNull && depth >= 3 && !inCheck && beta < MATE - MAX_PLY &&
      sideHasNullMoveMaterialFen(fen)) {
    const reduction = 2 + Math.floor(depth / 4);
    const nullPosition = makeNullPosition(game);
    const nullScore = -negamax(
      nullPosition,
      depth - 1 - reduction,
      -beta,
      -beta + 1,
      ply + 1,
      false,
      null
    );
    if (nullScore >= beta) return beta;
  }

  const moves = ordered(legalMoves, ttMove, ply, counterMove);
  if (!moves.length) return inCheck ? -MATE + ply : 0;

  let best = -Infinity;
  let bestMove = null;
  const quietTried = [];

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const quiet = isQuiet(move);

    // Late-move pruning: at shallow depth, skip quiet moves after several
    // better-ordered candidates have already been searched. Never prune
    // captures, promotions, checks, or any move while in check.
    if (!inCheck && quiet && depth <= 3 && i >= (depth === 1 ? 7 : depth === 2 ? 10 : 14)) {
      continue;
    }

    // Futility pruning: avoid late quiet moves that cannot plausibly raise
    // alpha at shallow depth. The first move and all forcing moves are kept.
    if (!inCheck && quiet && i > 0 && depth <= 2 &&
        staticEval + (depth === 1 ? 110 : 210) <= alpha) {
      continue;
    }

    if (quiet) quietTried.push(move);
    game.move(move);
    let score;

    if (i === 0) {
      score = -negamax(game, depth - 1, -beta, -alpha, ply + 1, true, move);
    } else {
      let reduction = 0;
      if (!inCheck && depth >= 3 && i >= 3 && quiet && !/[+#]$/.test(move.san || "")) {
        reduction = LMR_REDUCTIONS[depth][Math.min(i, 255)];
      }

      score = -negamax(game, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, true, move);

      if (reduction > 0 && score > alpha) {
        score = -negamax(game, depth - 1, -alpha - 1, -alpha, ply + 1, true, move);
      }
      if (score > alpha && score < beta) {
        score = -negamax(game, depth - 1, -beta, -alpha, ply + 1, true, move);
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
        if (counterKey) counterMoves[counterKey] = moveKey(move);
        for (const tried of quietTried) {
          if (moveKey(tried) !== moveKey(move)) updateHistory(tried, depth, -0.5);
        }
      }
      break;
    }
  }

  const flag = best <= originalAlpha ? "upper" : best >= beta ? "lower" : "exact";
  storeTT(key, { depth, score: scoreToTT(best, ply), flag, move: bestMove });
  return best;
}

export function findBestMove(game, maxDepth = 6, options = {}) {
  searchNodes = 0;
  activeSearchDepth = 0;
  searchStartedAt = Date.now();
  nextProgressNode = 50000;
  ttGeneration = (ttGeneration + 1) >>> 0 || 1;
  searchProgressCallback = typeof options?.onProgress === "function" ? options.onProgress : null;
  // Iterative deepening ends at the selected search depth. Nodes are counted
  // for diagnostics only and never stop the search early.
  const depthCeiling = Math.max(1, Math.min(MAX_PLY - 2, Math.floor(Number(maxDepth) || 6)));
  const moves = game.moves({ verbose: true });
  if (!moves.length) return null;

  // Reuse the bounded transposition table and move-ordering heuristics across turns.
  const rootKey = zobristHash(game);
  const rootSlot = ttIndex(rootKey);
  const previousRootMove = TT_VALID[rootSlot] && TT_KEYS[rootSlot] === rootKey
    ? ttMoveAt(rootSlot)
    : null;
  const previousRootMoveKey = previousRootMove ? moveKey(previousRootMove) : null;
  let bestMove = previousRootMoveKey
    ? (moves.find(move => moveKey(move) === previousRootMoveKey) || moves[0])
    : moves[0];
  let bestScore = -Infinity;

  for (let depth = 1; depth <= depthCeiling; depth++) {
    activeSearchDepth = depth;
    reportSearchProgress({ stage: "searching", iterationStart: true });
    let window = depth >= 3 ? 35 : Infinity;
    let alpha = window === Infinity ? -Infinity : bestScore - window;
    let beta = window === Infinity ? Infinity : bestScore + window;
    let iterationMove = bestMove;
    let iterationScore = -Infinity;

    // Aspiration windows: retry with a wider window after fail-low/high.
    while (true) {
      iterationMove = bestMove;
      iterationScore = -Infinity;
      let rootAlpha = alpha;
      const rootMoves = ordered(game.moves({ verbose: true }), bestMove, 0);

      for (let i = 0; i < rootMoves.length; i++) {
        const move = rootMoves[i];
            game.move(move);
        let score;
        if (i === 0) {
          score = -negamax(game, depth - 1, -beta, -rootAlpha, 1, true, move);
        } else {
          score = -negamax(game, depth - 1, -rootAlpha - 1, -rootAlpha, 1, true, move);
          if (score > rootAlpha && score < beta) {
            score = -negamax(game, depth - 1, -beta, -rootAlpha, 1, true, move);
          }
        }
        game.undo();

        if (score > iterationScore) {
          iterationScore = score;
          iterationMove = move;
        }
        if (score > rootAlpha) rootAlpha = score;
        if (rootAlpha >= beta) break;
      }

      if (iterationScore <= alpha && alpha !== -Infinity) {
        window *= 2;
        alpha = iterationScore - window;
        continue;
      }
      if (iterationScore >= beta && beta !== Infinity) {
        window *= 2;
        beta = iterationScore + window;
        continue;
      }
      break;
    }

    bestMove = iterationMove;
    bestScore = iterationScore;
    reportSearchProgress({ stage: "depth-complete", completedDepth: depth });
  }

  storeTT(rootKey, {
    depth: depthCeiling,
    score: scoreToTT(bestScore, 0),
    flag: "exact",
    move: { from: bestMove.from, to: bestMove.to, promotion: bestMove.promotion }
  });

  const elapsedMs = Math.max(1, Date.now() - searchStartedAt);
  const result = {
    from: bestMove.from,
    to: bestMove.to,
    promotion: bestMove.promotion || null,
    score: bestScore,
    nodes: searchNodes,
    depth: depthCeiling,
    elapsedMs,
    nps: Math.round(searchNodes * 1000 / elapsedMs)
  };
  reportSearchProgress({ stage: "complete", completedDepth: depthCeiling });
  searchProgressCallback = null;
  return result;
}
