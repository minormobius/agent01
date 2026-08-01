# Bake-off `smoke-01` — brief `inpac-race`

Target: `clock/inpac`. 2 runs across 2 cells.

**There is no overall score.** The gate is a floor, the primitives are a checklist. Ranking is a human call — see the arena page.

| harness | model | run | gate | primitives | agent | patch | time |
|---|---|---|---|---|---|---|---|
| claude | ds4-flash | 1 | **PASS** | 4/4 | exit 0 | 69730B | 2722s |
| opencode | ds4-flash | 1 | **PASS** | 4/4 | exit 0 | 114166B | 2907s |

## Gate

| harness / model / run | boots | draws | animated | autostart | physics |
|---|---|---|---|---|---|
| claude / ds4-flash / 1 | ✓ | ✓ | ✓ | ✓ | ✓ |
| opencode / ds4-flash / 1 | ✓ | ✓ | ✓ | ✓ | ✓ |

## Race primitives

| harness / model / run | clock | laps | best | intact |
|---|---|---|---|---|
| claude / ds4-flash / 1 | ✓ | ✓ | ✓ | ✓ |
| opencode / ds4-flash / 1 | ✓ | ✓ | ✓ | ✓ |

## Judge panel (anonymised, second opinion only)

Entries were relabelled and every mention of harness and model stripped before review; no model judged its own entry. Judges read NOTES.md and the diff — **they cannot see the game**, so this is about ambition, craft and use of the topology, not looks.

### Entry A — `claude__ds4-flash__s1` · would-play 9

- **honesty of the notes** (judged by ds4-pro): The notes are forthright and honest, explicitly separating what was tested from what was reasoned about, and they never claim visual verification. They state real trade-offs and limitations without marketing spin.
  - strongest: Bluntly admitting the visual look was only reasoned about, not confirmed, despite it being the most glamorous part.
  - weakest: Phrasing like 'the racing line on a torus is a real decision' could be seen as a slight overstatement; it's a genuine feature but not a huge strategic revelation.

### Entry B — `opencode__ds4-flash__s1` · would-play 8

- **design ambition** (judged by ds4-pro): This entry commits fully to a pure tube racer that exploits the torus's dual cycles with a helix lap, turning Pac-Man's topology into a genuine racing design rather than a dressed-up checklist.
  - strongest: The helix lap that winds once around the tube per lap around the ring, making the race inseparable from the torus topology and giving the player a track with no flat equivalent.
  - weakest: The decision to race only against a ghost and pacemaker is logically sound, but lacks the unpredictable pressure of living rivals; it feels like a safe choice for a judged arena rather than a bolder multiplayer or AI opponent.

## Notes from each agent

### claude / ds4-flash / run 1 — gate PASS

# INPAC — Labyrinth Circuit

## The fork: Pac-Man DNA, on a clock

I kept the maze, the pellets and the ghosts and built a **hot-lap time trial on
the toroidal circuit**. The pure-racer fork was the bolder visual idea, but it
meant inventing a game from nothing — a smooth tube has no reason to be hard,
and the existing assets don't serve it. INPAC's labyrinth, ghosts and pellet
field were already the most game-like thing on the page, and the WebGPU
interior-torus renderer was already the striking part. So the brief's phrase
"Pac-Man, now on a clock" is exactly what I built — and it leans on the one
thing no flat maze has: a lap that wraps seamlessly around the ring, with a
physically shorter inner line. The racing line on a torus is a real decision.

## What the race is

- **A lap** = one full circuit of the ring (54 u-tiles of progress, any v).
  The maze wraps, so the start/finish is a checkerboard band around the tube —
  no seam. **Laps: 3.** The state clock is total elapsed (monotonic); the big
  HUD timer is the current lap.
- **Fuel is speed.** Pellets fill a fuel gauge that drains constantly; speed
  scales with fuel. Thread the pellet lines or crawl.
- **Ghosts are traffic.** A hit is a WRECK: fuel to zero, +2s on the lap, brief
  invulnerability. A power pellet flips them and you can eat one for −3s. No
  lives — the fail state is a bad time, which is the honest form of failure for
  a time trial and keeps the race running for a demo/capture.
- **Ghost of your best run.** Each lap is recorded; the fastest becomes a
  translucent cyan tracer that replays on later laps with a live ahead/behind
  readout. You race yourself, and the ghost gets faster as you do.
- **The inner line is faster.** Tile speed is metric-corrected so physical
  speed is uniform, which makes the shorter inner equator the fast line.
- **4 checkpoints** (cyan gates in-world + minimap) for pace feedback.
- Jumping is a real tool: you can hop over ghosts and shortcut walls, at the
  cost of dropping your pellet chain. The gravity that makes jumps work
  everywhere is the field fix below.

## The physics fix

The old electrostatic LUT reversed sign exactly where you land — 422 of 1728
interior samples pushed you off the wall, which is fatal for banking at speed.
`field.mjs` replaces the integration with the geometric fact the analogy was
groping toward: inside the tube, down is *away from the centreline*, a purely
radial field in the (R, Z) cross-section, at every angle and depth. The
magnitude profile keeps a floor near the centreline (so a jump through the
middle still comes down) and eases toward the wall (so you don't weigh 3× more
on one side). It is analytic — ~11ms for 100k evaluations, no LUT — and passes
sign/direction/uniformity/floor/finite/symmetry on all three geometries.

The page drives its jump physics and airborne camera from this field. Over
HTTP it loads `field.mjs`; the file:// sandbox blocks ESM *and* fetch, so the
page carries an identical inlined copy (same math, asserted to match) as a
transport fallback — the capture exercises the real physics either way.

