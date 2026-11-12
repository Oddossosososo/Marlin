import unittest

from analyze_marlin_games import centipawn_loss, classify_loss, stable_game_id


class MarlinLearningTests(unittest.TestCase):
    def test_centipawn_loss_never_negative(self):
        self.assertEqual(centipawn_loss(30, 50), 0)
        self.assertEqual(centipawn_loss(120, -80), 200)

    def test_loss_thresholds(self):
        self.assertEqual(classify_loss(0), "ok")
        self.assertEqual(classify_loss(49), "ok")
        self.assertEqual(classify_loss(50), "inaccuracy")
        self.assertEqual(classify_loss(100), "mistake")
        self.assertEqual(classify_loss(200), "blunder")

    def test_game_id_is_stable_and_changes_with_game(self):
        headers = {"White": "MarlinChessBot", "Black": "Opponent", "Date": "2026.11.12"}
        first = stable_game_id(headers, "match.pgn", 1)
        self.assertEqual(first, stable_game_id(headers, "match.pgn", 1))
        self.assertNotEqual(first, stable_game_id(headers, "match.pgn", 2))


if __name__ == "__main__":
    unittest.main()
