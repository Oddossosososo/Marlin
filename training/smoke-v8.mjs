import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { findBestMove as findV8, initialiseV8 } from "../engine-v8.js";
import { findBestMove as findV7, initialiseV7 } from "../engine-v7.js";

const positions = [
  // Opening, middlegame, side in check, and a simplified ending.
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 4 7",
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
  "8/8/4k3/8/4K3/8/4P3/8 w - - 0 1"
];

await initialiseV8();
await initialiseV7();

for (const [index, fen] of positions.entries()) {
  for (const [name, findMove] of [["V8", findV8], ["V7", findV7]]) {
    const game = new Chess(fen);
    const move = await findMove(game, 3);
    assert.ok(move, `${name} returned no move for test position ${index + 1}`);
    const legal = game.moves({ verbose: true }).some(candidate =>
      candidate.from === move.from &&
      candidate.to === move.to &&
      (candidate.promotion || "q") === (move.promotion || "q")
    );
    assert.ok(legal, `${name} returned an illegal move for test position ${index + 1}`);
    game.move(move);
  }
}

console.log("MARLIN V8/V7 smoke tests passed: 4 positions each, all moves legal.");
