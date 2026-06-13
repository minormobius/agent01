# duck — a spin-gravity flight simulator

**Live at:** `duck.mino.mobi`
**Stack:** Cloudflare Worker (ASSETS binding) + vanilla ES modules + **WebGPU**. No build step.

Fly a duck under **two reference frames** and feel the difference. The duck's
aerodynamics — thrust, lift, drag, banking turns — are identical in both. Only the
**body force** changes:

| Mode | Body force | What you feel |
|---|---|---|
| **Earth** | uniform `g₀ = 9.81 m/s²` down | ordinary flight; breadcrumbs fall straight |
| **O'Neill cylinder** | centrifugal `ω²r` (outward) + Coriolis `−2Ω×v` | "gravity" weakens as you climb toward the axis; every motion is deflected; breadcrumbs curve |

The cylinder is hoop's canonical hull (see `hoop/js/research.js`): floor radius
**R = 8 km**, spun so the outer skin sees 1 g ⇒ **ω ≈ 0.0313 rad/s ⇒ 0.8 g at the
floor**. Press **C** to cycle to tighter habitats (down to a 120 m ring) where the
Coriolis force becomes wild and obvious.

We sit in the hull's **co-rotating frame**: the landscape is stationary and curves
up and over your head, the way an inhabitant experiences it. The headline demo is
**breadcrumbs** (`Space`) — pure ballistic markers with no wings. On Earth the stream
falls straight down behind you. In the cylinder, Coriolis bends the stream sideways
and centrifugal drags it down to the floor.

## The course + landing

Each world has a **procedurally generated 8-gate course** ("barriers" to navigate)
plus a **landing pad** at the end. The course winds over the ground on Earth and
**spirals down the curved interior** in the cylinder. Fly through the **gold** (next)
gate — the HUD shows distance and a bearing arrow — then chase the **cyan** ones.
Clear them all and **land gently on the pad**: touchdowns are graded on descent rate
and how level the duck is (smooth / bumpy / rough), with a bonus for the pad. `N`
rolls a fresh course; it's deterministic per seed.

## Controls

**Touch / mouse:** tap to **flap** (a wingbeat), where you tap **steers** (above
center = nose up, sides = bank), hold to keep flapping; the 🍞 button holds-to-drop
breadcrumbs. **Keyboard:** `W`/`S` pitch · `A`/`D` roll · `Q`/`E` yaw · `Shift`/`Ctrl`
throttle · `Space` breadcrumbs · `G` toggle Earth⇄cylinder · `C` cycle cylinder size ·
`N` new course · `R` reset · `P` pause · `H` help.

## Layout

```
duck/
├── index.html        # canvas + HUD + controls overlay + WebGPU gate
├── css/style.css     # phosphor-on-ink HUD
├── js/
│   ├── math.js       # vec3 / mat4 (perspectiveZO for WebGPU's [0,1] depth) / quat
│   ├── physics.js    # THE TWO FRAMES — earthAccel, cylinderAccel, invariants  (pure)
│   ├── geometry.js   # procedural meshes: duck, ground, cylinder shell, gates, + a
│   │                 #   seeded tree KIT (yarrow-style golden-angle recursion) + forest scatter
│   ├── course.js     # procedural gate course + landing pad + pass detection      (pure)
│   ├── webgpu.js     # the renderer: one instanced pipeline, hemi+sun light, fog
│   └── game.js       # flight model, chase camera, breadcrumbs, course, landing, HUD, loop
├── test/physics.selftest.mjs   # proves the rotating-frame integrator (see below)
├── test/course.selftest.mjs    # course determinism + gate pass detection
├── worker.js         # thin asset server (deep-link fallback to index.html)
└── wrangler.jsonc    # name=duck, custom_domain duck.mino.mobi
```

## The physics is honest (and proven)

`js/physics.js` is pure, deterministic, zero-dep and node-tested. The headline
check in `test/physics.selftest.mjs`: integrate a **free** particle in the
cylinder's co-rotating frame using only the centrifugal + Coriolis terms, then
rotate the trajectory back into the **inertial** frame — and assert it comes out a
**straight line at constant velocity**. A free body must travel straight in an
inertial frame, so if any term or sign were wrong, the line would bend. The suite
also pins the canonical hoop numbers (8 km → 0.8 g, ω ≈ 0.0313), centrifugal
direction/vanishing-on-axis, Coriolis sign, and conservation of the **Jacobi
integral** (rotating frame) and **specific energy** (Earth).

```bash
node duck/test/physics.selftest.mjs   # 22 checks
node duck/test/course.selftest.mjs    # 21 checks (course determinism + gate crossing)
```

## Deploy

`.github/workflows/deploy-duck.yml` runs the physics selftest, then
`npx wrangler deploy` from `duck/` on push to `main` or the owning branch touching
`duck/**`. Pure-static Worker — no D1, no secrets beyond the shared Cloudflare
credentials. Ownership is in `deploy-registry.json` (surface `duck`). Verify the
deploy log binds `duck.mino.mobi (custom domain)` (the golden rule).

## Notes

- **WebGPU only.** Needs Chrome/Edge/Safari 18+ (desktop) or Chrome on Android. The
  page shows a graceful "WebGPU required" card otherwise.
- **Determinism.** Prop fields are seeded (mulberry32), so a world is identical every
  load and stable across the mode toggle — the repo's reproducibility habit.
- **Trees, the yarrow way.** After `clock/yarrow` (a plant grown from one number),
  each species in the tree KIT is a seeded recursive growth — limbs placed around the
  parent at the **golden angle** (137.5°), tapering each generation, with low-poly
  foliage clumps at the tips. Six species (fir, spruce, oak, broadleaf, birch, bush)
  are built once and instanced into clustered **groves** so the ground reads as forest.
