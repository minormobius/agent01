# O'Neill Links — Coriolis golf

**Live at:** `duck.mino.mobi` (designer) · `duck.mino.mobi/play.html` (play)
**Stack:** Cloudflare Worker (ASSETS binding) + vanilla ES modules + **WebGPU**. No build step.

Golf on the inside of an **O'Neill cylinder**. There's no real gravity — the hull
spins, so "down" is **centrifugal** (`ω²r`, radially outward) and the floor curves
up and over your head. Every shot also feels the **Coriolis force** (`−2Ω×v`),
which **bends the ball in the air and keeps breaking it as it rolls**. Aim straight
at the pin and you miss; you have to read the spin of the world.

This surface used to be a spin-gravity *duck* flight sim. It's now a golf game built
on that sim's renderer and — crucially — its **proven rotating-frame physics
kernel**. A golf ball is a near-pure ballistic projectile, which makes it the
cleanest possible probe of the frame it flies in.

## Twin screens

| Screen | URL | What it is |
|---|---|---|
| **Designer** | `/` (`index.html`) | Lay out a hole: a live **3D preview** of the cylinder interior beside a **2D plan editor**. Drag the tee, the pin and hazards; pick the habitat (8 km hoop → 120 m ring) and the frame; par is computed from the floor distance. "Play this hole" / "copy share link" encode the whole course into a URL. |
| **Play** | `/play.html#<course>` | Hit the ball. Pick a club, aim, hold to charge power, release to swing. Watch the **cyan trail** peel off the **gold aim line** — that's the Coriolis bend. Land it, roll it, hole out; score against par. Press **G** to replay the exact shot under plain **Earth** gravity (the control) and feel the difference. |

The two screens share courses as a base64url-encoded blob in the URL hash, so a
designed hole is a permalink.

## The physics is honest (and proven)

The field accelerations come straight from the shared kernel in `js/physics.js`
(the canonical hoop hull: floor radius **R = 8 km**, spun for **0.8 g** at the
floor, `ω ≈ 0.0313 rad/s`; press the habitat button down to a 120 m ring where the
Coriolis force is wild). That kernel is pinned by `test/physics.selftest.mjs`, whose
headline check integrates a **free** particle in the co-rotating frame and rotates
the trajectory back into the **inertial** frame — it must come out a **straight
line**, or a sign is wrong.

On top of the field the ball carries two aerodynamic terms that make it a *golf*
ball and not a cannonball (`js/golf.js`):

- **quadratic drag** — `a = −dragK·|v|·v`;
- **Magnus** — `a = magnusK·(spin × v)`. Backspin → lift (carry); sidespin →
  draw/fade. Being a cross product it's perpendicular to velocity, so it does no
  work.

With drag and spin switched off, `stepBall` reduces **exactly** to the proven free
particle — `test/golf.selftest.mjs` asserts that reduction (and pins the Magnus
no-work / lift-sign properties, the floor geometry, hole capture, par, and course
encode/decode round-trips).

```bash
node duck/test/physics.selftest.mjs   # 22 checks (the rotating-frame kernel)
node duck/test/golf.selftest.mjs      # 28 checks (golf ballistics + course model)
```

Both run in the deploy workflow before `wrangler deploy`.

## Controls (play)

**Touch / mouse:** drag the view to **aim**; the **HIT** button charges power (hold)
and swings (release). Club ◀▶ and aim ◀▶ buttons below. **Keyboard:** `A`/`D` aim ·
`1`–`5` or `[`/`]` club · `,`/`.` side-spin · hold `Space` to charge, release to
swing · `G` Earth ⇄ cylinder · `R` replay · `P` pause · `H` help.

Hazards: **water** costs a penalty stroke (re-drop), **sand** is slow, **rough**
grabs. The green is the lighter disc around the flag.

## Layout

```
duck/
├── index.html        # the COURSE DESIGNER (3D preview + 2D plan editor)
├── play.html         # the PLAY surface
├── css/style.css     # phosphor-on-ink HUD + golf controls
├── js/
│   ├── math.js       # vec3 / mat4 (perspectiveZO) / quat            (pure, shared)
│   ├── physics.js    # THE TWO FRAMES — earthAccel, cylinderAccel    (pure, shared, proven)
│   ├── golf.js       # ball ballistics (drag + Magnus) + course model + sharing (pure)
│   ├── geometry.js   # procedural meshes: ball, flag, tee, disc, arrow, world + forest
│   ├── webgpu.js     # the renderer: one instanced pipeline, hemi+sun light, fog
│   ├── play.js       # the golf game: swing, flight, roll/putt, hazards, scoring, HUD
│   └── designer.js   # the designer: 3D preview + draggable 2D plan editor
├── test/physics.selftest.mjs   # rotating-frame integrator proof
├── test/golf.selftest.mjs      # golf ballistics + course model
├── worker.js         # thin asset server (deep-link fallback to index.html)
└── wrangler.jsonc    # name=duck, custom_domain duck.mino.mobi
```

## Deploy

`.github/workflows/deploy-duck.yml` runs both selftests, then `npx wrangler deploy`
from `duck/` on push to `main` or an owning branch touching `duck/**`. Pure-static
Worker — no D1, no secrets beyond the shared Cloudflare credentials. Ownership is in
`deploy-registry.json` (surface `duck`). The worker `name` is `duck` and it owns the
`duck.mino.mobi` custom domain (the golden rule); verify the deploy log binds
`duck.mino.mobi (custom domain)`.

## Notes

- **WebGPU only** for the 3D — Chrome/Edge/Safari 18+ desktop, or Chrome on Android.
  The play surface shows a graceful "WebGPU required" card otherwise; the designer's
  **plan editor still works without it** (only the 3D preview needs the GPU).
- **Determinism.** Prop fields and procedural holes are seeded (mulberry32), so a
  course is identical every load — the repo's reproducibility habit, and what makes
  a shared permalink mean the same hole on every machine.
