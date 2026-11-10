// Optional online Syzygy 6/7-man probe via the public Lichess tablebase API.
// If the API is unavailable, the engine safely falls back to its local search.
const cache = new Map();
const MAX_CACHE = 512;

export async function probeSyzygy(game, timeoutMs = 1800) {
  const fen = game.fen();
  const fields = fen.split(" ");
  const pieceCount = game.board().flat().filter(Boolean).length;
  if (pieceCount > 7 || pieceCount < 2 || (fields[2] && fields[2] !== "-")) return null;
  if (cache.has(fen)) return cache.get(fen);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = "https://tablebase.lichess.ovh/standard?fen=" + encodeURIComponent(fen);
    const response = await fetch(url, { signal: controller.signal, cache: "force-cache" });
    if (!response.ok) return null;
    const data = await response.json();
    const candidate = data.moves?.[0];
    if (!candidate?.uci || !["win", "draw", "loss", "cursed-win", "blessed-loss"].includes(candidate.category)) return null;

    const uci = candidate.uci;
    const move = game.moves({ verbose: true }).find(m =>
      m.from === uci.slice(0, 2) &&
      m.to === uci.slice(2, 4) &&
      (!uci[4] || m.promotion === uci[4])
    );
    if (!move) return null;

    const result = {
      from: move.from,
      to: move.to,
      promotion: move.promotion || "q",
      score: candidate.category === "win" || candidate.category === "cursed-win" ? 100000 :
             candidate.category === "loss" || candidate.category === "blessed-loss" ? -100000 : 0,
      source: "syzygy-7-man",
      category: candidate.category,
      dtz: candidate.dtz ?? null
    };
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(fen, result);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
