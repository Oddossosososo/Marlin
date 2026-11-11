import { Chess } from "https://esm.sh/chess.js@1.4.0";
import createMarlinModule from "./marlin-wasm.js";
import { findBestMove, initialiseV7 } from "./engine-v7.js";

const positions = [
  ["Starting position", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
  ["Kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"],
  ["Middlegame", "r2q1rk1/pp2bppp/2n1pn2/2pp4/3P4/2P1PN2/PP1NBPPP/R2Q1RK1 w - - 0 10"],
  ["Endgame", "8/5pk1/6p1/3P4/2P5/5K2/8/8 w - - 0 1"]
];

function runCpp(wasm, fen, depth) {
  const bytes = new TextEncoder().encode(fen).length + 1;
  const fenPtr = wasm._malloc(bytes);
  const outPtr = wasm._malloc(512);
  try {
    wasm.stringToUTF8(fen, fenPtr, bytes);
    const start = performance.now();
    wasm._marlin_cpp_search(fenPtr, depth, outPtr, 512);
    const ms = performance.now() - start;
    const output = wasm.UTF8ToString(outPtr);
    const nodePart = output.split("nodes ")[1];
    const depthPart = output.split("depth ")[1];
    const nodes = Number(nodePart || 0);
    const reachedDepth = Number((depthPart || "").split(" ")[0] || 0);
    if (!nodes || reachedDepth !== depth) throw new Error("C++ search returned an invalid result: " + output);
    return { ms, nodes, nps: Math.round(nodes * 1000 / Math.max(ms, 0.01)), move: output.split(" ")[1] || "—" };
  } finally {
    wasm._free(fenPtr);
    wasm._free(outPtr);
  }
}

function runV7(fen, depth) {
  const game = new Chess(fen);
  const start = performance.now();
  const result = findBestMove(game, depth);
  const ms = performance.now() - start;
  if (!result || result.depth !== depth || !result.nodes) throw new Error("V7 did not complete depth " + depth);
  return { ms, nodes: result.nodes, nps: Math.round(result.nodes * 1000 / Math.max(ms, 0.01)), move: result.from + result.to + (result.promotion || "") };
}

self.onmessage = async ({ data }) => {
  try {
    const depth = Math.max(3, Math.min(8, Number(data?.depth) || 5));
    self.postMessage({ type: "status", message: "Initialising C++ WebAssembly and V7…" });
    const wasm = await createMarlinModule();
    await initialiseV7();
    self.postMessage({ type: "status", message: "Warming up both engines…" });
    const warmFen = positions[0][1];
    runV7(warmFen, 2);
    runCpp(wasm, warmFen, 2);
    const results = [];
    for (let i = 0; i < positions.length; i++) {
      const [name, fen] = positions[i];
      self.postMessage({ type: "status", message: "Testing " + name + " (" + (i + 1) + "/" + positions.length + ")…" });
      // Alternate order to reduce systematic first-run bias.
      const v7First = i % 2 === 0;
      let v7, cpp;
      if (v7First) {
        v7 = runV7(fen, depth);
        cpp = runCpp(wasm, fen, depth);
      } else {
        cpp = runCpp(wasm, fen, depth);
        v7 = runV7(fen, depth);
      }
      results.push({
        position: name, v7, cpp,
        faster: v7.ms < cpp.ms ? "V7" : cpp.ms < v7.ms ? "C++" : "Tie"
      });
    }
    const v7Total = results.reduce((sum, row) => sum + row.v7.ms, 0);
    const cppTotal = results.reduce((sum, row) => sum + row.cpp.ms, 0);
    const winner = v7Total < cppTotal ? "V7 JavaScript" : cppTotal < v7Total ? "C++ / WASM" : "Tie";
    const ratio = (Math.max(v7Total, cppTotal) / Math.max(0.01, Math.min(v7Total, cppTotal))).toFixed(2);
    self.postMessage({ type: "complete", results, summary: { winner, ratio } });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || String(error) });
  }
};
