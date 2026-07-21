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

## Go-live: the 2 human steps (everything else is automated)

**No R2.** Run #1 proved R2 needs its own account enablement (CF error `10042`,
not available on this plan), so workspace persistence moved into the
ContainerShell Durable Object's SQLite storage — already required for the
container to exist, no extra entitlement. The only things the workflow cannot
do itself:

1. **Enable Cloudflare Containers** on the account (dashboard → Workers &
   Pages; included with the $5 Workers paid plan — if it's not visible in the
   sidebar, look under Workers & Pages → your worker → Settings, or the
   account's Billing → subscriptions; availability varies by account age).
   The `wrangler deploy` step is the definitive probe — its error names the
   gap if the entitlement is missing.
2. **Add GitHub Actions SECRETS** (repo Settings → Secrets and variables →
   Actions → Secrets):
   - `MOONSHOT_API_KEY` — ✅ already added.
   - `OS_AGENT_GITHUB_TOKEN` — fine-grained PAT limited to
     `minormobius/agent01`, Contents read/write + Workflows read/write. Its
     pushes DO trigger Actions (unlike the Actions-internal `GITHUB_TOKEN`),
     which is exactly what we want.

**Identity is committed config**: `ALLOWED_DIDS` in `os/api/wrangler.toml` is
the **morphyx service account** (`morphyxmino.bsky.social`,
`did:plc:yivyyp54vddf7qf2lpsikhe4`).

**Login is an HTML overlay** (no xterm typing — mobile paste, password
managers, and typeahead all work): handle field with Bluesky typeahead →
**Continue with Bluesky** runs OAuth through the shared `auth.mino.mobi`
worker (`packages/oauth-client/auth.js`; the `.mino.mobi` SSO cookie means a
session from any mino.mobi site is picked up with zero typing). First-ever
OAuth login shows Bluesky's consent screen once. The overlay's app-password
fallback remains the **power mode** — OAuth sessions read everything but can
only *write* collections inside the granted scope (writes route through the
auth worker's `/pds/*` proxy); arbitrary-collection writes need app-password.
The `kimi` container verifies OAuth sessions server-side via
`auth.mino.mobi/api/me` (scores-worker pattern); a cookie-only SSO session
triggers one OAuth bounce on first `kimi` to mint this origin its own token.

Then **push anything touching `os/api/**`** (or dispatch *Deploy os-api* from
the Actions tab). The workflow: deploys (custom-domain route binds
`os-api.minomobi.com`; golden rule verified by the health-check step) →
generates `CAP_SIGNING_KEY` once → syncs `MOONSHOT_API_KEY` / `GITHUB_TOKEN`
from GitHub → polls `/health` until green.

Also check `KIMI_MODEL` in `os/api/wrangler.toml` — it's a placeholder
(`kimi-k3`); set it to the current id from Moonshot's docs. Mainland accounts:
switch `KIMI_BASE_URL` to `https://api.moonshot.cn/anthropic`.

**Smoke test**: os.mino.mobi → sign in (OAuth overlay) → you land in the
**chat view** (the default surface): type a message and the agent answers from
inside your container (first message cold-starts it — up to ~30s, the header
says so). Ask it to `work hello-kimi`, make a change, commit and push — the
push shows up on GitHub and Actions run. The `>_ terminal` button opens the
power surface (full PDS shell; `kimi` there gives the raw Claude Code TUI over
a PTY). Chat transport: os-api `/chat` → container headless run
(`agent kimi3 -p --output-format stream-json --resume <sid>`,
--dangerously-skip-permissions — single-tenant container, scoped PAT).

## What syncs from where (secret/config map)

| Worker config | Source | When |
|---|---|---|
| `CAP_SIGNING_KEY` | generated on the runner (`openssl rand -hex 32`) | first run only — never auto-rotated (would kill live capability tokens) |
| `MOONSHOT_API_KEY` | GH secret `MOONSHOT_API_KEY` | every run (GitHub is source of truth — rotate there) |
| `GITHUB_TOKEN` (worker) | GH secret `OS_AGENT_GITHUB_TOKEN` | every run |
| `ALLOWED_DIDS`, `KIMI_BASE_URL`, `KIMI_MODEL`, `INJECT_SHARED_CREDS` | committed `[vars]` in `wrangler.toml` | every deploy |
| Workspace store | ContainerShell DO SQLite storage (chunked tarballs, 64MB cap) | nothing to provision |
| `os-api.minomobi.com` | `custom_domain` route in `wrangler.toml` | every deploy (golden rule) |

## Day-2 notes

- **Feature-branch model**: the agent's helper `work <slug>` creates/resumes
  `kimi/<slug>` from `origin/main`. No deploy workflow matches `kimi/*`, so the
  agent **cannot ship to prod** — a human promotes work by merging or adding the
  branch to a `deploy-*.yml` trigger (registry rules apply). That's the safety
  line; keep it.
- **Persistence**: workspace + `~/.claude` tarball into the per-DID DO's
  SQLite storage every 2 min and on container sleep (10 min idle). Cold start
  restores it. Capped at 64MB compressed (node_modules etc. excluded).
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
| deploy step fails at `wrangler deploy` | Cloudflare Containers not available on the account (human step 1) — the error message is the diagnosis |
| Health-check step times out | Custom-domain cert still provisioning (re-run), or the deploy log doesn't bind `os-api.minomobi.com (custom domain)` — golden rule |
| WS closes with 503 | `ALLOWED_DIDS` empty in wrangler.toml [vars] |
| WS closes with 403 | Logged-in DID not on `ALLOWED_DIDS` — log in as morphyx |
| `agent kimi3` → "no key configured" | GH secret `MOONSHOT_API_KEY` missing (workflow warned) |
| Agent starts, model errors | `KIMI_MODEL` id wrong/stale — check Moonshot docs |
| Agent can't `git push` | GH secret `OS_AGENT_GITHUB_TOKEN` missing/expired |
| Workspace empty after wake | `CAP_SIGNING_KEY` missing (sync disabled), or tarball exceeded the 64MB cap (413 in container logs) |
