import assert from "node:assert/strict";
import { moveTimeBudgetMs } from "../move-time-manager.js";

function position({ checked = false, forcing = 0, pieces = 32 } = {}) {
  return {
    isCheck: () => checked,
    moves: () => Array.from({ length: 20 }, (_, i) => ({
      captured: i < forcing ? "p" : undefined
    })),
    board: () => Array.from({ length: 8 }, (_, rank) =>
      Array.from({ length: 8 }, (_, file) => rank * 8 + file < pieces ? { type: "p" } : null)
    )
  };
}

const quiet = moveTimeBudgetMs({ wtime: 60000, winc: 0 }, "w", position());
const tactical = moveTimeBudgetMs({ wtime: 60000, winc: 0 }, "w", position({ forcing: 5 }));
const check = moveTimeBudgetMs({ wtime: 60000, winc: 0 }, "w", position({ checked: true }));
const endgame = moveTimeBudgetMs({ wtime: 60000, winc: 0 }, "w", position({ pieces: 8 }));

assert(tactical > quiet, "Tactical positions should receive more search time.");
assert(check > tactical, "Check evasions should receive the highest priority.");
assert(endgame > quiet, "Endgames should receive a modest time increase.");
assert(quiet <= 3000, "Normal search time must remain capped.");
assert(moveTimeBudgetMs({ wtime: 1000, winc: 0 }, "w", position()) <= 50,
  "Low-clock search must respect the 5% clock cap.");
assert.equal(moveTimeBudgetMs({}, "w", position()), 100,
  "Clockless games should use the safe fallback.");
console.log("MARLIN adaptive time-management tests passed.");
