import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findBestMove as findPolicyMove, initialiseV7 } from "./engine-v7-policy.js";
import { findBestMove as findSearchMove } from "./engine-v7.js";

self.onmessage = async (event) => {
  const { pgn, depth = 5, requestId } = event.data || {};
  try {
    const game = new Chess();
    if (pgn) game.loadPgn(pgn);
    const positionFen = game.fen();

    const initialised = await initialiseV7();
    let move;
    let fallbackUsed = false;
    try {
      move = await findPolicyMove(game, depth);
    } catch (policyError) {
      console.warn("MARLIN V7 policy unavailable; using V7 core search:", policyError);
      move = findSearchMove(game, depth);
      fallbackUsed = true;
    }

    if (game.fen() !== positionFen) {
      self.postMessage({ requestId, error: "Position changed while V7 was thinking; stale move rejected." });
      return;
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
      self.postMessage({ requestId, error: "V7 returned a move that is not legal; it was blocked." });
      return;
    }

    self.postMessage({
      requestId,
      move: {
        from: legalMove.from,
        to: legalMove.to,
        promotion: legalMove.promotion || "q",
        source: fallbackUsed ? "search-fallback" : (move.source || "search"),
        san: legalMove.san,
        nodes: move.nodes ?? 0
      },
      nodes: move.nodes ?? 0,
      nnue: Boolean(initialised?.nnue)
    });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
