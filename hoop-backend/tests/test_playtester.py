"""Run the scripted playtester as an enforced integration test.

scripts/playtester.py drives the real FastAPI app through the doing-stuff verbs
end-to-end (take/equip/talk/choose + the reactive gate). Wrapping its scripted
scenario here means CI fails if any verb regresses, and the bot's self-cleanup is
exercised on every run. Stays under POLLER_STUB_LLM=1 (set by conftest); no llama.
"""

from scripts.playtester import Playtest


def test_scripted_scenario_passes():
    pt = Playtest(verbose=False)
    try:
        pt.seed()
        pt.run_scenario()
    finally:
        pt.cleanup()
    assert pt.failed == 0, f"{pt.failed} playtester assertion(s) failed"
    assert pt.passed > 0


def test_random_monkey_run_is_clean():
    """A seeded random run must leave no exceptions or dangling-equipment invariants."""
    pt = Playtest(verbose=False)
    try:
        pt.seed()
        pt.run_random(seed=1, steps=80)
    finally:
        pt.cleanup()
    assert pt.failed == 0
