# moji — moji.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The emoji wiki. Thin assets Worker (worker `moji`, custom_domain moji.mino.mobi) — no build, no D1, no AI, no secrets. Home page is every Unicode emoji in one pastable, searchable table (click a glyph to copy); /e/<id> (id = hyphen-joined lowercase code points, e.g…

## Facts

| | |
|---|---|
| Surface | `moji` |
| Dir | `moji/` |
| Endpoint | `moji.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/emoji-wiki-platform-support-v6ubju` |
| Deploy | `.github/workflows/deploy-moji.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "moji"`.

## How it works

The emoji wiki. Thin assets Worker (worker `moji`, custom_domain moji.mino.mobi) — no build, no D1, no AI, no secrets. Home page is every Unicode emoji in one pastable, searchable table (click a glyph to copy); /e/<id> (id = hyphen-joined lowercase code points, e.g. /e/1f600) is a per-emoji page with code points, the Emoji version it debuted in, and platform-support timelines (Apple/Google/Microsoft/Samsung/WhatsApp/Twitter-X). Data is generated from Unicode UTS#51 emoji-test.txt by scripts/build-moji-data.mjs into moji/data/emoji.json (committed); platform first-ship dates are hand-authored in moji/data/platforms.json, keyed by Emoji version.

## Deploying

Pushes to `claude/emoji-wiki-platform-support-v6ubju` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-moji.yml`](../.github/workflows/deploy-moji.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
