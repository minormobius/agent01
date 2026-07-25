# uni — uni.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The Unicode browser (sibling to moji). Thin assets Worker (worker `uni`, custom_domain uni.mino.mobi) — no build, no D1/AI/secrets. Home is every Unicode block grouped by plane with sample glyphs + live search (name substring over a lazy-loaded index, or paste a char / type U+XXXX to jump). /b/<slug> renders a block as a pastable char grid with infinite scroll (handles the 40k-char CJK blocks)…

## Facts

| | |
|---|---|
| Surface | `uni` |
| Dir | `uni/` |
| Endpoint | `uni.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/emoji-wiki-platform-support-v6ubju` |
| Deploy | `.github/workflows/deploy-uni.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "uni"`.

## How it works

The Unicode browser (sibling to moji). Thin assets Worker (worker `uni`, custom_domain uni.mino.mobi) — no build, no D1/AI/secrets. Home is every Unicode block grouped by plane with sample glyphs + live search (name substring over a lazy-loaded index, or paste a char / type U+XXXX to jump). /b/<slug> renders a block as a pastable char grid with infinite scroll (handles the 40k-char CJK blocks); /c/<hex> is a per-character page with name, block, script, category, age, and every encoding (UTF-8/16/32, HTML entity, CSS/JS/Python escapes, URL). Data generated from the Unicode Character Database (uni/data/ucd/*.txt) by scripts/build-uni-data.mjs: ~40k explicitly-named chars stored per-block, ~119k CJK/Hangul/Tangut ideographs named ALGORITHMICALLY client-side (no per-char storage) via uni/lib/uni.js (node-tested by uni/lib/uni.selftest.mjs).

## Deploying

Pushes to `claude/emoji-wiki-platform-support-v6ubju` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-uni.yml`](../.github/workflows/deploy-uni.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
