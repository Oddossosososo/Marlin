import { selectV9CuratedOpeningMove } from "./opening-policy-v9.js";

const BOOK_URL = new URL("./nnue/marlin-v9-opening-book.json", import.meta.url);
let book = null;
let loading = null;

export async function initialiseV9OpeningBook() {
  if (book) return book.training || {};
  if (!loading) {
    loading = (async () => {
      try {
        let candidate;
        if (typeof process !== "undefined" && process.versions?.node) {
          const { readFile } = await import("node:fs/promises");
          candidate = JSON.parse(await readFile(BOOK_URL, "utf8"));
        } else {
          const response = await fetch(BOOK_URL, { cache: "no-cache" });
          if (!response.ok) throw new Error("Opening book HTTP " + response.status);
          candidate = await response.json();
        }
        if (candidate.format !== "MARLIN_OPENING_BOOK_V1" ||
            candidate.model !== "MARLIN V9" ||
            !candidate.positions || typeof candidate.positions !== "object") {
          throw new Error("V9 opening-book format is invalid.");
        }
        book = candidate;
        console.log("Loaded MARLIN V9 GM opening book:", candidate.training || {});
      } catch (error) {
        console.warn("MARLIN V9 GM opening book unavailable; using curated opening fallback:", error.message);
        book = { format: "MARLIN_OPENING_BOOK_V1", model: "MARLIN V9", positions: {}, training: { fallback: true } };
      }
      return book.training || {};
    })().catch(error => { loading = null; throw error; });
  }
  return loading;
}

export function selectV9OpeningMove(game) {
  // Never let a learned book recommend the Van Geet as White's first move.
  // This is a hard repertoire rule, not a statistical preference.
  const isInitialWhitePosition =
    game.history().length === 0 &&
    game.turn() === "w" &&
    game.board().flat().filter(Boolean).length === 32;

  if (isInitialWhitePosition) {
    const curated = selectV9CuratedOpeningMove(game);
    if (curated) return curated;
  }

  if (book) {
    const key = game.fen().split(" ").slice(0, 4).join(" ");
    const entries = book.positions[key] || [];
    if (entries.length) {
      const legal = game.moves({ verbose: true });
      const candidates = entries.map(entry => {
        // b1c3 is deliberately excluded at the initial position (Van Geet).
        if (isInitialWhitePosition && entry.uci === "b1c3") return null;
        const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(entry.uci || "");
        if (!match) return null;
        const move = legal.find(candidate =>
          candidate.from === match[1] &&
          candidate.to === match[2] &&
          (candidate.promotion || null) === (match[3] || null)
        );
        return move ? { move, weight: Math.max(1, Number(entry.weight) || 1), games: entry.games || 0 } : null;
      }).filter(Boolean);
      if (candidates.length) {
        const total = candidates.reduce((sum, item) => sum + item.weight, 0);
        let cursor = Math.random() * total;
        for (const item of candidates) {
          cursor -= item.weight;
          if (cursor < 0) return { ...item.move, source: "gm-opening-book", bookGames: item.games };
        }
        const last = candidates[candidates.length - 1];
        return { ...last.move, source: "gm-opening-book", bookGames: last.games };
      }
    }
  }

  const fallback = selectV9CuratedOpeningMove(game);
  return fallback || null;
}

export function v9OpeningBookInfo() {
  return book?.training || { loaded: false };
}
