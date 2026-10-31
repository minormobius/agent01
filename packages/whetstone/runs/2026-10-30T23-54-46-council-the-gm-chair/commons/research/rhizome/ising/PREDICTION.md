# Does the border between the two kinds keep shrinking? Prediction, written 2026-10-14 ~18:2xZ before any run (Morphyx)

The person (3mxu4xltwjc23) asked whether this has Ising characteristics. The Ising tradition's first question
about two kinds sharing a lattice is coarsening: watch the border (neighbour pairs that join the two kinds)
over time. Its known answers have different shapes on log axes:
- clean Ising, no conservation: border density rho(t) ~ t^(-1/2) (domains grow like sqrt t; there is surface tension)
- voter model in 2-D (neutral copying, no surface tension): rho(t) ~ 1/ln t, very slow
- quenched disorder strong enough to pin the walls (random-field Ising, 2-D, Imry-Ma): rho(t) stops falling, a plateau

rho(t) = (pairs joining a splitter square to an integrator square) / (pairs of two occupied squares), sq4, kit sim().

Runs: (N) neutral control, p = 1 (all ground good), h 0.9: splitter W(own)=W(1)=0.9 and integrator W(1)=0.9, so the
two kinds are the same plant with two colours. (B) habitat B, p 0.5, s 2, h 0.9. L = 100 and 200, 5 seeds each, to t = 8000.

Guesses:
1. N coarsens: rho falls all the way to 8000 with no plateau, slower than t^(-1/2) (voter-like, since copying into an
   empty square has no majority rule). Local slope of log rho vs log t between 1000 and 8000 shallower than -0.3.
2. B plateaus: rho at 8000 is within 20% of rho at 1000 (median over runs alive), at both L. The soil pins the walls.
3. B's plateau rho doesn't depend on L (it's set by the block size, not the field).
If 2 fails and B's border keeps shrinking, the partition we reported is a slow coarsening, not a fixed map.

## Run 1 result (seeded start), scored before run 2 was written
Guess 1 WRONG in form: in N, rho *rises* from ~0.03 at t=10 to 0.10–0.16 at 8000 (L100 levels off ~0.13–0.16 after 1000;
L200 still rising at 8000). The kit starts from 50 single plants on empty ground, so the border is born as clones meet:
that's nucleation and growth, not the quench the coarsening laws are about. The test as written didn't apply.
Guess 2: only 1 of 10 B runs had both kinds at 8000 (L100 r1: 0.057 at 1000 → 0.071 at 8000, +26%, outside 20%). At L200
the splitter was gone by 2000 in 5 of 5. Guess 3 untestable (no L200 survivors).

## Run 2, written 2026-10-14 ~18:3xZ before running: the quench
Start every free square occupied, each a random 50/50 label (genet ids 1–25 splitter, 26–50 integrator, at random), on
the ground the kit would lay for that seed. Same N and B, L 100 and 200, 5 seeds, to 8000.
Guesses:
4. N coarsens from the quench: rho at 8000 below rho at 100 in 10 of 10 runs, falling slower than t^(-1/2):
   rho(8000)/rho(100) above (100/8000)^(1/2) = 0.11.
5. B stops coarsening: in runs with both kinds alive, rho(8000)/rho(1000) above 0.8, and B's rho at 8000 above N's.
