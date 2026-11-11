#!/usr/bin/env python3
"""Build a compact V9 opening book from filtered human master PGNs.

The book uses popular legal moves from high-rated human games. It never treats
bot-tagged games as human master games, even if their Elo headers are inflated.
"""
import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

import chess
import chess.pgn


BOT_TITLES = {"BOT", "ENGINE", "COMPUTER", "AI"}
MASTER_TITLES = {"GM", "WGM", "IM", "WIM", "FM", "WFM"}


def is_master(headers, color, minimum_elo):
    side = "White" if color == chess.WHITE else "Black"
    title = headers.get(side + "Title", "").upper()
    if title in BOT_TITLES:
        return False
    try:
        rating = int(headers.get(side + "Elo", "0"))
    except ValueError:
        return False
    return rating >= minimum_elo or title in MASTER_TITLES


def result_score(result, side_to_move):
    if result == "1/2-1/2":
        return 0.5
    if result == "1-0":
        return 1.0 if side_to_move == chess.WHITE else 0.0
    if result == "0-1":
        return 1.0 if side_to_move == chess.BLACK else 0.0
    return None


def position_key(board):
    # Ignore the move counters so identical chess positions can be merged.
    return " ".join(board.fen().split()[:4])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pgn-dir", default="training/gm-games")
    parser.add_argument("--min-elo", type=int, default=2400)
    parser.add_argument("--max-games", type=int, default=50000)
    parser.add_argument("--max-ply", type=int, default=24,
                        help="Only index the first N plies of each game.")
    parser.add_argument("--min-samples", type=int, default=3)
    parser.add_argument("--out", default="nnue/marlin-v9-opening-book.json")
    parser.add_argument("--data-attribution", default="Operator-supplied human master PGNs; verify source licence.")
    parser.add_argument("--data-license", default="Source dataset licence(s) recorded in data attribution.")
    args = parser.parse_args()

    pgn_files = sorted(Path(args.pgn_dir).rglob("*.pgn"))
    if not pgn_files:
        raise SystemExit(f"No PGNs found in {args.pgn_dir}")

    # position -> UCI move -> [games, points]
    counts = defaultdict(lambda: defaultdict(lambda: [0, 0.0]))
    seen = accepted = indexed_plies = 0

    for path in pgn_files:
        with path.open("r", encoding="utf-8", errors="replace") as source:
            while seen < args.max_games:
                game = chess.pgn.read_game(source)
                if game is None:
                    break
                seen += 1
                headers = game.headers
                variant = headers.get("Variant", "Standard").strip().lower()
                if variant not in {"standard", "chess"}:
                    continue
                if not (
                    is_master(headers, chess.WHITE, args.min_elo)
                    and is_master(headers, chess.BLACK, args.min_elo)
                    and headers.get("Result") in {"1-0", "0-1", "1/2-1/2"}
                ):
                    continue

                accepted += 1
                board = game.board()
                for ply, move in enumerate(game.mainline_moves()):
                    if ply >= args.max_ply:
                        break
                    score = result_score(headers["Result"], board.turn)
                    if score is not None:
                        record = counts[position_key(board)][move.uci()]
                        record[0] += 1
                        record[1] += score
                    board.push(move)
                    indexed_plies += 1

        if seen >= args.max_games:
            break

    positions = {}
    for fen, moves in counts.items():
        candidates = []
        for uci, (games, points) in moves.items():
            if games < args.min_samples:
                continue
            score_rate = points / games
            # Bayesian smoothing avoids treating a tiny winning sample as
            # stronger evidence than a well-established mainline. The square
            # root of the sample count rewards popularity without letting it
            # completely overwhelm demonstrated results.
            smoothed_score = (points + 10.0) / (games + 20.0)
            weight = max(1, round(
                100.0 * (games ** 0.5) * math.exp((smoothed_score - 0.5) * 2.0)
            ))
            candidates.append({
                "uci": uci,
                "games": games,
                "score": round(score_rate, 5),
                "smoothed_score": round(smoothed_score, 5),
                "weight": weight,
            })
        # Weighted move choice balances score performance and sample size.
        candidates.sort(key=lambda item: (item["weight"], item["games"]), reverse=True)
        if candidates:
            positions[fen] = candidates[:6]

    if not positions:
        raise SystemExit(
            "No opening positions met the master-game filters. Check PGN tags, "
            "the minimum Elo, and the minimum sample count."
        )

    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "format": "MARLIN_OPENING_BOOK_V1",
        "model": "MARLIN V9",
        "license": args.data_license,
        "training": {
            "games_seen": seen,
            "games_accepted": accepted,
            "indexed_plies": indexed_plies,
            "positions": len(positions),
            "minimum_elo": args.min_elo,
            "minimum_samples_per_move": args.min_samples,
            "maximum_plies_per_game": args.max_ply,
            "data_attribution": args.data_attribution,
        },
        "positions": positions,
    }
    output.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(payload["training"], indent=2))
    print(f"Wrote V9 opening book: {output} ({output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
