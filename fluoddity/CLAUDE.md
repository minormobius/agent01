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
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-fluoddity.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "fluoddity"`.

## Deploy status

MANAGED — FIXED: added custom_domain route (fluoddity.mino.mobi) to make the binding declarative. Name kept (fluoddity-minomobi); no twin worker found, so it was already deploying the right worker.

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-fluoddity.yml`](../.github/workflows/deploy-fluoddity.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
