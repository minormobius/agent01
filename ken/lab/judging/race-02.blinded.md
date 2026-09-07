# Blinded judging material

Race `race-02`. 12 entries, relabelled and scrubbed. Same brief for all:
repair the gravity bug and turn the demo into a race with a clock, laps and a best time.

Judge on what the notes show about **craft and ambition**: does the author understand the
defect, is the fix principled or patched, what did they choose to build beyond the minimum,
and are the claims honest about what was not done. The notes are all you get — nobody can
see the game render.

---

## Entry A

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
htt
…[truncated]

---

## Entry B

# INPAC — Grand Prix

**The fork: pure tube racer.** The maze is gone. INPAC is a first-person lap
race on the inner wall of the torus. The maze was noise; the torus was the
signal, and the only way to make "down is everywhere, the whole world wraps
over your head" the star of the game is to remove everything that competes
with it.

The Pac-Man DNA survives as *decor*, on purpose: the four ghosts are rival
racers (a race on a haunted torus has rivals, not enemies), the pellets are
the track's dotted line (a small speed tick as you eat the racing line), the
power pellets are turbo pads. No maze, no chase, no eating, no dying. The loop
is laps, position, and your own best time.

## The track is the topology
A **(1,1) spiral** — one full poloidal revolution per lap. This is the thing a
flat track cannot do: the road climbs and banks over your head, the far side
hangs above you, and the whole circuit is visible wrapped overhead. A lap is
the long way around the ring while also turning once around the tube.

## What you race
- **5 laps** against the four ghost rivals, each holding a lane on the track at
  a fixed pace. They start ahead; you climb.
- **Turbo pads** respawn every lap as track fixtures (only the current lap's
  trail is eaten), so pace is consistent and hitting the pads is the skill
  lever — a clean boosted lap beats a wandering one.
- **Your own best lap**, from lap 2 on: every completed lap becomes a pale cyan
  phantom on the track. You are literally racing the ghost of yourself.

## The physics fix
The shipped electrostatic LUT (opposite-charged shell + same-charge centreline
ring) reversed sign exactly where you stand — the brief's table. I replaced it
with an **analytic field** in `field.mjs`: gravity is exactly along the outward
normal from the tube centreline everywhere, with a gentle magnitude profile
(heaviest at the wall, ~55% on the axis, never zero, never reversed). No LUT,
no sliders, no sign checks. Passes sign/direction/uniformity/finite/symmetry
at `{8,3}`, `{12,2}`, `{6,4}`. The page drives airborne physics from it.

## Trade-offs
- **Maze, ghost AI, scoring, lives** — deleted. The generator, the chase
  waves, the eat/frightened state machine were the entire old game and are gone.
- **Steering is assisted by default** (pure-pursuit along the centreline) and
  A/D overrides it. The car auto-accelerates. That makes the game playable
  with zero input (which the capture needs) and approachable in the arena;
  skill shows in boost timing and line choice.
- **Jump kept**: Space hops, Shift+Space launches across the tube. With the

…[truncated]

---

## Entry C

# TORUS RUSH — INPAC, as a race

## The fork: pure tube racer

I cleared the board. No maze, no pellets, no ghost-hunt.

The torus's *geometry* is the interesting thing INPAC owns, and Pac-Man's
maze fights it: a maze is a flat-grid habit, and the torus's real offer is that
every line on it is a circuit. A race is the smallest game that makes the
topology the whole game — the long way round the ring vs the short way is not a
decorative choice, it is the difference between the outer equator (2π(R+r) ≈ 69
units) and the inner equator (2π(R−r) ≈ 31 units). A maze on a torus just
re-poses the same walls Pac-Man already had, in a harder place to read. A race
lets the player *feel* that the inner wall is a shorter lap.

So: one lap is one full traversal of the ring. The inner equator is the racing
line — the shortest way around, drawn as a gold line right where you stand. A
"pure tube racer" also lets the fixed physics bug be load-bearing rather than
incidental: at speed you *need* gravity to pin you to the wall at every point of
the tube, which is exactly what the fixed field now does.

