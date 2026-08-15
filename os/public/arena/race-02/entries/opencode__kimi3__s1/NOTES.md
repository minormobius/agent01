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

`?autostart=1` starts an attract mode that genuinely races (autopilot steers
for the next ring; it laps in ~9.9 s). Any key or click takes the wheel.
Pointer lock is only ever requested from a real gesture, guarded.

## What I traded away

The maze/pellet/ghost-AI machinery, the physics-toy sliders (shell/line/B-field
— meaningless once gravity is honest), and the top-down renderer. A pacer that
ramps would be fairer than a fixed 12.5 s drone. The ghost is session-persisted
only through the page lifetime plus localStorage best-time; samples aren't
serialized. No audio — autoplay rules make it gesture-gated anyway.

## What I verified (and how)

- `node bakeoff/briefs/inpac-race/score.mjs clock/inpac` — **gate 5/5,
  skeleton 4/4**, repeatedly, including after final edits.
- `field.mjs` alone against the inpac-gravity scorer: every physics check
  passes on all three geometries (sign cos = 1, tilt 0.0°, uniformity 1.00×,
  floor 0.28, exact mirror symmetry).
- A 42 s headless soak of the real page: countdown → laps 1→3 (9.9 s → 9.6 s,
  best improving), finish screen, attract auto-restart, best retained.
  **Zero page errors, zero console errors.**
- **The WGSL did not compile at first** (`of` is a reserved word — caught only
  by probing `getCompilationInfo()` in headless Chromium, since a dead shader
  fails silently). After the fix: both pipelines build clean, and a readback
  probe dispatching the real shader against the real spawn camera produces a
  structured frame — violet wall, amber ribbon, blue conduit glow, ring
  accents (mean 88, stdev 35 over 64×64, per-pixel hue classification).
- The `file://` capture path cannot load ES modules (CORS — verified
  empirically in the harness's own Chromium). So the game boots from a classic
  script with a **byte-identical inline copy** of the field, and a loader swaps
  in the real `field.mjs` import whenever modules can load (the live site, any
  normal https origin). All call sites go through one `Field.field` binding.

## What I could not verify

I have not seen the 3D view with human eyes — headless Chromium does not
composite the WebGPU surface into screenshots, so neither can I. The render
probe proves the shader runs and produces the intended palette and structure
at the spawn camera; it does not prove the framing, the fog density, or the
conduit's brightness are *beautiful* at every angle. Those constants are
chosen by reasoning, not by eye. HUD, overlays, course map, countdown, and the
race state machine are verified directly from screenshots and state polling.
