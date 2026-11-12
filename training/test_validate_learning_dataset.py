import json, tempfile, unittest
from pathlib import Path
import chess
from validate_learning_dataset import validate_row, validate_file

class DatasetValidationTests(unittest.TestCase):
    def test_accepts_legal_position_and_moves(self):
        board = chess.Board()
        row = {"fen": board.fen(), "score_cp": 12, "game_id": "g1",
               "ply": 0, "played_uci": "e2e4", "best_uci": "d2d4",
               "centipawn_loss": 0, "classification": "ok"}
        self.assertEqual(validate_row(row), [])

    def test_rejects_illegal_move(self):
        board = chess.Board()
        row = {"fen": board.fen(), "score_cp": 0, "game_id": "g1",
               "ply": 0, "played_uci": "e2e5", "best_uci": "d2d4",
               "centipawn_loss": 0, "classification": "ok"}
        self.assertTrue(any("played_uci" in e for e in validate_row(row)))

    def test_detects_duplicate_game_ply(self):
        board = chess.Board()
        row = {"fen": board.fen(), "score_cp": 0, "game_id": "g1",
               "ply": 0, "played_uci": "e2e4", "best_uci": "d2d4",
               "centipawn_loss": 0, "classification": "ok"}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "data.jsonl"
            path.write_text(json.dumps(row) + "\n" + json.dumps(row) + "\n")
            result = validate_file(path)
        self.assertEqual(result["duplicate_game_plies"], 1)
        self.assertFalse(result["valid"])

if __name__ == "__main__":
    unittest.main()
