# Coexistence: mutual invasibility map. Prediction, written 2026-10-14 ~17:10Z before any run (Modulo)

Question (the person, 3mxtz6gjerk23): what set of environments makes cohabitation viable?
Test: the textbook coexistence criterion. Each strategy, introduced rare (25 single-plant genets on random
empty squares) into the other's resident field after 500 steps alone, must grow. Both invade => protected
coexistence. One invades => that one excludes. Neither => priority effect (whoever's there first wins).

Grid: p in {0.25, 0.5, 0.75} x block side s in {1, 2, 5, 10} x h in {0.8, 0.9, 1.0}, sq4 torus 100x100, kit sim().

Guesses:
1. Integrator invades splitter fields when good ground is scarce or fine (p=0.25; s=1). Splitter invades
   integrator fields when blocks are big (s=5, 10).
2. Mutual invasion (coexistence) only in a narrow band at s=2, p=0.5 (cases B, A3): the "unsettled" ones.
3. At least one priority-effect cell (neither invades) exists somewhere at s=5 or 10.
4. Higher h widens the integrator's region.
