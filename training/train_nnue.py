#!/usr/bin/env python3
"""Train a compact, Marlin-owned NNUE-style network from Stockfish labels."""
import argparse, json, random
from pathlib import Path
import numpy as np
import torch
from torch import nn

FEATURES, HIDDEN1, HIDDEN2 = 768, 128, 32

def features_from_fen(fen):
    import chess
    board = chess.Board(fen)
    active = []
    for sq, piece in board.piece_map().items():
        relative_colour = 0 if piece.color == board.turn else 1
        feature = relative_colour * 384 + (piece.piece_type - 1) * 64 + sq
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

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="training/data/stockfish.jsonl")
    ap.add_argument("--out", default="nnue/marlin-v4.nnue.json")
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--batch-size", type=int, default=512)
    ap.add_argument("--lr", type=float, default=0.001)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed)
    rows = [json.loads(line) for line in open(args.data, encoding="utf-8") if line.strip()]
    if len(rows) < 1000:
        raise SystemExit(f"Need at least 1,000 labelled positions; found {len(rows)}")
    x = np.zeros((len(rows), FEATURES), dtype=np.float32)
    y = np.empty(len(rows), dtype=np.float32)
    for i, row in enumerate(rows):
        x[i, features_from_fen(row["fen"])] = 1.0
        y[i] = np.clip(row["score_cp"], -1600, 1600) / 800.0
    order = np.random.permutation(len(rows))
    split = max(1, int(len(rows) * 0.95))
    train, valid = order[:split], order[split:]
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = Net().to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-5)
    loss_fn = nn.SmoothL1Loss()
    xt = torch.from_numpy(x); yt = torch.from_numpy(y)
    for epoch in range(args.epochs):
        model.train(); np.random.shuffle(train); losses=[]
        for start in range(0, len(train), args.batch_size):
            ids = train[start:start+args.batch_size]
            xb, yb = xt[ids].to(device), yt[ids].to(device)
            opt.zero_grad(set_to_none=True)
            loss = loss_fn(model(xb), yb)
            loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step()
            losses.append(loss.item())
        model.eval()
        with torch.no_grad():
            val = loss_fn(model(xt[valid].to(device)), yt[valid].to(device)).item() if len(valid) else float("nan")
        print(f"epoch {epoch+1:02d}/{args.epochs} train={np.mean(losses):.5f} valid={val:.5f}", flush=True)
    model.cpu().eval()
    state = model.state_dict()
    payload = {
        "format":"MARLIN_NNUE_V1", "architecture":"768x128x32x1",
        "feature_encoding":"stm-relative-piece-square-v1", "output_scale_cp":800,
        "training":{"teacher":"Stockfish UCI evaluations","positions":len(rows),"epochs":args.epochs,"seed":args.seed},
        "weights":{
            "fc1_w":state["fc1.weight"].T.contiguous().tolist(),"fc1_b":state["fc1.bias"].tolist(),
            "fc2_w":state["fc2.weight"].T.contiguous().tolist(),"fc2_b":state["fc2.bias"].tolist(),
            "out_w":state["out.weight"].reshape(-1).tolist(),"out_b":float(state["out.bias"].item())
        }
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(payload,separators=(",",":")),encoding="utf-8")
    print(f"Exported trained weights: {args.out}")

if __name__ == "__main__":
    main()
