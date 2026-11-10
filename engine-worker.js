import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findBestMove as findPolicyMove, initialiseV6 } from "./engine-v6-policy.js";
import { findBestMove as findSearchMove } from "./engine-v6.js";

self.onmessage = async (event) => {
  const { pgn, depth, requestId } = event.data || {};
  try {
    const game = new Chess();
    if (pgn) game.loadPgn(pgn);

    const initialised = await initialiseV6();
    let move;
    let fallbackUsed = false;

    try {
      move = await findPolicyMove(game, depth);
    } catch (policyError) {
      console.warn("MARLIN V6 policy unavailable; using core search:", policyError);
      move = findSearchMove(game, depth);
      fallbackUsed = true;
    }

    if (!move) {
      self.postMessage({ requestId, error: "Marlin could not find a legal move." });
      return;
    }

    const legalMove = game.moves({ verbose: true }).find(candidate =>
      candidate.from === move.from &&
      candidate.to === move.to &&
      (candidate.promotion || "q") === (move.promotion || "q")
    );

    if (!legalMove) {
      self.postMessage({ requestId, error: "Engine returned an illegal move; it was blocked." });
      return;
    }

    self.postMessage({
      requestId,
      move: {
        from: legalMove.from,
        to: legalMove.to,
        promotion: legalMove.promotion || "q",
        source: fallbackUsed ? "search-fallback" : (move.source || "search"),
        san: legalMove.san
      },
      nnue: Boolean(initialised?.nnue)
    });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
