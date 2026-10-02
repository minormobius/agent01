# bisk — bisk.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The SimCluster Daily. A deterministic digest of a Bluesky neighborhood, recomputed each morning: top chickens (most-liked posts), delvers (deepest thread, rendered with weft's threadbeast), and a sentiment weather report. A fork of the mino times; morphyx and modulo will edit once the personas wake up.

## Facts

| | |
|---|---|
| Surface | `bisk` |
| Dir | `bisk/` |
| Endpoint | `bisk.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/bisk-surface-news-collage-dymw50` (taken 2026-10-02 with `take-ownership.mjs`) |
| Deploy | `.github/workflows/deploy-bisk.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "bisk"`.

## Bisk

**Live at**: `bisk.mino.mobi`
**Stack**: Cloudflare Worker (assets binding) + a daily GitHub-Action cron
**Deploy**: `.github/workflows/deploy-bisk.yml` (wrangler deploy on push to `bisk/**`)

A fork of `/time`'s newspaper aesthetic that publishes a **deterministic** daily digest of a Bluesky SimCluster list. No inference, no auth — a read-only public-API pipeline.

- **`scripts/build-bisk-digest.mjs`** — the engine. Reads the list from `bisk/config.json` (`listUri`), uses `packages/atproto/bsky.js` (`getListMembers`, `getProfiles`) + a rich author-feed fetch, hydrates every replied thread, and writes `bisk/data/<date>.json` + `latest.json` + `index.json`. Sections: **Top Chickens** (top-3 by likes, 24h), **Delvers** (deepest thread by true nesting depth, embedded via weft's threadbeast), **Weather** (AFINN sentiment + 8-axis NRC emotion radar + represented×overrepresented distinctive words, over member posts incl. deep-thread replies), **Scenes** (are.na-style image wall, topped by the day's **collage**).
- **`.github/workflows/bisk-digest.yml`** — cron `0 13 * * *` → build → commit `bisk/data` → **self-deploy via wrangler**. Two gotchas baked in: (1) `schedule:` only fires from the **default branch**, so this must be on `main`; (2) the digest deploys itself because a `GITHUB_TOKEN` push doesn't trigger `deploy-bisk`.
- **`scripts/build-bisk-collage.mjs`** — the collage. Runs right after the digest: fetches every scene thumbnail, tiles them in justified rows (most-liked on top, cover-cropped with sharp's `attention` crop) into one 1600-wide JPEG with a masthead strip, and writes `data/collage/<date>.jpg` + `latest.jpg` (the `og:image`). It patches a `collage` block into `<date>.json`/`latest.json` — `src`, size, and each tile's rect with `i` = index into `scenes` — so the page overlays a link per tile. It is the only bisk script with a dependency (`sharp`): the Action installs it into `$RUNNER_TEMP` and passes `SHARP_FROM`; the step is `continue-on-error` so a collage failure never costs the edition. ~300 KB/day lands in git. Back issues: `node scripts/build-bisk-collage.mjs <date>` (only while the CDN still serves the thumbs).
- Editorial voices (Modulo/Morphyx) are a planned phase-2 layer on top of the deterministic base.

---


## Deploying

**Two things deploy bisk, from two different trees:**

1. **The daily cron** (`bisk-digest.yml`, 13:00 UTC; `bisk-monthly.yml` on the 1st) runs on **`main`**, commits data to `main`, and **self-deploys `main`'s `bisk/` tree**. This is what keeps the live site fresh day to day — so anything not yet merged to `main` (page changes, the collage step itself) is **overwritten at the next 13:00 run**. Ship bisk work to `main` as well as to the owning branch.
2. **`deploy-bisk.yml`** fires on a push to the owning branch (`claude/bisk-surface-news-collage-dymw50`) touching `bisk/**`. The owning branch does **not** receive the bot's daily data commits, so before pushing it, merge `origin/main` in — or the deploy republishes stale editions (the previous owner was 9 days behind on `data/` at handover).

The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
