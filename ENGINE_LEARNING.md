# Marlin Engine Learning Notes

This document records search ideas for Marlin's independent implementation. It is a learning guide, not copied Stockfish or Reckless source code.

## Already in Marlin V2

- **Alpha-beta pruning:** narrows the search window and cuts branches that cannot improve the current result.
- **Negamax:** uses the side-to-move score convention to simplify minimax.
- **Iterative deepening:** searches depth 1, then 2, and so on, reusing the previous best move for ordering.
- **Transposition table:** caches positions with depth and exact/lower/upper bounds.
- **Principal Variation Search (PVS):** searches later moves with a narrow window first, then re-searches promising moves.
- **Late Move Reductions (LMR):** searches later quiet moves at reduced depth and restores depth when they beat alpha.
- **Move ordering:** transposition-table move, promotions, captures, killer moves, then history-scored quiet moves.

## Added: Null-move pruning

Null-move pruning asks whether the side to move would still exceed beta after effectively passing. If the reduced null search fails high, the normal search can often be cut off.

Marlin guards this with:
- minimum search depth;
- not being in check;
- enough non-pawn material for the side to move;
- no consecutive null-move searches.

It is a heuristic, not a legal chess move. It can misjudge zugzwang positions, so it must be tested against a build with the feature disabled.

## Stockfish study checklist

Study these concepts from Stockfish's public architecture and implement them independently:
1. Stronger move ordering and capture quality scoring (SEE).
2. Better history tables and continuation history.
3. Static evaluation improvements, then NNUE as a separate project.
4. Search stability: aspiration windows, pruning margins, and time management.
5. Perft and tactical test suites before strength claims.

Do not copy source code unless the applicable licence and attribution requirements are followed.

## Reckless study checklist

Reckless is useful for learning how a Rust engine organizes:
- NNUE evaluation and accumulator updates;
- SIMD backends;
- staged move picking;
- history heuristics;
- pruning and extensions;
- tablebase integration.

Treat these as architecture lessons. Reimplement ideas from first principles and respect Reckless's AGPL-3.0 licence before reusing any code.

## Testing before claiming strength gains

- Run perft positions to check move generation.
- Compare null pruning on/off over the same tactical and zugzwang test positions.
- Run many paired V1/V2 games with colors swapped.
- Save every Arena game as PGN and inspect blunders.
- Use fixed depth or fixed time and report the sample size; one game is not an Elo rating.
