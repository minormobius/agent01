# Brief: make INPAC a race

You are working in the `minormobius/agent01` monorepo. Your work is confined to
one directory: **`clock/inpac/`**, served live at
[torus.mino.mobi/inpac/](https://torus.mino.mobi/inpac/).

Read `clock/CLAUDE.md` and the repo root `CLAUDE.md` before you change anything.

---

## What you're being asked for

INPAC is a first-person Pac-Man played on the **inside** of a torus. You walk on
the tube's inner wall; the doughnut curves away above and around you; look up
and the far side of the tube hangs overhead. It is a striking place and
currently not much of a game.

**Turn it into a race. Make it look good.**

That's the whole ask. It is deliberately broad, because **what is being compared
here is taste** — yours against five other agents given this identical brief. A
human is going to put the results side by side and decide which one they'd
rather play. Design decisions are the deliverable, not an incidental cost of
satisfying a checklist.

Two things are fixed (below): a physics bug you must fix, and a small machine
contract so the results can be captured at all. Everything else — what you race
against, what the track is, what it looks and feels like, what the torus is
*for* — is yours.

### The fork you must choose, and declare

Does the race keep INPAC's Pac-Man DNA — maze, pellets, ghosts, now on a clock —
or do you clear the board and build a pure tube racer?

**Either is a legitimate answer.** Pick one, commit to it, and say in `NOTES.md`
which you chose and why. That choice is the most interesting thing you will tell
us, so don't hedge it into a mush that is half of each.

### Things worth thinking about

Not requirements. Prompts, if you want them:

- A torus has two independent ways around it. A lap could go the long way round
  the ring, or spiral through both. What does the topology make possible that a
  flat track doesn't?
- What are you racing? A clock, a ghost of your own best run, opponents, a
  collapsing track, something else?
- You're inside a tube — the whole track is visible, wrapped overhead. That is a
  real and unusual affordance. Use it or deliberately don't.
- "Looks good" is not "has more effects." Restraint reads as confidence.

## The bug you must fix first

"Down", inside a tube, means **away from the tube centreline** — straight at the
nearest wall — at every point, all the way around.

The current code builds "down" from an **electrostatic analogy**: an
oppositely-charged shell on the torus surface attracting the player, plus a
same-charge ring along the tube centreline repelling them, numerically
integrated into a 32×32 lookup table over cylindrical `(R, Z)`
(`computeGravLUT` / `sampleGravity` in `index.html`).

It doesn't hold up. Measured on the shipped code at R=8, r=3 — positive means
"pulls you onto the floor", negative means "pushes you off it":

| distance from centreline | v=0° (outer) | v=90° (top) | v=180° (inner) | v=270° (bottom) |
|---|---|---|---|---|
| 0.70 r | +0.284 | +2.732 | +6.985 | +2.732 |
| 0.90 r | **−2.747** | +0.286 | +6.123 | +0.286 |
| 0.99 r | **−5.801** | **−3.632** | +1.684 | **−3.632** |

**Gravity reverses sign exactly where you land**, everywhere except the inner
equator. 422 of 1728 interior samples push you off the wall instead of onto it.

For a walking game this was a curiosity. For a **race** it is fatal: you cannot
bank into the outer wall, you cannot trust the floor at speed, and lap times
become a function of where you happen to be standing. Fix it before you build on
it.

How you fix it is yours. Repair the charge scheme, replace it with something
analytic, or something else — nothing below names an implementation. Note that
the *grounded* camera already sidesteps the LUT with the geometric normal (there
is a comment saying so); the bug bites while **airborne**, which is the only
place the field is actually integrated.

## The contract

Three seams. They exist because none of this can be judged otherwise — a game
nobody can start and nobody can inspect gets no credit for being good.

**1. `clock/inpac/field.mjs`** — the interior field, extracted. Dependency-free
ES module, no DOM:

```js
export const params = { TORUS_R: 8.0, TORUS_r: 3.0 };

// Acceleration at cylindrical (R, Z), in the (R̂, Ẑ) half-plane.
// geom is { R, r } for the torus being simulated; fall back to `params`.
export function field(R, Z, geom = {}) { /* … */ return { gR, gZ }; }
```

`index.html` must import it and drive its physics from it. A perfect module the
page doesn't use is not a fix.

**2. `?autostart=1`** — with this query parameter, the game begins play
immediately, with **no clicks and no keypresses**. The capture harness sends no
input at all; if a human has to press START, your entry is invisible and fails
the gate.

> Practical warning, found the hard way: **Pointer Lock throws without a user
> gesture.** If your start path calls `requestPointerLock()` unconditionally it
> will throw under autostart and abort before you render anything. Guard it.

**3. `window.__inpacState()`** — returns the live race state:

```js
{ running: boolean, timeMs: number, lap: number, laps: number, bestMs: number|null }
```

Keep it cheap; it is polled. `bestMs` may be `null` until a lap is completed.

## How you're judged

**The gate — all five, or you're out.** Machine-checked:

| check | requirement |
|---|---|
| `boots` | loads with no uncaught page errors |
| `draws` | puts something on screen |
| `animated` | the picture actually moves between frames |
| `autostart` | honours `?autostart=1` with no input |
| `physics` | interior gravity pulls you onto the wall at every interior sample, across three torus geometries — `{R:8,r:3}`, `{R:12,r:2}`, `{R:6,r:4}` |

**The skeleton — four race primitives**, reported `n/4`. These keep six entries
comparable instead of six unrelated genres:

| check | requirement |
|---|---|
| `clock` | a race clock that advances |
| `laps` | a circuit: `lap` and `laps` exposed, `laps ≥ 1` |
| `best` | a best time present in the state contract |
| `intact` | still a real page — render loop, uses `field.mjs`, not gutted |

**Taste — everything else, and the actual point.** Not scored by any machine.
A human ranks the entries side by side in the arena, and an anonymised panel of
models reviews the code and notes. There is no number to farm here; there is
only whether the thing is good.

Run the gate and skeleton yourself, as often as you like:

```bash
node bakeoff/briefs/inpac-race/score.mjs clock/inpac
```

## What you cannot verify, and must not claim

You are in a headless sandbox. **You cannot see the 3D view** — headless
Chromium does not composite the WebGPU surface into a screenshot, so neither can
the scoring harness. The capture proves your entry is *alive* (HUD, minimap,
overlays, a ticking clock); it says nothing about how it looks.

So: do not write "I verified the game renders correctly". You didn't. Say what
you checked and what you're trusting. An honest `NOTES.md` reads far better to
the human doing the ranking than a confident one that turns out to be wrong.

## Ground rules

- Change **only** `clock/inpac/`. Other surfaces, the registry, the deploy
  workflows and the scorer are off limits; edits to `bakeoff/**` are discarded
  when your entry is collected.
- No new runtime dependencies, no build step. These files are served as static
  assets exactly as they sit on disk.
- Don't modify `score.mjs` or `capture.mjs`. Entries are re-scored with the
  repo's copy, so local edits buy you nothing.
- Write `clock/inpac/NOTES.md`: the fork you chose and why, what you designed,
  what you traded away, what you couldn't verify. Keep it short and concrete.
  It is read side by side with five others.
