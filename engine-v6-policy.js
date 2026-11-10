import { findBestMove as findSearchMove, initialiseV6 } from "./engine-v6.js";
import { selectOpeningMove } from "./opening-policy-v6.js";
import { probeSyzygy } from "./syzygy-v6.js";

export { initialiseV6 };

export async function findBestMove(game, maxDepth = 5, options = {}) {
  const tablebaseMove = await probeSyzygy(game);
  if (tablebaseMove) return tablebaseMove;

  const bookMove = selectOpeningMove(game);
  if (bookMove) {
    return {
      from: bookMove.from,
      to: bookMove.to,
      promotion: bookMove.promotion || "q",
      score: null,
      source: "opening-book"
    };
  }
  return findSearchMove(game, maxDepth, options);
}
