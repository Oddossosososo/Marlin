import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { initialiseV9OpeningBook, selectV9OpeningMove } from "./opening-book-v9.js";
import { selectV9CuratedOpeningMove, v9CuratedOpeningLines } from "./opening-policy-v9.js";

const info = await initialiseV9OpeningBook();
assert.equal(info.positions, 0, "the placeholder GM book starts empty");

// Prove every fallback line is legal from the standard starting position.
for (const line of v9CuratedOpeningLines()) {
  const game = new Chess();
  for (const san of line.moves) {
    const move = game.move(san);
    assert.ok(move, line.name + " contains an illegal move: " + san);
  }
}

// The curated fallback offers 1.e4 and 1.d4, but the first move itself must
// come from V9 search so 1.Nc3 remains possible when V9 evaluates it best.
const start = new Chess();
assert.equal(selectV9CuratedOpeningMove(start, () => 0).san, "e4");
assert.equal(selectV9CuratedOpeningMove(start, () => 0.99).san, "d4");
assert.equal(selectV9OpeningMove(start), null,
  "the starting position must be searched rather than forced by an opening book");

// Against 1.e4, Black's book offers the Caro-Kann and Sicilian, not 1...e5.
const afterE4 = new Chess();
afterE4.move("e4");
assert.equal(selectV9CuratedOpeningMove(afterE4, () => 0).san, "c6");
assert.equal(selectV9CuratedOpeningMove(afterE4, () => 0.99).san, "c5");

// Italian and Ruy Lopez are both available after 1.e4 e5 2.Nf3 Nc6.
const italianPosition = new Chess();
for (const san of ["e4", "e5", "Nf3", "Nc6"]) italianPosition.move(san);
assert.equal(selectV9CuratedOpeningMove(italianPosition, () => 0).san, "Bc4");
assert.equal(selectV9CuratedOpeningMove(italianPosition, () => 0.99).san, "Bb5");

// The Queen's Gambit Declined is the prepared answer to 1.d4.
const afterD4 = new Chess();
afterD4.move("d4");
assert.equal(selectV9CuratedOpeningMove(afterD4, () => 0).san, "d5");

// A game that begins 1.Nc3 leaves the curated repertoire and goes to
// normal V9 search for the reply. The first move was not forbidden.
const vanGeet = new Chess();
assert.ok(vanGeet.moves().includes("Nc3"));
vanGeet.move("Nc3");
assert.equal(selectV9CuratedOpeningMove(vanGeet, () => 0), null);
assert.equal(selectV9OpeningMove(vanGeet), null);

console.log("MARLIN V9 classical opening repertoire tests passed.");
