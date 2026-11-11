import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findBestMove as findV8Move, initialiseV8 } from "./engine-v8.js";
import { findBestMove as findV7Move, initialiseV7 } from "./engine-v7.js";

self.onmessage = async (event) => {
  const { pgn, depth, version, requestId } = event.data || {};
  try {
    const game = new Chess();
    if (pgn) game.loadPgn(pgn);

    const isV8 = version === "v8";
    const findMove = isV8 ? findV8Move : findV7Move;
    const reportProgress = details => self.postMessage({
      requestId,
      type: "progress",
      version,
      ...details
    });

    reportProgress({ stage: "initialising", depth: 0, nodes: 0 });
    const initialised = isV8 ? await initialiseV8() : await initialiseV7();
    reportProgress({ stage: "checking-book", depth: 0, nodes: 0 });
    const move = await findMove(game, depth, {
      onProgress: details => reportProgress(details)
    });

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
      nnue: Boolean(initialised?.nnue)
    });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
