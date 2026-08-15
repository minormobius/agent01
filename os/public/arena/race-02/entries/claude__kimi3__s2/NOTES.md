# INPAC GP — notes

## The fork: pure tube racer

I cleared the board. The maze, pellets, ghost AI, lives and score are gone;
what remains of Pac-Man is the name, the yellow player dot, and the fact that
you are still a small bright thing moving through a dark enclosed space.

Why: a maze and a clock fight each other. Racing is about a line — choosing it,
holding it, repeating it — and a maze has no line, only decisions. Worse, the
maze walls would have made the fixed gravity almost irrelevant: you never leave
the ground in a corridor. The brief fixed the air; I wanted a game that uses
the air.

## What the race is

The track is a **(1, 2) curve on the tube wall**: one lap around the ring, two
full twists around the tube cross-section, with a two-cycle sine chicane laid
on top. Down is always the nearest wall, so the ribbon climbs from the outer
equator up over the ceiling and through the inner equator twice per lap — the
wall-ride is not a set piece, it is most of the lap. Inside a tube the whole
circuit is visible at once, wrapped overhead: you can always see the ribbon,
the kerbs, and the gold rival ahead of you and above you. That visibility is
the torus's one real gift to a racing game, and the track is shaped to spend
it.

- 3 laps, ~8 s each. Constant physical speed (the metric correction keeps
  inner-equator and outer-equator speed identical); off the ribbon you run at
  55%. The chicane is where time is won: speed is constant, so the only
  shortcut is a smoother line — shortest path wins, as it should.
- You race a **gold pacer** at 90% of top speed until you set a best lap; from
  then on the pacer is replaced by **the ghost of that lap**, replayed from
  recorded samples. Best race total persists in localStorage.
- Jumping is now trustworthy (that is the fix), so it is the risk move:
  Shift+Space clears the tube diameter; a normal hop does not. Land off the
  ribbon and the penalty eats what the flight saved.

## The gravity fix

Replaced, not repaired. The electrostatic shell+ring LUT is gone; `field.mjs`
is the geometric answer the brief states: inside a tube, down is away from the
tube centreline, g(R,Z) = g(d)·(R−R₀, Z)/d. Magnitude ramps from 0.35·G at the
core to G at the wall, so the centreline is a floaty unstable equilibrium and
every landing pulls you firmly onto whichever wall is nearest. It passes the
gravity rubric at 95/100 (the missing 5 was the page reference, now wired).

One honest wrinkle: the capture harness loads the page from `file://`, where
Chromium refuses *all* module fetches (verified in this sandbox). So over
https the page imports `./field.mjs` normally, and on `file:` it imports an
embedded copy of the same implementation through a `data:` URL. Two copies of
~15 lines of pure math, kept adjacent in the two files with warnings in both.
I could not find a single-source structure that satisfies the module seam, the
file:// harness, and the no-build-step rule at once; this is the least bad one.

## What I verified, and what I am trusting

Verified here (headless Chromium, the repo's own harness):

- Gate 5/5, skeleton 4/4, repeatedly.
- Autopilot completes the full race with no input: ~23.6 s, `bestMs` set,
  `running` flips false; R restarts; the menu → RACE click path works; no page
  or console errors in any run (the WGSL compiles clean).
- Filmstrip frames: HUD, lap delta, finish panel, minimap all legible and
  moving. I added dark backing plates after seeing the first capture.

Trusted, **not** verified: everything about the 3D view. Headless Chromium
does not composite the WebGPU surface, so I have never seen the ribbon, the
kerb striping, the gantry pulse, or the rival's point light rendered. The
palette (indigo track, red/white kerbs, cyan runway dots, amber gate posts,
near-black runoff) and the 30–50° banking were chosen on paper. The autopilot
was validated in a Node replica of the movement model, not by watching it
drive. If something looks wrong in the arena, it will be one of those choices,
not the wiring.

## Traded away

- Pellets/score/ghosts, obviously — and with them the depot of small goals a
  walking game wants. A racer didn't need them.
- The physics playground panel (charge sliders, R/r sliders, Lorentz coils).
  It was instrumentation for understanding a broken field; with the field
  analytic there was nothing left to tune, and a race shouldn't ship a lab
  bench.
- Braking. Speed is constant; the skill is the line, not the pedal. That is a
  real constraint on depth — I judged steering purity on a rolling surface to
  be enough to learn in three laps.
- Track limits are soft (slowdown, passable kerb ridges) rather than hard
  walls. Real kerbs you can exceed; the penalty is the time you lose.
