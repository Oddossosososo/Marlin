import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { initialiseV9OpeningBook, selectV9OpeningMove } from "./opening-book-v9.js";

const info = await initialiseV9OpeningBook();
assert.equal(info.positions, 0, "the initial placeholder book should report zero trained positions");

const game = new Chess();
const first = selectV9OpeningMove(game);
assert.ok(first, "V9 should choose a curated first move before GM data is trained");
assert.equal(first.san, "e4", "V9 should prefer a classical central opening, not the Van Geet Opening");
assert.ok(game.moves().includes(first.san), "the selected opening move must be legal");

game.move(first);
const blackReply = selectV9OpeningMove(game);
assert.ok(blackReply, "the curated fallback should provide a legal reply");
assert.ok(game.moves().includes(blackReply.san), "the reply must be legal");

const vanGeet = new Chess();
vanGeet.move("Nc3");
assert.equal(selectV9OpeningMove(vanGeet), null,
  "the curated repertoire should not continue the Van Geet Opening as a recommended line");

console.log("MARLIN V9 GM opening-book fallback tests passed.");
