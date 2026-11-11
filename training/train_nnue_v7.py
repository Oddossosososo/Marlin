#!/usr/bin/env python3
"""Train MARLIN V7 NNUE on Stockfish labels sampled from human master games.

The master PGNs shape the position distribution; Stockfish analysis supplies
consistent centipawn targets so V7 does not simply imitate individual moves.
"""
import argparse
import hashlib
import json
import random
from pathlib import Path

import numpy as np
import torch
from torch import nn

FEATURES, HIDDEN1, HIDDEN2 = 768, 128, 32


def features_from_fen(fen):
    board = __import__("chess").Board(fen)
    active = []
    for square, piece in board.piece_map().items():
        relative_colour = 0 if piece.color == board.turn else 1
        feature = relative_colour * 384 + (piece.piece_type - 1) * 64 + square
        active.append(feature)
    return active


class Net(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(FEATURES, HIDDEN1)
        self.fc2 = nn.Linear(HIDDEN1, HIDDEN2)
        self.out = nn.Linear(HIDDEN2, 1)

    def forward(self, x):
        return self.out(torch.relu(self.fc2(torch.relu(self.fc1(x))))).squeeze(-1)


def load_rows(paths):
    rows = []
    for path in paths:
        file_path = Path(path)
        if not file_path.is_file():
            raise SystemExit(f"Training dataset missing: {file_path}")
        with file_path.open("r", encoding="utf-8") as source:
            rows.extend(json.loads(line) for line in source if line.strip())
    return rows


def split_by_game(rows, seed):
    rng = np.random.default_rng(seed)
    groups = {}
    for i, row in enumerate(rows):
        groups.setdefault(row.get("game_id", f"row-{i}"), []).append(i)
    keys = list(groups)
    rng.shuffle(keys)
    valid_target = max(1, int(len(rows) * 0.05))
    valid_ids = []
    for key in keys:
        if len(valid_ids) >= valid_target:
            break
        valid_ids.extend(groups[key])
    valid = np.asarray(sorted(valid_ids), dtype=np.int64)
    valid_set = set(valid_ids)
    train = np.asarray([i for i in range(len(rows)) if i not in valid_set], dtype=np.int64)
    if len(train) == 0 or len(valid) == 0:
        order = rng.permutation(len(rows))
        split = max(1, int(len(rows) * 0.95))
        train, valid = order[:split], order[split:]
    return train, valid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", action="append", required=True,
                        help="JSONL dataset; pass more than once to combine sources")
    parser.add_argument("--out", default="nnue/marlin-v7.nnue.json")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--lr", type=float, default=0.001)
    parser.add_argument("--seed", type=int, default=47)
    parser.add_argument("--model-name", default="MARLIN V7")
    parser.add_argument("--data-attribution", default="Operator-supplied PGN and Stockfish teacher labels; verify source licence.")
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    rows = load_rows(args.data)
    if len(rows) < 1000:
        raise SystemExit(f"Need at least 1,000 labelled positions; found {len(rows)}")

    x = np.zeros((len(rows), FEATURES), dtype=np.float32)
    y = np.empty(len(rows), dtype=np.float32)
    for i, row in enumerate(rows):
        x[i, features_from_fen(row["fen"])] = 1.0
        y[i] = np.clip(float(row["score_cp"]), -1600, 1600) / 800.0

    train_ids, valid_ids = split_by_game(rows, args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = Net().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-5)
    loss_fn = nn.SmoothL1Loss()
    features = torch.from_numpy(x)
    targets = torch.from_numpy(y)

    for epoch in range(args.epochs):
        model.train()
        np.random.shuffle(train_ids)
        losses = []
        for start in range(0, len(train_ids), args.batch_size):
            ids = train_ids[start:start + args.batch_size]
            xb, yb = features[ids].to(device), targets[ids].to(device)
            optimizer.zero_grad(set_to_none=True)
            loss = loss_fn(model(xb), yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            losses.append(loss.item())

        model.eval()
        with torch.no_grad():
            validation = loss_fn(
                model(features[valid_ids].to(device)),
                targets[valid_ids].to(device),
            ).item()
        print(
            f"epoch {epoch + 1:02d}/{args.epochs} "
            f"train={float(np.mean(losses)):.5f} valid={validation:.5f}",
            flush=True,
        )

    model.cpu().eval()
    state = model.state_dict()
    source_counts = {}
    for row in rows:
        source = row.get("source", "unknown")
        source_counts[source] = source_counts.get(source, 0) + 1
    unique_games = len({row.get("game_id") for row in rows if row.get("game_id")})

    payload = {
        "format": "MARLIN_NNUE_V1",
        "architecture": "768x128x32x1",
        "feature_encoding": "stm-relative-piece-square-v1",
        "output_scale_cp": 800,
        "training": {
            "model": args.model_name,
            "teacher": "Stockfish UCI centipawn evaluations",
            "positions": len(rows),
            "games": unique_games,
            "sources": source_counts,
            "epochs": args.epochs,
            "validation_positions": int(len(valid_ids)),
            "seed": args.seed,
            "data_attribution": args.data_attribution,
            "data_sha256": {
                str(path): hashlib.sha256(Path(path).read_bytes()).hexdigest()
                for path in args.data
            },
        },
        "weights": {
            "fc1_w": state["fc1.weight"].T.contiguous().tolist(),
            "fc1_b": state["fc1.bias"].tolist(),
            "fc2_w": state["fc2.weight"].T.contiguous().tolist(),
            "fc2_b": state["fc2.bias"].tolist(),
            "out_w": state["out.weight"].reshape(-1).tolist(),
            "out_b": float(state["out.bias"].item()),
        },
    }
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Exported MARLIN V7 weights: {output} ({output.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
