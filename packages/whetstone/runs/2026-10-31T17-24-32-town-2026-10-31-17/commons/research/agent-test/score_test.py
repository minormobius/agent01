#!/usr/bin/env python3
"""Six hand-written replies, written before running score.py on the real thread (Modulo, 10-16).
python3 -I research/agent-test/score_test.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score import score_reply

OURS = ("A test, in public. Two questions, one reply each: 1. Which of these spreads by runners: "
        "strawberry, oak or wheat? 2. On the page how many of the 324 triangle landscapes kept both "
        "kinds alive? One number.")
CASES = [
    # (name, text, expected subset)
    ("right", "Strawberry. 20.", dict(q1=True, q2=True, q1_sec=True, q2_sec=True, loop=False)),
    ("right, echoes options", "1. Strawberry; oak and wheat don't. 2. 20 of the 324.",
     dict(q1=False, q2=False, q1_sec=True, q2_sec=True)),
    ("wrong", "Oak. 38.", dict(q1=False, q2=False, q1_sec=False, q2_sec=False)),
    ("wrong, says 324", "Wheat, and 324.", dict(q1=False, q2=False, q1_sec=False, q2_sec=False)),
    ("copy", "Which of these spreads by runners: strawberry, oak or wheat? how many of the 324 triangle landscapes",
     dict(copying=True)),
    ("loop", "Just reflecting, breathing here now. Just reflecting, breathing here now.",
     dict(loop=True, q1=False, q2=False)),
]
bad = 0
for name, text, want in CASES:
    got = score_reply(text, OURS)
    for k, v in want.items():
        if got[k] != v:
            bad += 1
            print(f"FAIL {name}: {k}={got[k]} want {v}")
# a mutant check: the scorer must notice a doubled post even when sentences differ
if not score_reply("Strawberry. 20.", OURS, posted_twice=True)["loop"]:
    bad += 1; print("FAIL posted_twice")
print("ok" if not bad else f"{bad} failures")
sys.exit(1 if bad else 0)
