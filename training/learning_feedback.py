#!/usr/bin/env python3
"""Turn Stockfish-labelled MARLIN positions into a cautious improvement report.

This is diagnostic feedback, not self-modifying training: it never changes engine
code, evaluation parameters, or weights.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import chess

PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
}


def material_balance(board: chess.Board, colour: chess.Color) -> int:
    score = 0
    for piece_type, value in PIECE_VALUES.items():
        score += len(board.pieces(piece_type, colour)) * value
        score -= len(board.pieces(piece_type, not colour)) * value
    return score


def position_phase(board: chess.Board) -> str:
    non_pawn_material = sum(
        len(board.pieces(piece_type, colour)) * value
        for colour in (chess.WHITE, chess.BLACK)
        for piece_type, value in PIECE_VALUES.items()
        if piece_type != chess.PAWN
    )
    if non_pawn_material >= 6200:
        return "opening"
    if non_pawn_material >= 2600:
        return "middlegame"
    return "endgame"


def classify_position(row: dict[str, Any]) -> tuple[str, list[str]]:
    board = chess.Board(row["fen"])
    mover = board.turn
    best = chess.Move.from_uci(row["best_uci"])
    played = chess.Move.from_uci(row["played_uci"])
    if best not in board.legal_moves:
        raise ValueError("Stockfish best move is illegal in supplied FEN")
    if played not in board.legal_moves:
        raise ValueError("Played move is illegal in supplied FEN")

    motifs: list[str] = []
    if board.is_capture(best) and not board.is_capture(played):
        motifs.append("missed_capture_opportunity")
    if board.gives_check(best) and not board.gives_check(played):
        motifs.append("missed_checking_opportunity")
    if best.promotion and not played.promotion:
        motifs.append("missed_promotion_opportunity")

    before = material_balance(board, mover)
    after_board = board.copy()
    after_board.push(played)
    after = material_balance(after_board, mover)
    if before - after >= 300:
        motifs.append("material_loss_after_move")

    return position_phase(board), motifs


def build_report(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts: Counter[str] = Counter()
    phase_counts: dict[str, Counter[str]] = defaultdict(Counter)
    severity: Counter[str] = Counter()
    examples: dict[str, list[dict[str, Any]]] = defaultdict(list)
    invalid_rows = 0

    for row in rows:
        try:
            phase, motifs = classify_position(row)
        except (KeyError, ValueError, chess.InvalidMoveError, chess.IllegalMoveError):
            invalid_rows += 1
            continue

        category = row.get("classification", "unknown")
        severity[category] += 1
        for motif in motifs:
            counts[motif] += 1
            phase_counts[phase][motif] += 1
            if len(examples[motif]) < 5:
                examples[motif].append({
                    "game_id": row.get("game_id"),
                    "ply": row.get("ply"),
                    "fen": row.get("fen"),
                    "best_uci": row.get("best_uci"),
                    "played_uci": row.get("played_uci"),
                    "centipawn_loss": row.get("centipawn_loss"),
                })

    recommendations = []
    guidance = {
        "missed_capture_opportunity": "Review capture ordering, tactical move generation and quiescence search.",
        "missed_checking_opportunity": "Review forcing-move ordering and checks in tactical search.",
        "missed_promotion_opportunity": "Review promotion move generation and passed-pawn evaluation.",
        "material_loss_after_move": "Review attacked-piece detection, exchanges and one-move blunder checks.",
    }
    for motif, count in counts.most_common():
        recommendations.append({
            "pattern": motif,
            "occurrences": count,
            "suggestion": guidance[motif],
            "examples": examples[motif],
        })

    return {
        "schema_version": 1,
        "report": "MARLIN V10.4 learning feedback",
        "positions_received": len(rows),
        "positions_analysed": len(rows) - invalid_rows,
        "invalid_positions": invalid_rows,
        "severity_counts": dict(severity),
        "motif_counts": dict(counts),
        "motifs_by_phase": {phase: dict(counter) for phase, counter in phase_counts.items()},
        "prioritized_recommendations": recommendations,
        "interpretation": (
            "These are observable move-pattern signals, not proof of engine root "
            "causes. Review example positions before changing code. This report "
            "does not train weights or modify the active engine."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", default="training/data/marlin-v10-games.jsonl")
    parser.add_argument("--out", default="training/reports/marlin-v10.4-feedback.json")
    args = parser.parse_args()

    dataset = Path(args.dataset)
    if not dataset.exists():
        raise SystemExit(f"Learning dataset not found: {dataset}")

    rows = []
    with dataset.open(encoding="utf-8") as source:
        for line_number, line in enumerate(source, 1):
            if not line.strip():
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise SystemExit(f"Invalid JSON on line {line_number}: {exc}") from exc

    report = build_report(rows)
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "positions_analysed": report["positions_analysed"],
        "invalid_positions": report["invalid_positions"],
        "motif_counts": report["motif_counts"],
        "output": str(output),
    }, indent=2))


if __name__ == "__main__":
    main()
