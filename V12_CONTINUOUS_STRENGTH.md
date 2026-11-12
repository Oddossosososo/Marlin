# MARLIN V12 — Continuous Strength Development

## Goal
Improve playing strength through a repeatable loop of search/evaluation improvements, game analysis, teacher-labelled candidate training, and statistically controlled promotion.

## Search configuration
- Maximum requested depth: 22 plies (already supported by the current C++ search entry point and browser selector).
- Default depth remains conservative for responsiveness.
- Iterative deepening must preserve the best move from the last fully completed iteration.
- Search must remain cancellable; depth 22 is experimental and may take a long time.

## Evaluation and training
- V11 tapered handcrafted evaluation is the safe fallback.
- Train candidate NNUE weights independently; validate tensor dimensions, finite values, dataset provenance, and held-out positions.
- Do not overwrite champion weights on training completion alone.

## Overnight workflow contract
1. Collect permitted game data and Stockfish-labelled positions.
2. Analyse MARLIN's own inaccuracies, mistakes, and blunders.
3. Train a candidate with a reproducible seed and recorded dataset manifest.
4. Run unit tests, legal-move/perft checks, tactical regression tests, and paired colour-swapped champion matches.
5. Publish candidate weights and reports as immutable Actions artifacts.
6. Promote only if the candidate passes every correctness gate and shows a statistically meaningful improvement.
7. Deploy Pages, verify the model file responds successfully, verify the app loads that exact model identity, and retain rollback to the previous champion.

## Reporting states
- QUEUED: GitHub has accepted the scheduled run but no runner has started.
- IN PROGRESS: a job is executing.
- FAILED: a required job or validation gate failed; champion remains active.
- SUCCEEDED: all gates passed and candidate artifact was retained.
- PUBLISHED: successful candidate is on the Pages deployment and the live site confirms it is loaded.

## Important
Scheduled automation is periodic, not continuous per-second training. No rating gain is asserted without paired-match evidence. Training loss is not a playing-strength measurement.
