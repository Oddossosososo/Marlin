#!/usr/bin/env python3
"""MARLIN champion/challenger state machine.

A completed match result is supplied by a separate, verified match runner.
This module never invents or simulates chess results.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

DEFAULT_STATE = {
    "schema_version": 1,
    "champion": {"engine": "MARLIN V7", "checkpoint": "main"},
    "challenger": {
        "engine": "MARLIN V8",
        "checkpoint": "v8-development",
        "vetoed": False,
    },
    "last_match": None,
}


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return json.loads(json.dumps(DEFAULT_STATE))
    state = json.loads(path.read_text(encoding="utf-8"))
    if state.get("schema_version") != 1:
        raise ValueError("Unsupported championship state schema")
    for key in ("champion", "challenger"):
        if not isinstance(state.get(key), dict):
            raise ValueError(f"Missing {key} state")
    state["challenger"].setdefault("vetoed", False)
    return state


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def set_veto(state: dict[str, Any], vetoed: bool) -> dict[str, Any]:
    state["challenger"]["vetoed"] = vetoed
    return state


def record_result(
    state: dict[str, Any],
    *,
    challenger_score: float,
    games: int,
    champion_checkpoint: str,
    challenger_checkpoint: str,
    settings: dict[str, Any],
) -> dict[str, Any]:
    if not 0.0 <= challenger_score <= 1.0:
        raise ValueError("challenger_score must be between 0 and 1")
    if games < 2 or games % 2:
        raise ValueError("games must be an even number of at least 2")
    if not champion_checkpoint or not challenger_checkpoint:
        raise ValueError("Both immutable checkpoint identifiers are required")

    champion = state["champion"]
    challenger = state["challenger"]
    if champion_checkpoint != champion["checkpoint"]:
        raise ValueError("Champion checkpoint changed during the match")
    if challenger_checkpoint != challenger["checkpoint"]:
        raise ValueError("Challenger checkpoint changed during the match")

    if challenger["vetoed"]:
        outcome = "vetoed"
    elif challenger_score > 0.5:
        outcome = "promoted"
        state["champion"] = {
            "engine": challenger["engine"],
            "checkpoint": challenger["checkpoint"],
        }
    else:
        outcome = "champion-retains"

    state["last_match"] = {
        "champion_before": champion,
        "challenger": challenger,
        "challenger_score": challenger_score,
        "games": games,
        "settings": settings,
        "outcome": outcome,
    }
    return state


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("status", "veto", "clear-veto", "record-result"))
    parser.add_argument("--state", default="training/championship-state.json")
    parser.add_argument("--score", type=float)
    parser.add_argument("--games", type=int)
    parser.add_argument("--champion-checkpoint")
    parser.add_argument("--challenger-checkpoint")
    parser.add_argument("--settings-json", default="{}")
    args = parser.parse_args()

    path = Path(args.state)
    state = load_state(path)
    if args.action == "veto":
        set_veto(state, True)
    elif args.action == "clear-veto":
        set_veto(state, False)
    elif args.action == "record-result":
        if args.score is None or args.games is None:
            parser.error("record-result requires --score and --games")
        state = record_result(
            state,
            challenger_score=args.score,
            games=args.games,
            champion_checkpoint=args.champion_checkpoint or "",
            challenger_checkpoint=args.challenger_checkpoint or "",
            settings=json.loads(args.settings_json),
        )
    if args.action != "status":
        save_state(path, state)
    print(json.dumps(state, indent=2))


if __name__ == "__main__":
    main()
