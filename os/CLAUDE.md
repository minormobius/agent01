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
| Owning branch | `claude/os-deploy-surface-474bz3` |
| Deploy | `.github/workflows/deploy-os.yml` |
| Uses | `os-api.minomobi.com` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "os"`.

## How it works

React + Vite + xterm.js terminal UI over the user's PDS, plus the AGENT PLATFORM.

`kimi` boots the Cloudflare Containers backend (os/api, owner-DID-gated)
straight into a coding-agent **cell**. A cell is two independent axes:

- **harness** — the agent loop. `claude` (Claude Code CLI, speaks the Anthropic
  Messages API) or `opencode` (OpenCode, speaks OpenAI Chat Completions via
  `@ai-sdk/openai-compatible`).
- **model** — an endpoint + model id + key, injected by the worker as
  `AGENT_PROFILES`: `kimi3` (Moonshot), `ds4-flash` / `ds4-pro` (DeepSeek V4),
  `claude` (native Anthropic, browser-supplied key).

`kimi --model=ds4-flash --harness=opencode` runs that pair; `agent` inside the
container prints the live matrix and is the authority on what is installed and
keyed. Adding a model is still one profile entry and no code; adding a harness
is one `run_<name>` function in `agent.sh`.

The agent clones agent01, works on `kimi/*` branches, pushes, and GitHub Actions
run. Workflow paths exclude `os/api/**` so frontend deploys do not fire on
backend changes.

`public/arena/` holds published bake-off runs (see
[`../bakeoff/CLAUDE.md`](../bakeoff/CLAUDE.md)) — the same cells given one brief
and scored side by side, served at `os.mino.mobi/arena/<run-id>/`. Entries are
model-written HTML; `public/_headers` serves them from an opaque origin
(`Content-Security-Policy: sandbox allow-scripts`) so they cannot reach the
`.mino.mobi` SSO cookie or the Anthropic key in localStorage. Staging a run into
`public/arena/` is a deliberate human step, never something CI does.

## Deploy status

MANAGED (frontend) — standalone PDS shell ships and works with no backend (login + ls/cat/find/du/blob/curl/sync/sql, all client-side XRPC + WASM CAR parse + DuckDB). The `kimi`/`container` commands probe the os-api backend at RUNTIME (/health, 4s timeout) and report exactly what's missing instead of dangling a dead WebSocket — no build-time gating variable needed (VITE_CONTAINER_API_URL remains an optional override). Worker name `os` owns os.mino.mobi via custom_domain route (golden rule OK). CLEANUP: delete the orphan `pds-os` worker.

## Deploying

Pushes to `claude/os-deploy-surface-474bz3` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-os.yml`](../.github/workflows/deploy-os.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
