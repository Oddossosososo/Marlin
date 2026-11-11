import createMarlinModule from "./marlin-wasm.js";

let modulePromise = null;

export async function initialiseV9() {
  if (!modulePromise) {
    modulePromise = createMarlinModule().catch(error => {
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
}

export async function searchV9(fen, requestedDepth = 4) {
  if (typeof fen !== "string" || !fen.trim()) {
    throw new TypeError("A valid FEN string is required.");
  }

  const depth = Math.max(1, Math.min(12, Math.floor(Number(requestedDepth) || 4)));
  const wasm = await initialiseV9();
  const fenBytes = new TextEncoder().encode(fen);
  const fenSize = fenBytes.length + 1;
  const fenPtr = wasm._malloc(fenSize);
  const outPtr = wasm._malloc(512);

  if (!fenPtr || !outPtr) {
    if (fenPtr) wasm._free(fenPtr);
    if (outPtr) wasm._free(outPtr);
    throw new Error("MARLIN V9 could not allocate WebAssembly memory.");
  }

  const startedAt = process.hrtime.bigint();
  try {
    wasm.stringToUTF8(fen, fenPtr, fenSize);
    wasm._marlin_cpp_search(fenPtr, depth, outPtr, 512);
    const output = wasm.UTF8ToString(outPtr);
    const match = output.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?) score (-?\d+) depth (\d+) nodes (\d+)$/);

    if (!match) {
      throw new Error("MARLIN V9 returned an invalid search response: " + output);
    }

    const [, uci, scoreText, depthText, nodesText] = match;
    const reachedDepth = Number(depthText);
    if (reachedDepth !== depth) {
      throw new Error("MARLIN V9 reached depth " + reachedDepth + " instead of " + depth + ".");
    }

    const elapsedMs = Math.max(1, Number(process.hrtime.bigint() - startedAt) / 1e6);
    const nodes = Number(nodesText);
    return {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || null,
      uci,
      score: Number(scoreText),
      depth: reachedDepth,
      nodes,
      elapsedMs,
      nps: Math.round(nodes * 1000 / elapsedMs),
      source: "cpp-wasm-v9"
    };
  } finally {
    wasm._free(fenPtr);
    wasm._free(outPtr);
  }
}
