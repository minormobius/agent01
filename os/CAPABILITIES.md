# mino OS (`os/`) — Capabilities & Architecture

**Canonical overview.** What `os/` is, what it can do today, how it's wired, and
where it's going. This is the map; the two deep-dives below are the territory.

| Doc | Role |
|-----|------|
| **`CAPABILITIES.md`** (this) | Vision, capability matrix, architecture-at-a-glance, deployment state, roadmap. Start here. |
| **`DESIGN.md`** | Feature/how-it-works reference — every shell command, the CAR parser, DuckDB integration, container internals. |
| **`api/SECURITY.md`** | Trust model — why no secret is safe in the container, the capability-token primitive, the per-tenant credential plan. |
| **`RUNBOOK.md`** | Go-live checklist for the container backend + the Kimi agent platform (owner steps, adding more open models, troubleshooting). |

---

## What this is

An **ATProto-native browser workspace**: a terminal (`os.mino.mobi`) that treats
your Personal Data Server as a filesystem, layers SQL analytics over your whole
repo, and — for trusted users — drops you into a **real cloud shell with Claude
Code** that operates on your behalf. The repo *is* the backend; Cloudflare is
glue. The product thesis: your identity (a DID + PDS session) is the only account
you need — every capability hangs off that one verified identity.

It runs in **three planes**:

```
┌── BROWSER (untrusted for secrets) ─────────────────────────────────────┐
│  xterm.js terminal                                                      │
│   • PDS shell:  ls cd cat echo edit rm find du blob curl whoami         │  ← direct XRPC to YOUR PDS
│   • Analytics:  sync → CAR → Rust/WASM parse → DuckDB-Wasm → sql        │  ← all client-side, no backend
│   • AI:         ai <prompt>  (Gemini, browser-side)                     │
│   • container:  opens a WebSocket to plane 2 ───────────────┐           │
└─────────────────────────────────────────────────────────────┼──────────┘
                            │ HTTPS (XRPC)                      │ WSS (?session=did&auth=jwt)
                            ▼                                   ▼
                  ┌── YOUR PDS ──────┐         ┌── CONTROL PLANE: Worker os-mino-api ──────────┐
                  │ bsky.social /    │         │ TRUSTED. Holds all secrets.                   │
                  │ self-hosted /    │         │  • /ws    identity gate (verify DID↔PDS)      │
                  │ did:web          │         │  • /sync  R2 workspace persist (cap-token'd)   │
                  └──────────────────┘         │  • mints per-instance CAP_TOKEN (HMAC{did,exp})│
                                               │  • ContainerShell DO — one per DID             │
                                               └───────────────────────┬───────────────────────┘
                                                                        ▼
                                               ┌── CONTAINER (untrusted; user has root shell) ─┐
                                               │ Docker: bash · node 22 · python3 · uv · git    │
                                               │ Claude Code + GitHub MCP server · PTY server   │
                                               │ Workspace on ephemeral disk, R2-synced (2-min) │
                                               │ Sleeps after 10m idle; wakes ~2-3s on reconnect│
                                               │ Holds ONLY a did-scoped CAP_TOKEN — no secrets │
                                               └────────────────────────────────────────────────┘
```

---

## Capability matrix

Legend: ✅ live · 🚧 built, not yet deployed · 📋 planned

### Identity & auth
| Capability | Where | Status | Notes |
|---|---|---|---|
| ATProto app-password login | browser → PDS | ✅ | `auth/oauth.js`: handle→DID→PDS, `createSession`. Phase-2 OAuth (PKCE+DPoP) is stubbed. |
| Google OAuth (for Gemini) | browser | ✅ | `auth/google.js`: popup, implicit grant, scope `generative-language`. Powers the `ai` command with no API key. |
| Anthropic key for container | browser localStorage | ✅ | `set-key` / `container --api-key=`. Used by Claude Code in the shell. |
| Container access allowlist | worker | ✅ | `ALLOWED_DIDS`, **fail-closed**. Identity is *verified* (DID→canonical PDS→`getSession`), never trusted from the client. |

