import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findBestMove as findPolicyMove, initialiseV7 } from "./engine-v7-policy.js";
import { initialiseV9OpeningBook, selectV9OpeningMove } from "./opening-book-v9.js";
import { searchV9, v9NnueStatus } from "./marlin-v9.js";

self.onmessage = async (event) => {
  const { pgn, depth = 6, requestId } = event.data || {};
  try {
    const game = new Chess();
    if (pgn) game.loadPgn(pgn);
    const positionFen = game.fen();
    let move;
    let fallbackUsed = false;
    let initialised = { nnue: false };
    await initialiseV9OpeningBook();

    try {
      move = selectV9OpeningMove(game);
      if (move) {
        self.postMessage({ requestId, type: "progress", engine: "v9", stage: "opening-book", depth: 0, nodes: 0 });
      } else {
        move = await searchV9(positionFen, depth, details =>
          self.postMessage({ requestId, type: "progress", engine: "v9", ...details })
        );
      }
      initialised = v9NnueStatus();
    } catch (cppError) {
      console.warn("MARLIN V9 C++ WebAssembly unavailable; using V7 fallback:", cppError);
      initialised = await initialiseV7();
      try {
        move = await findPolicyMove(game, depth, {
          onProgress: details => self.postMessage({ requestId, type: "progress", engine: "v7", ...details })
        });
      } catch (policyError) {
        console.warn("MARLIN V7 policy unavailable; using V7 core search:", policyError);
        move = findSearchMove(game, depth);
        fallbackUsed = true;
      }
    }

    if (game.fen() !== positionFen) {
      self.postMessage({ requestId, error: "Position changed while MARLIN was thinking; stale move rejected." });
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
      self.postMessage({ requestId, error: "MARLIN returned a move that is not legal; it was blocked." });
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
        nodes: move.nodes ?? 0,
        elapsedMs: move.elapsedMs ?? 0,
        nps: move.nps ?? 0,
        depth: move.depth ?? depth
      },
      nodes: move.nodes ?? 0,
      elapsedMs: move.elapsedMs ?? 0,
      nps: move.nps ?? 0,
      nnue: Boolean(initialised?.nnue)
    });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
