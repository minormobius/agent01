# torus — torus.mino.mobi

Worlds that are not flat. Seven toroidal games carved out of the deprecated
`clock` surface, plus **fortress**, which is not toroidal at all — it is a
fractal volume with its own gravity, and it lives here because it belongs to
the same question the torus games ask: what does moving around feel like when
"down" is not a constant?

Owned by branch **`claude/fractal-torus-webgpu-97gxv4`**. Registry entry is
`surfaces[] → surface: "torus"`; note `dir` is `clock`, not `torus`.

## What deploys, and the trap in it

`deploy-torus.yml` builds `torus/dist/` at deploy time from **two** places:

| in `dist/` | copied from | note |
|---|---|---|
| `index.html` | `torus/index.html` | the hub |
| `corn/ emsim/ inpac/ knotpac/ pac/ torpac/ toruschess/` | `clock/<toy>/` | **staged, not moved** — `g.mino.mobi` and `clock` still serve them |
| `fortress/` | `torus/fortress/` | lives here, not staged |

**Workers Static Assets replaces the whole manifest; it does not merge.** A
deploy that builds a `dist/` missing one of those dirs unpublishes that site
from a green run. The staging step asserts every expected `index.html` exists
and fails the job otherwise — keep that assertion in step with the list above
whenever a site is added or removed.

The same fact governs ownership. Before moving this surface's `branch`, verify
the new branch has byte-identical content on **every** path in the registry
entry's `paths`, not just the ones you are editing:

```bash
git diff --stat HEAD origin/<current-owner> -- $(node -e "
  console.log(require('./deploy-registry.json').surfaces
    .find(s=>s.surface==='torus').paths.map(p=>p.replace(/\/\*\*$/,'')).join(' '))")
```

Empty output is the go-ahead. That check is what made the last ownership move
safe; it is the same failure that once nearly republished `lab/www` with two of
four tenant sites missing.

## fortress

`torus/fortress/index.html` — one self-contained file, matching the `clock/*`
idiom. Raw WebGPU: no engine, no library, WGSL compiled at load and drawn
straight to the swapchain. There is deliberately **no WebGL fallback**; without
WebGPU the page explains itself and points back at the hub.

### The fractal

