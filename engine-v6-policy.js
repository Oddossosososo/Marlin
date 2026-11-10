import { findBestMove as findSearchMove, initialiseV6 } from "./engine-v6.js";
import { selectOpeningMove } from "./opening-policy-v6.js";

export { initialiseV6 };

export function findBestMove(game, maxDepth = 5) {
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
  return findSearchMove(game, maxDepth);
}
