# unit — unit.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The unit converter (reference wing, sibling to moji + uni). Thin assets Worker (worker `unit`, custom_domain unit.mino.mobi) - no build/D1/AI/secrets…

## Facts

| | |
|---|---|
| Surface | `unit` |
| Dir | `unit/` |
| Endpoint | `unit.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/emoji-wiki-platform-support-v6ubju` |
| Deploy | `.github/workflows/deploy-unit.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "unit"`.

## How it works

The unit converter (reference wing, sibling to moji + uni). Thin assets Worker (worker `unit`, custom_domain unit.mino.mobi) - no build/D1/AI/secrets. Home: category dropdown then two iOS-style CYLINDER unit pickers (unit/lib/cylinder.js, scroll-snap drum) flanking a value input + swap, with a live FULL-SPECTRUM table converting the value into every unit at once (click a row to set it as the target). Deep-linkable at /<category>/<from>/<to>?v= (e.g. /length/meter/foot?v=1). /reference is the longform table page: every unit's exact factor to/from its base both ways, affine temperature formulas, non-linear fuel economy, and SI + IEC binary prefixes. ~15 categories; all conversions in the pure engine unit/lib/units.js (factor/offset, or toBase/fromBase fns for non-affine), node-tested by unit/lib/units.selftest.mjs. Currency deliberately excluded (needs live rates).

## Deploying

Pushes to `claude/emoji-wiki-platform-support-v6ubju` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-unit.yml`](../.github/workflows/deploy-unit.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
