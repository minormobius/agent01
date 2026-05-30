# io.mino.mobi — ATProto Ticket Tracker + StumbleUpon Portal

**Status:** Design doc (no app code yet). Approved decisions captured below; build is phased.
**Branch:** `claude/atproto-tracker-portal-CExE3`
**Subdomain:** `io.mino.mobi` (one Worker, one front page, two surfaces).
**Author of record:** majormobius@gmail.com

This document is the source of truth for three related builds plus one future
add-on. It is intentionally over-specified so the build can proceed in
deployable slices and so a future session (human or the nightly Claude
dispatch) can pick up any phase without re-deriving the architecture.

---

## 0. The three things (plus a fourth, later)

1. **Tracker** — an ATProto-native bug / feature-request / idea sweeper. Any
   atproto identity can authenticate and submit a ticket. Tickets are custom
   lexicon records. A board view aggregates them Jira-style. A **post sweeper**
   additionally mints tickets from Bluesky posts containing a hashtag
   (`#atprotoideasio` to start — configurable).

2. **Portal** — "StumbleUpon for our websites." A button sends you to a random
   endpoint in our constellation. A persistent bar rides along on the
   destination and carries: *next random site*, *report a bug*, *request a
   feature* — the latter two deep-link a half-drafted ticket into the tracker
   in a new tab. The repo is one of several in a constellation, so the site
   registry must support pulling in additional domains.

3. **Unified front page** — `io.mino.mobi/` presents the tracker board and the
   portal launcher together as one page.

4. **(Future, not built now) Nightly Claude dispatch** — a cron GitHub Action
   that wakes a Claude Code session to work open tickets *scoped to this repo*
   overnight, opening PRs. Called out here only so phases 1–3 build toward it
   (machine-readable tickets, repo-scoping field, stable ticket IDs).

---

## 1. Decisions (locked)

| Question | Decision |
|---|---|
| Subdomain | **`io.mino.mobi`** |
| Ticket lexicon NSID | **`com.minomobi.io.ticket`** |
| Where authed-user tickets live | **The user's own PDS** (decentralized, portable), discovered/aggregated via an **ATProto-native index** (Constellation — see §4), mirrored into D1 for fast board reads. |
| Where swept tickets live | **A minomobi service-account PDS** — the sweeper cannot write to a stranger's repo, so posts-turned-tickets are minted on our service account with a strong reference back to the original post + author. |
| Stumble bar mechanism | **Iframe wrapper first** (works on any site, including third-party constellation domains, with zero per-site changes). **Opt-in shared snippet** is the phase-2 enhancement for our own sites that refuse framing. |
| Initial sweep hashtag | `#atprotoideasio` (stored in worker config; add/modify freely) |
| Proceed now | **Design doc only.** |

### Why these

- **User-owned tickets** is the most atproto-native shape and the one you
  asked for ("tickets are atproto custom lexicons"). It mirrors how `airchat`
  keeps voice records on each user's PDS and only *caches* them in D1. The
  board never becomes a data silo; if io.mino.mobi vanishes, every ticket
  still exists on its author's repo.
- **Constellation for discovery** honors your pointer
  (`constellation.microcosm.blue`). It removes the need to run our own
  firehose just to find tickets scattered across many PDSes. See §4 for the
  exact pattern and its fallback.
- **Iframe-first stumble bar** respects your worry about editing ~100 sites.
  An iframe wrapper needs no changes to *our* sites and is the *only* option
  that can ever wrap *other people's* sites. The opt-in snippet is strictly
  better UX where we control the site, so we migrate our own sites to it over
  time — but we don't block launch on touching them all.

---

## 2. System overview

