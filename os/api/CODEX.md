# Codex as a third harness — the technical difficulties

Research record, 2026-09-15. Tested against `@openai/codex` **0.154.0** (linux
x64, static musl binary) in the agent sandbox. Nothing here has run inside a
Cloudflare Container yet; §6 is the list of things that can only be settled
there.

**Short version.** Device-code auth is real and it does solve the "no browser in
the container" problem — but that was never the hard part. Three things are:

1. A ChatGPT login is a **rotating single-use** credential, and this backend
   tars `$HOME` and restores it into a fresh container on every wake. Snapshot
   and rotation are incompatible by construction (D3).
2. Measured per-endpoint, the **only** step blocked from datacenter egress is
   *starting* a device login. Token refresh and subscription inference both
   answer normally (D1) — so the fragile step is acquiring a credential in the
   container, not using one there. That inverts the obvious design.
3. Codex dropped the Chat Completions wire format, so it cannot drive `kimi3`
   or `ds4-*` at all without a translating shim (D6).

Putting the principal in the auth flow does dissolve (1), and §5 works through
where they have to stand for it to also survive (2).

---

## 1. What device auth actually is, and where it stands

`codex login --device-auth` prints a `chatgpt.com` URL and a short code; you
approve the code from any browser on any device; the CLI polls and writes
tokens to `$CODEX_HOME/auth.json`. The flag is **present but undocumented** in
0.154.0 — `codex login --help` lists it with an empty description, which is how
the CLI marks beta surface:

```
      --device-auth
          
```

Two adjacent paths exist in the same binary and matter for us:

| path | command | what it authenticates as |
|---|---|---|
| ChatGPT OAuth (browser) | `codex login` | your ChatGPT plan |
| ChatGPT OAuth (device) | `codex login --device-auth` | your ChatGPT plan |
| Platform API key | `printenv OPENAI_API_KEY \| codex login --with-api-key` | a billed API key |
| Workspace access token | `printenv CODEX_ACCESS_TOKEN \| codex login --with-access-token` | a ChatGPT workspace, non-interactively (Enterprise-gated) |
| **no OpenAI auth at all** | a `[model_providers.*]` entry with `env_key` | whatever key that env var holds |

That last row is the one this repo actually cares about, and it is verified
working — see §3.

---

## 2. The difficulties, in the order they will bite

### D1 — exactly one step of the login is bot-challenged: starting the device flow

This is the finding I did not expect, and it is narrower and more actionable
than "OpenAI blocks datacenters". Measured per-endpoint from this sandbox's
egress, reproducible across attempts and independent of User-Agent:

| endpoint | result | meaning |
|---|---|---|
| `POST auth.openai.com/oauth/device/code` | **403 Cloudflare challenge** | **starting a device login fails** |
| `POST auth.openai.com/oauth/token` (refresh grant) | 401 JSON, *"Could not validate your token"* | **refresh works** — it processed the request and rejected the fake token |
| `POST chatgpt.com/backend-api/codex/responses` | 401 JSON `{"detail":"Unauthorized"}` | **subscription inference works** |
| `GET auth.openai.com/`, `chatgpt.com/`, `/backend-api/me` | 403 Cloudflare challenge | browser-facing HTML pages |
| `api.openai.com`, `api.moonshot.ai`, `api.anthropic.com` | 401 | clean |

So it is **not** the case that the ChatGPT plane is unreachable. The
machine-to-machine endpoints — token refresh, and the Responses endpoint that a
subscription cell actually runs on — both answer normally. The single blocked
step is the one that *initiates* an interactive login, which is exactly where a
bot check belongs and exactly what `codex login --device-auth` calls first.
That is why it logged `starting device code login flow`, printed nothing, and
hung until killed: the failure is silent, with no error, no code and no timeout
message, so **a user watching the os.mino.mobi terminal would see a hung command
with no diagnosis**.

The consequence for design is the important part, and it inverts the obvious
plan: *getting* a credential inside the container is the fragile step, while
*using and refreshing* one there is fine. A token minted where a real browser
lives — the principal's own machine — then refreshed and spent from the
container, only touches endpoints that work.

Caveat, stated plainly: this is the sandbox's proxy egress, not Cloudflare
Containers. The per-endpoint *pattern* is likely to hold (it tracks which
endpoints are browser-facing, not which IP asked), but the specific verdict for
device-code initiation must be confirmed from a container shell — test #1 in §6.