## The physics fix

The electrostatic LUT was replaced with an analytic harmonic well — the field is
the gradient of ½·|p − centreline|², so acceleration is simply the vector from
the tube centreline to the point. Direction is exactly the wall normal
everywhere (worst tilt 0.0°), magnitude is uniform around the tube (1.00×,
down from a 5× spread), and it is finite on the centreline. Extracted to
`field.mjs` per the seam, with a byte-identical inline fallback for file://
loads (dynamic `import('./field.mjs')` is blocked by CORS over file://; the
module is used in production over http(s)).

A design consequence worth noting: because the field is harmonic, a jump
launched inward decelerates as it crosses the tube and lands gently on the far
side — harmonic-oscillator arcs. That turned "jump the tube" (Space) into a
real line-choice move: leap across the inside to switch walls mid-race, or cut
the corner onto a boost pad on the far wall. The orbit is driven by the same
`field()` the scorer checks.

## What was designed

- **The circuit.** 72×24 unwrapped track, all floor. Lap counting runs on
  unwrapped-u with wrap-aware accumulation, so cutting a corner reads as
  progress rather than a backwards half-lap.
- **The racing line.** A gold line on the inner equator plus a white checker
  start/finish band that wraps the whole tube cross-section and pulses as a
  beacon — the classic "hug the line" read, but the line is the short side of a
  donut.
- **Boost pads.** Nine pads slalom 
…[truncated]

---

## Entry D

# INPAC — Torus Time Trial

## The fork, and why

I cleared the Pac-Man board and built a **pure tube racer**. A race wants flow,
and INPAC's maze — a random DFS grid painted onto a curved surface — was the one
thing actively fighting the torus. Pellets and ghosts are a flat game that
happens to be wrapped around a donut; the interesting thing about this place has
nothing to do with them. The single great affordance of being *inside* a tube is
the tube itself: a continuous, banked surface where **the whole track is visible
at once, wrapped overhead**, and where two independent directions of travel
exist. A racer is about the surface. A maze is about ignoring it. I chose the
thing the room was built for.

## What it is

