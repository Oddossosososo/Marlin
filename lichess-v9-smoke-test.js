import { Chess } from "chess.js";
import { searchV9 } from "./marlin-v9.js";

const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const game = new Chess(fen);
const result = await searchV9(fen, 2);
const legal = game.moves({ verbose: true }).some(move =>
  move.from === result.from &&
  move.to === result.to &&
  (move.promotion || null) === (result.promotion || null)
);

if (!legal) {
  throw new Error("V9 returned an illegal move from the starting position: " + result.uci);
}
if (result.depth !== 2 || result.nodes <= 0) {
  throw new Error("V9 did not complete the expected depth-2 search.");
}

console.log(`PASS starting position: ${result.uci}, depth ${result.depth}, ${result.nodes} nodes`);

const timed = await searchV9(fen, 5, 150);
const timedLegal = game.moves({ verbose: true }).some(move =>
  move.from === timed.from &&
  move.to === timed.to &&
  (move.promotion || null) === (timed.promotion || null)
);
if (!timedLegal) {
  throw new Error("V9 returned an illegal move under the blitz time budget: " + timed.uci);
}
if (timed.elapsedMs > 1500) {
  throw new Error("V9 exceeded its 150ms search budget by too much: " + timed.elapsedMs + "ms");
}
console.log(`PASS timed search: ${timed.uci}, completed depth ${timed.depth}/5, ${timed.elapsedMs.toFixed(1)}ms`);

console.log("MARLIN V9 Lichess integration smoke test passed.");
