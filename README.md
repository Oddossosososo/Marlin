# MARLIN Chess Engine

MARLIN is an experimental browser chess engine and training project.

## Current engine: V6

- V6 search is the default engine for player games.
- Iterative deepening, alpha-beta / negamax, transposition table, PVS, LMR and null-move pruning.
- Static-exchange-aware quiescence filtering to avoid wasting search on losing captures.
- V6 loads its own trained NNUE weights from `nnue/marlin-v6.nnue.json`.
- If the V6 network has not finished training or cannot be loaded, the engine clearly falls back to its classical evaluator.

## Training V6

The workflow `.github/workflows/train-marlin-v6.yml` trains a Marlin-owned NNUE model using Stockfish UCI evaluations as teacher labels. It generates a larger dataset, trains the compact 768x128x32x1 network, validates its structure and provenance metadata, then publishes the resulting weights to GitHub Pages.

The network is an independent Marlin model; this project does not bundle Stockfish's network or copy Stockfish source code.

## Arena

The Arena compares MARLIN V6 against V5 with alternating colours. Use the same search depth for both engines and collect many games before drawing strength conclusions. One game is not an Elo rating.

## Run

Open the GitHub Pages site:

https://oddossosososo.github.io/Marlin/

