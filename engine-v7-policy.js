import { findBestMove as findSearchMove, initialiseV7 } from "./engine-v7.js";
import { selectOpeningMove as selectLocalBookMove } from "./opening-policy-v7.js";
import { probeSyzygy } from "./syzygy-v6.js";

export { initialiseV7 };

const masterCache = new Map();
const CACHE_LIMIT = 256;
const BOOK_MAX_PLIES = 30;
const MASTER_MIN_GAMES = 5;

function repertoireAllows(game, move) {
  const history = game.history();
  if (history.length === 0) return move.san === "e4" || move.san === "d4";
  if (history.length === 1) {
    if (history[0] === "e4") return move.san === "e5";
    if (history[0] === "d4") return move.san === "d5" || move.san === "Nf6";
  }
  return true;
}

function parseMasterUci(uci) {
  // Lichess master explorer returns coordinate moves such as e2e4 or e7e8q.
  // Reject malformed strings instead of interpreting partial coordinates.
  if (typeof uci !== "string" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length === 5 ? uci[4] : null
  };
}

function findLegalMasterMove(game, uci, expectedFen = game.fen()) {
  // Do not accept a cached/API move if the position changed while the request
  // was in flight. Resolve the complete UCI against the active legal list.
  if (game.fen() !== expectedFen) return null;
  const parsed = parseMasterUci(uci);
  if (!parsed) return null;

  const matches = game.moves({ verbose: true }).filter(candidate =>
    candidate.from === parsed.from &&
    candidate.to === parsed.to &&
    (candidate.promotion || null) === parsed.promotion
  );
  // Exactly one legal match is required. No partial-match or queen-default guess.
  return matches.length === 1 ? matches[0] : null;
}

function chooseMasterMove(game, data, expectedFen) {
  if (game.fen() !== expectedFen || !Array.isArray(data?.moves) || !data.moves.length) return null;
  const side = game.turn();
  const candidates = [];

  for (const record of data.moves) {
    const white = Number(record?.white);
    const draws = Number(record?.draws);
    const black = Number(record?.black);
    if (![white, draws, black].every(n => Number.isSafeInteger(n) && n >= 0)) continue;

    const total = white + draws + black;
    if (total < MASTER_MIN_GAMES || total > Number.MAX_SAFE_INTEGER) continue;

    const move = findLegalMasterMove(game, record.uci, expectedFen);
    if (!move || !repertoireAllows(game, move)) continue;

    const wins = side === "w" ? white : black;
    const expectedScore = (wins + 0.5 * draws + 0.5) / (total + 1);
    const popularity = Math.log1p(total) / 1000;
    candidates.push({
      move,
      uci: record.uci,
      score: expectedScore + popularity,
      total
    });
  }

  candidates.sort((a, b) => b.score - a.score || b.total - a.total);
  return candidates[0] || null;
}

function isCapturingCandidate(game, candidate) {
  if (!candidate?.from || !candidate?.to) return true;
  const legal = game.moves({ verbose: true }).find(move =>
    move.from === candidate.from &&
    move.to === candidate.to &&
    (move.promotion || null) === (candidate.promotion || null)
  );
  // Unknown or stale book/tablebase moves are never trusted.
  return !legal || Boolean(legal.captured);
}

async function fetchMasterBookMove(game, timeoutMs = 1100) {
  const history = game.history();
  if (history.length >= BOOK_MAX_PLIES) return null;

  const fen = game.fen();
  if (masterCache.has(fen)) {
    const cachedUci = await masterCache.get(fen);
    if (typeof cachedUci !== "string") return null;
    const cachedMove = findLegalMasterMove(game, cachedUci, fen);
    if (!cachedMove) return null;
    return {
      from: cachedMove.from,
      to: cachedMove.to,
      promotion: cachedMove.promotion || "q",
      san: cachedMove.san,
      source: "master-book"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const request = (async () => {
    try {
      const url = "https://explorer.lichess.ovh/masters?fen=" +
        encodeURIComponent(fen) + "&moves=12&topGames=0&recentGames=0";
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "force-cache"
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (game.fen() !== fen) return null;
      const selected = chooseMasterMove(game, data, fen);
      return selected?.uci || null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })();

  // Cache only a validated UCI string (or null), never a move object tied to
  // a different Chess instance. Revalidate it against the legal list on read.
  masterCache.set(fen, request);
  const selectedUci = await request;
  masterCache.set(fen, selectedUci);
  if (masterCache.size > CACHE_LIMIT) masterCache.delete(masterCache.keys().next().value);

  if (typeof selectedUci !== "string" || game.fen() !== fen) return null;
  const selectedMove = findLegalMasterMove(game, selectedUci, fen);
  if (!selectedMove) return null;

  return {
    from: selectedMove.from,
    to: selectedMove.to,
    promotion: selectedMove.promotion || "q",
    san: selectedMove.san,
    source: "master-book"
  };
}

export async function findBestMove(game, maxDepth = 6, options = {}) {
  const tablebaseMove = await probeSyzygy(game);
  if (tablebaseMove && !isCapturingCandidate(game, tablebaseMove)) return tablebaseMove;

  const masterMove = await fetchMasterBookMove(game);
  if (masterMove && !isCapturingCandidate(game, masterMove)) return masterMove;

  const localBookMove = selectLocalBookMove(game);
  if (localBookMove && repertoireAllows(game, localBookMove) &&
      !isCapturingCandidate(game, localBookMove)) {
    return {
      from: localBookMove.from,
      to: localBookMove.to,
      promotion: localBookMove.promotion || "q",
      san: localBookMove.san,
      source: "curated-book"
    };
  }

  return findSearchMove(game, maxDepth, options);
}
