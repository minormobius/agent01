# os-api — Security model

`os-api` runs a **per-user container with a real shell** (one Durable Object per
DID, `idFromName(did)`). The whole design follows from one fact:

> **The user controls the container.** They have a shell, they can run any
> binary, read any file, and read any other process's memory (`/proc/<pid>/mem`).
> Therefore **no secret is safe inside the container** — not in env vars, not in
> a file, not in a "sidecar" process. The only trustworthy place for a secret is
> the **worker**.

Everything below is about keeping secrets in the worker and giving the container
**capabilities, not credentials**.

---

## Trust boundaries

| Component | Trust | Holds |
|-----------|-------|-------|
| Browser | untrusted for secrets | opaque PDS session (accessJwt/refreshJwt) |
| **Worker** (`os-mino-api`) | **trusted control plane** | all master secrets; authenticates every request; mints scoped creds |
| Durable Object (`ContainerShell`, per-DID) | trust boundary | per-user isolation; mints the capability token |
| Container shell | **untrusted** (assume hostile) | only a per-instance capability token |

---

## The capability token (implemented)

Instead of injecting shared secrets, the DO mints a **per-instance capability
token** and hands it to the container via `CAP_TOKEN`:

```
CAP_TOKEN = base64url({did, exp}) . base64url(HMAC-SHA256(payload, CAP_SIGNING_KEY))
```

- Signed with `CAP_SIGNING_KEY`, which **lives only in the worker**. A shelled
  user cannot forge a token for a different DID.
- Bound to one DID, short TTL (24h), re-minted on every container wake.
- Every callback the container makes to the worker carries it; the worker
  verifies the HMAC + expiry and authorizes **only that DID's resources**.

This is the primitive every privileged operation hangs off. Today it backs
workspace sync; the PDS and git proxies below reuse it unchanged.

### Already closed

- **`/ws` identity gate** — fail-closed `ALLOWED_DIDS`; identity is *verified*
  (claimed DID → canonical PDS via plc.directory → `getSession` with the
  accessJwt → assert match), never trusted from the client. (Phase 1.)
- **`/sync` cross-tenant leak** — previously any container with the shared
  `SYNC_TOKEN` could read/write **every** user's R2 tarball. Now `/sync/<id>`
  requires a valid `CAP_TOKEN` and enforces `id === cap.did`. A container can
  only touch its own workspace.

### The remaining shared-secret footgun

`GITHUB_TOKEN` and `CLOUDFLARE_API_TOKEN` are **shared account credentials**.
They are now gated behind `INJECT_SHARED_CREDS`:

- `INJECT_SHARED_CREDS=true` → injected into the shell. **Single-tenant only.**
  Convenient for personal use (you trust yourself with your own tokens). Safe
  *only* because `ALLOWED_DIDS` is just you.
- `INJECT_SHARED_CREDS=false` (default) → never injected.

> **Hard rule:** never add a second DID to `ALLOWED_DIDS` while
> `INJECT_SHARED_CREDS=true`. That hands the second user your entire GitHub and
> Cloudflare account. Multi-tenant ⇒ `INJECT_SHARED_CREDS=false` + the proxies
> below.

---

## What multi-tenant still needs

With `INJECT_SHARED_CREDS=false` the container has no GitHub/CF/PDS access at
all. Each capability below is a **worker endpoint** the container calls with its
`CAP_TOKEN`; the worker resolves the DID, attaches the *real* (scoped) credential
server-side, and enforces what that DID may do. Secrets never reach the shell.

### 1. PDS access (`/pds/*` proxy) — the differentiated feature

Let the in-container agent operate on **the user's own** PDS.

- Ship a tiny **PDS-MCP server** inside the container (wrap `packages/atproto/
  pds.js` `PdsClient`). It exposes tools — `pds.listRecords`, `pds.createRecord`,
  `pds.uploadBlob` — and makes its HTTP calls to `os-api.minomobi.com/pds/*` with
  the `CAP_TOKEN`. The raw PDS token never lands in the shell env, so an `env`
  dump leaks nothing.
- The worker maps `cap.did` → that user's session and attaches PDS auth. Long
  term, route through the shared OAuth worker (`auth.mino.mobi/pds/*`) so the
  credential is a **DPoP-bound, narrowly-scoped** token (use the enumerated
  scopes in `workers/auth/src/oauth/scope.ts`), refreshed by that worker — no
  app password anywhere near the container.

### 2. Git access — **product decision (see below)**

The container must not hold your org PAT. Options, weakest→strongest isolation:
- **(a) Fine-grained PAT, single repo** — only viable single-tenant.
- **(b) GitHub App installation tokens** — worker mints a per-repo, ~1h token on
  demand. Good for "a few trusted collaborators on specific repos."
- **(c) BYO-GitHub** — each user connects *their own* GitHub via OAuth; the
  worker stores their token and mints short-lived access for their container.
  Blast radius = the user's own GitHub. Best for open/multi-tenant.

### 3. Cloudflare deploy — **product decision (see below)**

Arbitrary users running `wrangler deploy` against **your** account is almost
never what you want. Options:
- **Drop it** for users; offer a constrained **"publish to R2 under your handle"**
  capability instead (worker writes to R2 at `u/<did>/…`, served from a separate
  cookieless domain — *not* `*.mino.mobi`, which shares the SSO cookie).
- **BYO-Cloudflare** for power users (their token, their account).

### 4. WS auth hardening (minor)

The accessJwt currently rides as a `?auth=` query param (TLS-encrypted but may
hit CF logs). Replace with a **one-time ticket**: browser calls an authenticated
`/ticket` → gets a single-use, 30s token → opens `/ws?ticket=…`. Low priority.

### 5. Container hardening (defense in depth)

- Drop egress the agent doesn't need (the shell can otherwise exfiltrate
  anything it gets hold of).
- Per-DID R2 quota + size cap on sync tarballs.
- `max_instances` and per-DID rate limits to bound cost/abuse.

---

## Decisions for the owner

These change what gets built, so they're yours to make before implementing §2–3:

1. **Who is this for?** Just you → stay single-tenant, `INJECT_SHARED_CREDS=true`,
   done. A few trusted people → GitHub App tokens (2b), drop CF deploy. Open to
   any Bluesky user → BYO-GitHub (2c), R2 publish only, full hardening.
2. **Should users touch git at all**, or is the agent's job "operate on your PDS
   + publish a site"? If the latter, you can skip the git proxy entirely and the
   surface shrinks a lot.
3. **Where does user-generated output get hosted?** R2 under a cookieless domain
   is the safe default; never `*.mino.mobi`.

---

## Rollout order

1. ✅ `/ws` identity gate (Phase 1).
2. ✅ Capability token + `/sync` DID-scoping + `INJECT_SHARED_CREDS` gate (this).
3. PDS-MCP server + `/pds/*` proxy (the differentiated win; safe single-tenant).
4. Pick the tenancy target (decisions above), then git/CF capabilities to match.
5. WS ticket + container egress/quota hardening.
