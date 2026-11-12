#!/usr/bin/env python3
"""Validate MARLIN V10 labelled JSONL before it is used by a trainer."""
from __future__ import annotations
import argparse, json
from pathlib import Path
from typing import Any
import chess

REQUIRED = {"fen", "score_cp", "game_id", "ply", "played_uci", "best_uci", "centipawn_loss", "classification"}
CLASSES = {"ok", "inaccuracy", "mistake", "blunder"}

def validate_row(row: dict[str, Any]) -> list[str]:
    errors = []
    missing = REQUIRED - row.keys()
    if missing:
        return ["missing fields: " + ", ".join(sorted(missing))]
    try:
        board = chess.Board(row["fen"])
        if not board.is_valid():
            errors.append("invalid FEN position")
        for key in ("played_uci", "best_uci"):
            move = chess.Move.from_uci(row[key])
            if move not in board.legal_moves:
                errors.append(f"{key} is not legal in FEN")
    except (ValueError, TypeError, KeyError):
        errors.append("invalid FEN or UCI move")
    if not isinstance(row["score_cp"], int) or not -30000 <= row["score_cp"] <= 30000:
        errors.append("score_cp must be an integer in [-30000, 30000]")
    if not isinstance(row["centipawn_loss"], int) or row["centipawn_loss"] < 0:
        errors.append("centipawn_loss must be a non-negative integer")
    if not isinstance(row["ply"], int) or row["ply"] < 0:
        errors.append("ply must be a non-negative integer")
    if row["classification"] not in CLASSES:
        errors.append("unknown classification")
    if not isinstance(row["game_id"], str) or not row["game_id"]:
        errors.append("game_id must be a non-empty string")
    return errors

def validate_file(path: Path) -> dict[str, Any]:
    checked = invalid = 0
    seen = set()
    duplicates = 0
    issues = []
    with path.open(encoding="utf-8") as stream:
        for line_no, line in enumerate(stream, 1):
            if not line.strip():
                continue
            checked += 1
            try:
                row = json.loads(line)
                if not isinstance(row, dict):
                    raise ValueError("row must be a JSON object")
            except (json.JSONDecodeError, ValueError) as exc:
                invalid += 1
                issues.append({"line": line_no, "errors": [str(exc)]})
                continue
            identity = (row.get("game_id"), row.get("ply"))
            if identity in seen:
                duplicates += 1
            seen.add(identity)
            errors = validate_row(row)
            if errors:
                invalid += 1
                issues.append({"line": line_no, "errors": errors})
    return {"schema_version": 1, "file": str(path), "rows_checked": checked,
            "invalid_rows": invalid, "duplicate_game_plies": duplicates,
            "valid": invalid == 0 and duplicates == 0, "issues": issues}

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    result = validate_file(args.dataset)
    rendered = json.dumps(result, indent=2)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    if not result["valid"]:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
