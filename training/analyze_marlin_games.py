#!/usr/bin/env python3
"""Analyse MARLIN's own PGNs and build a Stockfish-labelled learning dataset.

This is supervised evaluation data, not automatic reinforcement learning. It
never changes the active engine or publishes weights; candidate training must
be evaluated separately before promotion.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import chess
import chess.engine
import chess.pgn


def stable_game_id(headers: dict[str, str], source: str, index: int) -> str:
    identity = "|".join((
        headers.get("Site", ""),
        headers.get("Date", ""),
        headers.get("White", ""),
        headers.get("Black", ""),
        headers.get("Result", ""),
        source,
        str(index),
    ))
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:20]


def classify_loss(cpl: int) -> str:
    if cpl >= 200:
        return "blunder"
    if cpl >= 100:
        return "mistake"
    if cpl >= 50:
        return "inaccuracy"
    return "ok"


def centipawn_loss(best_cp: int, played_cp: int) -> int:
    return max(0, best_cp - played_cp)


def analyse_game(
    game: chess.pgn.Game,
    engine: chess.engine.SimpleEngine,
    depth: int,
    game_id: str,
    source_name: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    board = game.board()
    rows: list[dict[str, Any]] = []
    moves: list[dict[str, Any]] = []

    for ply, move in enumerate(game.mainline_moves()):
        if board.is_game_over():
            break

        mover = board.turn
        before_fen = board.fen()
        before = engine.analyse(board, chess.engine.Limit(depth=depth))
        best_cp_raw = before["score"].pov(mover).score(mate_score=30000)
        best_move = before.get("pv", [None])[0]
        if best_cp_raw is None or best_move is None:
            board.push(move)
            continue

        best_cp = int(best_cp_raw)
        best_uci = best_move.uci()
        played_san = board.san(move)
        played_uci = move.uci()

        board.push(move)
        after = engine.analyse(board, chess.engine.Limit(depth=depth))
        played_cp_raw = after["score"].pov(mover).score(mate_score=30000)
        if played_cp_raw is None:
            continue

        played_cp = int(played_cp_raw)
        loss = centipawn_loss(best_cp, played_cp)
        category = classify_loss(loss)

        # The trainer consumes FEN + score_cp. Extra fields preserve provenance
        # and connect each sample to the move that produced the position.
        rows.append({
            "fen": before_fen,
            "score_cp": max(-30000, min(30000, best_cp)),
            "game_id": game_id,
            "ply": ply,
            "source": "marlin-game-stockfish-labelled",
            "source_file": source_name,
            "played_uci": played_uci,
            "best_uci": best_uci,
            "centipawn_loss": loss,
            "classification": category,
        })
        moves.append({
            "ply": ply + 1,
            "side": "white" if mover == chess.WHITE else "black",
            "fen": before_fen,
            "played_san": played_san,
            "played_uci": played_uci,
            "best_uci": best_uci,
            "best_eval_cp": best_cp,
            "played_eval_cp": played_cp,
            "centipawn_loss": loss,
            "classification": category,
        })

    counts = {key: sum(m["classification"] == key for m in moves)
              for key in ("inaccuracy", "mistake", "blunder")}
    report = {
        "game_id": game_id,
        "headers": dict(game.headers),
        "plies_analysed": len(moves),
        "average_centipawn_loss": round(
            sum(m["centipawn_loss"] for m in moves) / len(moves), 1
        ) if moves else 0,
        "counts": counts,
        "critical_moves": [m for m in moves if m["classification"] != "ok"],
        "moves": moves,
    }
    return rows, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pgn-dir", default="training/marlin-games")
    parser.add_argument("--stockfish", default="stockfish")
    parser.add_argument("--depth", type=int, default=10)
    parser.add_argument("--max-games", type=int, default=500)
    parser.add_argument("--out", default="training/data/marlin-v10-games.jsonl")
    parser.add_argument("--report", default="training/reports/marlin-v10-analysis.json")
    args = parser.parse_args()

    if not 1 <= args.depth <= 30:
        parser.error("--depth must be between 1 and 30")
    pgn_files = sorted(Path(args.pgn_dir).rglob("*.pgn"))
    if not pgn_files:
        raise SystemExit(f"No PGN files found in {args.pgn_dir}")

    output_path = Path(args.out)
    report_path = Path(args.report)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    engine = chess.engine.SimpleEngine.popen_uci(args.stockfish)
    all_reports: list[dict[str, Any]] = []
    games_seen = 0
    positions_written = 0
    try:
        with output_path.open("w", encoding="utf-8") as output:
            for pgn_path in pgn_files:
                with pgn_path.open("r", encoding="utf-8", errors="replace") as source:
                    index = 0
                    while games_seen < args.max_games:
                        game = chess.pgn.read_game(source)
                        if game is None:
                            break
                        index += 1
                        games_seen += 1
                        if game.errors:
                            print(f"Skipping malformed game {pgn_path}:{index}")
                            continue
                        variant = game.headers.get("Variant", "Standard").lower()
                        if variant not in {"standard", "chess"}:
                            continue
                        if not list(game.mainline_moves()):
                            continue

                        game_id = stable_game_id(game.headers, pgn_path.name, index)
                        rows, report = analyse_game(
                            game, engine, args.depth, game_id, pgn_path.name
                        )
                        for row in rows:
                            output.write(json.dumps(row, separators=(",", ":")) + "\n")
                        positions_written += len(rows)
                        all_reports.append(report)
                        if games_seen % 10 == 0:
                            print(
                                f"games={games_seen} positions={positions_written}",
                                flush=True,
                            )
    finally:
        engine.quit()

    totals = {
        key: sum(game["counts"][key] for game in all_reports)
        for key in ("inaccuracy", "mistake", "blunder")
    }
    summary = {
        "schema_version": 1,
        "model": "MARLIN V10 learning-data prototype",
        "teacher": "Stockfish UCI",
        "depth": args.depth,
        "games_seen": games_seen,
        "games_analysed": len(all_reports),
        "positions_written": positions_written,
        "totals": totals,
        "dataset": str(output_path),
        "games": all_reports,
        "important_note": (
            "This dataset records positions and Stockfish evaluations. It does "
            "not itself update engine weights or guarantee stronger play."
        ),
    }
    report_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: summary[k] for k in (
        "games_seen", "games_analysed", "positions_written", "totals",
        "dataset"
    )}, indent=2))


if __name__ == "__main__":
    main()
