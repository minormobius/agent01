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
  fixed inward gravity you can't leave the wall — the tube is a solid prison
  you're glued to.
- The physics dev-panel sliders are gone; there's nothing to tune anymore.

## Machine contract notes
- `running` stays `true` through the results screen and the session clock keeps
  counting after the last lap (the overlay shows the frozen race total). This
  is deliberate: headless Chromium's emulated vsync can run far ahead of wall
  time (measured a 30 s race ending in ~6 s of capture time), so freezing the
  session at the line made the contract flake out mid-capture. The clock is
  paced by `performance.now()`, not the rAF timestamp.

## What I could not verify
- **The 3D view, full stop.** Headless SwiftShader composites a WebGPU canvas
  as an opaque white field, and its compute readback is flaky (identical
  pipelines sometimes write pixels, sometimes return zeros), so I could not
  see the interior render. The raymarcher is the shipped original's (which the
  harness docs record as working under SwiftShader) with colour, start-line and
  ghost edits; it compiles and runs without errors. In headless the game
  renders the 2D torus world view instead — that I *did* verify frame-by-frame
  from the filmstrip. On a real GPU the FPV interior is what you get.
- **The feel.** I tuned the assist, jump and rival pace from position/time
  logs, not from eyes. Whether the spiral reads as glorious or nauseating is
  an unverifiable call here.
- **The harness boots from `file://`**, where the browser blocks ESM imports by
  CORS. So `index.html` imports `field.mjs` on http(s) (the live site, the
  arena) and falls back to a byte-identical inline copy on `file://`. The
  physics gate scores `field.mjs` itself; both paths run the same math.
