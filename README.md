# MARLIN Chess Engine

MARLIN is an experimental browser chess engine and training project.

## Play engine: V9 C++ WebAssembly

- V9 C++ WebAssembly is the default engine for Play and PGN next-move analysis. The Play interface falls back to the V7 policy/search if WebAssembly cannot load. V9's C++ search currently supports up to 12 plies.
- Iterative deepening, alpha-beta / negamax, transposition table, PVS, LMR and null-move pruning. Search stops at the selected depth; there is no fixed node-count cutoff. Depth 6 is the default in Play, Arena and PGN analysis. Arena reads the selected depth control and sends that same depth to both V7 and V6. Actual nodes, elapsed time and nodes per second (NPS) are reported. V7 uses numeric 53-bit Zobrist keys instead of BigInt, scores each move once before sorting, keeps a bounded transposition table and move-ordering history warm across turns, and reuses the previous root move as a principal-variation hint. V6's Arena search also reuses previous-move context instead of rebuilding the full game history at every node.
- A dedicated handcrafted evaluation adds king safety, pawn structure, piece activity and mobility, bishop-pair value, rook files and endgame king activity. Structural weaknesses are evaluated as soft penalties; tactics can justify them.
- Captures use standard chess material values. V7's handcrafted fallback explicitly scores the white-minus-black material balance, alongside positional terms. Static-exchange evaluation is used for capture ordering and quiescence pruning; it does not punish the capturing piece simply for taking.
- V9 checks its local GM opening book first, then uses a curated classical repertoire that starts with 1.e4 rather than 1.Nc3 (the Van Geet). When no book move exists, it searches normally. V7 retains its separate opening policy.
- V7 loads its own weights from `nnue/marlin-v7.nnue.json`. Until the V7 training workflow publishes that file, V7 uses its handcrafted evaluation.
- Syzygy tablebase probing remains an optional online endgame helper.

## V7 training

The workflow `.github/workflows/train-marlin-v7.yml` trains the V7 NNUE using positions sampled from supplied high-rated human PGNs. Stockfish labels those positions with centipawn evaluations, and supplementary Stockfish teacher positions are mixed in.

The master-game positions shape the training distribution; Stockfish supplies consistent evaluation targets. This is not move imitation and does not prove GM strength. The workflow filters bot games, validates player rating/title metadata, validates model tensors, records dataset attribution and only then publishes V7 weights.

Place authorised PGNs in `training/gm-games/` or pass an HTTPS PGN / PGN.zst URL to the workflow. Check the source's licence and preserve any required attribution. See `training/README-v7.md`. Lichess data collections have different licences: its rated-game/evaluation exports are CC0, while official broadcast PGNs are CC BY-SA 4.0.

## V9 GM training and opening repertoire

The `.github/workflows/train-marlin-v9.yml` workflow checks the official Lichess broadcast archive weekly. It downloads the newest complete monthly broadcast PGN, then filters games to titled masters or games where both players meet the minimum Elo threshold. Games marked BOT or ENGINE are always excluded, regardless of their Elo tags.

Stockfish labels sampled positions from the human master games; additional Stockfish teacher positions are mixed in to train MARLIN's own 768x128x32x1 V9 NNUE. The same master PGNs build a move-frequency opening book. V9 uses that GM book first, then a curated classical fallback; the Van Geet Opening is not in the recommended repertoire. Deviating from book always returns to search.

Lichess official broadcast PGNs are released under CC BY-SA 4.0. The trained files record source attribution and the dataset licence; the workflow does not publish the raw PGN archive. Review `training/README-v9.md` for the pipeline and limitations.

**Current model status:** the checked-in opening-book file is initially empty, and the V9 NNUE is not considered active until the first training run publishes `nnue/marlin-v9.nnue.json`. Until then V9 uses its handcrafted evaluation and curated opening fallback. Training loss or GM-game exposure alone does not establish GM playing strength; use paired engine matches to measure it.

## MARLIN V10 continuous-learning foundation

