# MARLIN C++ Engine

This directory contains the new native C++ engine, developed alongside the existing
JavaScript V8 engine. The JavaScript engine remains the reference implementation
until the C++ engine passes correctness tests and demonstrates measured strength.

## Current milestone

The first milestone is the low-level bitboard foundation:

- A1 = bit 0, H8 = bit 63.
- Pawn, knight and king attack masks.
- Blocker-aware rook, bishop and queen attack generation.
- Bit counting and least-significant-bit extraction.

This is **not yet a complete chess engine**. Legal move generation, FEN parsing,
make/unmake, check detection, castling, en passant, promotions, search and UCI
will be added in later milestones.

## Build and test

Requires a C++20 compiler:

```sh
g++ -std=c++20 -O2 -Wall -Wextra -Werror -pedantic \
  -Icpp/include cpp/src/bitboard.cpp cpp/tests/bitboard_tests.cpp \
  -o /tmp/marlin-bitboard-tests
/tmp/marlin-bitboard-tests
```


The C++ core is validated by the `MARLIN C++ Core Checks` GitHub Actions workflow.
