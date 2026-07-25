# fix — fix.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The FIX (Financial Information eXchange) message parser (reference wing, sibling to moji/uni/unit). Thin assets Worker (worker `fix`, custom_domain fix.mino.mobi) — no build/D1/AI/secrets…

## Facts

| | |
|---|---|
| Surface | `fix` |
| Dir | `fix/` |
| Endpoint | `fix.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/fix-message-parser-yndbht` |
| Deploy | `.github/workflows/deploy-fix.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "fix"`.

## How it works

The FIX (Financial Information eXchange) message parser (reference wing, sibling to moji/uni/unit). Thin assets Worker (worker `fix`, custom_domain fix.mino.mobi) — no build/D1/AI/secrets. Home is a paste box: drop a raw FIX message (SOH, or |/^/;/newline delimiters — auto-detected) and it renders every tag decoded to field name + type, every coded value to its enum meaning, repeating groups reconstructed as a nested tree, header/body/trailer banded, and BodyLength (9) + CheckSum (10) validated against the raw bytes. The dictionary auto-selects from BeginString (tag 8). /f/<tag> is a per-field reference (name, type, full enum table, group membership); /m/<code> is a per-message reference (name, category, resolved field layout with components expanded + groups nested). Three dictionaries — FIX 4.2, 4.4, and 5.0 SP2 (the FIXT.1.1 session layer merged in) — generated from the canonical QuickFIX spec XMLs (pinned in fix/data/spec/) by scripts/build-fix-data.mjs into fix/data/<ver>.json (+ .layouts.json). The parse engine fix/lib/fix.js is shared verbatim by the page and the node selftest fix/lib/fix.selftest.mjs (run it before touching the engine). All client-side — nothing is uploaded.

## Deploying

Pushes to `claude/fix-message-parser-yndbht` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-fix.yml`](../.github/workflows/deploy-fix.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