### Browser PDS shell (no backend — direct XRPC)
| Capability | Status | Notes |
|---|---|---|
| Repo-as-filesystem: `ls cd cat echo edit rm find du whoami` | ✅ | Each maps to an XRPC call against the user's PDS. `echo '{}' > path` / `edit` write records. |
| `blob ls/get/push` | ✅ | Blob management via `com.atproto.sync` / `repo.uploadBlob`. |
| `curl <nsid>` | ✅ | Raw XRPC escape hatch. |
| `find -text "term"` | ✅ | Full-text walk across all collections. |

### Data / analytics (client-side, zero backend)
| Capability | Status | Notes |
|---|---|---|
| `sync` — full repo → CAR → records | ✅ | `com.atproto.sync.getRepo` → **Rust/WASM** CAR v1 + DAG-CBOR + CID + MST parser (`crates/car-parser`, ~116KB) → NDJSON. |
| `sync --stats` | ✅ | Collection counts without full ingest. |
| `sql <query>` | ✅ | **DuckDB-Wasm** over the synced `records` table. JSON extraction, aggregation, the works. |
| `ai <prompt>` | ✅ | Gemini, browser-side (`lib/gemini.js`). |

### Container shell (plane 2+3)
| Capability | Status | Notes |
|---|---|---|
| Real bash PTY over WebSocket | 🚧 | Code complete (`api/`, PTY server in `container/`). Backend deploy is dispatch-only — go-live steps in `RUNBOOK.md`. |
| **Open-model agent profiles (`agent <profile>`, `kimi`)** | 🚧 | Claude Code CLI is the harness for ANY Anthropic-compatible endpoint. Worker injects `AGENT_PROFILES` ({base, model, key}); `agent kimi3` = Kimi via Moonshot, `kimi` in the browser boots straight into it (`?boot=` param). One profile per open model — no new harness code. |
| Per-DID persistent workspace | 🚧 | R2 tarball restore on start + 2-min autosave; survives 10-min idle sleep. |
| Toolchain: git · node 22 · python3 · **uv** · claude-code | 🚧 | `container/Dockerfile`. uv added for fast Python installs (HTTPS, egress-safe). |
| agent01 clone + `kimi/*` feature branches | 🚧 | `startup.sh` clones the repo; `work <slug>` starts `kimi/<slug>` off `origin/main`. Pushes (via the injected fine-grained PAT) fire GitHub Actions, but no deploy glob matches `kimi/*` — humans promote work. |
| GitHub MCP server | 🚧 | Installed in image; usable once backend is live + a git credential path exists (roadmap §4). |

### Control plane / security primitives
| Capability | Status | Notes |
|---|---|---|
| Per-instance capability token | ✅ | HMAC-signed `{did, exp}`, signing key worker-only. The primitive every privileged op hangs off. |
| `/sync` DID-scoping | ✅ | A container can touch only its own R2 workspace (`id === cap.did`). |
| Shared-cred tenancy switch | ✅ | `INJECT_SHARED_CREDS` gates `GITHUB_TOKEN`/`CLOUDFLARE_API_TOKEN`. Default off. |
| PDS proxy (`/pds/*`) + in-container MCP | 📋 | The differentiated win — agent operates on the user's own PDS without the token entering the shell. |
| GitHub App git broker (`/git/*`) | 📋 | Worker mints ~1h per-repo installation tokens; container uses them over HTTPS via a credential helper. |

---

## Deployment & operational state

