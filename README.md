# MARLIN Chess Engine

MARLIN is an experimental browser chess engine and training project.

## Current engine: V7

- V7 is the default engine for Play and PGN next-move analysis.
- Iterative deepening, alpha-beta / negamax, transposition table, PVS, LMR and null-move pruning. Search stops at the selected depth; there is no fixed node-count cutoff. Depth 6 is the default in Play, Arena and PGN analysis. Actual nodes are reported for diagnostics. V7's search hot path avoids temporary board allocation during Zobrist hashing and reuses previous-move context rather than rebuilding move history at every node.
- A dedicated handcrafted evaluation adds king safety, pawn structure, piece activity and mobility, bishop-pair value, rook files and endgame king activity. Structural weaknesses are evaluated as soft penalties; tactics can justify them.
- The opening policy consults Lichess's master-game opening explorer, enforces the selected first-move repertoire, and falls back to the local curated lines when the service is unavailable.
- V7 loads its own weights from `nnue/marlin-v7.nnue.json`. Until the V7 training workflow publishes that file, V7 uses its handcrafted evaluation.
- Syzygy tablebase probing remains an optional online endgame helper.

## V7 training

The workflow `.github/workflows/train-marlin-v7.yml` trains the V7 NNUE using positions sampled from supplied high-rated human PGNs. Stockfish labels those positions with centipawn evaluations, and supplementary Stockfish teacher positions are mixed in.

The master-game positions shape the training distribution; Stockfish supplies consistent evaluation targets. This is not move imitation and does not prove GM strength. The workflow filters bot games, validates player rating/title metadata, validates model tensors, records dataset attribution and only then publishes V7 weights.

Place authorised PGNs in `training/gm-games/` or pass an HTTPS PGN / PGN.zst URL to the workflow. Check the source's licence and preserve any required attribution. See `training/README-v7.md`. Lichess data collections have different licences: its rated-game/evaluation exports are CC0, while official broadcast PGNs are CC BY-SA 4.0.

## Arena

Arena compares MARLIN V7 against V6 with alternating colours. Both search to the selected depth without a fixed node-count cutoff, and the interface reports actual nodes searched. Opening-book and tablebase moves can bypass normal search. Save and inspect many games before drawing strength conclusions.

## Legacy versions

MARLIN V1, V2 and V3 are deprecated and retained only for historical reference, old-game reproduction and regression comparisons. V3 is preserved as `engine.js`; it is not used by active Play or Arena. V5 remains in the source for older comparisons; V6 is the current Arena baseline.

## Run

Open the GitHub Pages site:

https://oddossosososo.github.io/Marlin/
