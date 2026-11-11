import { Chess } from "https://esm.sh/chess.js@1.4.0";
import createMarlinModule from "./marlin-wasm.js";
import { findBestMove as findV8Move, initialiseV8 } from "./engine-v8.js";

const positions = [
  ["Starting position", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
  ["Kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"],
  ["Middlegame", "r2q1rk1/pp2bppp/2n1pn2/2pp4/3P4/2P1PN2/PP1NBPPP/R2Q1RK1 w - - 0 10"],
  ["Endgame", "8/5pk1/6p1/3P4/2P5/5K2/8/8 w - - 0 1"]
];

function runV9(wasm, fen, depth) {
  const bytes = new TextEncoder().encode(fen).length + 1;
  const fenPtr = wasm._malloc(bytes);
  const outPtr = wasm._malloc(512);
  try {
    wasm.stringToUTF8(fen, fenPtr, bytes);
    const start = performance.now();
    wasm._marlin_cpp_search(fenPtr, depth, outPtr, 512);
    const ms = performance.now() - start;
    const output = wasm.UTF8ToString(outPtr);
    const nodes = Number((output.match(/\bnodes (\d+)/) || [])[1] || 0);
    const reachedDepth = Number((output.match(/\bdepth (\d+)/) || [])[1] || 0);
    const match = output.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?)/);
    if (!match || reachedDepth !== depth || !nodes) {
      throw new Error("V9 did not complete depth " + depth + ": " + output);
    }
    return {
      ms, nodes,
      nps: Math.round(nodes * 1000 / Math.max(ms, 0.01)),
      move: match[1]
    };
  } finally {
    wasm._free(fenPtr);
    wasm._free(outPtr);
  }
}

function runV8(fen, depth) {
  const game = new Chess(fen);
  const start = performance.now();
  const result = findV8Move(game, depth);
  const ms = performance.now() - start;
  if (!result || result.depth !== depth || !result.nodes) {
    throw new Error("V8 did not complete depth " + depth);
  }
  return {
    ms, nodes: result.nodes,
    nps: Math.round(result.nodes * 1000 / Math.max(ms, 0.01)),
    move: result.from + result.to + (result.promotion || "")
  };
}

self.onmessage = async ({ data }) => {
  try {
    const depth = Math.max(3, Math.min(8, Number(data?.depth) || 5));
    self.postMessage({ type: "status", message: "Initialising V9 WebAssembly and V8…" });
    const wasm = await createMarlinModule();
    await initialiseV8();
    self.postMessage({ type: "status", message: "Warming up both engines…" });
    const warmFen = positions[0][1];
    runV8(warmFen, 2);
    runV9(wasm, warmFen, 2);

    const results = [];
    for (let i = 0; i < positions.length; i++) {
      const [name, fen] = positions[i];
      self.postMessage({ type: "status", message: "Testing " + name + " (" + (i + 1) + "/" + positions.length + ")…" });
      // Alternate which engine runs first to reduce systematic warm-up bias.
      let v8, v9;
      if (i % 2 === 0) {
        v8 = runV8(fen, depth);
        v9 = runV9(wasm, fen, depth);
      } else {
        v9 = runV9(wasm, fen, depth);
        v8 = runV8(fen, depth);
      }
      results.push({
        position: name, v8, v9,
        faster: v8.ms < v9.ms ? "V8" : v9.ms < v8.ms ? "V9" : "Tie"
      });
    }

    const v8Total = results.reduce((sum, row) => sum + row.v8.ms, 0);
    const v9Total = results.reduce((sum, row) => sum + row.v9.ms, 0);
    const winner = v8Total < v9Total ? "V8 JavaScript" : v9Total < v8Total ? "V9 C++ / WASM" : "Tie";
    const ratio = (Math.max(v8Total, v9Total) / Math.max(0.01, Math.min(v8Total, v9Total))).toFixed(2);
    self.postMessage({ type: "complete", results, summary: { winner, ratio } });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || String(error) });
  }
};
