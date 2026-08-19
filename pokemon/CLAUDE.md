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

Static worker-assets (Worker `poke`), four things sharing one asset manifest:

| Path | What |
|---|---|
| `/` | Critter Red — the monster RPG. `game.js`, `battle.js`, `overworld.js`, `data.js`, `ui.js`, `render.js` |
| `/proteus/` | [Amoeba qualia prototype](proteus/README.md) — you see only what the cell feels of itself. Also carries `flagella.js`, the ciliary model |
| `/flag/` | [Ciliary locomotion instrument](flag/README.md) — a free swimmer plus the measurements it comes from |
| `/qwop/` | [QWOP-like](qwop/README.md) — the same model as a game: four cilia, four keys, dodge the predators |

`/flag/` and `/qwop/` both import the model from `/proteus/flagella.js` rather
than copying it. Same worker, same asset directory, so a relative import across
them just works — **do not copy it**, the sync would rot.

Three node selftests live here and all run under `preflight` when this dir
changes: `proteus/flagella.selftest.mjs` (the model), `flag/flag.selftest.mjs`
(that page's loop agrees with the model), and `qwop/qwop.selftest.mjs` (that
skilled play actually beats unskilled play — the game's whole design claim, and
not something "it compiles" can tell you). Run them before touching
`flagella.js`: the constants in it are transcribed measurements, and the tests
are what prove the transcription.

**Static Assets replaces the whole manifest; it does not merge.** All four
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