| Surface | Resource | Domain | Workflow | State |
|---|---|---|---|---|
| **Frontend** | Pages worker `os` | `os.mino.mobi` | `deploy-os.yml` (paths `os/**` **excl.** `os/api/**`) | ✅ **Live.** Fully functional standalone — login + all PDS-shell/analytics/AI commands work with no backend. `kimi`/`container` unlock when the `OS_CONTAINER_API_URL` repo variable is set. |
| **Container backend** | Worker `os-mino-api` + Container + DO + R2 | `os-api.minomobi.com` (custom_domain route in wrangler.toml) | `deploy-os-api.yml` | 🚧 **Dispatch-only, unshelfing.** Owner steps in `RUNBOOK.md`: enable CF Containers, R2 `os-workspace`, secrets (`CAP_SIGNING_KEY`, `MOONSHOT_API_KEY`, `GITHUB_TOKEN`), `ALLOWED_DIDS`, dispatch deploy, set repo var. |
| OCR (sibling crate) | Worker `ocr` | `ocr.mino.mobi` | `deploy-ocr.yml` | ✅ Live. `crates/codescan-ocr` → `ocr/wasm/`. Separate product, shares the repo. |

The `container` command is **gated off in the frontend** until `VITE_CONTAINER_API_URL`
is set at build time — so it reports "not configured" instead of dangling a dead
WebSocket while the backend is unshipped. Frontend and backend deploy
independently (the frontend workflow excludes `os/api/**`).

**Housekeeping:** an orphan `pds-os` worker should be deleted (golden-rule
hygiene — `os` owns `os.mino.mobi`).

---

## Security model (summary)

One invariant drives everything: **the user controls the container** (root shell,
`/proc/<pid>/mem`), so **no secret is safe inside it**. Secrets live only in the
worker; the container gets **capabilities, not credentials** via the did-scoped
`CAP_TOKEN`. Single-tenant may inject shared `GITHUB_TOKEN`/`CLOUDFLARE_API_TOKEN`
(you trust yourself); multi-tenant must not — it hands a second user your whole
account. Full model, trust table, and the per-tenant credential plan: **`api/SECURITY.md`**.

---

## Roadmap

Decisions already locked (see `api/SECURITY.md` → *Decisions & findings*):

- **Tenancy target = "a few trusted people."** ⇒ `INJECT_SHARED_CREDS=false`,
  git via per-repo GitHub App tokens, no Cloudflare deploy for users, per-user PDS proxy.
- **Tangled ruled out as the live git remote** — CF Containers are HTTP/HTTPS-egress-only
  and tangled is SSH-only, so a container can't push to it. GitHub-over-HTTPS is the
  live remote; tangled stays an Actions-driven publish/mirror target.
- **uv adopted** in the container image.

Phased plan:

1. ✅ `/ws` identity gate.
2. ✅ Capability token + `/sync` DID-scoping + `INJECT_SHARED_CREDS` gate.
3. **Ship the backend** — the full owner checklist now lives in **`RUNBOOK.md`**
   (enable CF Containers, R2, secrets incl. `MOONSHOT_API_KEY`, `ALLOWED_DIDS`,
   dispatch `deploy-os-api.yml`, set the `OS_CONTAINER_API_URL` repo variable).
   *(This is the gate between "frontend demo" and "the agent platform works.")*
   First tenant model: **Kimi3** via Claude Code + Moonshot's Anthropic-compatible
   endpoint; `AGENT_PROFILES` generalizes to any open model.
4. **PDS-MCP server + `/pds/*` proxy** — the differentiated feature; safe even
   single-tenant. Agent reads/writes the user's own PDS, token never in the shell.
5. **GitHub App + `/git/*` broker** — per-repo ~1h installation tokens over HTTPS,
   git credential helper in the container. No GitHub token persists in the shell.
6. **Hardening** — WS one-time ticket (off the query string), container egress
   allowlist, per-DID R2 quota + sync size cap, per-DID rate limits.

### Still open (owner's call)
- **Does the trusted set need git at all,** or is the agent's job "operate on your
  PDS + publish a site"? If the latter, skip §5 and the surface shrinks a lot.
- **Where does user-generated output get hosted?** R2 under a *cookieless* domain
  is the safe default — never `*.mino.mobi` (shares the SSO cookie).
- **Phase-2 ATProto OAuth** (PKCE+DPoP) to retire app passwords — fold into the
  shared `auth.mino.mobi` worker, or keep `os` self-contained?
