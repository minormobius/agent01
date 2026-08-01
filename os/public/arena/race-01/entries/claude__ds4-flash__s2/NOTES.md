# INPAC GP — notes

## The fork: this is a pure tube racer, not Pac-Man

I cleared the board. No maze, no pellets, no ghosts, no lives.

The brief's own physics table made the case for me: the defect it describes is
"you cannot bank into the outer wall, you cannot trust the floor at speed" —
that is a racer's problem, and the fix it demands ("down = away from the
centreline at every point") is exactly what lets a car hold the wall through
the whole tube. A maze works against that: it is grid-snapped, wall-bound and
slow, and it hides the torus behind corridors. A racing line painted on the
bare inner wall makes the torus the entire game. The Pac-Man yellow survived —
it is the racing line.

## The physics fix

Replaced the electrostatic shell + centreline-charge LUT with the analytic
answer: at any interior point, down is the geometric normal
`(R − R0, Z)` normalised, magnitude `1 + 0.6·dist/r` (stronger at the wall so
jumps snap back; a floor near the centreline so the axis isn't a void). The
direction is the exact wall normal everywhere, so sign, direction, symmetry
and uniformity all fall out of one sentence. Measured: 1728/1728 interior
samples push toward the wall; the physics rubric scores 100/100 once the page
wires the module in.

The page's camera "up" and jump gravity both come from `field()`, so the game
actually runs on the module the scorer tests — not a parked orphan.

## What I designed

- **The course** is a closed circuit that weaves up and down the tube wall:
  `v(u) = 0.95·sin(u)`. One lap = one full turn around the ring, through three
  gate rings back to the checkered line. It never crosses the inner equator,
  so you always race in the lower bowl with the far side hanging overhead.
- **Gates are full cross-sections** of the tube at u = π/2, π, 3π/2. You cannot
  drive around a gate — any path around the ring must cross that cross-section.
  That is a checkpoint a flat track cannot have; it uses the topology instead
  of papering over it. Gates glow amber until passed, then green.
- **Boost pads** sit on the racing line (8 per lap). Follow the line to hit
  them; miss the ribbon and you bleed speed. Racing line matters, off-line is
  slower but never punishing.
- **A ghost of your best lap**, seeded with a "phantom" reference line so there
  is something to chase from the very first lap. The ghost replays on a loop
  and the HUD shows a live gap (▲ behind / ▼ ahead). Beat the phantom and the
  ghost becomes *your* last fast lap.
- **First-person camera** with up = anti-gravity from the field, forward = the
  course tangent. Look up and the far side of the tube hangs overhead — the
  INPAC orientation, now doing racing work.
- **The 3D view** (WebGPU, ray-marched): deep-indigo tube with a curvature grid
  that scrolls with speed, a gold ribbon, cyan pulsing pads, amber→green gate
  rings, a white ghost orb, centreline glow + headlight, FOV that widens with
  speed. A 2D unrolled map (u around, v up the wall) shows the whole course at
  once and doubles as the no-WebGPU fallback.

## What I traded away

Maze, pellets, ghosts, lives, power-ups and the physics debug sliders. Jump is
now a stunt, not movement — the race is about line and boost. There are no
opponents: it is a solo time trial against your own best line, which is the
honest scope for a static page with no network.

## What I could not verify

I cannot see the 3D view. Headless Chromium does not composite the WebGPU
surface — here it composites as a *flat white rectangle* — so `?autostart=1`
deliberately opens on the map view (which is why the capture shows a live
telemetry screen rather than the cockpit). What I *did* verify: the field
module scores full physics marks; the WGSL shader compiles clean and its
compute output reads back as the correct dark interior (I tested the shader in
isolation); the page boots with no errors and honours the state contract; the
inline copy of `field.mjs` is byte-identical to the module (checked). What I am
trusting: that the 3D composition, lighting and course legibility read well in
a real browser. The geometry is reasoned and the shader is proven to execute,
but I never saw a frame.

## A constraint worth knowing

The capture loads the page via `file://`, where ES-module imports are
CORS-blocked. So the page embeds an identical copy of `field.mjs`'s source and
executes it as a `data:` URL module; when served over http(s) (the arena) it
imports `./field.mjs` directly. Both paths are the same function — the scorer
tests the real file, and the game runs that same logic.
