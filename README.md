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
