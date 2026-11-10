# MARLIN V4 NNUE training

This pipeline trains **Marlin-owned weights** from Stockfish UCI evaluations. It does not copy Stockfish's network or source code. The exported network is a compact NNUE-style 768 → 128 → 32 → 1 model using side-to-move-relative piece-square features.

## 1. Install

Use Python 3.10+ and a Stockfish executable:

```bash
python -m pip install -r training/requirements.txt
```

## 2. Generate teacher-labelled positions

```bash
python training/generate_dataset.py --stockfish /path/to/stockfish --games 1000 --depth 12 --sample-every 2
```

Start smaller (e.g. 20 games at depth 8) to verify your setup. Increase games/depth for a larger, stronger dataset. Dataset files are local and should not be committed.

## 3. Train and export

```bash
python training/train_nnue.py --data training/data/stockfish.jsonl --epochs 30 --out nnue/marlin-v4.nnue.json
```

The exported JSON is the actual trained weight file. Keep it out of Git until training is complete and its size/licensing/provenance have been reviewed.

## Dataset and training notes

- Positions are sampled from Stockfish self-play; each target is a Stockfish depth-limited centipawn evaluation from the side-to-move perspective.
- The trainer uses a held-out validation split and reports training/validation loss.
- This is supervised evaluation distillation, not reinforcement learning and not a Stockfish clone.
- More positions and deeper teacher analysis generally improve labels, but also cost more compute.
- The compact network is deliberately Marlin's own architecture. It is NNUE-style rather than binary-compatible with Stockfish's HalfKP networks.
- For credible strength claims, run fixed-time paired matches with colours swapped and a large sample. A low training loss alone does not prove playing strength.

## Current status

No trained weights are checked into this repository. Generate the dataset and run training to create `nnue/marlin-v4.nnue.json`. The browser engine must only advertise NNUE as active after that file loads successfully.
