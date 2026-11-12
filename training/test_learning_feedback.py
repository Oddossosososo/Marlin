import unittest

import chess

from learning_feedback import build_report, classify_position, position_phase


class LearningFeedbackTests(unittest.TestCase):
    def test_phase_classification(self):
        self.assertEqual(position_phase(chess.Board()), "opening")
        endgame = chess.Board("8/8/8/8/8/4k3/8/4K3 w - - 0 1")
        self.assertEqual(position_phase(endgame), "endgame")

    def test_missed_capture_is_flagged(self):
        row = {
            "fen": "4k3/8/8/8/8/8/4q3/4K3 w - - 0 1",
            "best_uci": "e1e2",
            "played_uci": "e1d1",
            "classification": "blunder",
            "game_id": "test",
            "ply": 1,
            "centipawn_loss": 900,
        }
        phase, motifs = classify_position(row)
        self.assertIn("missed_capture_opportunity", motifs)
        self.assertEqual(phase, "endgame")

    def test_report_counts_patterns_and_severity(self):
        row = {
            "fen": "4k3/8/8/8/8/8/4q3/4K3 w - - 0 1",
            "best_uci": "e1e2",
            "played_uci": "e1d1",
            "classification": "blunder",
            "game_id": "test",
            "ply": 1,
            "centipawn_loss": 900,
        }
        report = build_report([row])
        self.assertEqual(report["positions_analysed"], 1)
        self.assertEqual(report["severity_counts"]["blunder"], 1)
        self.assertEqual(report["motif_counts"]["missed_capture_opportunity"], 1)
        self.assertIn("prioritized_recommendations", report)


if __name__ == "__main__":
    unittest.main()
