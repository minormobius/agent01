# TAILSPIN

kata's level series: the Cheshire cat rides a bicycle through four dimensions, and ten levels teach you to lean into
w. Every level is the cat, on its one-axis bike, in easy mode. The stick is the lean, and there is no autopilot.

## Riding

- **The stick (or WASD, or the arrows) is the lean.** Right leans right and turns right; up leans **ana** and down
  **kata**, into the direction your slice can't see. The bike takes the lean in a twentieth of a second, with the
  steady turn's steer (dyn.js easy mode). The stick's full throw is twice the biggest lean the level asks for, at
  least 8°, so the control is fine where the course is gentle.
- **The camera** rides behind the cat in the bike's own non-twisting frame. So "up" on the stick is always the
  direction the screen can't show, and a bend's direction (below) is exactly where the stick goes.
- **The kerbs say where the track goes.** Each kerb is coloured by which way the track heads out of your slice:
  **teal** ana, **rose** kata, white in it, deeper the steeper. That is the shader's: every track cell carries its
  place along the course (`world.js trackBins`), and the course's direction at each place (`binTangents`) is
  dotted with your slice's unseen direction.
- **The gauge** (bottom middle): your stick (blue ring), the cat's lean (gold dot) and, with **hint** on, the lean
  the track wants just ahead (white diamond).
- **Leave the track** (further than its radius from the centreline) for more than 0.45 s and you're put back at the
  last checkpoint (every 15 m). Finish clean and close to the line for 🥇, clean for 🥈, at all for 🥉.

## The engine

- **Courses (`js/course.js`).** A course is a run of segments, `{ len, r (radius), dir, twist }`. `dir` is the bend's
  direction in the rider's frame (0 right, 90 ana, 180 left, 270 kata), and `twist` turns it along the segment, which
  is the track's torsion. The centreline is integrated with the rider's frame carried without twisting
  (T′ = κ, e1′ = −(κ·e1)T, e2′ = −(κ·e2)T), each change of bend eased over 4 m. Then the course is turned by whichever
  of the 24 grid-keeping rotations fits Lean's stadium best (so you start squared to the voxels), centred a quarter-cell
  off the grid (so the centre line is one cell wide), and checked: inside the basin with a margin, and nowhere near
  itself.
- **The oracle (`js/oracle.js`).** It rides like a person on the page: the cat bike in easy mode, a pure-pursuit rider
  looking 4.9 m ahead, its stick limited to the level's throw, and a reaction time τ. It acts now on what it saw τ ago
  and doesn't make up for it. τ⋆ is the slowest reaction (25 ms grid, up to 1.2 s) at which it still finishes. A course
  it can't ride at τ = 0 isn't a level.
- **The difficulty (/10)** is 10 × (0.35 timing + 0.3 out-of-plane + 0.2 twist + 0.15 lean):
  - **timing** = 1 − τ⋆/1.2 s;
  - **out of plane** = half the share of bending that's into w, half how many directions it mixes;
  - **twist** = the fastest twist, against 8°/m;
  - **lean** = the biggest lean, against 20°.
  The cat bike at 3 m/s forgives slow hands, so the 4D parts carry most of the weight: what's hard here is what you
  can't see.
- **The levels (`js/levels.js`).** Ten, hand made, each teaching one thing: first lean, both ways, ana, kata, four
  ways, in between, corkscrew (torsion), narrow, helix, tailspin. Their scores are stored and held to the oracle's,
  and they rise every level: 0.18 to 5.22. The scale goes to 10 for later, nuttier levels.
- **Made levels (`js/gen.js`).** A seed and a tier (easy, medium, hard, or today's: the date, medium) make a course,
  the same every time. The tier sets how many bends, how tight, which ways (left and right, then ana and kata, then
  diagonals, then any angle), how often and how fast they twist, and how narrow the track is. A draw that doesn't
  fit or that the oracle can't ride is thrown away. URLs: `?level=3`, `?seed=123&tier=hard`.

TAILSPIN imports Lean's engine (`../lean/js/`: the stadium, the shader, the dynamics, the cat), which is the same
site, so it isn't a copy. A level switch changes only the floor's markings (`markTrack` / `unmarkTrack`), so the
stadium is built once.

## Checks

```bash
node kata/tailspin/test/tailspin.selftest.mjs   # ~50 s
```

- the rider's frame is orthonormal and doesn't twist, the course bends as asked, bends ease in, and a course starts
  squared to the grid;
- every level fits, the oracle rides it, its stored score is the oracle's, and every level is harder than the last;
- up on the stick is ana: the camera's unseen direction is the course's e2, and the lean for level 3's ana bend
  points up;
- made levels are the same for the same seed, every one fits and is ridden, and harder tiers score higher;
- every track cell has its place along the course and its direction, and a level switch leaves the stadium as it was.
