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
console.log("MARLIN V9 Lichess integration smoke test passed.");
