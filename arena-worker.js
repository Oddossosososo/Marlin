import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findBestMove as findV2Move } from "./engine.js";
import { findBestMove as findV1Move } from "./engine-v1.js";

self.onmessage = (event) => {
  const { pgn, depth, version, requestId } = event.data;
  try {
    const game = new Chess();
    if (pgn) game.loadPgn(pgn);
    const findMove = version === "v2" ? findV2Move : findV1Move;
    const move = findMove(game, depth);
    self.postMessage({ requestId, move });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
