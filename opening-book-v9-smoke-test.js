import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { initialiseV9OpeningBook, selectV9OpeningMove } from "./opening-book-v9.js";

const info = await initialiseV9OpeningBook();
assert.ok(info.positions > 0, "the trained V9 GM opening book should contain positions");
assert.ok(info.games_accepted > 0, "the trained V9 GM opening book should contain accepted master games");

const game = new Chess();
const first = selectV9OpeningMove(game);
assert.ok(first, "V9 should choose a move from the trained GM book in the starting position");
assert.equal(first.source, "gm-opening-book", "the starting move should come from the trained GM book");
assert.equal(first.san, "e4", "the most-supported starting move should be 1.e4");
assert.ok(first.bookGames >= 3, "the selected move should meet the book's minimum sample threshold");
assert.ok(game.moves().includes(first.san), "the selected opening move must be legal");

game.move(first);
const blackReply = selectV9OpeningMove(game);
assert.ok(blackReply, "the GM book or curated fallback should provide a legal reply");
assert.ok(game.moves().includes(blackReply.san), "the reply must be legal");

console.log("MARLIN V9 trained GM opening-book tests passed.");