```
                    ┌──────────────────────────────────────────────┐
                    │              io.mino.mobi (one Worker)        │
                    │                                              │
  Browser ───────►  │  GET /            unified front page         │
  (atproto user)    │  GET /board       tracker board (Jira-ish)   │
                    │  GET /stumble      portal launcher + bar host │
                    │  GET /go           302 → random site          │
                    │  GET /api/tickets  board data (from D1 cache) │
                    │  POST /api/sweep/* admin: trigger/inspect     │
                    │  ASSETS binding → static HTML/CSS/JS          │
                    │  D1 (atpolls-db)  → ticket index cache        │
                    │  cron 0 */N       → sweeper + index refresh   │
                    └───────┬───────────────────────┬───────────────┘
                            │                       │
        ┌───────────────────▼──────┐     ┌──────────▼─────────────────┐
        │ Shared OAuth worker       │     │ Service-account PDS         │
        │ auth.mino.mobi            │     │ (PdsPublisher, app pw)      │
        │ login + auth.pds.*        │     │ writes swept tickets        │
        │ → writes ticket to        │     └──────────┬─────────────────┘
        │   USER's own PDS          │                │
        └───────────────────────────┘                │
                            ▲                         │
                            │                         │
        ┌───────────────────┴─────────────────────────▼──────────────┐
        │ Constellation (constellation.microcosm.blue)                │
        │ network-wide backlink index → "all tickets referencing the  │
        │ io board anchor"  (discovery; D1 is the cache)              │
        └─────────────────────────────────────────────────────────────┘
```

Single Worker, single page-app, `atpolls-db` shared with poll/feed/rite/airchat
(per the repo's D1 convention). This matches the `rite` worker shape exactly
(ASSETS + D1 + cron in one `worker.js`).

---

## 3. Project A — the tracker

### 3.1 Lexicon: `com.minomobi.io.ticket`

Follows the repo convention (`airchat/lexicons/voice.json`): `lexicon: 1`,
record under `defs.main`, `"key": "tid"`, integers only (DAG-CBOR has no
float), `createdAt` as `format: datetime`, cross-lexicon refs via full NSID
(`com.atproto.repo.strongRef`). File lands at `io/lexicons/ticket.json`.

```jsonc
{
  "lexicon": 1,
  "id": "com.minomobi.io.ticket",
  "description": "A bug report, feature request, or idea for a site in the mino constellation.",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["kind", "title", "createdAt"],
        "properties": {
          "kind":      { "type": "string", "enum": ["bug", "feature", "idea"] },
          "title":     { "type": "string", "maxLength": 300, "maxGraphemes": 300 },
          "body":      { "type": "string", "maxLength": 20000, "maxGraphemes": 10000 },

          // Which site/endpoint this is about. Free text + optional structured target.
          "site":      { "type": "string", "maxLength": 200 },          // e.g. "poll.mino.mobi"
          "url":       { "type": "string", "format": "uri" },           // exact page if known
          "repo":      { "type": "string", "maxLength": 200 },          // e.g. "minormobius/agent01" (enables §6 dispatch scoping)

          "severity":  { "type": "string", "enum": ["low", "med", "high"] },  // bugs only; advisory
          "tags":      { "type": "array", "items": { "type": "string" }, "maxLength": 12 },

          // Discovery anchor: every ticket references the canonical board record so
          // Constellation can enumerate all tickets network-wide (see §4).
          "board":     { "type": "ref", "ref": "com.atproto.repo.strongRef" },

          // For swept tickets: the Bluesky post + author that generated it.
          "source":    { "type": "ref", "ref": "#source" },

          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    },
    "source": {
      "type": "object",
      "required": ["kind"],
      "properties": {
        "kind":   { "type": "string", "enum": ["manual", "swept"] },
        "post":   { "type": "ref", "ref": "com.atproto.repo.strongRef" }, // the #atprotoideasio post
        "author": { "type": "string", "format": "did" }                   // original poster's DID
      }
    }
  }
}
```

Notes:
- **`board` strongRef is the load-bearing field for discovery.** It points at
  one canonical anchor record on the service PDS (a `com.minomobi.io.board`
  singleton, or simply a well-known post). Because Constellation indexes
  *backlinks to a target*, anchoring every ticket to one known URI turns
  "find all tickets" into "find all backlinks to the anchor" — no firehose
  required. See §4.
- **`repo`** is what the future nightly dispatch (§9) filters on — only
  tickets naming a repo it owns get worked. For this repo: `minormobius/agent01`.
- **Status/triage is NOT in the user's record.** A ticket's lifecycle
  (`new → triaged → in_progress → done → wontfix`) is *board* state, owned by
  us, stored in D1 — not something we write back into the author's repo. We
  never mutate someone else's record. (If we later want public triage we'd
  publish a separate `com.minomobi.io.status` record on the *service* PDS that
  strongRefs the ticket — additive, never a write to the author's repo.)

### 3.2 Auth + submit flow (authed user → their own PDS)

Reuse the shared OAuth worker exactly as `bakery` does
(`bakery/src/atproto.js`): `new AuthClient()` from
`../../packages/oauth-client/auth.js`, `auth.init()` on load,
`auth.login(handle, { scope })`, then `auth.pds.createRecord(...)`.

- **Scope (narrow, as requested):**
  `atproto repo:com.minomobi.io.ticket`
  — identity + write our one lexicon, nothing else. This is *within* the
  shared worker's umbrella (`workers/auth/src/index.ts:198` already declares
  `atproto transition:generic repo:... blob:...`), so **no umbrella bump is
  needed** — a `repo:`-scoped collection is grantable under the existing
  ceiling. The Bluesky consent screen will read "write com.minomobi.io.ticket
  records" and nothing more.
