# os — os.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Browser-based terminal for your ATProto PDS. XRPC commands, DuckDB SQL, AI chat, and embedded bash container.

## Facts

| | |
|---|---|
| Surface | `os` |
| Dir | `os/` |
| Endpoint | `os.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/kimi3-container-deploy-24wux0` |
| Deploy | `.github/workflows/deploy-os.yml` |
| Uses | `os-api.minomobi.com` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "os"`.

## How it works

React + Vite + xterm.js terminal UI over the user's PDS, plus the AGENT PLATFORM: `kimi` boots the Cloudflare Containers backend (os/api, owner-DID-gated) straight into an open-model coding agent — Claude Code CLI pointed at an Anthropic-compatible endpoint via worker-injected AGENT_PROFILES (kimi3 = Moonshot; any open model = one more profile). The agent clones agent01, works on kimi/* branches, pushes, and GitHub Actions run. Workflow paths exclude os/api/** so frontend deploys do not fire on backend changes.

## Deploy status

MANAGED (frontend) — standalone PDS shell ships and works with no backend (login + ls/cat/find/du/blob/curl/sync/sql, all client-side XRPC + WASM CAR parse + DuckDB). The `kimi`/`container` commands probe the os-api backend at RUNTIME (/health, 4s timeout) and report exactly what's missing instead of dangling a dead WebSocket — no build-time gating variable needed (VITE_CONTAINER_API_URL remains an optional override). Worker name `os` owns os.mino.mobi via custom_domain route (golden rule OK). CLEANUP: delete the orphan `pds-os` worker.

## Deploying

Pushes to `claude/kimi3-container-deploy-24wux0` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-os.yml`](../.github/workflows/deploy-os.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
