import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { initialiseV9OpeningBook, selectV9OpeningMove } from "./opening-book-v9.js";
import { selectV9CuratedOpeningMove, v9CuratedOpeningLines } from "./opening-policy-v9.js";

const info = await initialiseV9OpeningBook();
assert.ok(info && typeof info === "object", "V9 opening-book metadata should load");
// The placeholder has zero positions, while a trained book has many.
// Both are valid, so this test must continue passing after training publishes data.
if (info.positions !== undefined) {
  assert.ok(Number.isInteger(info.positions) && info.positions >= 0,
    "opening-book position count must be a non-negative integer");
}

// Prove every curated fallback line is legal from the standard starting position.
for (const line of v9CuratedOpeningLines()) {
  const game = new Chess();
  for (const san of line.moves) {
    const move = game.move(san);
    assert.ok(move, line.name + " contains an illegal move: " + san);
  }
}

// The fallback offers 1.e4 and 1.d4, but V9 search controls the actual first move.
const start = new Chess();
assert.equal(selectV9CuratedOpeningMove(start, () => 0).san, "e4");
assert.equal(selectV9CuratedOpeningMove(start, () => 0.99).san, "d4");
assert.equal(selectV9OpeningMove(start), null,
  "the starting position must be searched rather than forced by an opening book");

// Against 1.e4, the prepared Black options are the Caro-Kann and Sicilian.
const afterE4 = new Chess();
afterE4.move("e4");
assert.equal(selectV9CuratedOpeningMove(afterE4, () => 0).san, "c6");
assert.equal(selectV9CuratedOpeningMove(afterE4, () => 0.99).san, "c5");

// Italian and Ruy Lopez remain available after 1.e4 e5 2.Nf3 Nc6.
const italianPosition = new Chess();
for (const san of ["e4", "e5", "Nf3", "Nc6"]) italianPosition.move(san);
assert.equal(selectV9CuratedOpeningMove(italianPosition, () => 0).san, "Bc4");
assert.equal(selectV9CuratedOpeningMove(italianPosition, () => 0.99).san, "Bb5");

// The Queen's Gambit Declined is the prepared answer to 1.d4.
const afterD4 = new Chess();
afterD4.move("d4");
assert.equal(selectV9CuratedOpeningMove(afterD4, () => 0).san, "d5");

// 1.Nc3 is legal and is not hard-coded out; subsequent play returns to V9 search
// unless the learned GM book has a matching position.
const afterNc3 = new Chess();
assert.ok(afterNc3.moves().includes("Nc3"));
afterNc3.move("Nc3");
assert.equal(selectV9CuratedOpeningMove(afterNc3, () => 0), null);
assert.equal(selectV9OpeningMove(afterNc3), null);

console.log("MARLIN V9 classical opening repertoire tests passed.");
