# MARLIN V8 — Development

V8 is being developed on the `v8-development` branch. V7 remains the stable production engine until V8 passes the championship gate.

## V8 priorities

1. **Search performance:** profile the existing V7 hot path before changing algorithms; optimise measured bottlenecks rather than guessing.
2. **Search reliability:** add deterministic tactical, legality, repetition, mate-score and timeout regression tests.
3. **Evaluation:** establish a reproducible baseline before training or changing evaluation weights.
4. **Strength testing:** paired games with colours swapped, fixed openings, identical time controls and immutable model checkpoints.
5. **Champion system:** V7 keeps the title until a non-vetoed V8 challenger scores above 50% in a completed paired match set.

## Championship rules

- The champion is not replaced by an untested build.
- A challenger that scores more than 50% wins the match and is promoted immediately, unless vetoed.
- A draw or champion win leaves the champion unchanged.
- Veto blocks promotion for the current challenger; clearing the veto makes it eligible again.
- Match records must include both engine versions, immutable checkpoint IDs, games, score and test settings.
- A browser Arena match is useful for manual checks, but is not by itself a statistically reliable Elo estimate.

## Current status

- [x] V8 development branch created.
- [x] Champion / challenger state machine and tests added.
- [ ] Dedicated V8 search implementation and performance benchmarks.
- [ ] Automated paired-game runner for V8 versus the current champion.
- [ ] Manual start-now / veto / clear-veto controls in GitHub Actions.
- [ ] Promotion workflow connected to verified match results.

V8 is a development baseline, not yet a stronger engine. No Elo or strength claim should be made until the match gate passes.
