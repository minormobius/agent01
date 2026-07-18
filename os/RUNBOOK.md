# os — Kimi agent platform go-live runbook

Unshelfing the `os/api` Cloudflare Containers backend and turning `os.mino.mobi`
into a chat window for **open-model coding agents** (first model: Kimi3), gated
to the owner only. The deploy is **self-provisioning** — almost everything below
happens automatically in GitHub Actions on push.

## What ships where

| Piece | What | How it deploys |
|---|---|---|
| Frontend (`os/`) | Terminal UI + `kimi` command | `deploy-os.yml` — auto on push to `claude/kimi3-container-deploy-24wux0` (or `main`) touching `os/**` (excl. `os/api/**`) |
| Backend (`os/api/`) | Worker `os-mino-api` + Docker container + DO + R2 | `deploy-os-api.yml` — auto on push touching `os/api/**` (same branches) or dispatch. **Self-provisioning**: ensures the R2 bucket, deploys, syncs secrets from GitHub, health-checks the domain |

## The architecture in one paragraph

`kimi` on os.mino.mobi probes `os-api.minomobi.com/health` (runtime gating — no
build flags), then opens a WebSocket. The worker verifies your identity (claimed
DID → canonical PDS via plc.directory → `getSession` with your accessJwt)
against the fail-closed `ALLOWED_DIDS` list, then routes you to your per-DID
container, booted straight into `agent kimi3` — **Claude Code CLI pointed at
Moonshot's Anthropic-compatible endpoint** (`ANTHROPIC_BASE_URL` +
`ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_MODEL`, injected by the worker via
`AGENT_PROFILES`). The workspace has a clone of `agent01`; the agent works on
`kimi/*` branches, pushes over HTTPS with the injected fine-grained PAT, and
GitHub Actions fire on push. No custom harness anywhere — the harness is Claude
Code; the model is a profile.

## Go-live: the 3 human steps (everything else is automated)

These are the only things the workflow cannot do itself:

1. **Enable Cloudflare Containers** on the account (dashboard → Workers &
   Pages → Containers; requires the paid Workers plan). Until this is on, the
   `wrangler deploy` step fails — that red run is the signal.
2. **Mint two credentials and add them as GitHub Actions SECRETS**
   (repo Settings → Secrets and variables → Actions → Secrets):
   - `MOONSHOT_API_KEY` — from platform.moonshot.ai → API keys.
   - `OS_AGENT_GITHUB_TOKEN` — fine-grained PAT limited to
     `minormobius/agent01`, Contents read/write + Workflows read/write. Its
     pushes DO trigger Actions (unlike the Actions-internal `GITHUB_TOKEN`),
     which is exactly what we want.
3. **Set the GitHub Actions VARIABLE `OS_ALLOWED_DIDS`** to your DID (same
   Settings page → Variables; DIDs are public, hence a variable). Find yours
   with `whoami` in the os shell, or:
   `curl "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=<you>"`

Then **push anything touching `os/api/**`** (or dispatch *Deploy os-api* from
the Actions tab). The workflow: ensures the `os-workspace` R2 bucket → deploys
(custom-domain route binds `os-api.minomobi.com`; golden rule verified by the
health-check step) → generates `CAP_SIGNING_KEY` once → syncs
`MOONSHOT_API_KEY` / `GITHUB_TOKEN` / `ALLOWED_DIDS` from GitHub → polls
`/health` until green.

Also check `KIMI_MODEL` in `os/api/wrangler.toml` — it's a placeholder
(`kimi-k3`); set it to the current id from Moonshot's docs. Mainland accounts:
switch `KIMI_BASE_URL` to `https://api.moonshot.cn/anthropic`.

**Smoke test**: os.mino.mobi → login (handle + app password) → `kimi`.
Expect: cold start ~2-3s → the Claude Code TUI running Kimi. Inside:
`work hello-kimi` → make a change → commit/push → the push shows up on GitHub
and Actions run. (No frontend rebuild needed — availability is a runtime
`/health` probe, and the production URL is the baked-in default.)

