#!/usr/bin/env python3
"""Generate Stockfish-labelled positions for Marlin's independent NNUE."""
import argparse, json, random
from pathlib import Path
import chess
import chess.engine

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stockfish", required=True, help="Path to the Stockfish executable")
    ap.add_argument("--games", type=int, default=100)
    ap.add_argument("--depth", type=int, default=10)
    ap.add_argument("--sample-every", type=int, default=2)
    ap.add_argument("--out", default="training/data/stockfish.jsonl")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    random.seed(args.seed)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    engine = chess.engine.SimpleEngine.popen_uci(args.stockfish)
    written = 0
    try:
        with open(args.out, "w", encoding="utf-8") as out:
            for game_no in range(args.games):
                board = chess.Board()
                ply = 0
                while not board.is_game_over() and ply < 240:
                    if ply >= 8 and ply % args.sample_every == 0:
                        info = engine.analyse(board, chess.engine.Limit(depth=args.depth))
                        score = info["score"].pov(board.turn).score(mate_score=30000)
                        if score is not None:
                            out.write(json.dumps({"fen": board.fen(), "score_cp": int(score)}) + "\n")
                            written += 1
                    result = engine.play(board, chess.engine.Limit(depth=args.depth))
                    if result.move is None:
                        break
                    board.push(result.move)
                    ply += 1
                print(f"game {game_no + 1}/{args.games}: {written} positions", flush=True)
    finally:
        engine.quit()
    print(f"Wrote {written} labelled positions to {args.out}")

if __name__ == "__main__":
    main()