The V10 learning-analysis workflow (`.github/workflows/marlin-v10-learning.yml`) runs daily and can also be started manually. It downloads up to 50 recent public games for the configured Lichess bot username (default: `MarlinChessBot`), analyses both sides' moves for context, but classifies and exports training positions only for MARLIN's own moves: inaccuracies (50+ cp), mistakes (100+ cp), and blunders (200+ cp). It exports a JSON report plus Stockfish-labelled FEN positions as downloadable workflow artifacts.

For private or locally supplied games, place authorised standard-chess PGNs in `training/marlin-games/` and run the workflow with the Lichess username input left blank. The reusable analyser is `training/analyze_marlin_games.py`; its helper tests are in `training/test_analyze_marlin_games.py`.

**Safety gate:** this first V10 stage collects and labels experience; it does not silently alter the live engine or overwrite V9 NNUE weights. A later training run must use held-out game-level validation and paired colour-swapped matches against the current champion before any candidate is promoted. More games alone do not guarantee stronger play.

## V9 vs V8 Arena

The Arena now pits MARLIN V9 (C++ WebAssembly search) against MARLIN V8 (JavaScript search), alternating colours between games. Both engines receive the same position and selected depth; V9 is capped at 12 plies by its current C++ search interface. The board verifies every returned move is legal, and the Arena records wins and draws and can export the game as PGN.

V9 adds killer-move ordering, a bounded quiet-move history heuristic, staged move priorities, and corrected mate-score conversion for transposition-table storage and retrieval. V8 remains the comparison baseline. V9 is a challenger, not a proven stronger engine: use a multi-game match set and independent testing before making an Elo or strength claim.

## Legacy versions

MARLIN V1, V2 and V3 are deprecated and retained only for historical reference, old-game reproduction and regression comparisons. V3 is preserved as `engine.js`; it is not used by active Play or Arena. V5 remains in the source for older comparisons; V6 is the current Arena baseline.

## Run

Open the GitHub Pages site:

https://oddossosososo.github.io/Marlin/

## Search depth and chess-piece artwork

- Play, Arena and PGN analysis expose search depths 1–22. Depth 22 is an experimental upper limit and can take a very long time; it is not a promise that every position will reach depth 22 quickly. Play includes a Stop search control, and Arena has its existing Stop control.
- The board uses locally stored Cburnett SVG chess-piece artwork by Colin M. L. Burnett. See [PIECE-ATTRIBUTION.md](PIECE-ATTRIBUTION.md).


## Version notes

V8 is retained as the JavaScript comparison engine. Its search includes reverse-futility, futility and late-move pruning, check extensions, aspiration windows, a transposition table, and an NNUE-aware evaluation path. V9 is the newer C++ search challenger used by the Arena and speed benchmark.


## Lichess bot

The Lichess bot uses MARLIN V9's C++ WebAssembly search through `marlin-v9.js`. The workflow starts automatically every six hours (UTC) from `main`, and can also be manually started. Each run tests legal chess moves before connecting to Lichess.

Required repository settings:
- Secret `LICHESS_TOKEN`: a token created for the dedicated Lichess BOT account with the `bot:play` scope.
- The account must have the `BOT` title. Lichess does not allow ordinary accounts to use the Bot API. Upgrading is irreversible and only possible before the account has played any game, so do not upgrade a personal playing account.
- Optional variable `LICHESS_USERNAME`: account name used as a fallback when identifying the bot's colour.
- Optional variable `MARLIN_DEPTH`: search depth from 1 to 12; defaults to 4 to keep move times practical.

The startup check verifies the BOT account before loading WebAssembly. Authentication failures now explain the required token scope. Dropped game streams reconnect with backoff, and rejected or stale moves are retried from a fresh game snapshot.

The bot accepts standard-chess challenges only. GitHub Actions stops a run after 350 minutes; the six-hour schedule starts the next run automatically, leaving a short restart gap. For an immediate start, manually dispatch the **MARLIN V9 Lichess Bot** workflow on `main` after configuring the secret and variables.
