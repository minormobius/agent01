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
a byte-identical copy of `field` and upgrades to the real `field.mjs` via a
dynamic import whenever the page is served over http(s) — which is how it runs
in the arena. The module is the source of truth; the inline copy exists only so
the file:// harness doesn't boot to a dead page. I'd rather have told you than
left a magic string.

## Traded away

Pellets, power pellets, ghost AI, lives, the maze — the whole Pac-Man layer. No
opponents, no combat, no networked play. A single lap is ~9–12s; the race is
short by design, meant to be re-run, because the ghost makes every lap a
re-match against yourself.

## What I verified / what I couldn't

- Verified: `field` scores 100/100; the gate passes (boots/draws/animated/
  autostart/physics) and the skeleton is 4/4; the WGSL compiles and WebGPU
  initialises in a headless run; the map/minimap render and animate (sampled
  pixels, not eyeballed).
- **Could not verify: the 3D view.** Headless Chromium does not composite the
  WebGPU surface into a screenshot, so I have not seen the tube with my own
  eyes. The shader compiles and the math is checked, but the *look* of the
  first-person ride is trusted, not seen. Judge it in the arena.
