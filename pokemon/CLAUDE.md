# pokemon — poke.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Critter Red. A browser-native monster RPG in the classic turn-based vein.

## Facts

| | |
|---|---|
| Surface | `pokemon` |
| Dir | `pokemon/` |
| Endpoint | `poke.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/microbial-locomotion-flagellation-uj0l09` |
| Deploy | `.github/workflows/deploy-pokemon.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "pokemon"`.

## How it works

Static worker-assets (Worker `poke`), ten things sharing one asset manifest:

| Path | What |
|---|---|
| `/` | Critter Red — the monster RPG. `game.js`, `battle.js`, `overworld.js`, `data.js`, `ui.js`, `render.js` |
| `/proteus/` | [Amoeba qualia prototype](proteus/README.md) — you see only what the cell feels of itself. Also carries `flagella.js`, the ciliary model |
| `/flag/` | [Ciliary locomotion instrument](flag/README.md) — a free swimmer plus the measurements it comes from |
| `/qwop/` | [QWOP-like](qwop/README.md) — the same model as a game: four cilia, four keys, dodge the predators |
| `/graze/` | [Predator-and-prey variant](graze/README.md) — /qwop/'s cell plus an energy budget, prey, and a water column. Its selftest is an experiment: does sit-and-wait *emerge*? |
| `/qgol/` | [Conway's Game of QWOP](qgol/README.md) — the same four keys on a rule instead of a swimmer. Three keys mark, the fourth commits, so Q W O P is exactly one B3/S23 generation. Shares no physics with the rest |
| `/griddle/` | [A house of pancakes](griddle/README.md) — squirt bottle, one-seat stove, spatula. You never see the face that is cooking; the burner is the fourth key because it is what makes the bubble cue lie |
| `/armline/` | [Six axes, four keys](armline/README.md) — a real **AR4 MK3** kinematic chain, transcribed from its MIT URDF, picking rejects off a moving line. 3D; uses `vendor/three.module.min.js` |
| `/mimic/` | [Dueling marionettes](mimic/README.md) — watch a puppet dance, then reproduce the *inputs* from what you saw. 3D. Its selftest measures whether the input-to-motion map is legible at all |
| `/pong/` | [Spin, solved](pong/README.md) — table tennis where the bat cannot leave its plane and the Magnus force comes out of a **D2Q9 lattice Boltzmann solver** in Rust, compiled to wasm and committed as `pong/solver.wasm`. 3D. Its selftest flies every shot twice, with the solved lift and without it |

`/flag/` and `/qwop/` import the model from `/proteus/flagella.js`, and
`/graze/` imports the whole cell from `/qwop/game.js`, rather than copying. Same
worker, same asset directory, so relative imports across them just work — **do
not copy**, the sync would rot. `/graze/` also wraps `/qwop/`'s predator table
rather than editing it, because that balance is measured and shipped. `/qgol/`,
`/griddle/`, `/armline/`, `/mimic/` and `/pong/` are the exceptions to all of
this: they import nothing from the others and share no physics with them. They
are on this surface because they are the same four keys.

Nine node selftests live here and all run under `preflight` when this dir
changes: `proteus/flagella.selftest.mjs` (the model), `flag/flag.selftest.mjs`
(that page's loop agrees with the model), `qwop/qwop.selftest.mjs` (that skilled
play beats unskilled play — the game's design claim, not something "it compiles"
can tell you), `graze/graze.selftest.mjs`, `qgol/qgol.selftest.mjs`,
`griddle/griddle.selftest.mjs`, `armline/armline.selftest.mjs`,
`mimic/mimic.selftest.mjs` and `pong/pong.selftest.mjs`. Run them before
touching `flagella.js` or `armline/arm.js`: the constants in both are
transcribed from published sources, and the tests are what prove the
transcription. `armline`'s checks its joint table field for field against the
AR4's URDF, from a second copy written out independently, so a typo has to be
made twice in the same way to survive.

Six of them are experiments rather than checklists — they sweep a family of
strategies or controllers, report which wins, and are allowed to tell you the
design is wrong. **All of them have.** `graze`'s said the growth curve plateaus
rather than turning over, against my stated prediction; `qgol`'s rejected the
claim that deaths-only always ends in extinction (it settles on the S23 core,
and a block survives it forever); `griddle`'s reported that a stopwatch beat
reading the cake, which was correct — at a genuinely constant temperature a
timer IS a perfect proxy, and the fix was to ask a fairer question rather than
to soften the assertion; `armline`'s turned up a mechanic nobody designed — the
jaws take longer to close than a part takes to cross the grasp radius, so you
have to commit the grip *before* the part arrives; `pong`'s killed the design
outright on its first run — a bat confined to a VERTICAL plane cannot replace
what air drag takes out of a 2.7 g ball, and the rally died in one exchange, so
the stroke plane now leans 30 degrees forward. In each case the documentation
was changed to match the measurement, not the other way round. That is what
these files are for.

`mimic`'s is the one that goes furthest: it does not test the game, it tests
whether the game is POSSIBLE. The whole premise is that you can watch a puppet
and infer which strings were pulled, which needs the input-to-motion map to be
both repeatable and separable — so the test measures the correlation between
input distance and motion distance (r = -0.955) and is entitled to come back and
say no such game exists. That is the shape to reach for when a design rests on a
perceptual claim rather than a mechanical one.

**A test can also pass for the wrong reason, and one here did.** The cell swam
the wrong way round for four shipped commits: `flagella.js` ran its travelling
wave tip-to-base, so the bundle pulled the body along behind it, when the paper
measures *"robust base-to-tip travelling waves"* — which push the cell toward
the base, body first, bundle trailing. Reversing the wave moves the cycle-mean
thrust magnitude by 0.35%, so every speed check reproduced the measured 646 um/s
either way and none of them could see it. `flag`'s speed check was meanwhile
passing by cancellation, averaging early-bout samples that read cold against
bent-cilium samples that read hot. Both are now tested directly: the direction
has its own assertion in `flagella.selftest.mjs` (with a negative control), and
`flag` compares only settled, bend-free samples, which tightened its agreement
from 1.34 to 1.03. **A sign that nothing asserts is a sign that will be wrong.**

Where a page has a browser-driving debug handle (`window.__qwop`, `__graze`,
`__qgol`, `__griddle`, `__armline`, `__mimic`, `__pong`), it is for ad-hoc checks with the
harness in
`scripts/lib/headless.mjs` — none of that is wired into `preflight`, which stays
node-only and fast. **Headless Chrome throttles `requestAnimationFrame` to about
0.5 Hz**, so a browser check cannot exercise gameplay that advances on the frame
clock; use it for what node cannot see — that the keys are wired up, the canvas
paints, nothing throws — and leave the simulation to the selftests.

**3D lives in `vendor/`.** `armline`, `mimic` and `pong` render in 3D and all import
`vendor/three.module.min.js` (r169, MIT), a byte-identical copy of the one the
`lab` surface vendors at `lab/_kit/`. It has to be a copy — a different worker
serves `lab`, so a cross-surface import would 404 in production. **One copy for
the whole surface**: any further 3D page imports that same file rather than
vendoring another.

**Rust lives in `pong/solver/`, and its build product is committed.**
`pong/solver.wasm` is a 33 kB module built from that crate — raw `extern "C"`
and a shared linear memory, no wasm-bindgen, no glue, like `clock/bearings`.
A committed build product can drift from its source, so
[`build-pong-solver.yml`](../.github/workflows/build-pong-solver.yml) rebuilds
and re-commits it on any change to the crate, and `pong.selftest.mjs` runs the
*committed binary* on a cheap grid against recorded values. The coefficients the
game flies on are a separate, longer thing: a converged sweep that takes about
half an hour on four cores and is reproduced with
`cd pokemon/pong/solver && cargo run --release --example sweep`. Change the
solver and BOTH have to be redone.

The three 3D pages share some hard-won rendering habits worth keeping:

- The environment map is generated procedurally in a few lines rather than
  shipped as an HDR — metal with nothing to reflect looks like grey plastic.
- Any mesh stretched between two points must be **unit height**, because the
  span helper scales it; a mesh with its own natural length gets scaled twice
  and comes out a fraction of the right size.
- **FIT THE CAMERA TO THE ASPECT, always.** A `PerspectiveCamera`'s `fov` is the
  VERTICAL field of view, so the horizontal one is
  `2*atan(tan(fov/2) * aspect)` and it collapses as the viewport narrows. A
  camera parked at a fixed distance frames beautifully on a laptop and runs the
  scene off both edges of a phone. Both pages shipped with exactly that bug.
  `mimic` fits a world-space box (and closes the gap between the two puppets
  below 1.15 aspect); `armline`'s view is oblique, so it keeps the direction and
  pushes back along it by `max(1, refAspect/aspect)`, which cannot swing the
  composition around by accident.
- On a portrait screen a **shorter** canvas makes the subject BIGGER, which is
  the opposite of the instinct. Wide content on a tall screen is
  horizontally-bound; more height lowers the aspect, tightens the horizontal
  fit, and shrinks everything.

**Headless Chrome will not go narrower than 500 CSS px.** `--window-size=390,844`
silently yields `innerWidth === 500` — 360 and 500 both report 500, while 600 and
900 track — so a screenshot at a phone width is the 500 px layout cropped to 390,
which reads as an overflow bug that is not there. It also ignores the viewport
meta, so that is no way round it either. To check a real phone width, run the
window at 500 (the `<=720px` rules a phone gets are already active there) and
constrain the content box to 360/390/430 from the driver, then assert no
element's right edge passes it.

**Static Assets replaces the whole manifest; it does not merge.** All ten
paths above ship from one `wrangler deploy`, so this branch has to carry all of
them. It does — it was checked as a strict superset of the previous owner's
tree before ownership moved — but any future branch taking this surface over
must be checked the same way, or a green run republishes the site with pages
missing.

## Deploy status

MANAGED — FIXED (zoom-bucket): config renamed mino-poke -> poke + custom_domain route, so wrangler deploy updates the worker that owns poke.mino.mobi. Was deploying stray worker mino-poke. CLEANUP: delete the orphan `mino-poke` worker in the dashboard.

## Deploying

Pushes to `claude/microbial-locomotion-flagellation-uj0l09` that touch this
surface's paths trigger [`.github/workflows/deploy-pokemon.yml`](../.github/workflows/deploy-pokemon.yml).
`main` does not deploy this or anything else — see the root `CLAUDE.md`.
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
