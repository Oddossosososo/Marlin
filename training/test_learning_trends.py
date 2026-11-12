import unittest
from learning_trends import summarise, compare

class LearningTrendTests(unittest.TestCase):
    def test_weighted_average_and_counts(self):
        report = {"positions_written": 4, "games": [
            {"focus_plies_analysed": 2, "average_centipawn_loss": 10,
             "counts": {"inaccuracy": 1}},
            {"focus_plies_analysed": 2, "average_centipawn_loss": 30,
             "counts": {"blunder": 2}}]}
        result = summarise(report)
        self.assertEqual(result["average_centipawn_loss"], 20)
        self.assertEqual(result["totals"]["inaccuracy"], 1)
        self.assertEqual(result["totals"]["blunder"], 2)

    def test_report_delta(self):
        old = {"games": [{"focus_plies_analysed": 2, "average_centipawn_loss": 20,
                          "counts": {"mistake": 1}}]}
        new = {"games": [{"focus_plies_analysed": 2, "average_centipawn_loss": 10,
                          "counts": {"mistake": 0}}]}
        result = compare(new, old)
        self.assertEqual(result["delta"]["average_centipawn_loss"], -10)
        self.assertEqual(result["delta"]["totals"]["mistake"], -1)

    def test_empty_report(self):
        self.assertEqual(summarise({"games": []})["average_centipawn_loss"], 0)

if __name__ == "__main__":
    unittest.main()
