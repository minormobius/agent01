# Codex as a third harness — the technical difficulties

Research record, 2026-09-15. Tested against `@openai/codex` **0.154.0** (linux
x64, static musl binary) in the agent sandbox. Nothing here has run inside a
Cloudflare Container yet; §6 is the list of things that can only be settled
there.

**Short version.** Device-code auth is real and it does solve the "no browser in
the container" problem — but that was never the hard part. The hard parts are
(a) Codex dropped the Chat Completions wire format, which is what `kimi3` and
`ds4-*` speak, and (b) a ChatGPT login is a *rotating single-use* credential,
which collides head-on with this backend's snapshot-and-restore persistence
model. There is a cheap version of this feature that avoids both, and an
expensive one that has to solve both. They are described in §5.

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

### D1 — the ChatGPT auth plane is bot-challenged from datacenter egress

This is the finding I did not expect and the one that most threatens the
device-auth plan.

From this sandbox's egress:

```
auth.openai.com  -> 403   (Cloudflare "Just a moment..." managed challenge)
chatgpt.com      -> 403   (same)
api.openai.com   -> 401   (clean — reachable, just unauthenticated)
api.moonshot.ai  -> 401
api.anthropic.com-> 401
```

So the *API plane* is fine and the *consumer account plane* is behind a managed
challenge that a non-browser client from a datacenter IP cannot pass. And this
is exactly what `codex login --device-auth` does here: it logs
`starting device code login flow`, prints nothing, and hangs until killed. The
failure is silent — no error, no code, no timeout message. That matches the
"the failure is silent and the cause is far away from the terminal" complaint in
the community writeups, and it means **a user staring at the os.mino.mobi
terminal would see a hung command with no diagnosis**.

Caveat, stated plainly: I cannot tell from here whether the 403 is this
sandbox's proxy egress reputation or datacenter IPs generally. Cloudflare
Containers egress from Cloudflare's own network, which may be treated
differently — better or worse. **This is test #1 in §6 and it is a go/no-go for
the whole ChatGPT-subscription cell.** If `auth.openai.com` is challenged from
the container, device auth is not available to us at any price and only the
API-key path remains.

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
provider call, and it ships OpenTelemetry. On an egress where `chatgpt.com` is
403-challenged (D1) that request fails; in my run it did not block the session,
but it is startup latency and noise on every boot, and it is a dependency on a
host we otherwise would not need.

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

## 5. Recommendation

Split it, because the two halves have completely different risk.

**Phase 1 — `--harness=codex` on an OpenAI platform API key.** One new worker
secret (`OPENAI_API_KEY`), one `AGENT_PROFILES` entry with a `respBase` of
`https://api.openai.com/v1`, `env_key` indirection exactly as OpenCode does it.
No device auth, no token custody, no shim, no rotation hazard, nothing written
to disk. It gets a real third harness and a real OpenAI cell into the matrix,
and it is the configuration OpenAI itself recommends for automation. Everything
in §2 except D7/D9/D10/D11 simply does not apply.

**Phase 2a — the open models under Codex.** Needs the Responses↔Chat shim (D6).
I would treat this as its own piece of work with its own fidelity test, not as a
footnote to phase 1, because a lossy shim quietly corrupts every bake-off
comparison that uses it.

**Phase 2b — the ChatGPT-subscription cell via device auth.** Only worth doing
after test #1 in §6 says the container can reach `auth.openai.com` at all. Even
then it should be `cli_auth_credentials_store = "ephemeral"` with re-auth on
each wake, single-instance, and explicitly *not* persisted into the workspace
tarball — because D3 and D4 together mean the persistent version trades "log in
once" for "risk logging the principal out of ChatGPT everywhere, from a stale
snapshot, with no obvious cause".

That is the honest trade, and it is why I would not lead with device auth even
though it is the thing that newly became possible.

---

## 6. What can only be answered from inside the container

1. **Does `auth.openai.com` answer a non-browser POST from Cloudflare Containers
   egress, or is it 403-challenged as it is here?** Go/no-go for 2b.
   `curl -sS -o /dev/null -w '%{http_code}' https://auth.openai.com/` from a
   container shell settles it in one line.
2. Does `codex login --device-auth` print its code on the xterm PTY (it needs a
   TTY; the browser terminal is one, `codex exec` is not)?
3. Does the device-auth toggle exist on the account in question (D2), and does
   the approved login actually land tokens?
4. Image build time and cold-start after +324 MB.
5. Whether `chatgpt.com`'s models-cache call (D10) adds meaningful latency or
   errors noisily on every boot behind a challenged egress.

Tests 1 and 2 need nothing built — they need `@openai/codex` in the image and a
shell. That is the cheapest next commit if you want the device-auth question
answered before committing to phase 1.
