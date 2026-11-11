# MARLIN C++ Engine

The native C++ engine is being developed alongside the JavaScript V8 engine. V8 remains the production/reference engine until the C++ implementation passes correctness tests and measured match-strength tests.

## Implemented
- 64-bit bitboard attack primitives.
- FEN parsing and serialization.
- Legal move generation, including castling, en passant and promotions.
- Make/unmake with reversible state.
- Perft validation against standard start-position and Kiwipete counts.

## Build and test
```sh
g++ -std=c++20 -O3 -DNDEBUG -Wall -Wextra -Werror -pedantic -Icpp/include cpp/src/bitboard.cpp cpp/src/board.cpp cpp/tests/bitboard_tests.cpp cpp/tests/board_tests.cpp -o /tmp/marlin-tests
/tmp/marlin-tests
```

GitHub Actions runs the C++ correctness suite. This is a move-generation foundation, not yet the complete search engine or a replacement for the Lichess bot.
