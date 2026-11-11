import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findBestMove as findV8Move, initialiseV8 } from "./engine-v8.js";
import { searchV9, v9NnueStatus } from "./marlin-v9.js";
import { initialiseV9OpeningBook, selectV9OpeningMove } from "./opening-book-v9.js";

async function findV9Move(fen, requestedDepth, reportProgress) {
  return searchV9(fen, requestedDepth, reportProgress);
}

self.onmessage = async (event) => {
  const { pgn, depth = 6, version, requestId } = event.data || {};
  try {
    const game = new Chess();
    if (pgn) game.loadPgn(pgn);
    const reportProgress = details => self.postMessage({
      requestId,
      type: "progress",
      version,
      ...details
    });

    let move;
    let initialised = { nnue: false };
    if (version === "v9") {
      await initialiseV9OpeningBook();
      move = selectV9OpeningMove(game) || await findV9Move(game.fen(), depth, reportProgress);
      initialised = v9NnueStatus();
      if (move.source === "gm-opening-book" || move.source === "curated-opening-book") {
        reportProgress({ stage: "opening-book", depth: 0, nodes: 0 });
      }
    } else if (version === "v8") {
      reportProgress({ stage: "initialising", depth: 0, nodes: 0 });
      initialised = await initialiseV8();
      reportProgress({ stage: "searching", depth: 1, nodes: 0 });
      move = await findV8Move(game, depth, {
        onProgress: details => reportProgress(details)
      });
    } else {
      throw new Error("Unknown Arena engine version: " + version);
    }

    if (!move) {
      self.postMessage({ requestId, error: "The selected engine found no legal move." });
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
        source: move.source || "search",
        san: legalMove.san
      },
      nodes: move.nodes ?? 0,
      elapsedMs: move.elapsedMs ?? 0,
      nps: move.nps ?? 0,
      depth: move.depth ?? depth,
      nnue: Boolean(initialised?.nnue)
    });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