## What I couldn't verify

Headless Chromium does not composite the WebGPU surface, so **I never saw the
3D view**. I verified: the shader compiles and `gpuSky` runs error-free over a
4s AI drive (so the start band, checkpoint gates, fuel glow and race-ghost
sphere additions are at least sound WGSL); the 2D fallback keeps the page alive
when WebGPU is unavailable; the AI completes laps and the ghost/delta logic
produces sane values; the gate and skeleton pass repeatedly. The *look* — how
the band reads, whether the cyan ghost is legible, the feel of the lighting —
is reasoned about, not confirmed.

## Trade-offs

- The demo AI under `?autostart=1` follows a forward-weighted shortest path
  with no wall collision (the path is walkable by construction), so the
  filmstrip shows a smooth lap rather than a stutter. It is competent, not
  optimal — a human who holds the inner line and chains pellets can beat it.
- Lives and the score counter are gone; time and fuel replaced them.
- The physics panel still exists behind the ⚙ button (gravity scale, jump B
  fields, R/r, cell size) for anyone who wants to reshape the torus mid-race.

### opencode / ds4-flash / run 1 — gate PASS

# INPAC — Torus GP

## The fork I chose

**Pure tube racer. The maze is gone.**

I could have kept Pac-Man's maze and put a clock on it. I didn't, and the reason is
the topology: a maze is a flat graph that happens to be pasted onto a curved
surface — wrapping it around a torus changes the *connectivity* but not the
*puzzle*. A torus has two independent cycles, and the one thing a flat track
cannot do is use both at once. So the racing line here is a **helix** that winds
once around the tube for every lap around the ring: crossing the finish line
brings you back to the same point having gone around the ring *and* around the
wall. That lap only exists on a torus. The maze never mattered enough to fight
that.

The pellet-eater's DNA survives in the energy economy (the "orbs" on the line
are Pac-Man pellets you eat in place), but the game is a race.

## The design

- **The line.** A cyan ribbon spirals the tube (1 wrap per lap). Riding it gives
  energy and a small draft; you steer with A/D to stay on it as it winds over
  the top, under the bottom, around the inside.
- **The line choice.** The inner equator is the *shortest* way around the ring —
  cutting the inside wins distance but earns no boost, and studs guard it. The
  ribbon is longer but boost-rich. Both lines are viable; the leaderboard
  rewards whichever you learn.
- **Energy / boost.** W holds boost (×1.8 speed), draining energy. Gates (gold
  columns) and orbs refill it. S brakes for precision. Space hops over studs.
- **What you race.** Lap one you chase a pacemaker riding a perfect line; after
  that you race your own best lap — a glowing ghost. Beat it and the ghost
  updates. Three laps, then the race ends and a new one begins on the same
  circuit.
- **Hazards.** Studs protrude from the wall. Hitting one scrapes you (slow for
  ~0.7s, flash, thud) and shoves you off — no death, no restart; it costs time,
  which is the currency.
- **The view.** Inside the tube, the whole track hangs overhead — you see the
  line approaching from the far side before it passes over you. The WebGPU ray
  tracer renders the interior; a software cockpit (stars, scrolling road, the
  ribbon) covers any machine without WebGPU (`?nowgpu=1` forces it).
- **The unwrapped minimap.** A torus's surface is a rectangle that wraps in u
  and v — the minimap is that rectangle, scrolling as you go: helix, gates,
  studs, finish ring, the ghost, you. It is the one readout only this shape can
  give you.

## The physics fix

The electrostatic LUT is gone. `field.mjs` is analytic: a constant outward
acceleration along the poloidal normal `(R−R₀, Z)/‖(R−R₀, Z)‖`, softened inside
a small ball around the centreline so it is finite and single-direction there.
"Down" is *by construction* straight at the nearest wall at every interior point,
everywhere, all three geometries, at zero cost. The jump physics and the
airborne camera drive from it. Uniform strength also means no favourite place to
be fast on the wall — the track, not gravity, decides where speed lives.

## What I traded away

- No rivals — the race is against yourself (pacemaker → ghost). A human still
  has a number to beat, and the ghost is the clearest "the machine remembers you"
  signal a capture can't fake.
- No death penalty — a crash costs time, never the run. For a judged arena
  where nobody has a practice session, instant-death would read as broken.
- Studs are static, not on rails. The track is fixed per session so the ghost
  is honest.

## What I verified / what I could not

Verified: the physics gate (all samples, three geometries, in the scorer); all
five gate checks and all four skeleton checks in the scorer; the race clock is
real-time (fixed 1/120s timestep); a lap completes and `bestMs` fills inside a
12s capture; both shaders parse (wgsl_reflect); the fallback cockpit hits 60fps
and shows the ribbon; pointer lock is guarded so `?autostart=1` never throws.

Could not verify, and am not claiming otherwise: **the 3D raytraced view.** I
confirmed empirically that headless/software Chromium does not composite the
WebGPU surface (it reads as blank grey/black in screenshots), so the capture —
and I — see only the HUD, minimap and cockpit. The shader is the shipped one,
syntax-checked, with colour/emissive edits only; its actual look on a real GPU
is trusted, not seen. Likewise the feel of the tuning (speeds, steering, stud
placement) is unverified by play; the numbers are my best guess from the metric.
Sound is WebAudio and only starts after a user gesture.

One honest seam: static ES-module imports are CORS-blocked over `file://`, which
is how the capture loads the page. `index.html` imports `field.mjs` dynamically
and falls back to a byte-identical inline copy only when that fetch fails; over
https the module is used. The scorer's physics gate tests the module itself.
