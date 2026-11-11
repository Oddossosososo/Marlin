# MARLIN C++ migration

The migration is staged so the live GitHub Pages app and current V7/V8 engines
remain usable while the native engine is developed and measured.

## Current state

- The existing browser UI, PGN tools, Arena and workers remain JavaScript.
- The current search engines remain the reference implementation.
- `cpp/attacks.cpp` contains the first native C++ bitboard primitives:
  knight, king and colour-specific pawn attack generation.
- The same C++ translation unit is still linked into the existing Rust crate
  through `build.rs`; this keeps the existing Rust-facing ABI working.
- `cpp/CMakeLists.txt` builds the primitives independently, without Rust.

## Migration order

1. Establish native C++ builds and attack-generation regression tests.
2. Implement board state, FEN parsing, make/unmake and legal move generation.
3. Add perft tests against known chess positions before using the new movegen.
4. Port evaluation and search (iterative deepening, alpha-beta/PVS, TT, move
   ordering, quiescence and pruning) while comparing results with the JS engine.
5. Add a UCI executable and run tactical, perft and self-play regression suites.
6. Add a WebAssembly build and connect it to the existing browser worker.
7. The WebAssembly workflow builds and commits `marlin-wasm.js/.wasm`; the\n   browser worker prefers this backend and falls back to V7 if it cannot load.\n8. Promote C++ only after correctness and speed benchmarks show it is ready.

## Build and test

```sh
cmake -S cpp -B build/cpp -DCMAKE_BUILD_TYPE=Release
cmake --build build/cpp --config Release
ctest --test-dir build/cpp --output-on-failure
```

Do not remove the JavaScript or Rust paths until the C++ implementation passes
the same legal-move, PGN, search and Arena regression tests. A faster attack
primitive alone is not evidence that the complete engine is stronger or faster.
