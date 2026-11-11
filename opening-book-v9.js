import { readFile } from "node:fs/promises";
import { selectOpeningMove as selectCuratedFallback } from "./opening-policy-v7.js";

const BOOK_URL = new URL("./nnue/marlin-v9-opening-book.json", import.meta.url);
let book = null;
let loading = null;

export async function initialiseV9OpeningBook() {
  if (book) return book.training || {};
  if (!loading) {
    loading = (async () => {
      try {
        const source = await readFile(BOOK_URL, "utf8");
        const candidate = JSON.parse(source);
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
  if (book) {
    const key = game.fen().split(" ").slice(0, 4).join(" ");
    const entries = book.positions[key] || [];
    if (entries.length) {
      const legal = game.moves({ verbose: true });
      for (const entry of entries) {
        const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(entry.uci || "");
        if (!match) continue;
        const move = legal.find(candidate =>
          candidate.from === match[1] &&
          candidate.to === match[2] &&
          (candidate.promotion || null) === (match[3] || null)
        );
        if (move) return { ...move, source: "gm-opening-book", bookGames: entry.games };
      }
    }
  }

  const fallback = selectCuratedFallback(game);
  return fallback ? { ...fallback, source: "curated-opening-book" } : null;
}

export function v9OpeningBookInfo() {
  return book?.training || { loaded: false };
}
