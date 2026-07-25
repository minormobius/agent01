# ocr — ocr.mino.mobi, ocr.ascential.work

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Standalone client-side OCR (pull text / activation codes off an image). Vanilla HTML/JS + pure-Rust wasm (os/crates/codescan-ocr, artifact committed to ocr/wasm/). Worker `ocr` owns ocr.mino.mobi /api/model proxies the ocrs models (S3, no CORS).

## Facts

| | |
|---|---|
| Surface | `ocr` |
| Dir | `ocr/` |
| Endpoint | `ocr.mino.mobi, ocr.ascential.work` |
| Type | frontend |
| Owning branch | `claude/image-text-extraction-gH8UH` |
| Deploy | `.github/workflows/deploy-ocr.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "ocr"`.

## How it works

Standalone client-side OCR (pull text / activation codes off an image). Vanilla HTML/JS + pure-Rust wasm (os/crates/codescan-ocr, artifact committed to ocr/wasm/). Worker `ocr` owns ocr.mino.mobi; /api/model proxies the ocrs models (S3, no CORS). 2nd custom_domain route ocr.ascential.work added (alias; same worker, separate ascential.work zone — shared CLOUDFLARE_API_TOKEN already has Routes:Edit there, per ai-edu).

## Deploying

Pushes to `claude/image-text-extraction-gH8UH` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-ocr.yml`](../.github/workflows/deploy-ocr.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
