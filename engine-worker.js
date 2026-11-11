import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findBestMove as findPolicyMove, initialiseV7 } from "./engine-v7-policy.js";
import { findBestMove as findSearchMove } from "./engine-v7.js";

let cppModulePromise = null;

async function findCppMove(fen, requestedDepth) {
  if (!cppModulePromise) {
    cppModulePromise = import("./marlin-wasm.js").then(async module => {
      const factory = module.default || module;
      return factory();
    }).catch(error => {
      cppModulePromise = null;
      throw error;
    });
  }
  const wasm = await cppModulePromise;
  const fenSize = new TextEncoder().encode(fen).length + 1;
  const fenPtr = wasm._malloc(fenSize);
  const outPtr = wasm._malloc(512);
  const started = performance.now();
  try {
    wasm.stringToUTF8(fen, fenPtr, fenSize);
    const depth = Math.max(1, Math.min(12, Math.floor(Number(requestedDepth) || 6)));
    wasm._marlin_cpp_search(fenPtr, depth, outPtr, 512);
    const output = wasm.UTF8ToString(outPtr);
    const match = output.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/);
    if (!match) throw new Error("C++ search returned no move: " + output);
    const uci = match[1];
    const nodes = Number((output.match(/\bnodes (\d+)/) || [])[1] || 0);
    const elapsedMs = Math.max(1, Math.round(performance.now() - started));
    return {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || "q",
      source: "cpp-wasm",
      nodes,
      elapsedMs,
      nps: Math.round(nodes * 1000 / elapsedMs),
      depth
    };
  } finally {
    wasm._free(fenPtr);
    wasm._free(outPtr);
  }
}

self.onmessage = async (event) => {
  const { pgn, depth = 6, requestId } = event.data || {};
  try {
    const game = new Chess();
    if (pgn) game.loadPgn(pgn);
    const positionFen = game.fen();
    let move;
    let fallbackUsed = false;
    let initialised = { nnue: false };

    try {
      move = await findCppMove(positionFen, depth);
      self.postMessage({
        requestId,
        type: "progress",
        engine: "cpp",
        stage: "depth-complete",
        depth: move.depth,
        completedDepth: move.depth,
        nodes: move.nodes,
        nps: move.nps,
        elapsedMs: move.elapsedMs
      });
    } catch (cppError) {
      console.warn("MARLIN C++ WebAssembly unavailable; using V7 fallback:", cppError);
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
