# MARLIN C++ Engine

The native C++ engine is being developed alongside the JavaScript V8 engine. V8 remains the production/reference engine until the C++ implementation passes correctness tests and measured match-strength tests.

## Implemented
- 64-bit bitboard attack primitives.
- FEN parsing and serialization.
- Legal move generation, including castling, en passant and promotions.
- Reversible make/unmake with castling, en-passant and move counters restored.
- Perft tests for the start position and Kiwipete.
- Iterative-deepening alpha-beta search, quiescence, move ordering and a Zobrist transposition table.
- A standalone UCI command-line interface.
- A repeatable start-position search benchmark in CI.

## Build and test
```sh
cmake -S cpp -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
ctest --test-dir build --output-on-failure
./build/marlin-uci
```

The Lichess runner still uses the JavaScript engine. The C++ engine must pass CI, deeper perft suites, protocol tests and measured head-to-head games before it replaces the production bot. Search features are an initial implementation; speed and strength gains are not assumed until measured.
