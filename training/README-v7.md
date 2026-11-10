# MARLIN V7 training

V7 is trained from positions occurring in high-rated human master games, with
Stockfish centipawn analysis used as a consistent evaluation target. The goal is
to expose the evaluator to strategically coherent human positions without
teaching it to copy an individual player's moves or to prefer unsound moves.

## Input data

Place licensed/authorised standard-chess PGNs in `training/gm-games/`, or supply
an HTTPS PGN / PGN.zst URL to the V7 GitHub Actions workflow. Both players must
have Elo tags at or above the selected threshold, unless a recognised master
title is present. Bot-tagged games are excluded. Games are sampled from their
mainlines; Stockfish labels the resulting positions.

The Lichess database publishes different data collections under different
licences. Its rated-game/evaluation exports are CC0, while its official broadcast
PGN games are CC BY-SA 4.0. Check the exact source collection and preserve its
required attribution and share-alike notices before using it. Do not upload
commercial or otherwise restricted PGN collections unless you have permission.

Source: https://database.lichess.org/

## Training steps

1. Filter the supplied PGNs for human master-level games.
2. Sample positions across opening, middlegame and endgame.
3. Label sampled positions with Stockfish evaluations from the side-to-move POV.
4. Add supplementary Stockfish teacher positions.
5. Train the independent 768x128x32x1 V7 NNUE.
6. Validate tensor dimensions, finite values and master-position contribution.
7. Publish `nnue/marlin-v7.nnue.json` only after validation.

The human games shape the positions the network sees; Stockfish supplies the
numeric target. This is supervised evaluation training, not a claim that the
network has learned grandmaster strength. Strength must be measured in paired
matches against fixed reference engines.
