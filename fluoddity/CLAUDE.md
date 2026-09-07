# fluoddity — fluoddity.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Breed and fork emergent vector-trail organisms as deterministic genomes saved to your PDS, with an interactive phylogeny.

## Facts

| | |
|---|---|
| Surface | `fluoddity` |
| Dir | `fluoddity/` |
| Endpoint | `fluoddity.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/fluoddity-param-space-viz-9d5g4b` |
| Deploy | `.github/workflows/deploy-fluoddity.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "fluoddity"`.

## Deploy status

MANAGED — owning branch moved to `claude/fluoddity-param-space-viz-9d5g4b` (the parameter-space takeover). Earlier: added custom_domain route (fluoddity.mino.mobi) to make the binding declarative. Name kept (fluoddity-minomobi); no twin worker found, so it was already deploying the right worker.

## Deploying

Pushes to `claude/fluoddity-param-space-viz-9d5g4b` that touch this surface's paths trigger [`.github/workflows/deploy-fluoddity.yml`](../.github/workflows/deploy-fluoddity.yml).
The sandbox cannot reach Cloudflare — **push to the owning branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes. `main` does not deploy.

## How it hangs together

Pure static site plus one worker route (`worker.js`: `/api/tts`, an ElevenLabs
proxy gated by `CLIP_WHITELIST`). No D1, no migrations. Every page imports the
same three modules, so change those and you change every page:

| Module | Holds |
|---|---|
| `engine.js` | the WebGL2 simulation. `PARAMS` is the canonical evolvable box (13 knobs → `[lo, hi, sigma]`); `randomConfig`/`mutate` are the genome operators. `FluoddityEngine(dim, count, {arena, text})`. |
| `descriptors.js` | the phenotype read off a 64² downsample: `readDescriptors`, `verdict` (dead / sparse / frozen / boiling / blown out / alive) and the **interestingness scalar** `fitness` / `fitness2(v1, v2)`. |
| `viewcontrols.js` | trail⇄particle toggle, reset, and the **substrate match** (`M_REF = 1.8`): with `substrate: true` a surface's engine is density-matched to the playground on mount. |

`GAME.md` is the design record for `/game/` and the best single read on how the
pieces fit (temperature, verdicts, the rubric pipeline).

### The hero's interestingness engine

The landing hero (`index.html` `pickLively`) is the reference scorer the rest of
the site leans on: draw from the viable box, run **260 + 8** steps and read
descriptors (T1), run **192 + 8** more and read again (T2), score
`fitness2(v1, v2)`, keep the best of ten. It runs on a 480² / 55 000 engine at
the matched density. The torus, gallery and `/space.html` reuse exactly that
protocol, so "interestingness" means one thing everywhere.

## Pages

| Page | What |
|---|---|
| `index.html` | landing: hero organism + the card index of everything below |
| `game/` | the one-thumb game (HEAT → TAME → BREED → DISCOVER), see `GAME.md` |
| `play/` | the playground: sliders, liveness HUD, save to PDS |
| `text/`, `read/`, `clip/` | text-attractor variants (swarm spells words; RSVP reader; narrated clips — whitelisted) |
| `gallery.html`, `map.html`, `forest.html` | everyone's saved organisms; phenotype phase-space map with lineage edges; the atlas of published expeditions |
| `hot.html` | HOT/NOT labelling → a linear rubric in 8-feature descriptor space |
| `select.html`, `arena.html`, `torus.html`, `breed.html` | guided 4×4 breeding; 16-species shared field; toroidal render; the autopilot breeder |
| **`space.html`** | **the parameter-space map** (below) |

### `space.html` — parameter space

A map of the genome scored by the hero's interestingness engine, sampled live
in the visitor's browser (nothing is precomputed or stored). The genome has
**16 axes**: the 13 `PARAMS` knobs plus `rule_seed`, `cohorts` and the spawn
pattern (`initial_conditions`); `hazard_rate` is pinned at 0. Three views, all
centred on one **base** organism:

- **slice** — an N×N grid over two chosen axes (default force × gain), every
  other gene held at the base. Cells fill in Bayer order so the picture is
  coarse first and refines. White crosshair = the base.
- **spectrum** — one row per axis, swept across its viable range through the
  base. A flat bright row is a knob the organism doesn't care about; a
  flickering one is a lottery (`rule_seed` always is).
- **basin** — the hypersphere: random unit directions in normalised 15-D genome
  space, walked outward at eight radii; fitness vs distance shows how big the
  base's alive region is.

Clicking any cell previews it live (second engine, follows the view toggle);
**make base** re-centres all three views on it (with back history), so a walk
through the map is a manual hill-climb. Colour by interestingness (one-hue
ramp) or verdict (site palette; *sparse* gets an extra dot because its yellow
collides with *frozen*).

Mechanics worth knowing before touching it:

- The sampler is the hero protocol sliced across animation frames (a step
  budget that adapts to ~25 ms/frame), fed by one queue that interleaves the
  three views so they fill at the same relative rate. Results are cached by a
  canonical key of the 16 genes **plus the engine size**, so re-centring back
  is free.
- It always scores in **trail** mode and at the matched density, whatever the
  visitor's display toggle says — otherwise the map would depend on a UI
  preference.
- Engine sizes: `fast` 224²/14k, `hot` 320²/32k (default; the hot-or-not
  engine), `hero` 480²/55k (the landing's, exact). The genome is not
  scale-invariant, so numbers shift a little between them; the key keeps their
  caches apart.
- URL hash carries the base and settings (`#c=` is the same base64url JSON the
  playground reads, plus `x`, `y`, `n`, `q`, `col`), so a map is a permalink and
  "copy link" / "playground ↗" round-trip.
- With no `#c=` it shuffles: the hero's ten-draw pick, through the same queue,
  becomes the first base.

Sampling cost is the whole budget: a 12×12 slice + 16 spectrum rows × 20 +
48 basin points ≈ 400 runs of 468 steps. Fine on a GPU (tens of seconds),
minutes on software GL. If you add a view, add it as another job list in
`rebuild()` so the interleaver keeps it progressive.

## Quirks

- `worker.js` serves everything else from assets; `.assetsignore` keeps this
  file off the public origin.
- The three lexicons (`lexicons/`, `play/lexicons/`) are backlink-anchored to
  `did:web:g.mino.mobi` so Constellation enumerates them across users.
- OG image is generated by `scripts/generate-fluoddity-og.mjs`.
