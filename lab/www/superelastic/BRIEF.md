# site-3 / "Superelastic" — handoff

## What this is

A reply to a factory-posted concept advert (`minormobius.bsky.social` said
"build that" — see their profile for the pattern; this is at least the sixth
time). The advert was itself a summary of a real paper: motility-induced
phase separation, but flipped — particles that individually just buzz in
place (no self-propulsion at all) form an active gas purely because their
collisions are super-elastic. More crowding → more collisions → more
injected energy → more crowding effectively, a positive feedback loop with
no motor anywhere in it. Tuning the same knob the other way is supposed to
let the crowd crystallize instead.

Turn one, shipped: a canvas of dots, two dials (particle count / density,
and collision restitution `e`), and a live readout that measures the
particles' own kinetic energy against a computed "quiet room" baseline to
call the state quiet or buzzing. The transition is genuinely emergent — the
physics is simulated directly from one local collision rule
(`resolveCollision` in the script), not scripted off the slider values. No
sign-in, no leaderboard, no OAuth: nothing here needs to remember anything
between visits yet.

## Decisions

**Plain canvas2D, not WebGPU, despite the advert naming `g/`'s shelf.** `g/`
is a different surface at `g.mino.mobi` — a different origin from
`minomobi.com/site-3/`, so its code can't be imported here at all (and
wouldn't survive the CSP's `script-src 'self'` even if it could). A few
hundred particles with a grid-accelerated O(n) neighbour search is well
within what canvas2D + `requestAnimationFrame` handles at 60fps, so WebGPU
wasn't actually load-bearing for turn one's scope anyway.

**Collision model is a restitution coefficient, not a fixed-energy "kick".**
The advert's language ("collision-kick strength") suggested a fixed energy
quantum injected per contact. I used the standard equal-mass 2D collision
with a restitution factor `e` instead (`e = 1` neutral/elastic, `e > 1`
super-elastic, `e < 1` lossy) because it's the physically standard,
easy-to-verify-by-hand collision rule, and because a fixed-quantum model's
linear stability analysis (worked through on paper, not in code) suggested
runaway would trigger at *any* positive kick and *any* density once speeds
got small enough — no genuine density threshold, just a rate difference.
The restitution model doesn't have that degeneracy and is honestly described
on the page.

**No exact analytic threshold curve.** I did not derive or pre-compute where
(density, `e`) crosses from quiet to buzzing — the page says so directly.
The sliders cover a wide enough range (density 20–450 particles in a fixed
virtual box, `e` from 0.4 to 2.0) that the transition should be findable by
exploration regardless of exactly where the constants put it. I have no
browser in this sandbox to confirm the transition is visually obvious at the
chosen defaults (N=140, e=1.15) — the harness screenshot after this build
finishes is the first real look anyone (including me) gets.

**Used `NOISE_AMP`/`DRAG_LIN`/`DRAG_QUAD` as free constants, tuned by
reasoning, not measurement.** These set the "empty room" resting jitter and
how fast energy bleeds out of a moving particle. `DRAG_QUAD` (a
speed-proportional extra drag) is what keeps the buzzing state from
blowing up numerically instead of saturating into a bounded hot gas — this
is a physically reasonable but not paper-derived saturation mechanism, and
the page doesn't claim otherwise.

**No leaderboard, no `pds.js`, no `workers/scores` in turn one.** The
advert's own scoping line says crystallization (and by extension, a
"recipes that crystallize fastest" leaderboard) is a stretch goal for once
the gas phase is convincing — so it wasn't attempted this turn. Following
the `diffuse` build's precedent in the profile: if/when a leaderboard is
built, use `/_kit/pds.js`'s `com.minomobi.lab.score` collection, not
`workers/scores` — the lab worker's `connect-src` CSP cannot reach
`scores.mino.mobi` at all, so that path is a dead end regardless of what any
future request names.

## The plan (in order)

1. **Verify the transition is real and findable on screen.** This is the one
   thing I could not test. If the screenshot/report shows the canvas looking
   the same at both slider extremes, the first fix is almost certainly the
   drag/noise constants (`DRAG_LIN`, `DRAG_QUAD`, `NOISE_AMP` near the top of
   the script), not the collision math — nudge `DRAG_LIN` down and/or the
   `e` slider's upper bound up before touching anything else.
2. **A headless Node harness to actually measure the threshold**, per this
   requester's demonstrated preference (see `honeyflow-chess` in the
   profile: "you can't cheat the flow, it's gotta be solved not guessed").
   The physics in `index.html` is plain JS with no DOM dependency in the
   `step()`/`resolveCollision()` functions — factoring those out into a
   standalone script and sweeping (density, `e`) pairs to measure
   steady-state energy would turn the current "explore the sliders and see"
   into an actual measured phase diagram, and could set the slider defaults
   to sit visibly near the real threshold instead of a guess. I had no Bash
   tool available this turn to write and run one.
3. **Crystallization** (the advert's stretch goal): pushing `e` well below 1
   already cools the crowd toward a jammed resting pack, but that's not
   ordered — there's no mechanism here that favours a lattice over a random
   jam. A real attempt needs either a longer-range alignment/attraction term
   between near-neighbours, or measuring local hexagonal order (bond-orientational
   order parameter ψ₆) as a second readout so "crystallized" means something
   checkable, not just "stopped moving."
4. **The leaderboard**, once crystallization exists to rank: `pds.js`'s
   `postScore`/`scoresOf`, recipe = (density, `e`) pair, score = time-to-order
   under a fixed seed so a run is reproducible and checkable by a second
   party re-running the same seed — this was the advert's own suggested
   verification method and it's a good one.

## Gotchas

**The collision-approach sign convention is easy to get backwards and it's
silent when you do.** With normal `n` pointing from particle A to particle B,
particles are *approaching* when `(vA - vB)·n > 0`, not `< 0` — I wrote the
inverted condition on the first pass and it would have made the entire
energy-injection mechanic (the whole point of the site) silently do almost
nothing, since particles would only get a velocity impulse when already
separating. Caught by hand-deriving a one-line numeric example (two
particles head-on, mass 1) before shipping, not by running it. If the
buzzing transition ever seems to stop responding to `e` after an edit near
`resolveCollision`, check this sign first.

**The packing-fraction/energy readouts only updated inside the
`requestAnimationFrame` loop on the first draft**, so dragging the density
slider while paused (or under `prefers-reduced-motion`, which starts
paused) left stale numbers on screen. Fixed by pulling `updatePhi()` out and
calling it from both the loop and the slider handler — worth remembering
for any other readout added later: anything driven by a value a visitor can
change while paused needs its own update call outside the animation loop.
