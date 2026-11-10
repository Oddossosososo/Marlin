import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findBestMove as findV6Move, initialiseV6 } from "./engine-v6-policy.js";

self.onmessage = async (event) => {
  const { pgn, depth, version, requestId } = event.data;
  try {
    const game = new Chess();
    if (pgn) game.loadPgn(pgn);
    const findMove = version === "v6" ? findV6Move : findV5Move;
    if (version === "v6") await initialiseV6();
    const move = findMove(game, depth);
    self.postMessage({ requestId, move });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