A three-lap time trial around the ring. You run on the inner wall of the tube,
gravity-aligned (down = toward the wall). The **racing line** is an amber ribbon
painted on the wall, weaving gently around the tube's cross-section; **gates**
(12 per lap, incl. start/finish) sit on it, and you must thread them in order.
You race **the clock and your own best lap** — a cyan ghost of your best run that
replays alongside you from lap two. Best lap persists to localStorage when the
host allows it (the arena sandbox doesn't; the game tolerates that).

The torus makes one real decision out of its topology: the **inner wall is the
short way round** (radius R−r = 5 vs R+r = 11 around the ring). So the racing
line is to cut toward the inner equator as far as the gate windows allow —
roughly 30% off a lap if you thread it tightly. That's the skill, and it's a
skill a flat track cannot offer, because a flat track has no circumference that
changes with where on the wall you stand.

Restraint was the visual brief: a dark indigo tube, one amber guide strip, white
gate beacons, a green start line, a soft key light from the tube's core. The
whole lap hanging overhead is the effect; I didn't add another one on top.

## The physics fix

The electrostatic LUT is gone. `field.mjs` computes "down" analytically: the unit
vector from the tube centreline through the point, at constant strength, so the
floor is uniform everywhere and there is no singularity except the exact
centreline (returned as zero). It scores **100/100** on the gravity rubric
(sign/direction/uniformity/floor/finite/symmetry all clean, all three
geometries), and the page's jump integrator is driven by it.

One honesty note: the scoring harness loads the page over `file://`, where
Chromium blocks ES-module imports (CORS: origin `null`). So `index.html` inlines
a byte-identical copy of `field` and u
…[truncated]

---

## Entry E

# INPAC GP — notes

## The fork: pure tube racer

I cleared the board. The maze, pellets and ghost AI are gone; what remains of
INPAC is the place itself — the ray-marched interior of the torus — and the
act of moving along its wall.

Why: a maze is a walking-speed idea. At racing speed, walls you must not touch
become noise, and pellet-mopping is a route-planning problem, not a driving
problem. The torus is the interesting object here, so I made the race *about*
it. The honest way to keep Pac-Man DNA would have been a time-trial maze
clear; that is a worse race than this is a maze game.

## What it is

- **The course is the (1,1) curve of the 2-torus** — per lap it goes once the
  long way round the ring and once through the hole. It is the line that uses
  both independent circuits of the topology at once, which felt like the only
  correct answer to "what is a lap on a torus". On the flattened map it is the
  diagonal; on the wall it is a spiral that climbs the outer equator and dives
  through the hole, so the track ahead of you is visibly wrapped around the
  tube — overhead included. Twelve gates along it, three laps.
- **You race three things at once**: two paceline drones on constant-pace
  laps (red 9.2 s, cyan 10.8 s — visible, colored, and they wash the wall with
  light as they pass), the clock, and a gold **ghost of your fastest lap**,
  recorded per-frame and replayed on subsequent laps. Best lap, per-gate
  splits, and the ghost persist in `localStorage`.
- **Driving**: auto-throttle with brake (S) and drift — your velocity swings
  toward your heading at a finite rate, so at full speed the line matters and
  the walls are bankable everywhere (they are all "down"). Space jumps; the
  jump is the thing the broken field used to sabotage.

## The physics fix

Replaced, not repaired. The electrostatic analogy (attracting shell +
repelling centreline ring, numerically integrated into a LUT) was the wrong
object: the field a walking-inside-a-tube game wants is not a physical field
at all. `field.mjs` is the analytic answer — acceleration points radially
away from the tube centreline, straight at the nearest wall, with a magnitude
that ramps from a soft floor at the centreline to full pull at the wall.
Direction error 0.0°, wall uniformity 1.00×, and a jump now lands with the
same 0.64 s airtime at every poloidal angle (verified by simulation at 8
angles; the shipped code failed 422/1728 interior samples, concentrated
exactly where you land). The page's airborne integrator and airborne camera
both sample `field()`; the grounded camera keeps the g
…[truncated]

---

## Entry F

# INPAC — the race fork

INPAC was a first-person Pac-Man played inside a torus. This fork turns it into
a **pure tube racer** and, on purpose, keeps almost none of the Pac-Man DNA.

## The fork, and why

The brief forced a choice: keep the Pac-Man game and bolt a clock onto it, or
commit to the race. I chose the race, and cleared the board.

Pac-Man inside a torus is a *navigation* game — the interesting part is maze
topology, ghost AI, and pellet coverage. A race is a *line-following* game —
the interesting part is the track, the line you take, and the clock. Those two
designs fight each other: a maze wants you to double back and detour, a race
wants you to commit to one line. Keeping both would have meant a race that a
ghost can ruin, or a Pac-Man with a score attack glued on. Neither is good at
either. So the Pac-Man board is gone; what survives is the thing Pac-Man and a
race genuinely share — moving through a torus — plus the one piece of Pac-Man
that *is* a race mechanic: the ghost. The best-lap ghost.

## What was designed

- **A (1,1) helical circuit.** One lap winds once around the big ring *and*
  once around the tube cross-section, so the track never repeats a view and you
  get the torus's two directions of "around" for the price of one. The line is
  `v = u` on the surface; gates sit on it at 30° steps (12 per lap), three
  laps to a race.
- **The clock, the laps, the best time.** `?autostart=1` drops you straight
  into the run (no clicks, no keys — the capture harness sends none), and
  `window.__inpacState()` exposes `{running, timeMs, lap, laps, bestMs}`.
  `bestMs` is `null` until a lap completes, as specified.
- **A ghost of your best lap.** A cyan sphere that replays your fastest line
  one lap ahead of you. It's the only remnant of the original's ghosts, and the
  thing that makes the race a *race* against yourself rather than a solo sprint.
- **Auto-run with steering.** The runner advances on its own; the player steers,
  boosts, brakes, and jumps. The jump arc is what shows the physics — airborne
  you fall back toward the wall, and the fix below is what makes that fall
  point the right way at every part of the tube.
- **A gravity-aligned camera.** Up is the inward normal at your position, so the
  floor stays down even as the tube curves under you — the "first person inside
  a tube" feel the original wanted but couldn't hold near the walls.

## The physics fix

The old electrostatic lookup table (`computeGravLUT` / `sampleGravity`) reversed
sign near the wall — right where you stand. "Down" inside a tube means **away
from the t
…[truncated]

---

## Entry G

# INPAC — Torus Grand Prix

**Fork chosen: a pure tube racer.** The maze, pellet-gobbling and enemy ghosts
are gone. What remains is the torus interior, and a racing line that uses all
of it — a (1,1) helix, one full turn of the tube per lap — painted as a light
ribbon on the wall and enforced by a ring of twelve gates. Cut across the open
interior with a jump and you trade gate credits for distance; the correct
interior gravity (`field.mjs`) is what makes all of it driveable. This is the
commitment: no Pac-Man DNA left in it. It is a time trial against a ghost.

## The three-seam contract

- **`field.mjs`** — the interior gravity source of truth, extracted and
  dependency-free. `index.html` imports it (over http(s)); when a browser
  blocks same-directory module imports under `file://`, the page falls back to
  a byte-identical inline copy. The scorer imports the real module, which is
  the thing being measured.
- **`?autostart=1`** — begins the race immediately, autopilot on, no clicks or
  keys. `requestPointerLock()` is only ever called from the Start button, which
  is a user gesture, so it cannot throw.
- **`window.__inpacState()`** — returns `{ running, timeMs, lap, laps, bestMs }`
  every frame.

## How the race works

- **The line.** `v(u) = LINE_PHASE + u` — one poloidal turn per toroidal turn,
  so over a lap the ribbon spirals around the tube once, visiting every
  latitude. Gates sit on it at twelve even u-steps; boost pads sit a quarter
  step ahead of each gate.
- **Gate economy.** Hitting a gate's tolerance band (|Δv| ≤ 2.5 grid tiles)
  takes **−0.25 s** off the lap and refills boost; missing adds **+1.2 s**.
  This is what makes the spiral line optimal. Without it the inner equator is
  trivially fastest (the tube is narrower there, so a fixed physical u-speed
  crosses grid tiles faster) and the topology is wasted.
- **Jumps.** `SPACE` launches along the inward wall normal with the field's
  acceleration integrated in 8 substeps; `SHIFT+SPACE` is a super leap. You are
  a projectile through the open interior, and the v-projection updates live so
  gate judgement works mid-air.
- **The ghost.** Before you have a best lap it is a 12 s pacer; after your
  first completed lap it is your own best-lap replay, sampled at 40 ms. The HUD
  delta is that ghost's lead in seconds. It is also the menu's camera.
- **Physics conversion.** `dX = duPhys / (R + r·cos v) · WORLD_W / 2π` and
  `dY = dvPhys / r · WORLD_H / 2π` — physical u-speed along the tube maps to
  grid distance through the actual local ring radius, so the racer genuinely
  runs fast
…[truncated]

---

## Entry H

# INPAC — the inside line

## The fork: a pure tube racer. The maze is gone.

I chose to clear the board. INPAC's identity is the *place* — the inner wall of a
torus, gravity always pulling you onto the tube, the far side hanging overhead —
and the Pac-Man maze actively flattens it: on a maze, the wall you walk is a 2D
board in a costume, the torus is scenery, and the game is "eat pellets, dodge
ghosts." A race is the opposite: it needs flow, banking, and a reason to use
every direction the tube offers. So there is no maze, no pellets, no ghosts-as-
enemies. There is a track and a clock.

## The physics fix

The shipped electrostatic LUT (attracting shell + repelling centreline ring)
reversed sign exactly where you land — 422/1728 interior samples pushed you off
the wall. That's fatal for banking at speed. I replaced it with the analytic
field in `field.mjs`: constant magnitude, direction exactly away from the tube
centreline at every point. Newton's shell theorem says a hollow shell has zero
interior field, so there is no "real" gravity to recover — the design intent is
the definition: uniform apparent gravity, always onto the wall. Constant
magnitude is also what makes a race fair (you weigh the same on every bank of
the tube). The airborne hop integrates `field()` directly — the only place the
field is genuinely integrated, per the brief.

## What the race is

The track is a **(1,1) helix on the tube**: one lap winds once around the ring
*toroidal* direction *and* once around the doughnut (*poloidal* direction)
simultaneously. That is the answer to "a lap could go the long way round, or
spiral through both" — it spirals through both, which is the only way a course
can thread the whole tube, and it means the track is a closed ribbon you can see
winding ahead and overhead from anywhere inside.

- **3-lap time trial.** A gold pace ghost sets the par (8.2s). From the moment
  you bank a lap, your own best lap replays as a ghost — you race yourself.
- **Six gates** on the helix. Miss a gate's window and you're checkpoint-reset
  just before it with speed bled off — the line is enforced, play never
  dead-ends.
- **Nitro** (Shift/W) — refilled by clean gates, so good lines pay for speed.
- **Hop** (Space) — a gravity hop through the void, integrated with `field.mjs`.
- **Controls**: auto-throttle, A/D or mouse steer, S brake. When you're idle the
  car autopilots the line (so `?autostart=1` captures a real race, not a frozen
  page).
- Inside the tube, the whole circuit is visible — I leaned on that: the gates
  are glowing hoops you see coming from way off
…[truncated]

---

## Entry I

# INPAC — Torus Time Trial

## The fork: a pure tube racer

I cleared the board. No maze, no pellets, no ghosts.

The Pac-Man DNA was inherited baggage that fights a race: a maze is walls, and
walls are the enemy of speed. Keeping "maze, pellets, ghosts, now on a clock"
would have produced a haunted house with a stopwatch, not a race. So I kept the
one thing INPAC actually had that nothing else in the repo has — **first-person
walking on the inside of a torus, with the whole track wrapped overhead** — and
threw the arcade layer away. Committed, not halved.

## What it is

A **three-lap time trial** on a `(1,1)` torus-knot circuit: a single closed lane
that winds the ring **and** the tube in one lap. That is the topology answer to
"what does a torus make possible": a lap that a flat track cannot express. The
lane progress metric is `(u+v)/2`, so completing a lap provably requires a full
turn around the ring *and* a full turn around the tube — run only the long way
and you're stuck at half a lap. You race two things: the clock, and the ghost of
your own best lap (replayed in real time, persisted in `localStorage`).

The track is a neon ribbon on a near-black tube. Look up and the rest of the lap
curves away overhead — that affordance is the point, so the lane, the gates and
the finish are all visible in-world, not just on a minimap.

## The physics bug

`field.mjs` replaces the electrostatic LUT with the exact geometric answer:
**down = the unit vector away from the tube centreline, at a single constant
magnitude**, finite everywhere (zero on the centreline itself), mirror-symmetric
by construction. No analogy, no table, no integration.

Why constant magnitude matters for a *race* specifically: it means you weigh the
same at the outer wall, the inner wall, the top and the bottom, so lap times are
not secretly a function of where on the tube you happen to be, and a jump comes
down in the same predictable arc anywhere. The scorer's `uniformity` check
passes at exactly 1.00×. The page drives its airborne physics from
`field.mjs` (a dynamic `import`, with a byte-identical inline fallback for the
capture's `file://` origin, which blocks module fetches — commented in the code).

## What I traded away

- **Enemies** — nothing chases you. Racing your own ghost is the whole threat.
- **The maze, score, power pellets** — the board is clean by design.
- **The physics slider panel** — the geometry is fixed and tuned, not a sandbox.
- **Hard collisions** — there are no walls to hit. The lane steers you with a
  speed penalty off-track instead; corner-cutting is the ski
…[truncated]

---

## Entry J

# INPAC — Tube Circuit

## The fork: pure tube racer

I cleared the board. Maze, pellets, lives, and the ghost-house AI are gone.

Reason: the maze is procedurally generated noise. There is no authored line
through it, so a clock on it measures luck and wandering, not driving. The
asset worth building a race around is the tube itself. The torus offers two
independent ways around, and a maze only ever used one of them.

The course is a **spiral ribbon painted on the tube wall**: it winds once
around the cross-section for every lap around the ring (`v = 270° + u`), so a
lap uses both directions around the torus in one motion — floor, outer wall,
overhead, inner wall, floor. From the driver's seat the track visibly corkscrews
around you, and because you're inside the tube the entire circuit is always in
view, wrapped overhead. That is the picture this geometry exists to make, so
the ribbon is the brightest thing in the scene.

## The physics fix

Deleted the electrostatics. `field.mjs` is the analytic answer the brief
states: in the cylindrical (R, Z) half-plane the tube centreline is one point,
and the field is purely radial away from it — exact at every depth, every
geometry, ~10 flops. Direction error 0.0°, wall uniformity 1.00×, mirror
symmetry exact; the gate's three geometries all pass.

The magnitude is a gameplay choice the checks leave open: full strength from
the wall inward to 0.3·r, then a linear ramp to exactly zero on the centreline.
The softened core makes long jumps through the hollow middle float instead of
snapping, and keeps the field continuous where the radial direction is
undefined. A SHIFT-jump (9 u/s) clears the 6-unit tube and lands you on the
far wall — cutting through the core is the one real shortcut, and now that
gravity can be trusted, it works from any wall to any wall.

## The race

- 3 laps, 8 gates per lap on the ribbon. **Clean gate** (within ±45° of v):
  +18% boost for 1.4s. **Missed gate**: +1.5s penalty, red flash. Crossing the
  plane always clears the gate — you never hunt backward, slalom-style.
- Clock is wall-clock (not accumulated dt), so lag can't lie about your time.
- Finish a race and your run is recorded; your **best race replays as a ghost
  pacer** (white-violet orb + map dot + live ± delta). Best race and best lap
  persist in localStorage.
- Momentum speed model (W gas / S brake / coast drag), subtle bank-into-turns
  camera roll, speed-stretched FOV, WRONG WAY indicator. Jump = SPACE.
- `?autostart=1` starts a self-playing demo race (short countdown, autopilot
  follows the ribbon); any key or click tak
…[truncated]

---

## Entry K

# INPAC — a race inside the torus

## The fork: I cleared the board

Pure tube racer. No maze, no pellets, no ghost house. Reasons:

- The brief's own physics indictment is a *racing* indictment — you cannot
  bank, you cannot trust the floor at speed. A 0.45-wall maze exists to be
  not-touched; it fights the fantasy of speed the bug fix enables.
- The torus's only irreplaceable asset is its topology. A Pac-Man maze treats
  the surface as a wrapping rectangle; the topology is decoration. I wanted a
  track that could not exist on flat ground.
- The shipped artifact already proved FPV maze Pac-Man is "a striking place
  and not much of a game." Restraint reads as confidence: one line, sixteen
  rings, a clock.

What survives of Pac-Man is the name and the yellow-on-black typography.

## The design

**The lap is a (2,1) torus knot.** One trip around the ring while the course
spirals twice through the hole — a glowing amber ribbon painted on the tube
wall (`v = 2u`), threaded by 16 rings. On a torus this never self-intersects,
yet from inside the tube you can see the whole course: the ribbon and the next
rings hang overhead on the far side. That affordance — the entire track visible
at all times — is the game's signature view.

- **Race**: standing start, 3-2-1-GO, 3 laps, ring-gated course (miss a ring
  and it simply stays live — turn back and thread it).
- **Opposition**: the clock; a magenta pacer drone on a 12.5 s reference lap;
  a pale ghost of your best lap, replayed from recorded samples (best persists
  in localStorage where the sandbox allows it).
- **Physics**: the fix is analytic. Inside a tube, down *is* the direction away
  from the tube centreline — `field.mjs` states it exactly
  (`g = G·d/(d+0.2r)` along the outward normal), no charges, no LUT. It is
  integrated only while airborne (the one place the old field mattered), with
  full momentum carry: jumps keep your speed, so hopping to straighten the
  spiral's curves is a real line choice. The grounded camera uses the
  geometric normal; the airborne camera derives "up" from `field.mjs`.
- **Look**: raymarched tube interior on WebGPU — deep-violet wall with a faint
  lat/long grid for speed texture, the pulsing amber ribbon, analytic
  ray×plane ring gates (the next one burns amber), a checker patch at the
  start line, orb light-pools, distance fog, and a glowing conduit thread
  along the tube centreline so the void has a heart. FOV widens ~9% at top
  speed. HUD is monospace amber/teal on dark chips; the (u,v) course map
  bottom-right shows ribbon, rings, pacer, ghost, and you.

`?a
…[truncated]

---

## Entry L

# INPAC — notes

## The fork: pure tube racer (not Pac-Man)

I cleared the board. INPAC keeps its setting — first person on the *inside* of
a torus — and drops the maze, pellets and ghosts entirely. The maze was already
solving nothing the topology didn't solve better, and a pellet hunt on a clock
would have been a checklist answer: Pac-Man with a timer. A race is a stronger
reason for the torus to exist, so I committed to it.

What a torus gives a race that a flat track can't: **two independent loops**.
A lap here is a (1,1) spiral — once around the ring *and* once around the tube
— so the racing line threads both directions of the surface at once. You start
on the outer equator, dive down the tube wall, pass through the inner equator
(the narrowest, fastest-feeling part of the tube), and climb back around to
where you began. That's the whole track: no walls, one glowing line, and
twelve rings to thread.

**What you race is your own best lap.** After lap one, a translucent ghost of
your fastest run replays alongside you every lap, so the opponent is always
exactly at your skill level and the race is always winnable — the design
constraint is a finish line, not an AI I'd have to tune blind.

## What I built

- **Physics.** Replaced the charged-shell + line-charge LUT with the analytic
  answer the torus makes obvious: down is the outward normal, constant
  magnitude. It is exactly mirror-symmetric, finite on the centreline, and
  correct for any R/r — the scorer's R=6,r=4 spindle included. 100/100 on the
  gravity rubric, and it is what the jump/landing actually integrates.
- **Movement.** A hover-racer: W throttle, A/D strafe, mouse steer, SPACE hop,
  SHIFT boost (a small regenerating pool), Q cruise. Constant physical speed
  regardless of where you are on the tube, so lap times are about line, not
  about standing spot.
- **Track.** A spiral racing line (teal) drawn straight onto the tube wall in
  the shader, twelve amber rings you fly through, a thin grid on the wall for
  motion parallax, and a centre-line glow. Deep-navy base, two accent colours.
  Restraint over effects.
- **HUD.** Race clock (top-centre), lap counter, best lap, a live pace delta
  against the best, a speed bar, a next-ring bearing dot, and an unrolled-torus
  minimap. All DOM, all visible to the capture harness.
- **Seams.** `field.mjs` extracted; `?autostart=1` starts with no input and no
  pointer-lock request; `window.__inpacState()` returns `{running, timeMs,
  lap, laps, bestMs}`. `bestMs` persists in `localStorage` along with the ghost
  path, so your best survives a relo
…[truncated]
