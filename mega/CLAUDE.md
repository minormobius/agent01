# mega — mega.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Interactive map of global megaprojects—construction, timelines, costs, and deep context on a 3D globe.

## Facts

| | |
|---|---|
| Surface | `mega` |
| Dir | `mega/` |
| Endpoint | `mega.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/integrate-v091-v092-v093-4yie2i` |
| Deploy | `.github/workflows/deploy-mega.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "mega"`.

## How it works

Static worker-assets (Worker `mega`, directory '.'). Wings: `/` — megaproject dashboard (global infrastructure tracker, MapLibre + Deck.gl); `/sprite` — procedural NPC Sprite Lab (seed-deterministic, atproto-persistable engine breeding NPC sprites for the hoop O'Neill-cylinder game); `/sprite/item` — item genome + characteristics engine (phylogeny, trait dials, breeding); `/sprite/fixture` — chamber fixtures grown from hoop v3's voronoi tiling; `/v092` — the playable world clone (hoop v090 streaming painted world) carrying the player systems: inventory (Voronoi-cylinder), item-lore engine, technomagic combat, civic-tree character creation; `/v093` — THE SYNTHESIS: v092's player systems set inside v091's lived-in world (traffic-sized rooms, grand civic anchors, voronoi-grown impassable wall consoles, self-emitting deco, bollard-lit concourse, half-scale separating residents). Client-side renderers; no D1/DO/secrets.

## Deploy status

MANAGED — owned by claude/integrate-v091-v092-v093-4yie2i (the v091×v092 synthesis: /v093). Worker `mega` + custom_domain route (mega.mino.mobi). CLEANUP: delete the orphan `mega-minomobi` worker.

## Deploying

Pushes to `claude/integrate-v091-v092-v093-4yie2i` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-mega.yml`](../.github/workflows/deploy-mega.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
