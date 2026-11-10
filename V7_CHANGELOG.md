# MARLIN V7 update

## Included

- Dedicated V7 search module and independent V7 NNUE loader.
- New handcrafted evaluation for king safety, pawn structure, piece activity, mobility, bishop pairs, rook files and endgame king activity.
- Lichess master-game explorer opening lookup, with repertoire guards and a local curated fallback.
- Play and PGN analysis now run V7 in a background worker.
- Arena now compares V7 against V6 using the same five-million-node per-move budget.
- New PGN ingestion and V7 NNUE training workflow.
- Dataset source attribution is stored in the exported model metadata.

## Not yet complete

- No V7 NNUE weights are present until the training workflow succeeds with an authorised master PGN dataset.
- The engine's GM/3500 Elo target is aspirational, not measured.
- The Lichess master opening explorer requires an internet connection; the local book is only a fallback and is not a complete professional opening database.
- Syzygy probing remains online and is not bundled offline.

## Training interpretation

The V7 trainer samples positions reached in high-rated human games and labels those positions with Stockfish evaluations. This exposes the network to a more human-like positional distribution while keeping objective evaluation targets. It does not directly copy human moves or guarantee human-like style or strength.
