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

Static worker-assets (Worker `poke`), seven things sharing one asset manifest:

| Path | What |
|---|---|
| `/` | Critter Red — the monster RPG. `game.js`, `battle.js`, `overworld.js`, `data.js`, `ui.js`, `render.js` |
| `/proteus/` | [Amoeba qualia prototype](proteus/README.md) — you see only what the cell feels of itself. Also carries `flagella.js`, the ciliary model |
| `/flag/` | [Ciliary locomotion instrument](flag/README.md) — a free swimmer plus the measurements it comes from |
| `/qwop/` | [QWOP-like](qwop/README.md) — the same model as a game: four cilia, four keys, dodge the predators |
| `/graze/` | [Predator-and-prey variant](graze/README.md) — /qwop/'s cell plus an energy budget, prey, and a water column. Its selftest is an experiment: does sit-and-wait *emerge*? |
| `/qgol/` | [Conway's Game of QWOP](qgol/README.md) — the same four keys on a rule instead of a swimmer. Three keys mark, the fourth commits, so Q W O P is exactly one B3/S23 generation. Shares no physics with the rest |
| `/griddle/` | [A house of pancakes](griddle/README.md) — squirt bottle, one-seat stove, spatula. You never see the face that is cooking; the burner is the fourth key because it is what makes the bubble cue lie |

`/flag/` and `/qwop/` import the model from `/proteus/flagella.js`, and
`/graze/` imports the whole cell from `/qwop/game.js`, rather than copying. Same
worker, same asset directory, so relative imports across them just work — **do
not copy**, the sync would rot. `/graze/` also wraps `/qwop/`'s predator table
rather than editing it, because that balance is measured and shipped. `/qgol/`
and `/griddle/` are the exceptions to all of this: they import nothing from the
others and share no physics with them. They are on this surface because they are
the same four keys.

Six node selftests live here and all run under `preflight` when this dir
changes: `proteus/flagella.selftest.mjs` (the model), `flag/flag.selftest.mjs`
(that page's loop agrees with the model), `qwop/qwop.selftest.mjs` (that skilled
play beats unskilled play — the game's design claim, not something "it compiles"
can tell you), `graze/graze.selftest.mjs`, `qgol/qgol.selftest.mjs`, and
`griddle/griddle.selftest.mjs`. Run them before touching `flagella.js`: the
constants in it are transcribed measurements, and the tests are what prove the
transcription.

The last three are experiments rather than checklists — they sweep a family of
strategies or controllers, report which wins, and are allowed to tell you the
design is wrong. **All three have.** `graze`'s said the growth curve plateaus
rather than turning over, against my stated prediction; `qgol`'s rejected the
claim that deaths-only always ends in extinction (it settles on the S23 core,
and a block survives it forever); `griddle`'s reported that a stopwatch beat
reading the cake, which was correct — at a genuinely constant temperature a
timer IS a perfect proxy, and the fix was to ask a fairer question rather than
to soften the assertion. In each case the documentation was changed to match the
measurement, not the other way round. That is what these files are for.

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
`__qgol`, `__griddle`), it is for ad-hoc checks with the harness in
`scripts/lib/headless.mjs` — none of that is wired into `preflight`, which stays
node-only and fast. **Headless Chrome throttles `requestAnimationFrame` to about
0.5 Hz**, so a browser check cannot exercise gameplay that advances on the frame
clock; use it for what node cannot see — that the keys are wired up, the canvas
paints, nothing throws — and leave the simulation to the selftests.

**Static Assets replaces the whole manifest; it does not merge.** All seven
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
