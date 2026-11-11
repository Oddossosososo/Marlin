import { Chess } from "chess.js";
import { searchV9 } from "./marlin-v9.js";

const positions = [
  ["starting position", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
  ["Kiwipete", "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"]
];

for (const [name, fen] of positions) {
  const game = new Chess(fen);
  const result = await searchV9(fen, 3);
  const legal = game.moves({ verbose: true }).some(move =>
    move.from === result.from &&
    move.to === result.to &&
    (move.promotion || null) === (result.promotion || null)
  );

  if (!legal) {
    throw new Error(`V9 returned an illegal move in ${name}: ${result.uci}`);
  }
  if (result.depth !== 3 || result.nodes <= 0) {
    throw new Error(`V9 did not complete the expected search in ${name}.`);
  }

  console.log(`PASS ${name}: ${result.uci}, depth ${result.depth}, ${result.nodes} nodes`);
}

console.log("MARLIN V9 Lichess integration smoke test passed.");
