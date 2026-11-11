import { Chess } from "chess.js";
import { performance } from "node:perf_hooks";

const positions = [
  {
    name: "Start position",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    expected: [20, 400, 8902, 197281, 4865609]
  },
  {
    name: "Kiwipete (castling and tactical move generation)",
    fen: "r3k2r/p1ppqpb1/bn2pnp1/2pP4/1p2P3/2N2N2/PPQBBPPP/R3K2R w KQkq - 0 1",
    expected: [48, 2039, 97862, 4085603]
  },
  {
    name: "Position 3 (en-passant and rook endgame)",
    fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    expected: [14, 191, 2812, 43238, 674624]
  },
  {
    name: "Position 4 (promotions and castling rights)",
    fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    expected: [6, 264, 9467, 422333]
  }
];

function perft(game, depth) {
  if (depth === 0) return 1;
  const moves = game.moves({ verbose: true });
  let nodes = 0;
  for (const move of moves) {
    game.move(move);
    nodes += perft(game, depth - 1);
    game.undo();
  }
  return nodes;
}

function format(value) {
  return value.toLocaleString("en-US");
}

const requestedDepth = Number.parseInt(process.argv[2] || "4", 10);
if (!Number.isInteger(requestedDepth) || requestedDepth < 1 || requestedDepth > 4) {
  console.error("Usage: npm run perft:v8 -- [depth 1-4]");
  process.exit(2);
}

let failed = false;
console.log(`MARLIN V8 perft baseline — depth ${requestedDepth}`);
console.log("Move generation is provided by chess.js; this records the reference counts for the C++ port.\n");

for (const position of positions) {
  const game = new Chess(position.fen);
  const expected = position.expected[requestedDepth - 1];
  const started = performance.now();
  const actual = perft(game, requestedDepth);
  const elapsedMs = Math.max(0.01, performance.now() - started);
  const nps = Math.round(actual * 1000 / elapsedMs);
  const passed = expected === undefined || actual === expected;
  if (!passed) failed = true;

  console.log(`${passed ? "PASS" : "FAIL"}  ${position.name}`);
  console.log(`  depth: ${requestedDepth} | nodes: ${format(actual)} | time: ${elapsedMs.toFixed(1)} ms | NPS: ${format(nps)}`);
  if (expected !== undefined) {
    console.log(`  expected: ${format(expected)} | ${passed ? "match" : "MISMATCH"}`);
  } else {
    console.log("  expected: not defined for this depth");
  }
}

console.log(failed ? "\nPerft baseline FAILED." : "\nPerft baseline completed.");
if (failed) process.exitCode = 1;
