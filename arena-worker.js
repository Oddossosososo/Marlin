import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findBestMove as findV6Move, initialiseV6 } from "./engine-v6-policy.js";
import { findBestMove as findV5Move } from "./engine-v5.js";

self.onmessage = async (event) => {
  const { pgn, depth, version, requestId, maxNodes = 5000000 } = event.data;
  try {
    const game = new Chess();
    if (pgn) game.loadPgn(pgn);
    const findMove = version === "v6" ? findV6Move : findV5Move;
    if (version === "v6") await initialiseV6();
    const move = await findMove(game, depth, { maxNodes });
    self.postMessage({ requestId, move, nodes: move?.nodes ?? null, maxNodes });
  } catch (error) {
    self.postMessage({ requestId, error: error?.message || String(error) });
  }
};
