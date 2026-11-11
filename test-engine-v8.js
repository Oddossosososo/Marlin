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
  (_game, move) => assert.match(move.san, /#$/, "engine should choose a checkmating move")
);

const terminal = new Chess("7k/6Q1/5K2/8/8/8/8/8 b - - 0 1");
assert.equal(findBestMove(terminal, 3), null, "checkmated side must have no move");
console.log("PASS Checkmate position returns no move");

// Replay the user's actual Lichess PGN and capture the two critical positions.
const pgn = "[Event \"casual correspondence game\"]\n[Site \"https://lichess.org/game/UCMJbPuK\"]\n[Date \"2026.11.11\"]\n[Round \"-\"]\n[White \"MarlinChessBot\"]\n[Black \"lichess AI level 8\"]\n[Result \"0-1\"]\n[GameId \"UCMJbPuK\"]\n[UTCDate \"2026.11.11\"]\n[UTCTime \"07:53:10\"]\n[WhiteElo \"3000\"]\n[BlackElo \"676767\"]\n[WhiteTitle \"BOT\"]\n[Variant \"Standard\"]\n[TimeControl \"-\"]\n[ECO \"A00\"]\n[Opening \"Van Geet Opening\"]\n[Termination \"Normal\"]\n\n1. Nc3 c5 2. Nf3 d5 3. d4 Nf6 4. Bg5 Ne4 5. Qd3 Nxg5 6. Nxg5 e5 7. Qe3 f6 8. O-O-O cxd4 9. Rxd4 Bc5 10. Nb5 Nc6 11. Nf3 Qb6 12. Nd6+ Ke7 13. Nxe5 Nxe5 14. Nxc8+ Rhxc8 15. Qxe5+ fxe5 16. Rxd5 Ba3 17. bxa3 Qc6 18. Rd2 Qc3 19. e4 Qa1# 0-1";
const parsed = new Chess();
parsed.loadPgn(pgn);
const playedMoves = parsed.history({ verbose: true });
const replay = new Chess();
let beforeQueenBlunder = null;
let afterBlackThreat = null;
for (let i = 0; i < playedMoves.length; i++) {
  if (i === 14) beforeQueenBlunder = replay.fen(); // after 14...Rhxc8, White to move
  if (i === 36) afterBlackThreat = replay.fen(); // after 18...Qc3, White to move
  replay.move(playedMoves[i].san);
}
assert.ok(beforeQueenBlunder, "PGN must contain position before 15.Qxe5+");
assert.ok(afterBlackThreat, "PGN must contain position after 18...Qc3");

searchAndPlay(
  "PGN regression: avoid the queen capture on e5",
  beforeQueenBlunder,
  5,
  (_game, move) => {
    assert.notEqual(move.from, "e3", "queen must not move from e3 into the f6-pawn capture");
    assert.notEqual(move.to, "e5", "Qxe5+ was the game-losing blunder");
  }
);

searchAndPlay(
  "PGN regression: prevent the mate threat after ...Qc3",
  afterBlackThreat,
  4,
  (game, _move) => {
    const replies = game.moves({ verbose: true });
    for (const reply of replies) {
      game.move(reply);
      assert.equal(game.isCheckmate(), false, `engine allowed immediate mate: ${reply.san}`);
      game.undo();
    }
  }
);

// Reproducible speed sample for future comparisons.
const benchmark = findBestMove(new Chess(), 5);
assert.ok(benchmark, "benchmark position must produce a move");
const depthsPerSecond = benchmark.depth / (benchmark.elapsedMs / 1000);
console.log(
  `BENCHMARK startpos: depth ${benchmark.depth} | ${benchmark.nodes} nodes | ${benchmark.nps} n/s | ${benchmark.elapsedMs} ms | ${depthsPerSecond.toFixed(2)} depths/s`
);
console.log("All MARLIN V8 tactical and PGN regression tests passed.");