A port of [Cyber Fortress](https://fragcoord.xyz/s/c5y70a5f) (after CodeParade).
The original is a glow accumulator — it never resolves a surface, it integrates
brightness along a ray, so there is nothing to stand on. The fold sequence is:

```
p.xz = -abs(rot(phase) · p.xz)                      |J| = 1
p /= dot(p,p)                     spherical inversion, |J| = 1/D
×9 { box fold(0.2), Menger sort fold, ×2.5, rotate } |J| = 2.5
```

Tracking that derivative gives a distance estimate:

```
DE(p) = D · length(q) / 2.5⁹        where D = dot(p,p) before inversion
```

and `2.5⁹ = 3814.7` — which is why the original divides by `4e3`. The `D`
factor is the part the original drops, and it is what converts the estimate
back out of inverted space into world units.

Two properties were checked numerically before any of it was written, and both
should be re-checked if the fold changes:

- **It never overshoots.** Worst `DE / (true remaining distance)` was 0.68 over
  sampled rays, so sphere-tracing is safe. Above 1.0 the tracer punches through
  walls and the player falls out of the world.
- **It converges cheaply at player scale** — ~20 steps to reach ε≈1e-3, versus
  ~280 to reach 1e-5. Collision uses the player radius as ε, which is why
  collision is affordable on the CPU every frame.

The origin is the inversion centre, where `DE → 0` for the wrong reason. It is
capped with a solid sphere of radius `CORE`; without that, rays and the player
both fall into a singularity that is not there.

### The gravitational field

A compute pass runs one invocation per coarse cell of a 32³ grid, each
sub-sampling the DE on a 6³ lattice — 192³ ≈ 7.1M evaluations, once — and
writes the occupied fraction as that cell's density. The result reads back to
the CPU, prunes to the ~3.6k non-empty cells, and the field is the Newtonian
sum with Plummer softening at the cell scale:

```
g(x) = -G · Σ mᵢ (x - xᵢ) / (|x - xᵢ|² + ε²)^{3/2}
```

`G` is then calibrated so the median `|g|` over a probe shell hits
`CFG.G_TARGET`, which is what keeps jump height sane at any fractal phase.
Changing the phase slider and pressing **re-solve field** reruns the whole
thing; it is a few tens of ms on real hardware.

Softening is not a fudge to hide a division: at 32³ the near field inside a
cell is not resolved, so an unsoftened sum would report noise as gravity right
where the player spends all their time. Local surface orientation comes from
the DE gradient instead, and gravity only has to say which way the mass is.

### Walking on a fractal

Three separate defects all presented as "jiggling", and each needed its own
fix. Numbers are from `walk.mjs`-style harnesses driving the real page.

- **Normals sampled below the detail scale.** At a 3e-4 stencil the physics
  normal swings **98° between consecutive 120 Hz ticks** — the player stands on
  grit far finer than they are and "up" flips every step. The swing collapses
  across a cliff between 3e-3 and 6e-3, reaching 9° at `PHYS_H` = 0.012 (~1.3
  player radii). Wider than that and the player ignores ledges their own size.
  This is the same mistake as the render normal, in a different subsystem.
  *Truncating the fold does not substitute for it* — at depth 6 the swing is
  still 95° at a narrow stencil, and the coarser solid floats the player 0.035
  above the visible surface, four times their radius.

- **Walking was ballistic.** Staying on a surface of curvature radius R at
  speed v needs g > v²/R. At the old walk speed 0.22 and |g| ≈ 0.09 the player
  left the ground over anything curved tighter than **0.54 units**, and this
  fractal is nothing but curvature tighter than that. Measured, the player was
  airborne 25–80% of a walk — being launched and re-landing, not walking.
  `SNAP` fixes it (grounded 100% of the walk) and is skipped just after a jump
  and while jump is held, so it can never fight an intentional launch.

- **The horizon was tied to the contour.** Blending the camera's up 65% toward
  the surface normal sounds right and feels awful, because the face under a
  walking player reorients constantly while gravity is a smooth field. It also
  buys nothing here: gravity points at the mass and standable faces point away
  from it, so the two mostly agree and the blend was contributing mainly
  wobble. Now 22%, and `UP_TAU` 0.45 — measured 8.3°/s median, 21°/s p90,
  against 40°/s p90 before.

Once the collider is genuinely glued to the surface it faithfully reproduces
every bump as head motion, so `EYE_TAU` lags the eye **along the up axis only**
— horizontal passes through untouched, since lagging that reads as sluggish
controls. This is ordinary FPS stair-smoothing. 0.10 s measured best (eye
acceleration 3.67 → 2.29 median); 0.20 was no better.

Beware when benchmarking this: a player who is airborne shows *lower* jitter
than one who is walking, because free flight is smooth. Any before/after that
does not also report **fraction of the walk spent grounded** will flatter the
broken version.

### Things that were tuned the hard way

Four defects here were only visible on a rendered frame, not in the code:

- **The glow exponent.** The original adds `pal/sqrt(v)` per step *while
  stepping by v*, so its emission per unit length is `pal/v^1.5`. Integrating
  the gentler `pal/sqrt(v)` turns the neon filigree into a flat white veil.
- **The key light must not sit on `-gravity`.** You approach falling along
  gravity, so a light there ends up behind the eye and every face is lit
  head-on — no shade anywhere.
- **AO radii are world-scale.** The stock IQ constants assume a scene tens of
  units across; this world is 2.6 across, so at those radii every probe lands
  in open space and the term never fires.
- **The normal must be sampled well above the detail scale.** At the
  microscopic scale the fractal is rough everywhere, the normal points
  anywhere, and fresnel fires on every pixel at once.

Albedo uses the orbit trap's **mean**, not its minimum: the minimum is sharp
but spatially unstable, and neighbouring pixels latching onto different
iterations is what breaks the surface into rainbow speckle.

### Performance

The fragment shader is the entire cost. Backing-store resolution is
`min(dpr,1.75) × ssaa × adapt`; `adapt` is a sustained-framerate governor,
because the same shader runs three orders of magnitude apart on a discrete GPU
and on a software rasteriser. Supersampling is plain SSAA via an oversized
backing store — the compositor does the downsample, no resolve pass.

The frame loop keeps two clocks on purpose: physics gets a **capped** delta so
a stall cannot teleport the player through a wall, the governor gets the real
one, because a capped delta cannot tell 10 fps from 2 fps.

`globalThis.__fortress` exposes `{ P, opts, CFG, field, deCPU, gravityAt,
spawn, solveField }`. Pinning `P` is the only way to compare two shading
settings on the same framing — the player is falling, so unpinned screenshots
are never the same shot twice.

### The duplicated estimator

`deCPU()` in JS mirrors `mapF()` in WGSL. Collision needs the DE every frame
and a GPU readback per step would cost more than recomputing it. **If one
changes, change both** — a divergence shows up as the player standing on
nothing, or clipping into a wall that renders as solid.

## Testing from the sandbox

Chromium at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` runs WebGPU
headless via SwiftShader with:

```
--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=swiftshader
--use-vulkan=swiftshader --enable-gpu --no-sandbox
```

That is enough to prove the shaders compile, the compute pass returns a
plausible mass distribution, and the physics runs. It is **not** a frame-rate
signal — SwiftShader renders this at single-digit fps, which is the governor
working, not a bug. `getCompilationInfo()` errors are surfaced on the boot card
with the offending WGSL line, so a shader typo names itself rather than
appearing as a blank canvas.

`createImageBitmap()` on a WebGPU canvas reads back blank under SwiftShader;
use a page screenshot to inspect a frame.
