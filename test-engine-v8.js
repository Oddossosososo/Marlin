import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { findBestMove, initialiseV8 } from "./engine-v8.js";

await initialiseV8();

function searchAndPlay(name, fen, depth, verify) {
  const game = new Chess(fen);
  const result = findBestMove(game, depth);
  assert.ok(result, `${name}: engine returned no move`);

  const played = game.move({
    from: result.from,
    to: result.to,
    promotion: result.promotion || undefined
  });
  assert.ok(played, `${name}: engine returned an illegal move`);
  verify(game, played, result);
  console.log(`PASS ${name}: ${played.san} | depth ${result.depth} | ${result.nodes} nodes`);
}

searchAndPlay(
  "Opening move is legal",
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  3,
  (_game, _move, result) => {
    assert.ok(result.nodes > 0);
    assert.equal(result.depth, 3);
  }
);

searchAndPlay(
  "Find mate in one",
  "7k/8/5KQ1/8/8/8/8/8 w - - 0 1",
  3,
  (_game, move) => {
    assert.match(move.san, /#$/, "engine should choose a checkmating move");
  }
);

const terminal = new Chess("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1");
assert.equal(findBestMove(terminal, 3), null, "checkmated side must have no move");
console.log("PASS Checkmate position returns no move");
console.log("All MARLIN V8 tactical smoke tests passed.");
