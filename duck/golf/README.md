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
| **Play** | `/golf/play.html#<course>` | Hit the ball. Pick a club, aim, hold to charge power, release to swing. Watch the **cyan trail** peel off the **gold aim line** — that's the Coriolis bend. Land it, roll it, hole out; score against par. Press **G** to replay the exact shot under plain **Earth** gravity (the control). |

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

## Notes

- **WebGPU only** for the 3D. The play surface shows a "WebGPU required" card
  otherwise; the designer's **plan editor still works without it** (only the 3D
  preview needs the GPU).
- **Determinism.** Prop fields and procedural holes are seeded (mulberry32), so a
  shared permalink means the same hole on every machine.
