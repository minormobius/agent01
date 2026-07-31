# Brief: fix INPAC's interior gravity

You are working in the `minormobius/agent01` monorepo. Your task touches exactly
one toy: **`clock/inpac/`**, served live at
[torus.mino.mobi/inpac/](https://torus.mino.mobi/inpac/).

Read `clock/CLAUDE.md` and the repo root `CLAUDE.md` before you change anything.

---

## What INPAC is

First-person Pac-Man played on the **inside** of a torus. You walk on the tube's
inner wall; the doughnut curves away above and around you. Look up and you see
the far side of the tube overhead.

## What is broken

"Down", for someone standing inside a tube, means **away from the tube
centreline** — straight at the nearest wall — at every point, all the way
around. That is the entire physical requirement.

The current implementation does not do that. It builds "down" out of an
**electrostatic analogy**: an oppositely-charged shell on the torus surface that
*attracts* the player, plus a same-charge ring along the tube centreline that
*repels* them. Both are numerically integrated into a 32×32 lookup table over
cylindrical `(R, Z)` and bilinearly sampled (`computeGravLUT` / `sampleGravity`
in `clock/inpac/index.html`).

The analogy does not hold up. Measured on the shipped code at the default
geometry (R=8, r=3), here is the component of the field pointing toward the wall
— positive means "pulls you onto the floor", negative means "pushes you off it":

| distance from centreline | v=0° (outer wall) | v=90° (top) | v=180° (inner wall) | v=270° (bottom) |
|---|---|---|---|---|
| 0.70 r | +0.284 | +2.732 | +6.985 | +2.732 |
| 0.90 r | **−2.747** | +0.286 | +6.123 | +0.286 |
| 0.99 r | **−5.801** | **−3.632** | +1.684 | **−3.632** |

**Gravity reverses sign exactly where you land.** Over most of the tube the
field flips to pushing you back toward the centreline as you approach the floor.
Only near the inner equator (v=180°, the side facing the doughnut hole) does it
behave. Where it does work, it is wildly non-uniform — you weigh several times
more on one side of the tube than the other.

Two consequences you can see in the game: you cannot settle on large parts of
the wall, and jumps behave differently depending on where you are standing. Note
that the *grounded* camera sidesteps the whole thing by using the geometric
inward normal directly (there is a comment in the file saying as much) — so the
bug is most visible while **airborne**, which is the one place the field is
actually integrated (`updateJumpPhysics`).

Scored end to end, the shipped scheme gets **30/100** on the rubric below.

## What to deliver

**1. Extract the field into a testable module: `clock/inpac/field.mjs`.**

A dependency-free ES module, no DOM access, exporting:

```js
export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// Acceleration at the cylindrical point (R, Z), in the (R̂, Ẑ) half-plane.
// geom is { R, r } for the torus being simulated; fall back to `params`.
export function field(R, Z, geom = {}) { /* … */ return { gR, gZ }; }
```

This seam is required — it is what makes the physics testable at all, and it is
how your work is scored. Keep it pure: same inputs, same outputs, no globals.

**2. Make `index.html` use it.** Import `field.mjs` and drive the jump
integration from it. A module that scores perfectly while the page still runs
the old broken LUT is not a fix — the scorer checks that the page references it.

**3. Fix the physics** so a player inside the tube is pulled onto the wall,
consistently, everywhere, at any torus geometry the sliders can produce.

### How you fix it is yours to choose

You may repair the charge scheme, replace it with something analytic, or do
something else entirely. Nothing in the rubric names an implementation — it only
describes what a player must experience. Judge for yourself whether an
electrostatic analogy is the right tool for "stand on the inside of a tube".

If you keep the sliders meaningful, say so in your notes. If you make them
vestigial, say that too — an honest note about a tradeoff scores better with the
human reader than a silent removal.

## How you are scored — 100 points

Run it yourself, as often as you like:

```bash
node bakeoff/briefs/inpac-gravity/score.mjs clock/inpac
```

| pts | check | requirement |
|---|---|---|
| 30 | `sign` | At **every** interior sample — 3 geometries × 72 poloidal angles × 8 depths — the field must have a positive component toward the wall. This is the bug. |
| 15 | `direction` | At standing depth (0.93 r) the field must aim within **15°** of the wall normal. |
| 15 | `uniformity` | At the wall (0.98 r), heaviest-to-lightest apparent gravity around the tube must be **≤ 2×**. |
| 10 | `floor` | No interior point may have a pull weaker than **0.1×** the mid-tube average — no dead zones you float in. |
| 10 | `finite` | Finite output at degenerate probes: exactly on the centreline, on either wall, and on the symmetry axis. No NaN, no Infinity, no throw. |
| 10 | `symmetry` | The torus is mirror-symmetric about z=0, so the field must be: `gR(R,−Z) = gR(R,Z)` and `gZ(R,−Z) = −gZ(R,Z)`, within 1%. |
| 5 | `speed` | 100k evaluations in under 250ms — this runs 8 substeps per frame. |
| 5 | `integrity` | `index.html` still references `field.mjs`, still has its render loop, and did not shrink below 20KB. Do not gut the game to pass the physics. |

The three geometries are `{R:8,r:3}`, `{R:12,r:2}` and `{R:6,r:4}`. The last is
deliberately fat — a fix tuned to the default aspect ratio will fail there.

`node bakeoff/briefs/inpac-gravity/baseline.mjs` scores the shipped code, so you
can see exactly what you are starting from.

## Ground rules

- Change **only** `clock/inpac/`. Do not touch other surfaces, the registry, the
  deploy workflows, or the scorer. Edits to `bakeoff/**` are ignored when your
  entry is collected.
- No new runtime dependencies. This file is served as static assets — no build
  step, no npm at runtime.
- Do not modify `score.mjs` or `baseline.mjs`. Your entry is re-scored with the
  repo's copy, so local edits to the scorer buy you nothing.
- Leave the game playable: same controls, same maze, same look.
- Write a short `clock/inpac/NOTES.md` — what you diagnosed, what you chose, and
  what you traded away. A human reads these side by side. Be honest about what
  you did not verify; you cannot run WebGPU here, so you **cannot** claim you
  watched the game work.

## What "done" looks like

`node bakeoff/briefs/inpac-gravity/score.mjs clock/inpac` prints 100/100, the
page still runs its own render loop off the same module, and `NOTES.md` explains
the call you made.