## What syncs from where (secret/config map)

| Worker config | Source | When |
|---|---|---|
| `CAP_SIGNING_KEY` | generated on the runner (`openssl rand -hex 32`) | first run only — never auto-rotated (would kill live capability tokens) |
| `MOONSHOT_API_KEY` | GH secret `MOONSHOT_API_KEY` | every run (GitHub is source of truth — rotate there) |
| `GITHUB_TOKEN` (worker) | GH secret `OS_AGENT_GITHUB_TOKEN` | every run |
| `ALLOWED_DIDS` | GH **variable** `OS_ALLOWED_DIDS` | every run. NOT in `[vars]` — a committed var would clobber the secret each deploy |
| `KIMI_BASE_URL`, `KIMI_MODEL`, `INJECT_SHARED_CREDS` | committed `[vars]` in `wrangler.toml` | every deploy |
| R2 bucket `os-workspace` | created via CF API by the workflow | idempotent, every run |
| `os-api.minomobi.com` | `custom_domain` route in `wrangler.toml` | every deploy (golden rule) |

## Day-2 notes

- **Feature-branch model**: the agent's helper `work <slug>` creates/resumes
  `kimi/<slug>` from `origin/main`. No deploy workflow matches `kimi/*`, so the
  agent **cannot ship to prod** — a human promotes work by merging or adding the
  branch to a `deploy-*.yml` trigger (registry rules apply). That's the safety
  line; keep it.
- **Persistence**: workspace + `~/.claude` tarball to R2 every 2 min and on
  container sleep (10 min idle). Cold start restores it.
- **Cost**: `max_instances = 3`; one container per DID, so effectively one
  running instance (yours) that sleeps when idle. Model tokens bill to your
  Moonshot account.
- **Native Claude still works**: `set-key sk-ant-…` in the PDS shell, then
  `container` → `claude` (the per-connection key rides the WS and is exported as
  `ANTHROPIC_API_KEY`; it is never stored server-side).
- **Rotation**: update the GH secret/variable and re-run the deploy — the sync
  step propagates it. `CAP_SIGNING_KEY` rotation is deliberate-manual
  (`wrangler secret put` from a laptop) since it invalidates live sessions.

## Adding the next open model (the generalization)

A "model" is one `AGENT_PROFILES` entry. For a model with an
Anthropic-compatible endpoint (several open-model providers ship one; anything
else can sit behind a LiteLLM-style gateway that speaks `/v1/messages`):

1. `os/api/wrangler.toml`: add `<NAME>_BASE_URL` + `<NAME>_MODEL` vars.
2. `os/api/src/index.js` `envVars`: add the profile to the `AGENT_PROFILES`
   JSON (base / model / key).
3. Add the GH secret and one sync line in `deploy-os-api.yml`'s secret step.
4. Push (the same push deploys it). Use it: `kimi --model=<name>` in the
   browser, or `agent <name>` in the shell.

No image rebuild logic, no frontend change, no new harness code.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `kimi` says "backend not reachable" | deploy-os-api.yml hasn't run green — check its latest run |
| deploy step fails at `wrangler deploy` | Cloudflare Containers not enabled on the account (human step 1) |
| Health-check step times out | Custom-domain cert still provisioning (re-run), or the deploy log doesn't bind `os-api.minomobi.com (custom domain)` — golden rule |
| WS closes with 503 | `ALLOWED_DIDS` unset — GH variable `OS_ALLOWED_DIDS` missing (workflow warned) |
| WS closes with 403 | Logged-in DID not on `ALLOWED_DIDS` |
| `agent kimi3` → "no key configured" | GH secret `MOONSHOT_API_KEY` missing (workflow warned) |
| Agent starts, model errors | `KIMI_MODEL` id wrong/stale — check Moonshot docs |
| Agent can't `git push` | GH secret `OS_AGENT_GITHUB_TOKEN` missing/expired |
| Workspace empty after wake | R2 bucket step failed, or `CAP_SIGNING_KEY` missing (sync disabled) |
