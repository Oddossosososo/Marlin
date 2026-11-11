import createMarlinModule from "./marlin-wasm.js";

let modulePromise = null;
let nnueStatus = { enabled: false, reason: "Not initialised" };

async function readV9Weights() {
  if (typeof process !== "undefined" && process.versions?.node) {
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(new URL("./nnue/marlin-v9.nnue.json", import.meta.url), "utf8"));
  }
  const response = await fetch(new URL("./nnue/marlin-v9.nnue.json", import.meta.url), {
    cache: "no-cache"
  });
  if (!response.ok) throw new Error("V9 NNUE weights unavailable: HTTP " + response.status);
  return response.json();
}

function validateWeights(candidate) {
  if (candidate?.format !== "MARLIN_NNUE_V1" ||
      candidate?.architecture !== "768x128x32x1" ||
      candidate?.feature_encoding !== "stm-relative-piece-square-v1" ||
      candidate?.training?.model !== "MARLIN V9") {
    throw new Error("V9 NNUE model format or identity is incompatible.");
  }
  const w = candidate.weights;
  if (!w || !Array.isArray(w.fc1_w) || w.fc1_w.length !== 768 ||
      w.fc1_w.some(row => !Array.isArray(row) || row.length !== 128) ||
      !Array.isArray(w.fc1_b) || w.fc1_b.length !== 128 ||
      !Array.isArray(w.fc2_w) || w.fc2_w.length !== 128 ||
      w.fc2_w.some(row => !Array.isArray(row) || row.length !== 32) ||
      !Array.isArray(w.fc2_b) || w.fc2_b.length !== 32 ||
      !Array.isArray(w.out_w) || w.out_w.length !== 32 ||
      !Number.isFinite(w.out_b)) {
    throw new Error("V9 NNUE tensor dimensions are invalid.");
  }
}

function installWeights(wasm, candidate) {
  validateWeights(candidate);
  const w = candidate.weights;
  const tensors = [
    Float32Array.from(w.fc1_w.flat()),
    Float32Array.from(w.fc1_b),
    Float32Array.from(w.fc2_w.flat()),
    Float32Array.from(w.fc2_b),
    Float32Array.from(w.out_w),
    Float32Array.of(w.out_b)
  ];
  if (tensors.some(values => Array.from(values).some(value => !Number.isFinite(value)))) {
    throw new Error("V9 NNUE contains non-finite weights.");
  }

  const ptrs = [];
  try {
    for (const values of tensors) {
      const ptr = wasm._malloc(values.length * Float32Array.BYTES_PER_ELEMENT);
      if (!ptr) throw new Error("Could not allocate V9 NNUE tensor memory.");
      ptrs.push(ptr);
    }

    // Refresh HEAPF32 after all allocations in case WebAssembly memory grew.
    for (let i = 0; i < tensors.length; i++) {
      wasm.HEAPF32.set(tensors[i], ptrs[i] >>> 2);
    }

    const result = wasm._marlin_cpp_set_nnue_weights(
      ptrs[0], ptrs[1], ptrs[2], ptrs[3], ptrs[4], ptrs[5]
    );
    if (result !== 1 || wasm._marlin_cpp_nnue_enabled() !== 1) {
      throw new Error("V9 C++ engine rejected the NNUE weights.");
    }
  } finally {
    for (const ptr of ptrs) wasm._free(ptr);
  }

  nnueStatus = {
    enabled: true,
    positions: candidate.training.positions,
    games: candidate.training.games,
    dataAttribution: candidate.training.data_attribution
  };
}

export async function initialiseV9() {
  if (!modulePromise) {
    modulePromise = createMarlinModule().then(async wasm => {
      try {
        const candidate = await readV9Weights();
        installWeights(wasm, candidate);
        console.log("MARLIN V9 NNUE enabled:", nnueStatus);
      } catch (error) {
        nnueStatus = { enabled: false, reason: error?.message || String(error) };
        console.warn("MARLIN V9 using handcrafted evaluation until GM-trained NNUE is available:", nnueStatus.reason);
      }
      return wasm;
    }).catch(error => {
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
}

export function v9NnueStatus() {
  return nnueStatus;
}

export async function searchV9(fen, requestedDepth = 4, onProgress = () => {}) {
  if (typeof fen !== "string" || !fen.trim()) {
    throw new TypeError("A valid FEN string is required.");
  }

  const depth = Math.max(1, Math.min(12, Math.floor(Number(requestedDepth) || 4)));
  onProgress({ stage: "initialising", depth: 0, nodes: 0 });
  const wasm = await initialiseV9();
  onProgress({ stage: "searching", depth: 0, nodes: 0 });
  const fenBytes = new TextEncoder().encode(fen);
  const fenSize = fenBytes.length + 1;
  const fenPtr = wasm._malloc(fenSize);
  const outPtr = wasm._malloc(512);

  if (!fenPtr || !outPtr) {
    if (fenPtr) wasm._free(fenPtr);
    if (outPtr) wasm._free(outPtr);
    throw new Error("MARLIN V9 could not allocate WebAssembly memory.");
  }

  const startedAt = globalThis.performance?.now?.() ?? Date.now();
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

    const elapsedMs = Math.max(1, (globalThis.performance?.now?.() ?? Date.now()) - startedAt);
    const nodes = Number(nodesText);
    const result = {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || null,
      uci,
      score: Number(scoreText),
      depth: reachedDepth,
      nodes,
      elapsedMs,
      nps: Math.round(nodes * 1000 / elapsedMs),
      nnue: nnueStatus.enabled,
      source: "cpp-wasm-v9"
    };
    onProgress({ stage: "complete", depth: reachedDepth, completedDepth: reachedDepth, nodes, nps: result.nps, elapsedMs });
    return result;
  } finally {
    wasm._free(fenPtr);
    wasm._free(outPtr);
  }
}