- **Allowlist origin:** add `https://io.mino.mobi` to `ALLOWED_ORIGINS`
  (`workers/auth/src/index.ts:22-41`). The `*.mino.mobi` wildcard already
  covers it, but list it explicitly per the repo convention. *This is a change
  to `workers/auth/` and must ship via `deploy-auth.yml` — see §8.*
- **Submit:** `auth.pds.createRecord('com.minomobi.io.ticket', record)` writes
  to the *logged-in user's* PDS through the worker's DPoP-bound `/pds/*` proxy.
  The browser never holds a PDS token.
- **Handle typeahead** on the (optional) "who are you" / mention fields: reuse
  the existing vanilla helper `js/typeahead.js` (auto-attaches to
  `<input data-bsky-typeahead>`, hits
  `app.bsky.actor.searchActorsTypeahead`). No new code.

After `createRecord` returns `{ uri, cid }`, the front end optimistically adds
the ticket to the board and fire-and-forgets `POST /api/index/notify {uri}` so
the Worker can pull it into the D1 cache immediately (rather than waiting for
the next cron index pass).

### 3.3 The board (Jira-ish)

A static page (`io/board.html` + `io/board.js`) that reads `GET /api/tickets`
(served from the D1 cache, §4.3) and renders columns by **board status**
(D1-owned), with kind/severity/site/tag facets and a free-text filter. Card
links out to the ticket's `at://` URI and to a Bluesky deep link for swept
ones. Pure vanilla, no build step — consistent with `rite`/`read`.

Columns: `New` · `Triaged` · `In progress` · `Done` · `Won't fix`.
Swimlanes/filter: by `repo`, by `site`, by `kind`.

Triage actions (drag between columns, set severity) are **admin-gated**
(`X-Admin-Key` header, like `rite`/`airchat` admin routes) and only write to
D1 — never to anyone's PDS.

### 3.4 Worker routes (tracker)

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Unified front page (board preview + stumble launcher) |
| GET | `/board` | Full board |
| GET | `/api/tickets` | Board data from D1 cache (paginated, filterable) |
| POST | `/api/index/notify` | Best-effort: pull one ticket URI into D1 now |
| POST | `/api/triage` | Admin: set board status/severity (D1 only) |
| GET | `/api/health` | Bindings + ticket count (deploy verify hook) |
| POST | `/api/sweep/run` | Admin: manual sweeper trigger (same code as cron) |

---

## 4. Discovery & indexing (the Constellation question)

The hard part of user-owned records: tickets live on *many* PDSes, so the
board needs a way to find them all. Three layers, cheapest first.

### 4.1 Primary: Constellation backlink index (anchor pattern)

