#!/usr/bin/env node
/**
 * Paired-colour MARLIN vs Stockfish benchmark.
 * This measures the checked-in C++ WebAssembly engine; it does not modify weights.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";
import createMarlinModule from "../marlin-wasm.js";

const envInt = (name, fallback, min, max) => {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
};

const marlinDepth = envInt("MARLIN_BENCH_DEPTH", 4, 1, 12);
const stockfishDepth = envInt("STOCKFISH_BENCH_DEPTH", 8, 1, 20);
const stockfishElo = envInt("STOCKFISH_BENCH_ELO", 1600, 800, 3000);
const openingPairs = [
  ["Italian", ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"]],
  ["Queen's Gambit", ["d4", "d5", "c4", "e6", "Nc3", "Nf6"]],
  ["English", ["c4", "e5", "Nc3", "Nf6", "g3", "d5"]],
  ["King's Indian", ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7"]]
];
const maxPlies = 240;

function createStockfish() {
  const child = spawn("stockfish", [], { stdio: ["pipe", "pipe", "inherit"] });
  const lines = [];
  const waiters = [];
  const rl = createInterface({ input: child.stdout });
  rl.on("line", line => {
    const index = waiters.findIndex(waiter => waiter.match(line));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      waiter.resolve(line);
    } else {
      lines.push(line);
      if (lines.length > 100) lines.shift();
    }
  });
  function waitFor(match, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error("Timed out waiting for Stockfish response."));
      }, timeoutMs);
      const waiter = {
        match,
        resolve: line => { clearTimeout(timer); resolve(line); }
      };
      waiters.push(waiter);
    });
  }
  function send(command) {
    child.stdin.write(command + "\n");
  }
  async function initialise() {
    send("uci");
    await waitFor(line => line === "uciok");
    send("setoption name Threads value 1");
    send("setoption name Hash value 128");
    send("setoption name UCI_LimitStrength value true");
    send(`setoption name UCI_Elo value ${stockfishElo}`);
    await ready();
  }
  async function ready() {
    send("isready");
    await waitFor(line => line === "readyok");
  }
  async function bestMove(fen) {
    send("position fen " + fen);
    send("go depth " + stockfishDepth);
    const line = await waitFor(value => value.startsWith("bestmove "), 120000);
    const move = line.split(/\s+/)[1];
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) {
      throw new Error("Stockfish returned an invalid move: " + line);
    }
    return move;
  }
  return {
    initialise,
    bestMove,
    close: () => { send("quit"); child.kill(); rl.close(); }
  };
}

function marlinBestMove(wasm, fen) {
  const size = new TextEncoder().encode(fen).length + 1;
  const fenPtr = wasm._malloc(size);
  const outPtr = wasm._malloc(512);
  if (!fenPtr || !outPtr) {
    if (fenPtr) wasm._free(fenPtr);
    if (outPtr) wasm._free(outPtr);
    throw new Error("Could not allocate MARLIN search buffers.");
  }
  try {
    wasm.stringToUTF8(fen, fenPtr, size);
    wasm._marlin_cpp_search(fenPtr, marlinDepth, outPtr, 512);
    const output = wasm.UTF8ToString(outPtr);
    const match = output.match(/^bestmove ([a-h][1-8][a-h][1-8][qrbn]?) score (-?\d+) depth (\d+) nodes (\d+)$/);
    if (!match || Number(match[3]) !== marlinDepth) {
      throw new Error("MARLIN search failed or did not reach requested depth: " + output);
    }
    return match[1];
  } finally {
    wasm._free(fenPtr);
    wasm._free(outPtr);
  }
}

async function playGame(wasm, stockfish, openingName, openingMoves, marlinColour) {
  const board = new Chess();
  for (const san of openingMoves) board.move(san);
  const startPly = board.history().length;
  let plies = 0;
  while (!board.isGameOver() && plies < maxPlies) {
    const marlinToMove = board.turn() === marlinColour;
    const uci = marlinToMove
      ? marlinBestMove(wasm, board.fen())
      : await stockfish.bestMove(board.fen());
    const move = board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || undefined
    });
    if (!move) throw new Error(`Illegal ${marlinToMove ? "MARLIN" : "Stockfish"} move ${uci} in ${board.fen()}`);
    plies++;
  }

  const result = board.isCheckmate()
    ? (board.turn() === "w" ? "0-1" : "1-0")
    : "1/2-1/2";
  const marlinScore = result === "1/2-1/2" ? 0.5
    : (result === "1-0" ? (marlinColour === "w" ? 1 : 0)
      : (marlinColour === "b" ? 1 : 0));
  return {
    opening: openingName,
    marlinColour: marlinColour === "w" ? "white" : "black",
    result,
    marlinScore,
    plies: plies + startPly,
    pgn: board.pgn()
  };
}

const wasm = await createMarlinModule();
const stockfish = createStockfish();
const games = [];
try {
  await stockfish.initialise();
  for (const [name, moves] of openingPairs) {
    for (const colour of ["w", "b"]) {
      const game = await playGame(wasm, stockfish, name, moves, colour);
      games.push(game);
      console.log(`${name} | MARLIN ${game.marlinColour} | ${game.result} | ${game.plies} plies`);
    }
  }
} finally {
  stockfish.close();
}

const score = games.reduce((sum, game) => sum + game.marlinScore, 0);
const wins = games.filter(game => game.marlinScore === 1).length;
const draws = games.filter(game => game.marlinScore === 0.5).length;
const losses = games.filter(game => game.marlinScore === 0).length;
const report = {
  schema_version: 1,
  benchmark: "MARLIN V10.5 paired-colour strength test",
  candidate: "current checked-in C++ WebAssembly search",
  opponent: "Stockfish with UCI_LimitStrength enabled",
  settings: { marlinDepth, stockfishDepth, stockfishElo, stockfishThreads: 1, openingPairs: openingPairs.length },
  games: games.length,
  wins,
  draws,
  losses,
  score,
  scorePercent: Number((score / games.length * 100).toFixed(1)),
  note: "A small match set is a regression signal, not a reliable Elo estimate. Compare candidates using the same openings, settings and hardware.",
  pgn: games.map(game => game.pgn).join("\n\n")
};
console.log("MARLIN_BENCHMARK_JSON=" + JSON.stringify(report));
