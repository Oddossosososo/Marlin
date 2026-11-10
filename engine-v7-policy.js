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

function chooseMasterMove(game, data) {
  if (!Array.isArray(data?.moves) || !data.moves.length) return null;
  const legal = game.moves({ verbose: true });
  const side = game.turn();
  const candidates = [];

  for (const record of data.moves) {
    const total = (Number(record.white) || 0) + (Number(record.draws) || 0) + (Number(record.black) || 0);
    if (total < MASTER_MIN_GAMES || typeof record.uci !== "string") continue;
    const move = legal.find(candidate =>
      candidate.from === record.uci.slice(0, 2) &&
      candidate.to === record.uci.slice(2, 4) &&
      (!record.uci[4] || candidate.promotion === record.uci[4])
    );
    if (!move || !repertoireAllows(game, move)) continue;

    const wins = side === "w" ? Number(record.white) || 0 : Number(record.black) || 0;
    const draws = Number(record.draws) || 0;
    const expectedScore = (wins + 0.5 * draws + 0.5) / (total + 1);
    // The small sample-size term favours established master practice over
    // a single lucky result while retaining score-based move selection.
    const popularity = Math.log1p(total) / 1000;
    candidates.push({ move, score: expectedScore + popularity, total });
  }

  candidates.sort((a, b) => b.score - a.score || b.total - a.total);
  return candidates[0]?.move || null;
}

async function fetchMasterBookMove(game, timeoutMs = 1100) {
  const history = game.history();
  if (history.length >= BOOK_MAX_PLIES) return null;

  const fen = game.fen();
  if (masterCache.has(fen)) return masterCache.get(fen);

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
      const selected = chooseMasterMove(game, data);
      if (!selected) return null;
      return {
        from: selected.from,
        to: selected.to,
        promotion: selected.promotion || "q",
        san: selected.san,
        source: "master-book",
        masterGames: data.moves?.find(entry => entry.uci ===
          selected.from + selected.to + (selected.promotion || "")) || null
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })();

  masterCache.set(fen, request);
  const result = await request;
  masterCache.set(fen, result);
  if (masterCache.size > CACHE_LIMIT) masterCache.delete(masterCache.keys().next().value);
  return result;
}

export async function findBestMove(game, maxDepth = 5, options = {}) {
  const tablebaseMove = await probeSyzygy(game);
  if (tablebaseMove) return tablebaseMove;

  const masterMove = await fetchMasterBookMove(game);
  if (masterMove) return masterMove;

  const localBookMove = selectLocalBookMove(game);
  if (localBookMove && repertoireAllows(game, localBookMove)) {
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
