# MARLIN V9: GM games, NNUE and opening book

## Automatic source

The GitHub Actions workflow `.github/workflows/train-marlin-v9.yml` runs weekly. When no custom PGN URL or repository PGNs are supplied, it reads the newest complete archive URL from:

https://database.lichess.org/broadcast/list.txt

The official Lichess broadcast PGN archives are published under **Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0)**. The workflow stores attribution and the licence in the exported model metadata. It does not commit the raw source PGN.

## Filtering

A game is eligible when both players are recognised titled masters (GM, WGM, IM, WIM, FM, WFM), or each player's Elo is at least the configured threshold. Player titles BOT, ENGINE and COMPUTER always exclude a game, even if the PGN has an inflated Elo tag. Only standard PGN games with valid results and enough moves contribute.

## What gets trained

1. Sample positions from the master games across the opening and middlegame.
2. Ask Stockfish for side-to-move centipawn labels.
3. Add supplementary Stockfish self-play teacher positions.
4. Train MARLIN's independent 768x128x32x1 NNUE network.
5. Build a separate opening book from the legal moves played most often in qualifying master games.
6. Validate tensor sizes, finite values, minimum GM-position contribution and opening-book metadata before publishing.

This is evaluation distillation using master-game positions, not imitation learning. The opening book records frequent human-master moves; it is not a guarantee that every stored move is best. When there is no book entry, V9 uses search.

## Opening policy

The local fallback begins with classical central openings, including 1.e4 and 1.d4. The Van Geet Opening (1.Nc3) is not a recommended first move in the curated repertoire. If the opponent leaves the book, MARLIN immediately returns to normal search.

## Running manually

Open **Actions → Train MARLIN V9 from GM games → Run workflow** on the main branch. The default is to use the latest Lichess broadcast archive automatically. A custom HTTPS PGN or PGN.zst URL can override it. You can adjust the minimum Elo, Stockfish depth, teacher-game count and epoch count.

## Model status and strength

Before the first successful training run, the V9 NNUE file is absent and the C++ engine deliberately uses its handcrafted evaluation. The opening-book JSON begins empty, so the curated repertoire is used. After successful validation, the workflow publishes:

- `nnue/marlin-v9.nnue.json`
- `nnue/marlin-v9-opening-book.json`

Training/validation loss only measures how well the evaluation approximates Stockfish's labels. It is not an Elo rating or proof of grandmaster strength. Measure playing strength with large paired matches, colour swaps, fixed hardware and a fixed time control against known reference engines.

## Attribution

Lichess broadcast database: https://database.lichess.org/broadcast/

Dataset licence: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0).
