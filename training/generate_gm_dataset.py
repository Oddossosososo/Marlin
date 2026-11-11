#!/usr/bin/env python3
"""Create Stockfish-labelled training positions from high-rated human PGNs.

Input PGNs are supplied by the operator and must be lawfully usable. Games are
filtered by both players' Elo ratings and engine/bot titles before sampling.
"""
import argparse
import hashlib
import json
from pathlib import Path

import chess
import chess.engine
import chess.pgn


BOT_TITLES = {"BOT", "ENGINE", "COMPUTER", "AI"}
MASTER_TITLES = {"GM", "WGM", "IM", "WIM", "FM", "WFM"}


def player_is_human_master(headers, color, minimum_elo):
    prefix = "White" if color == chess.WHITE else "Black"
    title = headers.get(prefix + "Title", "").upper()
    if title in BOT_TITLES:
        return False
    try:
        rating = int(headers.get(prefix + "Elo", "0"))
    except ValueError:
        return False
    # Ratings are the primary filter; recognised titles allow a titled player
    # whose current rating has temporarily fallen below the threshold.
    return rating >= minimum_elo or title in MASTER_TITLES


def stable_game_id(headers, file_path, game_index):
    identity = "|".join([
        headers.get("Event", ""),
        headers.get("Date", ""),
        headers.get("White", ""),
        headers.get("Black", ""),
        str(file_path),
        str(game_index),
    ])
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:20]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pgn-dir", default="training/gm-games")
    parser.add_argument("--stockfish", required=True)
    parser.add_argument("--min-elo", type=int, default=2400)
    parser.add_argument("--depth", type=int, default=12)
    parser.add_argument("--sample-every", type=int, default=2)
    parser.add_argument("--max-games", type=int, default=20000)
    parser.add_argument("--max-positions", type=int, default=150000)
    parser.add_argument("--out", default="training/data/marlin-v7-masters.jsonl")
    args = parser.parse_args()

    pgn_files = sorted(Path(args.pgn_dir).rglob("*.pgn"))
    if not pgn_files:
        raise SystemExit(
            f"No PGN files found in {args.pgn_dir}. Add a licensed/authorised "
            "master-game PGN or provide one through the V7 training workflow."
        )

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    engine = chess.engine.SimpleEngine.popen_uci(args.stockfish)
    games_seen = 0
    games_accepted = 0
    positions_written = 0
    try:
        with open(args.out, "w", encoding="utf-8") as output:
            for pgn_path in pgn_files:
                with open(pgn_path, "r", encoding="utf-8", errors="replace") as source:
                    game_index = 0
                    while games_seen < args.max_games and positions_written < args.max_positions:
                        game = chess.pgn.read_game(source)
                        if game is None:
                            break
                        game_index += 1
                        games_seen += 1
                        headers = game.headers
                        variant = headers.get("Variant", "Standard").strip().lower()
                        if variant not in {"standard", "chess"}:
                            continue
                        if not (
                            player_is_human_master(headers, chess.WHITE, args.min_elo)
                            and player_is_human_master(headers, chess.BLACK, args.min_elo)
                        ):
                            continue

                        board = game.board()
                        mainline = list(game.mainline_moves())
                        if len(mainline) < 24:
                            continue

                        game_id = stable_game_id(headers, pgn_path.name, game_index)
                        games_accepted += 1
                        for ply, move in enumerate(mainline):
                            if ply >= 8 and ply % max(1, args.sample_every) == 0:
                                info = engine.analyse(
                                    board, chess.engine.Limit(depth=args.depth)
                                )
                                score = info["score"].pov(board.turn).score(mate_score=30000)
                                if score is not None:
                                    output.write(json.dumps({
                                        "fen": board.fen(),
                                        "score_cp": int(max(-1600, min(1600, score))),
                                        "game_id": game_id,
                                        "source": "human-master-pgn",
                                    }) + "\n")
                                    positions_written += 1
                                    if positions_written >= args.max_positions:
                                        break
                            board.push(move)

                        if games_seen % 100 == 0:
                            print(
                                f"games={games_seen} accepted={games_accepted} "
                                f"positions={positions_written}",
                                flush=True,
                            )
                        if positions_written >= args.max_positions:
                            break
    finally:
        engine.quit()

    if positions_written < 1000:
        raise SystemExit(
            f"Only {positions_written} master positions were generated; "
            "at least 1,000 are required. Check PGN Elo tags and source files."
        )
    print(json.dumps({
        "games_seen": games_seen,
        "games_accepted": games_accepted,
        "positions": positions_written,
        "files": len(pgn_files),
        "output": args.out,
    }, indent=2))


if __name__ == "__main__":
    main()
