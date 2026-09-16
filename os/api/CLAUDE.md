# os-api — os-api.minomobi.com

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../../CLAUDE.md; the index of all surfaces is ../../docs/SURFACES.md. -->

The agent-platform backend for os.mino.mobi: per-DID Cloudflare Container (bash + git + Claude Code as the harness for open models via AGENT_PROFILES — kimi3 = Moonshot's Anthropic-compatible endpoint), PTY over WebSocket, DO-storage-synced workspace, fail-closed ALLOWED_DIDS identity gate (owner-only; INJECT_SHARED_CREDS=true is safe ONLY while the allowlist is exactly the owner)…

## Facts

| | |
|---|---|
| Surface | `os-api` |
| Dir | `os/api/` |
| Endpoint | `os-api.minomobi.com` |
| Type | backend |
| Owning branch | `claude/codex-containers-research-58t9ad` |
| Deploy | `.github/workflows/deploy-os-api.yml` |
| Uses | — |
| Provides | `os-api.minomobi.com` |

Machine-readable entry: [`deploy-registry.json`](../../deploy-registry.json) → `surfaces[]` where `surface == "os-api"`.

## How it works

The agent-platform backend for os.mino.mobi: a per-DID Cloudflare Container
(bash + git + **three agent harnesses**), PTY over WebSocket, DO-storage-synced
workspace, fail-closed ALLOWED_DIDS identity gate (owner-only;
INJECT_SHARED_CREDS=true is safe ONLY while the allowlist is exactly the owner).
Runs paid containers — cost bounded by max_instances=3 + 10-min idle sleep.

**Cells, not profiles.** The container runs any `(harness, model)` pair:

| axis | values | wire format |
|---|---|---|
| harness | `claude` (Claude Code CLI) | Anthropic Messages |
| | `opencode` (OpenCode) | OpenAI Chat Completions |
| | `codex` (OpenAI Codex CLI) | OpenAI **Responses** |
| model | `kimi3` (Moonshot), `ds4-flash` / `ds4-pro` (DeepSeek V4), `claude` (native) | both, per provider |
| | `gpt5` — the ChatGPT **subscription** cell, via this worker's own proxy | Responses only |

**The matrix is not full, and that is a fact about Codex.** It removed
`wire_api = "chat"` in 0.154, so it speaks only the Responses API and cannot
drive `kimi3` or `ds4-*` at all — those expose Chat Completions. Codex runs the
`gpt5` cell and nothing else until someone writes a Responses↔Chat shim
([`CODEX.md`](CODEX.md) D6). A profile carries `base` / `oaiBase` / `respBase`
for the three wire formats, and `agent` with no args prints which harnesses each
profile can actually run under.

The worker injects `AGENT_PROFILES` — `{name: {base, oaiBase, respBase, model,
key}}`. `base` is the provider's Anthropic-Messages endpoint, `oaiBase` its
Chat-Completions one, `respBase` its Responses one; a model is runnable under
exactly the harnesses whose wire format it exposes, and a profile missing the one
its harness needs fails loudly in `container/agent.sh` rather than 404ing at the
provider. `agent.sh` pins **every** Claude Code model tier to the profile's
one model id — DeepSeek silently remaps Claude ids by tier, which would
otherwise quietly turn a `ds4-flash` run's subagents into `ds4-pro`.

**Assist mode is model-routed too**: `/assist/start` takes `model` — any
worker-keyed profile name (`kimi3`, `ds4-flash`, `ds4-pro`) — and the DO calls
that provider's Anthropic endpoint directly (no container). The worker gates on
the selected model's key (`MOONSHOT_API_KEY` / `DEEPSEEK_API_KEY`) so a missing
secret names itself; the server-side `web_search` tool is attached only for
`kimi3` (DeepSeek's endpoint rejects it).

Chat state is keyed by cell, so `claude:ds4-flash` and `opencode:ds4-flash` are
separate conversations. OpenCode's event schema is not a documented contract, so
`server.js` normalizes it by **duck-typing** into the Claude Code shapes the
browser renders, passing anything unrecognised through verbatim — an unknown
event degrades to "shown as raw text", never to "silently dropped".

The same cells run headless in CI for comparison: [`bakeoff/`](../../bakeoff/CLAUDE.md).

**The subscription cell keeps its credential out of the container.** `gpt5`'s
`respBase` points at **this worker**, not at OpenAI, and its `key` is the
per-instance capability token the container already holds. Codex sends exactly
one credential-bearing header (`Authorization: Bearer <env_key>` — measured), so
`/openai/v1/responses` verifies that capability, swaps in the principal's real
ChatGPT bearer from DO storage, and forwards to
`chatgpt.com/backend-api/codex`. The container never holds an OpenAI credential,
so there is nothing for a workspace tarball to carry off and nothing that
rotates there; refresh happens in the DO, whose single-threaded execution
gives us the "one holder, serialized" property OpenAI's own guidance demands.
The tokens are deposited once via `PUT /openai/credential` (owner identity, same
gate as `/ws`) from an `auth.json` minted by `codex login` on a machine with a
real browser — required because device-code initiation is bot-walled from
container egress, measured twice. Full reasoning: [`CODEX.md`](CODEX.md) §5
Design C.

## Deploy status

MANAGED — SELF-PROVISIONING deploy (deploy-os-api.yml, create-mmo-db pattern): every run idempotently wrangler-deploys worker os-mino-api (Docker image built on the runner; custom_domain route binds os-api.minomobi.com — golden rule), syncs worker secrets from GitHub (CAP_SIGNING_KEY auto-generated once; MOONSHOT_API_KEY <- GH secret; GITHUB_TOKEN <- GH secret OS_AGENT_GITHUB_TOKEN), then health-checks the live domain. NO R2 (unavailable on this plan, CF 10042 — learned from run #1): workspace persistence is chunked tarballs in the ContainerShell DO's own SQLite storage. ALLOWED_DIDS is committed [vars] config (morphyx service DID). Un-automatable human prereqs (once): enable Cloudflare Containers on the account + mint the Moonshot key/PAT into GH secrets — see os/RUNBOOK.md.

## Deploying

Pushes to `claude/codex-containers-research-58t9ad` that touch this surface's paths trigger [`.github/workflows/deploy-os-api.yml`](../../.github/workflows/deploy-os-api.yml). `main` is **not** a trigger — see the root `CLAUDE.md`: a merge to main is an integration event, not a deploy.
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
