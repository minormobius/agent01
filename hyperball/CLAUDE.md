# hyperball — hyperball.mino.mobi

**HYPERBALL**: bike-ball in four dimensions. You ride a 4D bicycle round the inside of a small hollow 3-sphere, jump
and boost, and knock a ball into the spherinder goal at the far pole. Vaporwave arena. Solo practice for now (three
minutes, score what you can); an opponent is next.

## Facts

| | |
|---|---|
| Surface | `hyperball` |
| Dir | `hyperball/` |
| Endpoint | `hyperball.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/epic-mayer-y28tpl` |
| Deploy | `.github/workflows/deploy-hyperball.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "hyperball"`.

## How it works

One static site, no build, no worker script (worker `hyperball`, assets only, plain route `hyperball.mino.mobi/*`).

- `js/habitat.js` is a **byte-identical copy** of `ana/habitat/js/habitat.js` (the Hopf habitat's maths: J, exact
  flights, walking by parallel transport, `orthonormalTo`, the map `mapOf`). Edit ana's, then copy it over; the
  selftest fails on drift.
- `js/arena.js` (no DOM) is the game's physics. `ARENA`: R 40 m, 0.6 g, the ball (r 1.6, e 0.62), the bike, the goals
  (spherinders r 7, h 5 at `OWN` and `ENEMY`, opposite poles; kickoff on the equator, `SPOT`).
  - `gravity`: **arcade** (the default, g outward everywhere) or **spin** (ω²x − 2ωJv: Coriolis). Only airborne things
    feel the spin; the bike on the ground drives along the floor.
  - `stepBall` (gravity, drag, bounce with restitution, rolling friction), `stepBike` (throttle, brake, boost; steering
    turns the heading toward the stick's direction across it, [right, ana], at most the lean limit allows, v·ω = g
    tan φ; jump; in the air, gravity and boost, with jump held boost tilts 45° up; landing), `collide` (push and hit).
  - `inGoal`: within r of the pole along the floor and under h.
  - **Aiming**: `lockSlice` (ball lock: turns the across-space about the heading so the ball lies in span{F, up, Rt},
    so the chase camera, whose slice is that, always sees it; exact, the selftest holds the offset to 1e-9). Two rules
    keep it from wrenching the view, both learned the hard way: it turns to the NEARER of ±Rt (the slice holds the
    ball on your left too; turning Rt toward a ball on the left spun the across-plane 180°, a mirror-flip, every time
    you passed the ball), and the game runs it LAZY (`tol` 0.4 m: no turn while the ball is that close to the slice)
    at 1.5 rad/s. The old lock whipped the frame at its full rate on 560 of 960 steps of a drive past the ball; this
    one never does, and the ball stays in the slice (worst 0.93 m off, radius 1.6). `intercept` (a
    copy of the ball run forward to the first moment you could be under it), `approach` (a point behind the ball on
    the line to their goal), `steerToward`.
  - **The camera**, `chaseCamera` (here, not in main.js, so the selftest can drive it): behind the bike on the line
    from the ball, its direction turned as an angle in the (F, Rt) plane (never a vector average through zero); the
    look aims at the ball but stays within 0.5 rad of the bike (always in frame) and under 0.62 of straight up, and
    turns at most 1.6 rad/s; its right is up × look in the slice's (F, Rt, up) coordinates, so it can't degenerate
    when looking along Rt or at the sky (Gram–Schmidt of [look, up, Rt, N] did, and flipped). Tested: driving at the
    ball and past it, the frame never turns faster than 110°/s and the bike is never more than ~30° off centre.
  - `kickoff(A, rnd)`: with `rnd`, solo kickoffs come from a random side (0.5–2.4 rad off the line to their goal,
    any direction across it) with the ball already rolling; without, the fixed case for the tests.
- `js/main.js`: a fragment shader ray-traces the slice: the floor from inside (a neon grid of the planes x_k = 5n m,
  the halfway sphere, goal circles, shadows), the striped sun at the centre, the ball, the bike (two wheel balls, a
  capsule body, a flame when boosting), the goals (translucent cone wall at the goal's radius, roof at its height), the
  path ribbon (an arc to the intercept, chevrons, kerbs teal ana / pink kata of your slice) and the gold shot line. A
  2D overlay: the ball's marker (ana/kata offset when lock is off; an edge arrow when off screen), goal markers, a
  minimap (the arena as a ball on your axes), score, clock, boost. Physics at a fixed 120 Hz, the loop stopping the
  moment a step ends play (it once counted one goal seven times, the ball still in the net); ball cam looks at the
  ball. The floor's grid lines fade out where they're too fine to draw (blurred, they washed the floor pink). Touch: a stick (lean right/left, ana/kata) and BOOST, JUMP, BRAKE, GO;
  the throttle is always on by default on touch screens.

## Checks

```bash
node hyperball/test/hyperball.selftest.mjs   # <1 s: the copy, gravity, flights vs ana's, bounces, driving, jumps, hits, goals, ball lock (no flips), the camera (no jumps, bike in view), aiming, kickoffs
```

## Next

An opponent (the same aids, driving itself), boost pads, the ball's spin, a real 4D bicycle under you (kata's).
