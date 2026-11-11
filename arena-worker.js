import { Chess } from "https://esm.sh/chess.js@1.4.0";
import { findBestMove as findV8Move, initialiseV8 } from "./engine-v8.js";
import createMarlinModule from "./marlin-wasm.js";

let wasmPromise = null;

async function getWasm() {
  if (!wasmPromise) {
    wasmPromise = createMarlinModule().catch(error => {
      wasmPromise = null;
      throw error;
    });
  }
  return wasmPromise;
}

async function findV9Move(fen, requestedDepth, reportProgress) {
  reportProgress({ stage: "initialising", depth: 0, nodes: 0 });
  const wasm = await getWasm();
  const fenSize = new TextEncoder().encode(fen).length + 1;
  const fenPtr = wasm._malloc(fenSize);
  const outPtr = wasm._malloc(512);
  const startedAt = performance.now();

  try {
    wasm.stringToUTF8(fen, fenPtr, fenSize);
    const depth = Math.max(1, Math.min(12, Math.floor(Number(requestedDepth) || 6)));
    reportProgress({ stage: "searching", depth: 1, nodes: 0 });
    wasm._marlin_cpp_search(fenPtr, depth, outPtr, 512);
    const output = wasm.UTF8ToString(outPtr);
    const match = output.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/);
    if (!match) throw new Error("MARLIN V9 returned no move: " + output);

    const nodes = Number((output.match(/\bnodes (\d+)/) || [])[1] || 0);
    const reachedDepth = Number((output.match(/\bdepth (\d+)/) || [])[1] || 0);
    if (reachedDepth !== depth) {
      throw new Error("MARLIN V9 reached depth " + reachedDepth + " instead of " + depth + ".");
    }
    const elapsedMs = Math.max(1, Math.round(performance.now() - startedAt));
    const uci = match[1];
    const result = {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || "q",
      source: "cpp-wasm-v9",
      depth: reachedDepth,
      nodes,
      elapsedMs,
      nps: Math.round(nodes * 1000 / elapsedMs)
    };
    reportProgress({
      stage: "complete",
      depth: reachedDepth,
      completedDepth: reachedDepth,
      nodes,
      elapsedMs,
      nps: result.nps
    });
    return result;
  } finally {
    wasm._free(fenPtr);
    wasm._free(outPtr);
  }
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
      move = await findV9Move(game.fen(), depth, reportProgress);
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