### D2 — device auth is off until someone flips an account setting

Even with clean egress, the flow fails until **Profile → Settings → Security →
Device code authorization** is enabled on the ChatGPT account. On a managed
workspace (Team/Enterprise/Edu) the toggle is admin-owned and may be absent
entirely for a normal member — this is [openai/codex#9253](https://github.com/openai/codex/issues/9253),
closed with no maintainer response. The error, when it appears at all, points at
a workspace admin rather than at anything in the container.

For a personal Plus/Pro account this is a one-time human step, same class as the
existing "enable Cloudflare Containers on the account" prereq in
[`../RUNBOOK.md`](../RUNBOOK.md). It belongs there, not in code.

### D3 — a ChatGPT login is a rotating credential; this backend restores snapshots

This is the deepest architectural conflict and it is not fixable by configuration.

`auth.json` holds a **single-use refresh token with rotation and reuse
detection**. Codex refreshes when the access-token JWT is within ~5 min of
expiry, or when `last_refresh` is older than ~8 days, or on any 401. Each
refresh mints a new refresh token and *burns the old one*. Present a burned
token and OpenAI does not just reject that request — it invalidates the whole
rotation family (`refresh_token_reused`), which forces a full re-login. This is
well documented in the wild for people running Codex CLI and the VS Code
extension side by side on one account.

Now hold that against how `os-api` persists state:

- `container/server.js` tars `$HOME` every 2 minutes and PUTs it to the DO.
- `container/startup.sh` untars that snapshot into a **fresh** container on wake.
- `wrangler.toml` sets `max_instances = 3`.
- The container sleeps after 10 min idle, so restore-from-snapshot is the
  *normal* path, not an edge case.

A snapshot of a rotating single-use credential is a **poisoned credential**.
Concretely: container wakes, restores `auth.json` from a 2-minute-old tarball,
refreshes, saves. Fine. But the moment two instances are awake, or a restore
happens from a snapshot taken *before* the last refresh, the older token is
replayed and the account is logged out — of every device, including the human's
own laptop. OpenAI's own CI/CD guidance says it in as many words: *"Use one
`auth.json` per runner or serialized workflow stream. Do not share the same file
across concurrent jobs or multiple machines."* Our DO hands the same restored
home directory to whichever instance wakes.

And OpenAI's recommendation, verbatim, about exactly this situation: *"The right
way to authenticate automation is with an API key. Use this guide only if you
specifically need to run the workflow as your Codex account."*

### D4 — persisting the login would break a security rule this codebase already keeps

`~/.codex` is not in the sync tar today:

```js
' workspace .claude .bashrc .gitconfig' +
```

So as things stand a device-code login dies at the first 10-minute idle sleep and
the user re-authenticates every session. Adding `.codex` to that list fixes the
UX and creates a worse problem: **OpenAI account tokens would be written into
the ContainerShell DO's SQLite storage, and into any workspace tarball anyone
can `cat` out of the container.**

That is precisely the failure `agent.sh` already goes out of its way to avoid
for the OpenCode path, with the reasoning written in the file:

> The key goes in the environment, and the config REFERENCES it as
> `{env:OPENCODE_CELL_KEY}` — so the secret is not written to disk where a later
> `cat` of the workspace tarball would carry it off-container.

A ChatGPT refresh token is strictly worse than a provider API key here: a
provider key is rotatable and scoped to spend, whereas the refresh token is
account-level and (per D3) burning it logs the human out everywhere. Codex does
offer `cli_auth_credentials_store = "ephemeral"` (memory only) and `"keyring"` —
`ephemeral` is the honest choice for this container and it means *re-auth every
wake*, which is a real UX cost, not a workaround.

### D5 — `CODEX_HOME` is eight live SQLite databases, and we tar it every 2 minutes

After one `codex exec` run, `$CODEX_HOME` contains:

```
goals_1.sqlite    logs_2.sqlite     memories_1.sqlite   queue_1.sqlite
state_5.sqlite    thread_history_1.sqlite      (each with -wal and -shm)
sessions/  shell_snapshots/  skills/  installation_id  models_cache.json
```

Claude Code's `.claude` is JSON and JSONL, so tarring it live is merely racy.
Tarring a set of **WAL-mode SQLite databases** while Codex is mid-write captures
a torn `.sqlite` against a mismatched `-wal`, and the restore is a corrupt
database rather than a stale one. If `.codex` joins the sync list it needs
either a quiesce-before-tar step or a `VACUUM INTO`-style snapshot, not a
straight `tar czf`.

It also grows: `thread_history`, `memories` and `logs` are append-heavy, and the
tarball already has to fit in chunked DO storage.

### D6 — Codex can no longer speak Chat Completions, which is what our open models speak

Verified, and it contradicts the current published docs:

```
$ codex exec ...
Error loading config.toml: `wire_api = "chat"` is no longer supported.
How to fix: set `wire_api = "responses"` in your provider config.
More info: https://github.com/openai/codex/discussions/7782
```

`wire_api = "chat"` was deprecated 2025-12-09 and removed by 2026-02. Codex now
speaks **only** the Responses API. The verified request it emits is:

```
POST <base_url>/responses
Authorization: Bearer <env_key value>
body keys: model, instructions, input, tools, tool_choice,
           parallel_tool_calls, reasoning, store, stream, include,
           prompt_cache_key, client_metadata
```

Our `AGENT_PROFILES` carry `oaiBase` = `https://api.moonshot.ai/v1` and
`https://api.deepseek.com/v1` — **Chat Completions** endpoints, which is what
OpenCode consumes. Neither serves `/responses`. So:

> **Codex cannot drive `kimi3`, `ds4-flash` or `ds4-pro` directly.** The cell
> matrix does not simply gain a column.

Closing that gap needs a Responses→Chat-Completions translating shim between the
container and the provider. There is no official one; the community options
(LiteLLM-based bridges, `VibeAround`, forks that keep the chat wire) are
third-party and unaudited. For this repo a shim is not a small dependency —
it sits in the request path holding provider keys, and its fidelity *is* the
experiment: a bake-off across harnesses is only meaningful if the harness is the
variable, and an imperfect translation layer silently becomes a second variable.

### D7 — sandbox nesting

Codex sandboxes model-run commands itself (Landlock/seccomp on Linux). Inside a
container that usually cannot create the namespaces it wants, and the documented
pattern is `sandbox_mode = "danger-full-access"` + `approval_policy = "never"`,
treating the container as the boundary.

For us that boundary is doing more work than usual: `INJECT_SHARED_CREDS=true`
means the shell holds a real `GITHUB_TOKEN` and `CLOUDFLARE_API_TOKEN`. Claude
Code and OpenCode already run there under the same terms, so Codex adds no *new*
class of exposure — but "the container is the security boundary" is now load-
bearing for a third agent loop, and `ALLOWED_DIDS` staying exactly one DID is
what holds it up. The hard rule in `wrangler.toml` (flip `INJECT_SHARED_CREDS`
to false before a second DID) applies unchanged.

### D8 — plan terms and shared rate limits

A ChatGPT-subscription cell spends the human's own plan quota, and the container
is a second concurrent consumer of it alongside their laptop and IDE. Sharing one
ChatGPT account across machines/users is against OpenAI's terms; owner-only
(`ALLOWED_DIDS` = one DID) keeps this on the right side of that line, and it is
another reason `INJECT_SHARED_CREDS`/`ALLOWED_DIDS` must not quietly grow.

A platform **API key** has none of this problem: it is metered, rotatable, and
designed for automation.

### D9 — image size

`npm i @openai/codex@0.154.0` pulls **324 MB**: a 251 MB `codex` binary plus a
67 MB `codex-code-mode-host`, statically linked musl. That lands on every
`os-api` deploy's image build. Not disqualifying — worth knowing before the first
build times out.

### D10 — Codex phones home even on a custom provider

With a fully custom provider and no OpenAI credential, startup still opens
`https://chatgpt.com/` (the `list_models` / models-cache refresh) before any
provider call, and it ships OpenTelemetry. Per D1 the browser-facing paths on
that host are challenged while the `backend-api` ones are not, so whether this
call succeeds depends on which path it lands on; in my run it did not block the
session either way. It is startup latency and noise on every boot, and a
dependency on a host we otherwise would not need.

### D11 — `CODEX_HOME` must not be under a temp dir

```
WARNING: proceeding, even though we could not create PATH aliases:
Refusing to create helper binaries under temporary dir "/tmp"
```

Per-cell Codex homes must live under `/home/coder` — the same shape as the
existing `~/.opencode-cells/<profile>` isolation, not `/tmp`.

---

## 3. What is verified working, with no OpenAI account involved

Worth stating clearly because it is the foundation of the cheap path. Pointing
`config.toml` at a local fake provider, with **no** `OPENAI_API_KEY`, no
`CODEX_API_KEY` and no `auth.json`:

```toml
model_provider = "cell"
model = "deepseek-v4-flash"
approval_policy = "never"
sandbox_mode = "danger-full-access"

[model_providers.cell]
name = "mino cell"
base_url = "http://127.0.0.1:8899/v1"
env_key = "CELL_KEY"
wire_api = "responses"
```

Codex started the session and sent `Authorization: Bearer sk-test-12345` to
`POST /v1/responses`. Its own telemetry line confirms the credential situation:

```
auth.env_openai_api_key_present=false
auth.env_codex_api_key_present=false
auth.env_provider_key_present=true
```

So the harness needs **no ChatGPT login whatsoever** to be useful — the entire
device-auth question is only about getting the *native GPT-5.x-codex models* on
a subscription. The `env_key` indirection is also exactly the property
`run_opencode` relies on: the key stays in the environment and never lands in a
config file on disk.

---

## 4. Where the code would change

For reference when this gets built — all four are small:

| file | change |
|---|---|
| `container/Dockerfile` | `@openai/codex` in the global npm install (+324 MB) |
| `container/agent.sh` | one `run_codex()` + `codex` in the harness list; per-cell `CODEX_HOME=$HOME/.codex-cells/<profile>` writing a `config.toml`, mirroring `run_opencode` |
| `src/index.js` | `AGENT_HARNESSES: 'claude,opencode,codex'`; a `respBase` field on profiles that have a Responses endpoint |
| `container/server.js` | duck-type Codex's `--json` JSONL events (`thread.started`, `turn.*`, `item.*`) into the Claude Code shapes the browser renders — same treatment OpenCode already gets |

`codex exec --json` emits newline-delimited JSON with a documented-ish event
vocabulary, so the chat path is no harder than OpenCode's was.

---

## 5. Putting the human in the auth flow

The stated goal is the ChatGPT-subscription models, under Codex, on Cloudflare.
Involving the principal in the login is the right instinct — it dissolves most
of D3 — but D1 decides *where* they have to be involved, and the answer is not
the obvious one.

**Why human-in-the-loop helps at all.** The rotation hazard (D3) is not "the
token rotates", it is "an *old copy* gets replayed". Rotation is only dangerous
where a credential is duplicated: a tarball snapshot, two awake instances, a
secret store rewritten from the original each run. If exactly one live copy
exists and it dies with the container, rotation is a non-event. So any design
where the credential is never snapshotted is already most of the way there —
and note that `~/.codex` being absent from the sync tar today (D4) is, by
accident, the correct behaviour.

### Design A — device login inside the container, each wake

The user is already in a browser, on a PTY, with the terminal in front of them.
They run `codex login --device-auth`, approve the code on their phone, work,
and the credential dies with the container. No snapshot, no replay, one holder
ever. Almost no code: leave `.codex` out of the tar and it is done.

Two verified constraints:

- **It must use the `file` store, not `ephemeral`.** I tested both: with
  `cli_auth_credentials_store = "ephemeral"` a login reports *"Successfully
  logged in"* and the very next process reports *"Not logged in"*, with no
  `auth.json` on disk. Ephemeral is per-process — fine for a single long-lived
  app-server, useless when `codex login` and `codex` are separate commands in a
  shell. `file` plus an ephemeral container disk gets the same property with the
  process boundary respected.
- **It is the design D1 threatens.** Initiating a device flow is the one step
  measured as blocked. If that holds inside Containers, Design A is dead on
  arrival however elegant it is.

Its real cost even when it works: the container sleeps after 10 minutes idle, so
"each wake" means re-authenticating every time you come back from a coffee. That
is a tax on the principal, not on the machine.

### Design B — mint on the laptop, refresh from the Durable Object

This is the design D1's per-endpoint result actually points at. The principal
logs in **where a real browser already lives** — their own machine, `codex
login` — which is the only step that needs to pass a bot check. The resulting
credential goes into the DO once. Thereafter the DO refreshes it and hands each
container session a short-lived token; the container never holds the refresh
token and never writes it anywhere that syncs.

The reason this is more than a workaround: **a Durable Object is single-threaded
by construction**, so OpenAI's requirement — one holder, serialized, never
concurrent — stops being a discipline we have to maintain and becomes a property
of the runtime. The DO is genuinely the right primitive for custody of a
rotating single-use token, in a way a GitHub secret or a tarball never is.

And the endpoints it depends on are the ones that work: refresh answered 401-
with-JSON on a fake token, and `chatgpt.com/backend-api/codex/responses`
answered 401-with-JSON, both from this datacenter egress.

**The gap, stated honestly: Codex has no supported way to accept a
brokered ChatGPT token.** I checked the obvious candidates:

- `codex login --with-access-token` wants an *agent identity JWT* — feeding it
  anything else gives `Error logging in with access token: invalid agent
  identity JWT format`. That is the Enterprise access-token path, not a way to
  pass a ChatGPT OAuth token.
- The binary does carry an external-auth path (`app-server/src/external_auth.rs`,
  a `has_external_auth` flag, the string *"externally provided auth is never
  loaded from auth storage"*) and override hooks
  (`CODEX_REFRESH_TOKEN_URL_OVERRIDE`, `CODEX_AUTHAPI_BASE_URL`), but none of it
  is documented and the published app-server protocol exposes no host-supplied
  auth method. Building on it means building on private surface.
- So today Design B means the DO writes `auth.json` into the container at
  session start — which is literally OpenAI's own CI/CD recipe with the DO as
  the secret store, including its two rules: **one holder at a time**
  (so `max_instances = 1` for this path) and **write the rotated file back**
  (if the container dies without writing back, the DO's copy is burned and the
  next session poisons the family). The write-back is the part that has to be
  engineered carefully, not bolted on.

### What I would actually do

1. **`--harness=codex` on a platform API key first.** One worker secret, one
   `AGENT_PROFILES` entry, `env_key` indirection exactly as OpenCode does it.
   No login, no custody, no shim, nothing on disk. It proves the harness, the
   `server.js` event normalisation and the UI wiring against a real OpenAI
   model, so that when subscription auth lands it is *only* auth that is new.
   Everything in §2 except D7/D9/D10/D11 drops away.
2. **Run test #1** (§6) from a container shell. It is one `curl`, it costs
   nothing, and it decides between Design A and Design B.
3. **Then the subscription cell**, shaped by that answer — A if device-code
   initiation passes from Containers, B if it does not.

Design B is the one I would bet on, on the current evidence.

The open models under Codex (D6, needing the Responses↔Chat shim) stay a
separate piece of work with its own fidelity test — a lossy shim quietly
corrupts every bake-off comparison that uses it, so it should not ride along
with the auth work.

---

## 6. What can only be answered from inside the container

1. **Is device-code *initiation* challenged from Containers egress?** The single
   question that chooses between Design A and Design B. Needs no Codex install
   at all — one `curl` from any container shell:

   ```bash
   curl -sS -o /dev/null -w 'device/code -> %{http_code}\n' -X POST \
     https://auth.openai.com/oauth/device/code \
     -H 'Content-Type: application/x-www-form-urlencoded' \
     -d 'client_id=app_EMoamEEZ73f0CkXaXp7hrann&scope=openid+profile+email+offline_access'
   ```

   A JSON body (even an error) means Design A is live. A `403` with
   `Just a moment...` means it is not, and Design B is the path.
2. Confirm the other two planes still answer from Containers as they do here —
   `POST /oauth/token` and `POST chatgpt.com/backend-api/codex/responses` should
   both give JSON 401s. Design B depends on both.
3. Does `codex login --device-auth` print its code on the xterm PTY (it needs a
   TTY; the browser terminal is one, `codex exec` is not)? Only matters if 1
   passes.
4. Does the device-auth toggle exist on the account in question (D2), and does
   the approved login actually land tokens?
5. Does Containers' egress intercept HTTPS? If so the container must trust
   `/etc/cloudflare/certs/cloudflare-containers-ca.crt` — Codex honours
   `CODEX_CA_CERTIFICATE` (and `SSL_CERT_FILE`), so this is configuration rather
   than a blocker, but it fails confusingly if missed.
6. Image build time and cold-start after +324 MB.
7. Whether the models-cache call to `chatgpt.com` (D10) adds meaningful latency
   or errors noisily on every boot.

Tests 1 and 2 need nothing built and nothing installed — just a shell in the
existing container. That is the cheapest possible next step, and it is worth
doing before any code is written, because it picks the architecture.
