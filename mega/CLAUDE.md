# mega — mega.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

> **This surface hosts sub-sites on the same worker.** `/sprite` is the
> procedural-sprite lab (plus its `/sprite/api`), and **`/jev` is the TypeSafe
> Jev demo** ([`jev/CLAUDE.md`](jev/CLAUDE.md)) — mounted in `worker.js`
> alongside `/sprite/api` and `/bees/api`. jev rides this surface because the
> `mino.mobi` zone is at Cloudflare's hard cap of 100 Workers custom domains
> and cannot issue another subdomain.
>
> Two consequences worth knowing before you touch this surface:
> - **`/jev/api/ask` holds a paid credential.** `TYPESAFE_API_KEY` is a
>   Cloudflare secret on THIS worker, read only inside `jev/api.mjs`. Never
>   log it, never echo it, never move it into an asset.
> - **The deploy runs jev's selftests first**, and its worker selftest drives
>   this worker, so it will fail if a change here breaks `/sprite/api`,
>   `/bees/api`, or the jev mount.


Interactive map of global megaprojects—construction, timelines, costs, and deep context on a 3D globe.

## Facts

| | |
|---|---|
| Surface | `mega` |
| Dir | `mega/` |
| Endpoint | `mega.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/jev-minecraft-headless-9sbgxk` (transferred 2026-09-25 from `claude/jev-demo-website-pw3us1` for the headless-Minecraft work; before that from `claude/integrate-v091-v092-v093-4yie2i` when the `/jev` sub-site landed — a surface has exactly one owning branch, and jev cannot deploy unless the branch carrying it is the one that owns mega) |
| Deploy | `.github/workflows/deploy-mega.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "mega"`.

## How it works

Static worker-assets (Worker `mega`, directory '.'). Wings: `/` — megaproject dashboard (global infrastructure tracker, MapLibre + Deck.gl); `/sprite` — procedural NPC Sprite Lab (seed-deterministic, atproto-persistable engine breeding NPC sprites for the hoop O'Neill-cylinder game); `/sprite/item` — item genome + characteristics engine (phylogeny, trait dials, breeding); `/sprite/fixture` — chamber fixtures grown from hoop v3's voronoi tiling; `/v092` — the playable world clone (hoop v090 streaming painted world) carrying the player systems: inventory (Voronoi-cylinder), item-lore engine, technomagic combat, civic-tree character creation; `/v093` — THE SYNTHESIS: v092's player systems set inside v091's lived-in world (traffic-sized rooms, grand civic anchors, voronoi-grown impassable wall consoles, self-emitting deco, bollard-lit concourse, half-scale separating residents). Client-side renderers; no D1/DO/secrets.

## Deploy status

MANAGED — owned by claude/jev-minecraft-headless-9sbgxk (from claude/jev-demo-website-pw3us1, 2026-09-25). Worker `mega` + custom_domain route (mega.mino.mobi), and now a Cloudflare secret `TYPESAFE_API_KEY` for the `/jev` sub-site. Previously owned by claude/integrate-v091-v092-v093-4yie2i (the v091×v092 synthesis: /v093); that branch's `mega/` tree was verified to be a strict subset of this one before the transfer. CLEANUP: delete the orphan `mega-minomobi` worker.

## Deploying

Pushes to `claude/jev-minecraft-headless-9sbgxk` that touch this surface's paths trigger [`.github/workflows/deploy-mega.yml`](../.github/workflows/deploy-mega.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
