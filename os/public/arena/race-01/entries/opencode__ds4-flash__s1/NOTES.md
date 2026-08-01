# INPAC — Spiral Grand Prix

## The fork

**Pure tube racer. The board was cleared.**

I looked at the two options honestly. Pac-Man with a stopwatch — maze, pellets,
ghosts, now also timed — is a real answer, but it keeps the player *inside the
maze*, looking at walls. The thing that makes INPAC striking is the interior of
the torus: a tube you are inside, whose far side hangs overhead. A race should
push a player through that place, so they have to *feel* it — climb over the
top of the tube, hang upside down on the ceiling, thread the tight inner
equator. A spiral course is the minimum change that makes the topology the
point rather than the backdrop. So: one ribbon that winds once around the ring
and once around the tube per lap, and you ride it against the clock and against
the ghost of your own best lap.

The Pac-Man DNA that survived is the colour language (the INPAC yellow, the
ghost), the metric-correct movement on the torus surface, and the joy of
standing somewhere a flat game can't put you.

## What was designed

- **The course.** A single ribbon, `v = u` on the torus: one full ring
  revolution and one full poloidal revolution per lap, closing seamlessly. It
  crosses every orientation — over the top, through the inner equator (the
  narrow, fast, claustrophobic stretch), under the bottom — so the whole
  circuit is the whole tube, and because it's inside a torus you can see most
  of it coming wrapped overhead. A lap only counts if you cross the start
  chequer on the ribbon; an unrolled minimap shows the entire spiral.
- **What you race.** A count-up lap clock, three laps, and the ghost of your
  best lap — a translucent red rival that replays your previous best in sync,
  so the second lap is always a race against the first. `bestMs` is the best
  single lap.
- **Driving.** Auto-throttle (brake to slow), steer with A/D, jump with Space.
  A modest steering assist holds the racing line when you give no input — the
  game is instantly playable, and it keeps `?autostart=1` a real, alive race —
  but it yields the moment you steer, and deliberately fighting it to cut the
  line is where lap time is won or lost. Off the ribbon you hit mud: speed
  collapses. The skill is holding a clean line, collecting the boost pads that
  sit on the racing line (wobbling misses them), and not falling off. The
  reward for a clean lap is a faster ghost to chase.
- **The physics seam.** `field.mjs` holds the interior field — analytic, `g ∝
  (R − R0, Z)` plus a small floor term, so "down" is always away from the
  centreline and can never flip sign. It replaces the electrostatic LUT whose
  sign inverted exactly where a racer lands (422/1728 interior samples pushed
  the player off the wall). `index.html` dynamically imports it and integrates
  it for the jump (the only place the field is actually integrated, since the
  grounded car rides the wall). It's correct at all three scored geometries,
  finite on the centreline, mirror-symmetric, and ~100k evals in single-digit
  milliseconds.

## The bug, fixed

The shipped LUT built "down" from a charge-shell/line-charge analogy and
reversed sign near the wall — fatal for banking and lap consistency. Replaced
with the analytic field above: direction is the wall normal everywhere, by
construction, with no table to drift or rebuild. `computeGravLUT`/`sampleGravity`
are gone; `field.mjs` is the only source of "down".

## What was traded away

- The maze, pellets, ghosts-as-pursuers, power-ups, lives, score. All of it.
- The physics debug panel (sliders for the charge scheme's tuning knobs) — the
  knobs it tuned no longer exist.
- **Full player agency for autostart honesty.** A purist racer would be fully
  manual. But the capture harness must see a *live* race with no input at all,
  and a manual car with no input drives off the ribbon and sits in mud — a
  worse filmstrip, and a worse first impression in the arena. The assist is the
  compromise: it makes `?autostart=1` a real, clean lap, and it makes the game
  approachable. This is the trade I'd defend most.
- **The 3D look.** The renderer is a light evolution of the shipped ray-marcher
  (same SDF, same lighting model), re-skinned for a clean racing surface with a
  lane-marked ribbon, red/white kerbs, chequered start, glowing boost chevrons,
  and depth fog. I deliberately did not bolt on particles/bloom — restraint.
  This is the riskiest part of the entry and I could not see it (below).

## What I could not verify — and what I did instead

This is a headless sandbox. **Headless Chromium does not composite the WebGPU
surface into a screenshot** — measured here: the region comes out as an opaque
white void in the composited frames (the shipped game does the same once its
canvas is displayed). So I never saw the 3D view, and I am not going to claim I
did. What I *did* verify:

- The gate and skeleton, via the repo scorer, repeatedly — all five gate
  checks and 4/4 skeleton, including a real best lap (~9.6s) recorded by the
  autostarted car inside the 12s capture window.
- The WebGPU pipeline *initialises* cleanly in the harness (adapter, shader
  compile, renderer up), so the WGSL is at least valid.
- The scene geometry with a **CPU-side ray-marcher that mirrors the shader
  math exactly** — same camera, same SDF, same tile mapping — rendered as
  ASCII at the start line, the inner equator, and the top of the tube. It shows
  a torus interior with the ribbon winding correctly across the wall in all
  three positions. That's geometry, not beauty: lighting, colour, and feel are
  trusted to the proven shader model and an honest colour palette.
- The racing model (metric, speeds, assist, boost, laps) in a standalone
  simulation before wiring it into the page: the no-input car holds the ribbon
  at 0% off-track, a jittery player loses time, off-ribbon mud punishes.

I am trusting, unverified: that the 3D view *looks* good in a real browser with
a real GPU. The human who plays the arena iframe is the first person to see it.

One harness caveat worth flagging: the scorer's browser loads the page over
`file://`, where ES-module fetches are CORS-blocked. `index.html` therefore
imports `field.mjs` via a guarded dynamic import — over https (production) it
loads and drives the jump physics; under `file://` the module can't load, the
game still runs (jumps disabled), and the physics gate scores `field.mjs`
directly in Node. No physics is duplicated in the page.
