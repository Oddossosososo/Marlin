import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findChampionMove } from "./champion-engine.js";

self.onmessage = async ({ data = {} }) => {
  const { pgn, depth = 6, requestId } = data;
  try {
    const game = new Chess();
    if (pgn) game.loadPgn(pgn);
    const startingFen = game.fen();
    const move = await findChampionMove(startingFen, depth);
    if (game.fen() !== startingFen) throw new Error("Position changed during search.");
    const legalMove = game.moves({ verbose: true }).find(candidate =>
      candidate.from === move.from &&
      candidate.to === move.to &&
      (candidate.promotion || "q") === (move.promotion || "q")
    );
    if (!legalMove) throw new Error("Champion engine returned an illegal move; it was blocked.");
    self.postMessage({
      requestId,
      move: {
        from: legalMove.from,
        to: legalMove.to,
        promotion: legalMove.promotion || "q",
        source: "marlin-champion",
        san: legalMove.san
      },
      nodes: move.nodes ?? 0,
      elapsedMs: move.elapsedMs ?? 0,
      nps: move.nps ?? 0,
      depth: move.depth ?? depth,
      nnue: Boolean(move.nnue)
    });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
