# os — Kimi agent platform go-live runbook

Unshelfing the `os/api` Cloudflare Containers backend and turning `os.mino.mobi`
into a chat window for **open-model coding agents** (first model: Kimi3), gated
to the owner only.

## What ships where

| Piece | What | How it deploys |
|---|---|---|
| Frontend (`os/`) | Terminal UI + `kimi` command | `deploy-os.yml` — auto on push to `claude/kimi3-container-deploy-24wux0` (or `main`) touching `os/**` (excl. `os/api/**`) |
| Backend (`os/api/`) | Worker `os-mino-api` + Docker container + DO + R2 | `deploy-os-api.yml` — **manual dispatch only** (builds a Docker image, provisions paid containers) |

## The architecture in one paragraph

`kimi` on os.mino.mobi opens a WebSocket to `os-api.minomobi.com`. The worker
verifies your identity (claimed DID → canonical PDS via plc.directory →
`getSession` with your accessJwt) against the fail-closed `ALLOWED_DIDS` list,
then routes you to your per-DID container. The container boots straight into
`agent kimi3` — which is **Claude Code CLI pointed at Moonshot's
Anthropic-compatible endpoint** (`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` +
`ANTHROPIC_MODEL`, injected by the worker via the `AGENT_PROFILES` env). The
workspace has a clone of `agent01`; the agent works on `kimi/*` branches, pushes
over HTTPS with the injected fine-grained PAT, and GitHub Actions fire on push.
No custom harness anywhere — the harness is Claude Code; the model is a profile.

## Go-live checklist (owner steps — none of these work from the Claude sandbox)

1. **Enable Cloudflare Containers** on the account (dashboard → Workers &
   Pages → Containers; requires the paid Workers plan).
2. **Create the R2 bucket** for workspace persistence:
   `npx wrangler r2 bucket create os-workspace`
3. **Set worker secrets** (from your laptop, in `os/api/`):
   ```bash
   npx wrangler secret put CAP_SIGNING_KEY        # openssl rand -hex 32
   npx wrangler secret put MOONSHOT_API_KEY       # platform.moonshot.ai → API keys
   npx wrangler secret put GITHUB_TOKEN           # fine-grained PAT, see below
   # Optional, only if you want in-container wrangler deploys:
   npx wrangler secret put CLOUDFLARE_API_TOKEN
   npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
   ```
   **GITHUB_TOKEN scope**: fine-grained PAT limited to `minormobius/agent01`,
   Contents read/write + Workflows read/write. Its pushes DO trigger Actions
   (unlike the Actions-internal `GITHUB_TOKEN`), which is exactly what we want.
4. **Put your DID on the allowlist.** Find it with `whoami` in the os shell (or
   `curl "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=<you>"`),
   then set `ALLOWED_DIDS = "did:plc:…"` in `os/api/wrangler.toml` [vars] (a DID
   is public — fine to commit) and push. `INJECT_SHARED_CREDS` is already
   `"true"` — safe *only* while this list is exactly you. **Never add a second
   DID without flipping it to `"false"` first** (see `api/SECURITY.md`).
5. **Check the model id.** `KIMI_MODEL` in `os/api/wrangler.toml` is a
   placeholder (`kimi-k3`) — set it to the current id from Moonshot's docs.
   Mainland accounts: also switch `KIMI_BASE_URL` to
   `https://api.moonshot.cn/anthropic`.
6. **Deploy the backend**: Actions → *Deploy os-api (container) [MANUAL]* →
   Run workflow on `claude/kimi3-container-deploy-24wux0`. The custom domain
   `os-api.minomobi.com` is declared as a `custom_domain` route in
   `wrangler.toml`, so wrangler provisions it on deploy. **Golden rule check**:
   the deploy log must bind `os-api.minomobi.com (custom domain)`.
7. **Flip the frontend on**: repo Settings → Secrets and variables → Actions →
   **Variables** → new variable `OS_CONTAINER_API_URL` =
   `wss://os-api.minomobi.com`, then re-run `deploy-os.yml` (dispatch, or any
   `os/**` push). Until this variable exists, `kimi`/`container` stay cleanly
   gated off.
8. **Smoke test**: os.mino.mobi → login (handle + app password) → `kimi`.
   Expect: cold start ~2-3s → the Claude Code TUI running Kimi. Inside:
   `work hello-kimi` → make a change → commit/push → the push shows up on
   GitHub and Actions run.

## Day-2 notes

- **Feature-branch model**: the agent's helper `work <slug>` creates/resumes
  `kimi/<slug>` from `origin/main`. No deploy workflow matches `kimi/*`, so the
  agent **cannot ship to prod** — a human promotes work by merging or adding the
  branch to a `deploy-*.yml` trigger (registry rules apply). That's the safety
  line; keep it.
- **Persistence**: workspace + `~/.claude` tarball to R2 every 2 min and on
  container sleep (10 min idle). Cold start restores it.
- **Cost**: `max_instances = 3`; one container per DID, so effectively one
  running instance (yours) that sleeps when idle. Whisper-style per-token costs
  are on your Moonshot account.
- **Native Claude still works**: `set-key sk-ant-…` in the PDS shell, then
  `container` → `claude` (the per-connection key rides the WS and is exported as
  `ANTHROPIC_API_KEY`; it is never stored server-side).

## Adding the next open model (the generalization)

A "model" is one `AGENT_PROFILES` entry. For a model with an
Anthropic-compatible endpoint (several open-model providers ship one; anything
else can sit behind a LiteLLM-style gateway that speaks `/v1/messages`):

1. `os/api/wrangler.toml`: add `<NAME>_BASE_URL` + `<NAME>_MODEL` vars; document
   `<NAME>_API_KEY` secret and `wrangler secret put` it.
2. `os/api/src/index.js` `envVars`: add the profile to the `AGENT_PROFILES`
   JSON (base / model / key).
3. Redeploy the backend (dispatch `deploy-os-api.yml`).
4. Use it: `kimi --model=<name>` in the browser, or `agent <name>` in the shell.

No image rebuild logic, no frontend change, no new harness code.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `kimi` says "not configured" | `OS_CONTAINER_API_URL` repo variable unset, or frontend not rebuilt since setting it |
| WS closes with 503 | `ALLOWED_DIDS` empty (fail-closed) |
| WS closes with 403 | Logged-in DID not on `ALLOWED_DIDS` |
| `agent kimi3` → "no key configured" | `MOONSHOT_API_KEY` secret missing on the worker |
| Agent starts, model errors | `KIMI_MODEL` id wrong/stale — check Moonshot docs |
| Workspace empty after wake | R2 bucket missing, or `CAP_SIGNING_KEY` unset (no CAP_TOKEN → sync disabled) |
| Green deploy, dead endpoint | Golden rule: log must show `os-api.minomobi.com (custom domain)` |
