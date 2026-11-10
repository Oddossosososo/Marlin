import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findBestMove as findV3Move } from "./engine.js";
import { findBestMove as findV5Move, initialiseV5 } from "./engine-v5.js";
import { findBestMove as findV2Move } from "./engine-v2.js";

self.onmessage = async (event) => {
  const { pgn, depth, version, requestId } = event.data;
  try {
    const game = new Chess();
    if (pgn) game.loadPgn(pgn);
    const findMove = version === "v5" ? findV5Move : version === "v3" ? findV3Move : findV2Move;
    if (version === "v5") await initialiseV5();
    const move = findMove(game, depth);
    self.postMessage({ requestId, move });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
