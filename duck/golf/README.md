# O'Neill Links — Coriolis golf

**Live at:** `duck.mino.mobi/golf/` (designer) · `duck.mino.mobi/golf/play.html` (play)
**Stack:** Cloudflare Worker (ASSETS binding) + vanilla ES modules + **WebGPU**. No build step.

A sibling game living under the [duck](../README.md) spin-gravity flight sim, on the
same surface and built on the **same proven rotating-frame physics kernel**
(`../js/physics.js`) and WebGPU renderer (`../js/webgpu.js`).

Golf on the inside of an **O'Neill cylinder**. There's no real gravity — the hull
spins, so "down" is **centrifugal** (`ω²r`, radially outward) and the floor curves
up and over your head. Every shot also feels the **Coriolis force** (`−2Ω×v`),
which **bends the ball in the air and keeps breaking it as it rolls**. Aim straight
at the pin and you miss; you have to read the spin of the world. A golf ball is a
near-pure ballistic projectile, which makes it the cleanest possible probe of the
frame it flies in.

## Twin screens

| Screen | URL | What it is |
|---|---|---|
| **Designer** | `/golf/` (`index.html`) | Lay out a hole: a live **3D preview** of the cylinder interior beside a **2D plan editor**. Drag the tee, the pin and hazards; pick the habitat (8 km hoop → 120 m ring) and the frame; par is computed from the floor distance. "Play this hole" / "copy share link" encode the whole course into a URL. |
| **Play** | `/golf/play.html#<course>` | Hit the ball. A **free-look orbit camera** (mouse / pointer-lock on desktop, drag on touch; scroll to zoom) — where you face is where you aim. Hold to charge, release to swing. While charging, two **preview arcs** appear: **gold** = the real shot, **blue** = the same shot *without* Coriolis — the gap is the bend. The ball flies, bounces, and **rolls down the terrain grade**, putts **breaking** across the slope. Hole out; score against par. **G** replays the exact shot under plain **Earth** gravity. |

## Terrain — vendored from iris

The floor isn't flat. `js/terrain.mjs` is vendored from **`iris/sim/ratchet.mjs`**:
on a spinning floor "level" means *constant radius*, so terrain elevation builds
**inward** (surface radius `R − e(θ)`), carved as iris's asymmetric ratchet (a
short steep scarp, a long gentle glide). We use it as gentle rolling grade — the
designer's **crest / humps** sliders shape it, and in play the ball feels it: the
contact handler strips only the surface-**normal** velocity, so the down-slope
component of gravity survives and the ball rolls downhill and breaks on the green.

The two screens share courses as a base64url-encoded blob in the URL hash, so a
designed hole is a permalink.

## The physics is honest (and proven)

The field accelerations come straight from the shared kernel in `../js/physics.js`
(canonical hoop hull: floor radius **R = 8 km**, **0.8 g** at the floor,
`ω ≈ 0.0313 rad/s`), pinned by `../test/physics.selftest.mjs` (a free particle in
the co-rotating frame must trace a **straight line** back in the inertial frame).

On top of the field the ball carries two aerodynamic terms that make it a *golf*
ball and not a cannonball (`../js/golf.js`): **quadratic drag** and a **Magnus**
force (`a = magnusK·(spin × v)` — backspin lifts, sidespin draws/fades; being a
cross product it does no work). With drag and spin off, `stepBall` reduces
**exactly** to the proven free particle — `../test/golf.selftest.mjs` asserts that
reduction and pins the Magnus no-work / lift-sign properties, the floor geometry,
hole capture, par, and course encode/decode round-trips.

```bash
node duck/test/golf.selftest.mjs      # 28 checks (golf ballistics + course model)
```

## Controls (play)

**Touch / mouse:** drag the view to **aim**; the **HIT** button charges power (hold)
and swings (release). Club ◀▶ and aim ◀▶ buttons below. **Keyboard:** `A`/`D` aim ·
`1`–`5` or `[`/`]` club · `,`/`.` side-spin · hold `Space` to charge, release to
swing · `G` Earth ⇄ cylinder · `R` replay · `P` pause · `H` help.

Hazards: **water** costs a penalty stroke (re-drop), **sand** is slow, **rough**
grabs. The green is the lighter disc around the flag.

## Layout

```
duck/golf/
├── index.html        # the COURSE DESIGNER (3D preview + 2D plan editor)
└── play.html         # the PLAY surface
duck/js/              # shared with the flight sim
├── math.js · physics.js · webgpu.js · geometry.js   # the common kit
├── golf.js           # ball ballistics (drag + Magnus) + course model + sharing (pure)
├── play.js           # the golf game: swing, flight, roll/putt, hazards, scoring
└── designer.js       # the designer: 3D preview + draggable 2D plan editor
duck/test/golf.selftest.mjs   # golf ballistics + course model (gates the deploy)
```

## The sky, the axial sun, and the void

Pitch the camera up (mouse / drag, or `↑`) and the gaze swings off the fairway and
up the **spin axis**: the floor curls overhead and the **axial sun** comes into
frame. That sun is **ray-traced** in a fullscreen background pass (`webgpu.js`
`SKY_WGSL`): per pixel it unprojects the view ray (via the new `mat4.invert`) and
glows by the ray's analytic distance to the axis line, with bloom. The pass writes
no depth, so the land geometry occludes it correctly — which means the sun and the
**pure-black void** only show where there's no land: straight up the axis and
**out through the open end caps**. Looking out an end cap yields the only blackness
in the world. (Earth mode draws a plain sky gradient instead.)

## Mobile

The play HUD is thumb-first: a full-width swing block lifted above the home-bar
(`env(safe-area-inset-bottom)`), 50–58 px touch targets, a compact scorecard, and
**drag-to-look** (no pointer lock needed on touch). Landscape keeps the swing bar
slim so it doesn't eat the view.

## Notes

- **WebGPU only** for the 3D. The play surface shows a "WebGPU required" card
  otherwise; the designer's **plan editor still works without it** (only the 3D
  preview needs the GPU).
- **Determinism.** Prop fields and procedural holes are seeded (mulberry32), so a
  shared permalink means the same hole on every machine.
