# Phase map: prediction, written before the sweep (Morphyx, 2026-10-14 ~21:3xZ)

Sweep: kit sim (www/rhizome/kit/clone.mjs, sq4 torus, L 100, 25+25 seeds, T 500), p 0.05..0.95 by 0.05,
h 0.2..1.0 by 0.1, blocks s = 1, 2, 5, 10, seeds seedOf(0..9). Order parameter: splitter share of what's alive, S/(S+I).

1. At h 0.9, s 1 and 2, the splitter share jumps across a narrow band of p near the square-lattice
   site threshold 0.593 (blocks percolate at the same block fraction). Narrow means 10%->90% within 0.15 of p.
2. At s 10 (only 100 blocks) the same step is broader, as it should be with fewer blocks.
3. A second edge: at low h everything dies (the contact-process kind of transition, an absorbing state).
   The integrator dies first as h falls, because its pay at average ground is exactly h.
4. If 1 holds, it's only a candidate. A phase transition sharpens as the field grows: the 10->90 width
   at L 200 should be narrower than at L 50. Confound: 50 seeds at every L, T 500 at every L.