[Constellation](https://constellation.microcosm.blue) (microcosm / `at-microcosm/microcosm-rs`)
is a network-wide **backlink index**: it walks the firehose and indexes every
link it sees, keyed by **the target it points at**, **the collection** the
linking record came from, and **the JSON path** to the link within that record.
So it answers "what records link *to* this target?" — it does **not** expose a
generic "list every record of collection X" enumerator. (Confirmed against the
live API, 2026-05-30: the public instance has indexed ~15.4B links across ~3.3B
targets from ~26M identities.) This repo already speaks to a Constellation relay
in `workers/feed/src/constellation.ts` for like/repost backlinks.

**The trick:** we make *every* ticket reference one well-known **anchor** —
the `board` strongRef field (§3.1). Then "find all tickets" becomes "find all
records whose `.board` link points at our anchor URI" — exactly a backlink
query Constellation can answer, network-wide, with no firehose of our own.

**Verified API surface** (XRPC, `blue.microcosm.links.*`):

```
# Page through every ticket that links to the anchor:
GET https://constellation.microcosm.blue/xrpc/blue.microcosm.links.getBacklinks
      ?subject=<url-encoded at-uri of the io board anchor>
      &source=<linking collection + JSON path, i.e. com.minomobi.io.ticket @ .board>
      [&did=<filter to one author>] [&limit=1..100 (default 16)] [&reverse]

# Cheap board badge — count without enumerating:
GET …/xrpc/blue.microcosm.links.getBacklinksCount?subject=…&source=…

# Distinct authors who have filed (cursor-paginated):
GET …/xrpc/blue.microcosm.links.getDistinct?subject=…&source=…&limit=…&cursor=…
```

The `subject` is the anchor's at-uri; `source` selects the linking collection
+ the path of the link field (our `.board` strongRef). `getBacklinks` returns
the linking records (the tickets) so we read each ticket's fields straight from
the index response and upsert into D1 (§4.3) — falling back to a per-DID
`com.atproto.repo.getRecord` only if a field is missing.

> One detail to confirm with a smoke test at build time: the exact encoding of
> the `source` parameter (collection + path — whether it's one combined string
> or the `getBacklinks…BySubject?collection=…` variant the older relay used in
> `constellation.ts:47`). The endpoint names and `subject`/`limit`/`cursor`
> semantics above are verified against the live service; only `source`'s string
> format needs a one-line `curl` to pin down.

The anchor itself is a singleton record on the **service PDS** (e.g.
`com.minomobi.io.board` rkey `self`, or just a pinned post). Its at-uri is a
build-time constant in worker config. Note Constellation respects deletions, so
if an author deletes their ticket record it drops out of the index (and we
should mirror that on the next index pass).

### 4.2 Fallback / upgrade: Jetstream consumer

If Constellation indexing lags, is down, or we want sub-second freshness, the
canonical atproto-native way to get *all records of a collection* is a
[Jetstream](https://github.com/bluesky-social/jetstream) subscription filtered
to our collection:

```
wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=com.minomobi.io.ticket
```

Jetstream is a firehose-lite that emits create/update/delete events for only
the collections you ask for. A Cloudflare Worker can't hold a long-lived
WebSocket cheaply, so the natural home is a tiny **Durable Object** (poll
already uses DOs) or a small always-on consumer — but this is a phase-2
upgrade, **not** needed for launch. The anchor+Constellation path covers v1.

### 4.3 D1 cache (the board's actual data source)

Either discovery path feeds a D1 table the board reads from. New migration
`poll/apps/api/migrations/0026_io_tickets.sql` (next free number — repo is at
`0025`; **re-confirm at build time**, in-flight branches may take 0026):

```sql
-- io.mino.mobi ticket index cache. Source of truth is each author's PDS;
-- this table is a rebuildable read-cache + board-owned triage state.
CREATE TABLE IF NOT EXISTS io_tickets (
  uri          TEXT PRIMARY KEY,        -- at://did/com.minomobi.io.ticket/rkey
  cid          TEXT,
  author_did   TEXT NOT NULL,
  kind         TEXT NOT NULL,           -- bug | feature | idea
  title        TEXT NOT NULL,
  body         TEXT,
  site         TEXT,
  url          TEXT,
  repo         TEXT,                     -- enables §9 dispatch scoping
  severity     TEXT,
  tags         TEXT,                     -- JSON array
  source_kind  TEXT NOT NULL DEFAULT 'manual',  -- manual | swept
  source_post  TEXT,                     -- swept: at-uri of the #atprotoideasio post
  -- board-owned, never written back to any PDS:
  status       TEXT NOT NULL DEFAULT 'new',     -- new|triaged|in_progress|done|wontfix
  created_at   TEXT NOT NULL,            -- ISO from the record
  indexed_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_io_tickets_status ON io_tickets(status);
CREATE INDEX IF NOT EXISTS idx_io_tickets_repo   ON io_tickets(repo);
CREATE INDEX IF NOT EXISTS idx_io_tickets_kind   ON io_tickets(kind);

-- sweeper bookkeeping: which posts we've already turned into tickets, and our scan cursor
CREATE TABLE IF NOT EXISTS io_sweep_seen (
  post_uri   TEXT PRIMARY KEY,
  ticket_uri TEXT,
  swept_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS io_sweep_state (
  k TEXT PRIMARY KEY,    -- e.g. 'cursor'
  v TEXT
);
```

Idempotent (`IF NOT EXISTS`), applied by the deploy workflow's migration loop
like `rite`/`airchat` (§8). The cache is fully rebuildable from PDS records, so
losing it is harmless.

---

## 5. The hashtag for swept tickets

`#atprotoideasio` is the seed trigger. Store it as a worker config array
(`SWEEP_TAGS = ['atprotoideasio']`) so we can add/rename without code surgery.
Matching is on the post's `tag` facet *and* a plaintext fallback (some clients
don't emit facets).

---

## 6. The post sweeper

### 6.1 Behavior

Cron (`0 */N * * *`, start hourly) wakes the Worker's `scheduled()` handler. It:

1. Loads `cursor` from `io_sweep_state`.
2. Queries Bluesky for recent posts carrying a sweep tag:
   `GET app.bsky.feed.searchPosts?q=%23atprotoideasio&sort=latest&limit=…`
   (paginate with `cursor`). **Note:** no existing worker in the repo uses
   `searchPosts` — this is net-new; degrade gracefully on non-200 like
   `constellation.ts` does.
3. For each post not already in `io_sweep_seen`:
   - Parse a `kind` (bug/feature/idea) from the post text (simple keyword
     heuristic; default `idea`). Title = first line / first ~120 chars. Body =
     full post text. `site`/`url` = any link facet or `@`-mention of a known
     mino site.
   - **Mint a ticket on the service PDS** via poll's `PdsPublisher`
     (`poll/packages/shared/src/atproto/index.ts`): `createRecord(
     'com.minomobi.io.ticket', tid, record)` with
     `source = { kind:'swept', post:<strongRef>, author:<poster DID> }` and the
     `board` anchor strongRef.
   - Record `(post_uri → ticket_uri)` in `io_sweep_seen`; upsert into
     `io_tickets`.
4. Persist the new `cursor`.
5. **Index refresh:** also run the Constellation pull (§4.1) to fold in any
   manually-submitted tickets created since last pass.

Why the service account for swept tickets: we cannot write to a stranger's
repo. The ticket is *ours*, but it strongRefs the original post and records the
author DID, so attribution and "jump to the Bluesky thread" both work, and we
can later reply to the thread ("tracked as …") from a service bot if desired
(the `workers/bsky-bot` pattern).

### 6.2 Service-account pattern (copy poll's `PdsPublisher`)

Secrets (set on the io Worker via `wrangler secret put` in the deploy
workflow, mirroring poll): `ATPROTO_SERVICE_HANDLE`, `ATPROTO_SERVICE_PASSWORD`,
`ATPROTO_SERVICE_DID`, `ATPROTO_SERVICE_PDS`. `PdsPublisher` does
`com.atproto.server.createSession` → `com.atproto.repo.createRecord` with a
single 401 re-auth retry. We can either import from `poll/packages/shared` or
vendor a ~60-line copy into `io/` (the shared-atproto migration guidance in the
root CLAUDE.md says new code should prefer the shared lib; here the publisher
lives in poll's shared package, so vendor a small copy or add a tiny shim —
**decide at build time**; vendoring avoids a cross-package build dep for a
single-file Worker).

### 6.3 Anti-abuse / quality

- Rate-cap tickets per author DID per day.
- Require the post to be > N chars (skip bare hashtag spam).
- Optional allowlist/denylist DIDs in `io_sweep_state`.
- Dedup is `io_sweep_seen.post_uri` (PK), so re-runs are no-ops.

---

## 7. Project B — the StumbleUpon portal

### 7.1 Site registry (multi-domain constellation)

There is **no** machine-readable site list today — the closest is the
`var P = [...]` `PROJECTS` array in the root `index.html` (lines ~1790–1891,
~95 entries, shape `{ n, u, c, k, a, p? }`), parsed by
`scripts/generate-search-catalog.mjs` and `scripts/generate-og-card.mjs`.

For the portal we introduce **`io/sites.json`** — the one registry the portal
randomizes over, explicitly designed to span multiple domains/repos:

```jsonc
{
  "constellations": [
    {
      "domain": "mino.mobi",
      "repo": "minormobius/agent01",
      "sites": [
        { "url": "https://poll.mino.mobi",  "name": "poll",  "tags": ["bluesky"] },
        { "url": "https://rite.mino.mobi",  "name": "rite",  "tags": ["tools"] }
        // … generated, see below
      ]
    }
    // Additional constellation entries (other domains/repos) appended here.
  ]
}
```

- **Seeded from the existing `PROJECTS` array** by a new generator
  `scripts/generate-sites-json.mjs` (same regex approach the two existing
  generators use), so we don't hand-maintain ~95 URLs. Filter sub-entries
  (`p`-having) or include them as weighted — TBD, default: include top-level
  only, weight by `k`.
- **Other domains** are added by appending `constellations[]` entries
  (manually, or by other repos' CI committing into a shared list later). The
  shape is domain-first precisely so the constellation can grow beyond
  `mino.mobi`.
- The portal fetches `sites.json` client-side and picks a weighted-random URL.
  `GET /go` provides a server-side `302` equivalent (handy for the "next"
  button and for sharing a "surprise me" link).

### 7.2 The persistent bar — iframe-first

**Phase 1 (launch): iframe wrapper.** `io.mino.mobi/stumble` renders a fixed
top bar (`Next ⟳` · `🐞 Report bug` · `💡 Request feature` · `↗ Open directly`)
and loads the destination in a full-bleed `<iframe>` below it. The bar lives in
*our* top frame, so the destination cannot remove it — satisfying "the endpoint
can't get rid of the random website button." Works for **any** URL, including
third-party constellation domains, with zero changes to those sites.

**Known iframe limitations (documented, not blockers):**
- Sites that send `X-Frame-Options: DENY/SAMEORIGIN` or CSP
  `frame-ancestors` excluding us **won't render** in the frame. Detection:
  the iframe `load` event never fires / errors. **Fallback:** show a card
  "This site blocks embedding — [open in new tab]" with the bar still present,
  and the bug/feature buttons still work (they don't need the frame).
- COOP/COEP sites (`labglass`) and OAuth popups can misbehave inside a frame.
  Same fallback. (Our own sites we can later allowlist `io.mino.mobi` in their
  `frame-ancestors` if we want them framable — a small per-site `_headers`
  tweak, optional.)

**Phase 2 (our sites, gradual): opt-in shared snippet.** A tiny
`io/stumble-bar.js` that a site includes with one `<script>` tag. It renders
the same bar *in the site's own page* (no iframe), and re-pins itself across
in-site navigation via `sessionStorage` (set when arriving from a stumble, so
"can't get rid of it" holds even as you click around). This is strictly better
UX (no frame, no CSP fights, OAuth works) but requires touching each site once
— so we roll it out opportunistically (when already editing a site, like the
shared-OAuth migration policy in CLAUDE.md), **not** as a big-bang change to
~100 sites. Sites with the snippet are marked `"snippet": true` in `sites.json`
so the portal links to them directly instead of framing.

> Net: **iframe gives universal coverage now; the snippet gives perfect UX on
> our sites later.** Both can coexist — the portal picks per-site.

### 7.3 Bug/feature buttons → half-drafted ticket

The bar's `🐞`/`💡` buttons open **the tracker in a new tab** with the current
destination pre-filled via query params:

```
https://io.mino.mobi/?compose=bug&site=poll.mino.mobi&url=https%3A%2F%2Fpoll.mino.mobi%2F%23%2Fp%2Fabc
```

The front page reads `compose`/`site`/`url`/`kind` params, opens the submit
form with `kind`, `site`, and `url` pre-populated, and (if not logged in)
prompts auth first. "Half-drafted" = everything we can infer is filled; the
user writes the title/body and submits to their own PDS. New tab so the
stumble session is preserved.

(In the iframe case we know the destination URL from our own router; in the
snippet case the bar reads `location.href` directly — both produce the same
deep link.)

---

## 8. Deploy

### 8.1 `io/wrangler.jsonc` (copy `rite/wrangler.jsonc`)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "io",
  "main": "worker.js",
  "compatibility_date": "2026-02-20",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": ".", "binding": "ASSETS" },
  "d1_databases": [
    { "binding": "DB", "database_name": "atpolls-db",
      "database_id": "fee2f25a-8b4a-4d46-b245-9d5da93c117d" }
  ],
  "triggers": { "crons": ["0 * * * *"] },
  "routes": [ { "pattern": "io.mino.mobi", "custom_domain": true } ]
}
```

### 8.2 `.github/workflows/deploy-io.yml` (copy `deploy-rite.yml`)

- **Triggers:** push to `main` or **`claude/atproto-tracker-portal-*`** (so
  this branch deploys); paths `io/**` + `poll/apps/api/migrations/0026_io_tickets.sql`
  + the workflow file; plus `workflow_dispatch` with `skip_migrations`.
- **Steps:** checkout → node 20 → `npm install wrangler` → **migration loop**
  (`wrangler d1 execute atpolls-db --file=… --remote || echo already-applied`)
  → `wrangler deploy` (cwd `io/`) → verify `/api/health` → **secret sync**
  (airchat's `push_secret` helper, `--name io`) for `ATPROTO_SERVICE_HANDLE/
  PASSWORD/DID/PDS` and `ADMIN_KEY`.
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (existing); plus the
  four `ATPROTO_SERVICE_*` (already used by poll) and an `IO_ADMIN_KEY`.

### 8.3 Auth worker change (separate deploy)

Adding `https://io.mino.mobi` to `ALLOWED_ORIGINS`
(`workers/auth/src/index.ts:22-41`) ships via **`deploy-auth.yml`**, whose
trigger glob is `main` / `claude/implement-oauth-bsky-JgUdn`. So either: (a)
make that one-line origin addition on a branch that workflow recognizes, or (b)
add `claude/atproto-tracker-portal-*` to `deploy-auth.yml`'s branch list in the
same change. **Decide at build time.** The `*.mino.mobi` wildcard means auth
will actually *work* before the explicit listing lands; the listing is for
hygiene/visibility.

### 8.4 DNS

`io.mino.mobi` CNAME → the Worker's custom-domain route (Cloudflare handles
this when `routes[].custom_domain` is set and the zone is on the account).

---

## 9. Project C (future) — nightly Claude dispatch

Not built now; phases 1–3 build toward it. Sketch so the data shape is right:

- **Workflow** `.github/workflows/io-nightly.yml`, `schedule: 0 6 * * *` (cron
  fires only from the **default branch** — same gotcha as `bisk-digest.yml`),
  plus `workflow_dispatch`.
- **Selection:** query `GET https://io.mino.mobi/api/tickets?repo=minormobius/agent01&status=new`
  (the `repo` field + D1 index from §3.1/§4.3 are what make this possible).
  Pick the top N by some priority (severity, age, votes-if-added).
- **Dispatch:** launch a Claude Code session per ticket (or a batched session)
  on a fresh `claude/io-ticket-<id>` branch; it implements, commits, pushes,
  opens a PR referencing the ticket `at://` URI. The existing deploy workflows
  then ship the change on push (the repo's "every push to a Claude branch
  ships" model).
- **Loop closure:** on PR merge, an action flips the ticket's D1 `status` to
  `done` (board-owned state; we still never write to the author's PDS).

Open design points deferred: how to bound/scope the nightly agent safely,
human-in-the-loop gating before merge, and cost caps. Flagged here, not solved.

---

## 10. File manifest (what the build creates)

```
io/
  DESIGN.md                 ← this file
  index.html                unified front page (board preview + stumble launcher + compose form)
  board.html  board.js      full Jira-ish board
  stumble.html              iframe-wrapper portal host + bar
  app.js / styles.css       shared front-end
  stumble-bar.js            phase-2 opt-in snippet (lands early, adopted gradually)
  sites.json                generated site registry (multi-domain)
  worker.js                 routes + scheduled() sweeper + index refresh + ASSETS fallthrough
  wrangler.jsonc            ASSETS + D1 + cron + custom domain
  lexicons/ticket.json      com.minomobi.io.ticket
  (optionally) atproto.js   AuthClient wiring + PdsPublisher vendor

scripts/generate-sites-json.mjs   PROJECTS-array → io/sites.json
poll/apps/api/migrations/0026_io_tickets.sql   D1 cache + sweep bookkeeping
.github/workflows/deploy-io.yml   migrate → deploy → verify → secret sync
workers/auth/src/index.ts         +1 line: io.mino.mobi in ALLOWED_ORIGINS (ships via deploy-auth.yml)
```

---

## 11. Build phases (each independently deployable)

1. **Skeleton + deploy plumbing.** `io/` static front page (board + stumble
   stubs), `wrangler.jsonc`, `deploy-io.yml`, branch wired in. Ships an empty
   but live `io.mino.mobi`. *Proves the deploy path before any logic.*
2. **Auth + manual submit.** `ALLOWED_ORIGINS` + AuthClient wiring + lexicon +
   submit form → writes ticket to user's PDS. Handle typeahead. No board data
   yet (or read from the submitter's own `listRecords` for instant gratification).
3. **Index + board.** Migration 0026, Constellation pull (anchor pattern) →
   D1 cache, `GET /api/tickets`, the Jira board, triage admin routes.
4. **Sweeper.** `searchPosts` cron + `PdsPublisher` service writes +
   `io_sweep_*` bookkeeping + service secrets in the workflow.
5. **Portal.** `generate-sites-json.mjs` + `sites.json`, `/go`, iframe wrapper
   bar, bug/feature deep-links into the compose form.
6. **Polish.** Embedding-fallback UX, weighting, facets, Bluesky "tracked as…"
   reply bot (optional).
7. **(Later) Nightly dispatch** (§9).

---

## 12. Open items to confirm at build time

- **Constellation `source` encoding** — endpoint names + `subject`/`limit`/
  `cursor` are verified (§4.1); only the `source` param's exact string format
  (collection + JSON path) needs a one-line `curl` smoke test before coding.
- **Migration number** — `0026` assumed; re-check the highest in
  `poll/apps/api/migrations/` at build time (in-flight branches may collide;
  later merge renumbers per repo convention).
- **PdsPublisher: import vs vendor** into the io Worker (§6.2).
- **Auth-worker origin change delivery** — fold into `deploy-auth.yml`'s glob
  or piggyback its existing branch (§8.3).
- **Portal registry scope** — include sub-site (`p`) entries? weight by `k`?
- **Service PDS anchor record** — create the `com.minomobi.io.board` singleton
  (or designate a pinned post) and hardcode its at-uri as the discovery target.
```
