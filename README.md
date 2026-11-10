# Marlin Chess

Marlin is an experimental, multi-language chess-engine project. The first milestone is a browser-playable chess engine written in JavaScript.

## Play Marlin

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and `/ (root)`, then save.
4. Open the Pages URL GitHub provides.

You can also run it locally with a small static web server, for example:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

> The page imports chess.js from esm.sh, so an internet connection is required.

## Current features

- Legal chess moves, check, checkmate, castling, en passant and promotion handled by chess.js.
- Play as White against Marlin as Black.
- Minimax-style negamax search with alpha-beta pruning.
- Material and basic piece-square evaluation.
- Adjustable search depth, move history, undo and new game.

## Project structure

- `index.html` — application page
- `style.css` — board and interface styling
- `app.js` — game UI and player interaction
- `engine.js` — Marlin's move search and evaluation

## Roadmap

- Add automated engine-vs-engine testing.
- Add opening book and transposition table.
- Improve evaluation, move ordering and search extensions.
- Add UCI support and a native high-performance engine.
- Compare strength against Stockfish using repeatable match settings.

## Important

Marlin v0.1 is a learning prototype. It is not expected to beat Stockfish. Search depth is adjustable, but deeper searches can take noticeably longer in a browser.


## Native Rust + C++ experiment

The first native engine component is a C++ bitboard implementation called from Rust through a small C ABI.

- `cpp/attacks.cpp` — C++ knight attack generation
- `src/lib.rs` — safe Rust wrapper and unit tests
- `build.rs` — compiles the C++ source with the Rust `cc` build helper
- `Cargo.toml` — native Rust crate configuration

### Build and test

Install the Rust toolchain and a C++ compiler, then run:

```bash
cargo test
```

This is currently a native build experiment. The existing browser game still uses `engine.js`; browser/WASM integration will be a later step after the native bridge is tested.


## MARLIN V4 (development branch)

V4 is developed on `marlin-v4-nnue`, leaving `main`, V2 and V3 untouched.

- Zobrist position hashing and bounded transposition table.
- Iterative-deepening negamax with alpha-beta, PVS, LMR, null-move pruning, quiescence, killer/history move ordering.
- NNUE inference module (`nnue-v4.js`) with a Stockfish-teacher-trained 768x128x32x1 network.
- V4 is the player engine; the Arena runs V4 (White) against V3 (Black).

### Train actual NNUE weights

The repository contains the trainer, but trained weights are not checked in until generated. This avoids pretending random weights are a trained network.

1. Install Python dependencies: `pip install -r training/requirements.txt`.
2. Collect Stockfish-labelled positions:
   `python training/generate_dataset.py --stockfish /path/to/stockfish --games 1000 --depth 12 --sample-every 2`
3. Train and export:
   `python training/train_nnue.py --data training/data/stockfish.jsonl --out nnue/marlin-v4.nnue.json --epochs 20`

Until the exported file exists, V4 explicitly falls back to the V3 handcrafted evaluator while keeping the V4 search active. Once the file is deployed, the NNUE loader activates it automatically.

The trainer's network is MARLIN's own model. Stockfish supplies evaluation labels only; Stockfish network weights are not copied.


## MARLIN V5

V5 adds aspiration-window iterative deepening and a countermove heuristic on top of the V4 search/evaluation foundation. The Arena compares V5 against the V3 baseline and alternates colours on successive matches to reduce first-move bias. NNUE remains optional and is only active when trained weights are supplied; otherwise V5 uses the existing classical evaluation. Arena results are local self-play observations, not an Elo rating.
