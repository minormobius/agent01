# tide — CLAUDE.md (the THERMODYNAMICS wing)

You are working on **tide**, the thermodynamics wing of the O'Neill cylinder modelling
package. Read `tide/README.md` first — this file is the operational quick-reference.

## What tide is

The **climate** of the cylinder interior: the air, the fog, the water cycle and the heat
books. Three live modules + one planned, each self-contained under its own directory, all over
the canonical geometry in `shared/geometry.mjs`:

- `profile/` — the centrifugal barometer: a small standalone solver for the two profiles every
  other module sits on — gravity `g(r)=ω²r` and the isothermal pressure `P(r)=P_axis·e^{S(r/R)²}`
  from just radius, spin, and the non-spinning pressure. One closed form, no time-stepping.
- `atmosphere/` — 1-D radial column (temp / humidity / CO₂ vs altitude) + Mie fog optics.
- `fountain/` — azimuthal cross-section: rotating-frame ballistic fountain + linear-sun flux budget.
- `ratchet/` — lake topology: equipotential-arc surfaces (never secants) + the ratchet teeth that
  make lakes possible and route the runoff (home, or forward into the next lake — the river).
- `systems/` — water & energy ledger (reactors → light + jets; conserving water box; fish).
- `goss/` — **an odd tenant, deliberately hosted here**: the civic web viewer + social-drama
  substrate (`tide.mino.mobi/goss`). Not thermodynamics — the hoop econ society (vendored
  kernel, copy-never-fork: `goss/vendor/econ/` + `goss/vendor/paint/` from `hoop/v099/`)
  rendered as a force-laid WEB instead of a map. `goss/gossip.js` layers deterministic
  demographics/naming/kinship, the person↔person tie graph, EMERGENT tribes (label propagation
  — no faction is assigned at the NPC level anywhere in the engine), romance, and the two
  tension axes (tribalism · narcissism of small differences) emitting typed drama seeds — the
  proto-oracle. A second substrate loads hoop's real **nave floor 1** from baked JSON
  (`goss/data/nave-*.json`, baked by the node-only `goss/tools/bake-nave.mjs` — re-run it after
  hoop nave/engine changes) with two pollination modes: `floor` (default — the UNIFIED web: one
  society, hats cross wards Euclidean, like the game's commute web; measured healthier than sealed
  on every baked seed — see `goss/UNIFIED.md` + `goss/tools/study-unified.mjs`) and `sealed`
  (engine truth — chunk societies never mix, pinned in the selftest). Read `goss/README.md`
  before touching it.
- Module 3 (WebGPU interior visualiser) — planned.

The defining physics: **up (toward the axis) is hot, not cold** → permanent stratification →
**fog not rain**, and the same stagnation that waters the plants starves them of CO₂. The
pumps that relieve it are the thermal tide and the fountain.

## The package it belongs to

Four surfaces, one cylinder. **game → [hoop](../hoop)** · **structure → [rind](../rind)** ·
**thermodynamics → tide (you)** · **ecosystem → [biome](../biome)**. tide was split out of
biome: biome kept the *ecology* (food web), tide took the *climate* (air/water/energy). They
couple through radius (radius is altitude is temperature/humidity/CO₂). Keep the "four wings"
block and footer cross-links in `index.html` working.

## Run / test (all run from the sandbox; deploy does not)

```bash
node tide/profile/test/profile.selftest.mjs       # 24 checks
node tide/atmosphere/test/column.selftest.mjs     # 16 checks
node tide/atmosphere/test/optics.selftest.mjs     # 11 checks
node tide/fountain/test/fountain.selftest.mjs     # 25 checks
node tide/fountain/test/light.selftest.mjs        # 15 checks
node tide/ratchet/test/ratchet.selftest.mjs       # 20 checks
node tide/systems/test/resources.selftest.mjs     # 17 checks
node tide/goss/test/gossip.selftest.mjs           # 38 checks
# or all at once:
for t in tide/*/test/*.selftest.mjs; do node "$t" || echo "FAIL $t"; done
```

The self-tests are the contract — run them before every push.

## Deploy

- Push `tide/**` on `main` or `claude/nave-unified-web-6plmae` (the current owning branch) → `deploy-tide.yml`
  runs `wrangler deploy`. The sandbox cannot deploy; push and let the Action run. Verify the
  log binds `tide.mino.mobi (custom domain)` (the golden rule).
- Ownership is in `deploy-registry.json` (surface `tide`). Edit the registry, then
  `node scripts/gen-deploy-triggers.mjs --write` + `node scripts/lint-deploy-registry.mjs`.

## Invariants — do not break

1. **Conservation is the discipline.** Every model conserves its books to machine precision
   (water ~1e-16, the column to machine precision in cylindrical finite-volume). Don't add a
   flow without its paired counter-flow. The systems ledger closes the cross-module books.
2. **Determinism, zero deps, node + browser.** Every `sim/*.mjs` runs identically headless and
   in the page. No build step.
3. **`shared/geometry.mjs` is the single source of the build's numbers** (8 km habitat, 10 km
   hull, 1 km rind, 1 g at outer radius). Change geometry there, not in a module. If biome
   needs it for radius coupling, it vendors a copy — don't reach across surfaces at runtime.
4. **Pure static.** No D1/DO/secrets; the worker just serves assets + `/health`.
