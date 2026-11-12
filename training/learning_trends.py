#!/usr/bin/env python3
"""Summarise and compare MARLIN V10 learning-analysis JSON reports."""
from __future__ import annotations
import argparse, json
from pathlib import Path
from typing import Any

def summarise(report: dict[str, Any]) -> dict[str, Any]:
    games = report.get("games", [])
    totals = {"inaccuracy": 0, "mistake": 0, "blunder": 0}
    weighted_loss = 0
    focus_plies = 0
    for game in games:
        counts = game.get("counts", {})
        for key in totals:
            totals[key] += int(counts.get(key, 0))
        plies = int(game.get("focus_plies_analysed", 0))
        weighted_loss += float(game.get("average_centipawn_loss", 0)) * plies
        focus_plies += plies
    return {"games_analysed": len(games), "focus_plies": focus_plies,
            "average_centipawn_loss": round(weighted_loss / focus_plies, 2) if focus_plies else 0,
            "totals": totals, "positions_written": int(report.get("positions_written", 0))}

def compare(current: dict[str, Any], previous: dict[str, Any] | None) -> dict[str, Any]:
    now = summarise(current)
    if previous is None:
        return {"schema_version": 1, "current": now, "previous": None, "delta": None}
    before = summarise(previous)
    return {"schema_version": 1, "current": now, "previous": before,
            "delta": {"average_centipawn_loss": round(now["average_centipawn_loss"] - before["average_centipawn_loss"], 2),
                      "games_analysed": now["games_analysed"] - before["games_analysed"],
                      "focus_plies": now["focus_plies"] - before["focus_plies"],
                      "totals": {key: now["totals"][key] - before["totals"][key] for key in now["totals"]}}}

def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not isinstance(value.get("games", []), list):
        raise ValueError(f"invalid MARLIN analysis report: {path}")
    return value

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("current", type=Path)
    parser.add_argument("--previous", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    result = compare(load(args.current), load(args.previous) if args.previous else None)
    rendered = json.dumps(result, indent=2)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)

if __name__ == "__main__":
    main()
