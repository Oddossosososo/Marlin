// The C++ WASM now includes SEE capture ordering and expanded positional terms.
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

const timed = await searchV9(fen, 5, undefined, 150);
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


const openingTrap = new Chess();
for (const san of ["Nf3", "d5", "Nc3"]) {
  if (!openingTrap.move(san)) throw new Error("Could not build opening regression position: " + san);
}
const trapResult = await searchV9(openingTrap.fen(), 4);
if (trapResult.uci === "c8h3") {
  throw new Error("V9 regression: the bishop-hanging move ...Bh3 was selected.");
}
const trapLegal = openingTrap.moves({ verbose: true }).some(move =>
  move.from === trapResult.from &&
  move.to === trapResult.to &&
  (move.promotion || null) === (trapResult.promotion || null)
);
if (!trapLegal) throw new Error("V9 returned an illegal move in the opening-trap regression.");
console.log(`PASS opening tactical regression: rejected ...Bh3; selected ${trapResult.uci} at depth ${trapResult.depth}`);

console.log("MARLIN V9 Lichess integration smoke test passed.");
