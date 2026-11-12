# MARLIN World Championship

The championship compares every engine implementation currently present in the repository: V1, V2, V4, V5, V6, V7, V8 and V9. V3 is not included because no V3 engine implementation exists in this repository.

## Format
- Round robin: every engine plays every other engine.
- Ten games per pairing, with each engine playing five games as White and five as Black.
- Identical starting positions and the same search-depth setting for every engine.
- A 160-ply cap; games reaching the cap are scored as draws.
- The highest total points wins. The incumbent champion is retained on a points tie.
- Full PGNs, pair results and standings are saved as workflow artifacts/repository reports.

## One public identity
The website and player-facing identity remain **MARLIN**. The selected implementation is recorded privately in `champion.json` and loaded by `champion-engine.js`. Version IDs are implementation details, not separate player-facing bots.

## Automation
GitHub Actions runs the tournament nightly and on manual dispatch. A completed run commits the new standings, PGNs and champion selection. It does not claim an Elo rating: this is an internal round-robin score, and ten games per pairing is a small sample. Search depth 3 is intentionally conservative for CI runtime and can be raised after measuring the run duration.

## Safety gates
The tournament fails on an illegal move or engine error. The current champion remains unchanged if the run fails. No promotion occurs on a tie. Review the PGNs and standings before treating a promoted build as stronger.
