import unittest

from championship import DEFAULT_STATE, record_result, set_veto
import copy


class ChampionshipTests(unittest.TestCase):
    def setUp(self):
        self.state = copy.deepcopy(DEFAULT_STATE)
        self.kwargs = dict(
            games=20,
            champion_checkpoint="main",
            challenger_checkpoint="v8-development",
            settings={"depth": 6, "colour_swapped": True},
        )

    def test_challenger_promoted_immediately_after_win(self):
        result = record_result(self.state, challenger_score=0.55, **self.kwargs)
        self.assertEqual(result["champion"]["engine"], "MARLIN V8")
        self.assertEqual(result["last_match"]["outcome"], "promoted")

    def test_champion_retains_on_draw_or_loss(self):
        for score in (0.5, 0.4):
            state = copy.deepcopy(DEFAULT_STATE)
            result = record_result(state, challenger_score=score, **self.kwargs)
            self.assertEqual(result["champion"]["engine"], "MARLIN V7")
            self.assertEqual(result["last_match"]["outcome"], "champion-retains")

    def test_veto_blocks_promotion(self):
        set_veto(self.state, True)
        result = record_result(self.state, challenger_score=0.9, **self.kwargs)
        self.assertEqual(result["champion"]["engine"], "MARLIN V7")
        self.assertEqual(result["last_match"]["outcome"], "vetoed")

    def test_veto_can_be_cleared(self):
        set_veto(self.state, True)
        set_veto(self.state, False)
        self.assertFalse(self.state["challenger"]["vetoed"])

    def test_rejects_unpaired_game_count(self):
        with self.assertRaises(ValueError):
            record_result(self.state, challenger_score=0.6, **{**self.kwargs, "games": 3})

    def test_rejects_checkpoint_mismatch(self):
        with self.assertRaises(ValueError):
            record_result(self.state, challenger_score=0.6, **{
                **self.kwargs, "challenger_checkpoint": "mutable-latest"
            })


if __name__ == "__main__":
    unittest.main()
