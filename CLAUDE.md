# minomobi — Production Operations

## Role

This branch is the **devops/production branch** for all minomobi web properties.
Its job is site health: deployments work, pages load, workers respond, builds
pass, PWAs install, headers are correct, and nothing is broken.

Content creation, research, editorial voice, and feature design happen
elsewhere. This branch receives sites, stabilizes them, and keeps them running.

---

## Start here — where everything is

**This file deliberately does not contain a site list.** It used to, and it
rotted: it carried deep sections on 8 projects while 38 of 74 surfaces went
unmentioned, and it contradicted itself (rite was "eleven surfaces" in one
section and "five" in another). A hand-kept inventory cannot track a repo that
gains a surface a week. So the inventory is generated, and this file carries
only what is true everywhere.

| To find… | Read… |
|---|---|
| **every surface — what/where/live/branch/docs** | **[`docs/SURFACES.md`](docs/SURFACES.md)** — generated, always current |
| **how one surface works** | **`<dir>/CLAUDE.md`** — its own instruction set (linked from the index) |
| the machine facts (deps, paths, type) | [`deploy-registry.json`](deploy-registry.json) — the source of truth |
| how deploys work, and the gotchas | [`docs/DEPLOYS.md`](docs/DEPLOYS.md) |
| where things live on disk | [`docs/REPO-STRUCTURE.md`](docs/REPO-STRUCTURE.md) |
| OAuth migration bookkeeping | [`docs/OAUTH.md`](docs/OAUTH.md) |

**The rule: repo-wide facts live here; per-surface facts live in that surface's
`CLAUDE.md`.** When you learn something about one surface, write it there, not
here. If you add a surface, `scripts/gen-surface-docs.mjs --write` seeds its
doc; then edit it by hand.

---

## The operating loop — how work actually ships

Work happens on `claude/*` feature branches. Those branches are **assembled
into a merge candidate** and merged to `main` — that is the only way pull
requests get made here. The shape:

1. **Find the recent branches.** For each remote branch, commits ahead of
   `main` plus last-commit date. Branches from before the last merge candidate
   that are thousands of commits "ahead" are stale — their content already
   landed via an earlier candidate; skip them.
2. **Squash-merge each one** onto the candidate branch, as a single commit:
   `merge candidate: <branch> — <what it brings>`.
3. **Regenerate the derived artefacts** (below) — feature branches routinely
   self-register inconsistently, and this is where that gets reconciled.
4. **`node scripts/preflight.mjs`** — must pass before pushing.
5. Push, open the PR, and report what could not be verified from the sandbox.

### Preflight — run this before every push

```bash
node scripts/preflight.mjs           # every invariant + every generator + selftests
node scripts/preflight.mjs --fix     # regenerate what's stale, then re-check
```

It enforces, in one command: the registry invariant; that workflow triggers,
the surface map, the surface index, the search catalogue, the spec and the
dataviz copies are all in sync; that every surface has a landing-page entry, a
spec family and an instruction file; and that the selftests pass. **Every
registration gap ever found by hand in a merge candidate is a check in here.**

### The derived artefacts (never hand-edit these)

| Artefact | Regenerate with |
|---|---|
| `docs/SURFACES.md` | `node scripts/gen-surface-index.mjs --write` |
| surface-map table in `index.html` | `node scripts/gen-surface-map.mjs --write` |
| `functions/search.js` catalogue | `node scripts/generate-search-catalog.mjs` |
| `spec/data.js` | `node scripts/build-spec.mjs --write` |
| workflow `branches:` triggers | `node scripts/gen-deploy-triggers.mjs --write` |
| `og.png` / `og.svg` | `node scripts/generate-og-card.mjs` |
| `<dir>/CLAUDE.md` seeds | `node scripts/gen-surface-docs.mjs --write` |

Hand-edited: `index.html`'s `PROJECTS` array (`var P`) and its curated `<li>`
descriptions, and `spec/curated.js` (families + capsules). A new surface needs
an entry in both, or it is invisible to the landing page and the search bot.

---

## Shared ATProto Library (`packages/atproto/`)

**Three standalone JS modules** with no dependencies and no build step. Every project in this repo that talks to ATProto or Bluesky should import from here instead of reimplementing.

### How to Use

```js
// From any project (adjust relative path):
import { resolveHandle, resolvePds, PdsClient } from '../../packages/atproto/pds.js';
import { getAuthorFeed, getProfiles, getFollows } from '../../packages/atproto/bsky.js';
import { sealRecord, unsealRecord, deriveKek } from '../../packages/atproto/crypto.js';
```

### Modules

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| **`pds.js`** | Identity resolution + authenticated PDS operations | `resolveHandle`, `resolvePds`, `generateTid`, `PdsClient` (login, getRecord, putRecord, createRecord, listRecords, deleteRecord, uploadBlob, getBlob) |
| **`bsky.js`** | Read-only Bluesky public API wrappers | `getProfiles`, `resolveHandles`, `getAuthorFeed`, `getLikes`, `getFollows`, `getListMembers`, `getPostThreadDepth` |
| **`crypto.js`** | Vault encryption (ECDH + AES-GCM + PBKDF2) | `deriveKek`, `generateIdentityKey`, `wrapPrivateKey`, `unwrapPrivateKey`, `deriveDek`, `encrypt`, `decrypt`, `sealRecord`, `unsealRecord`, `generateTierDek`, `wrapDekForMember`, `unwrapDekFromMember`, `toBase64`, `fromBase64` |

### Migration Path

Existing projects (org, crm, wave, photo, labglass, bakery, time, cards, etc.) each have their own copy of this code. **Do not bulk-rewrite them.** When you're already modifying a project's ATProto layer for other reasons, switch its imports to `packages/atproto/` at that time. New projects should use the shared library from the start.

### What Stays Project-Local

- **Poll's RSA blind signatures** (`poll/packages/shared/src/crypto/`) — domain-specific, not shared
- **Poll's OAuth flow** (`poll/apps/api/src/oauth/`) — unique BFF confidential client
- **Bounty's Ed25519 minting** — separate concern
- **Project-specific PDS collections/constants** — belong in the project

---

## Shared dataviz library (`packages/dataviz/`)

**Statistics + publication-quality SVG charts.** Two standalone JS files, no
dependencies and no build step — same shape as `packages/atproto/`. If a project
needs to compute a statistic or draw a figure, import from here instead of
hand-rolling it. Full docs: [`packages/dataviz/README.md`](packages/dataviz/README.md).

| File | Purpose |
|---|---|
| **`stats.js`** | `WORMHOLE_STATS` — OLS (k predictors, SEs, R², AIC), correlation/Spearman, quantiles, KDE, ANOVA, χ², PCA + eigen, classical MDS, k-means, hierarchical clustering, logistic, Poisson, LDA, Kaplan–Meier + log-rank, ROC/AUC, Mahalanobis, community detection, DFT periodogram, ACF, changepoints |
| **`charts.js`** | `WORMHOLE_CHARTS` — 24 chart types returning `<svg>` **strings** (so they render in a Worker, in node, or client-side): scatter+fit, violin, box, ridgeline, histogram, grouped/stacked bar, heatmap, waterfall, forest, Q–Q, line, spectrum, scree, biplot, cluster scatter, dendrogram, ROC, Kaplan–Meier, lollipop, logistic curve, stem, network, hexbin |
| **`index.mjs`** | ESM facade — `import { stats, charts } from '../../packages/dataviz/index.mjs'` |

Colour follows the `dataviz` skill: Okabe–Ito categorical (validated
colourblind-safe), viridis sequential, blue–gray–red diverging; legends auto-place
in the emptiest quadrant.

**Two ways to consume it.** Module contexts (Workers, node, bundlers) import
`index.mjs`. **Static sites that serve these as assets** can't import across
directories — the browser fetches `/stats.js` from the site's own asset root — so
they keep a byte-identical copy in their own dir, kept honest by
`node scripts/sync-dataviz.mjs --check` (CI) / `--write` (refresh). **Edit
`packages/dataviz/`, never a copy**; add new consumers to `CONSUMERS` in that
script. Current consumer: `wormhole/`.

`node packages/dataviz/dataviz.selftest.mjs` is a **known-answer suite** — every
estimator is checked against a planted configuration with an analytically known
answer — plus a render of every chart. Run it before touching the library.

---

## OAuth Strategy — read this before adding auth to any site

There is a **dedicated, shared OAuth worker** at `workers/auth/` deployed to `auth.mino.mobi`. New sites that need Bluesky auth use it. A few existing sites are grandfathered into their own thing — leave them alone unless you're actively refactoring.

### Canonical architecture

```
┌─────────────────────────┐         ┌──────────────────────────────────┐
│  Any static site        │         │  workers/auth/  →  auth.mino.mobi│
│  (bakery, photo, wave,  │         │                                  │
│  wiki, your-new-site)   │         │  • /client-metadata.json         │
│                         │         │  • /oauth/start                  │
│  import { AuthClient }  │ ──────► │  • /oauth/callback               │
│    from packages/       │         │  • /api/me, /api/refresh         │
│         oauth-client/   │         │  • /pds/* (DPoP-bound proxy)     │
│         auth.js         │         │                                  │
│                         │ ◄────── │  D1: mino-auth-db (sessions,     │
│  Bearer <session_id>    │         │       oauth_keypair, states)     │
└─────────────────────────┘         └──────────────────────────────────┘
```

- **`workers/auth/`** — Cloudflare Worker (1.2k LOC TS) that holds the confidential OAuth client: PKCE + DPoP + PAR + `private_key_jwt`. Signing keypair is auto-generated into D1 on first `/client-metadata.json` request — no manual secret config. Sessions are opaque tokens carried two ways: an opaque `Bearer` token (stored in the originating site's `localStorage`) **and** a `mino_session` cookie scoped to `.mino.mobi`. The worker holds the DPoP-bound PDS refresh token and minted access tokens on the site's behalf and proxies PDS calls through `/pds/*`.

#### Single sign-on across subdomains

Sign in once (e.g. on the homepage) and every `*.mino.mobi` site recognises you with no re-login. The transport is the `.mino.mobi` domain cookie set on the OAuth callback (`Secure; HttpOnly; SameSite=Lax`): because every site shares the `mino.mobi` registrable domain, the cookie rides along on the client lib's credentialed `/api/me` and `/pds/*` calls. `AuthClient.init()` therefore validates against the worker even when *this* origin holds no token — a cookie-only session is picked up transparently. **Limitation:** `labglass.minomobi.com` is on a different registrable domain (`minomobi.com`), so the `.mino.mobi` cookie can't reach it; it falls back to its own per-site login. SSO only reaches sites that use the updated shared client lib (`packages/oauth-client/auth.js`) — currently bakery, photo, wave, wiki, and the homepage. Inline-OAuth sites and the grandfathered own-worker sites (airchat, poll/fluoddity) join as they migrate onto the shared lib.
- **`packages/oauth-client/auth.js`** — 9.7 KB browser-side library, no deps, no build. Exports `AuthClient` with `login(handle, {scope})`, `init()`, `getUser()`, `logout()`, and `auth.pds.{createRecord, putRecord, listRecords, deleteRecord, uploadBlob, getBlob}`. PDS calls go through the worker, so the browser never sees a token that talks to a PDS directly.
- **Deploy workflow**: `.github/workflows/deploy-auth.yml` — triggers on `main` or `claude/implement-oauth-bsky-JgUdn` touching `workers/auth/**`. The workflow auto-creates `mino-auth-db` on first run via `wrangler d1 create` (the `TODO_CREATE_DATABASE` placeholder in `workers/auth/wrangler.jsonc` is intentional — `sed`-patched at deploy time, not committed back).

### Per-site permission shaping — narrow scope + incremental escalation (the model)

**A login should request only the collections THAT site writes.** The worker takes a `scope` on every OAuth start and stores it per-session; the Bluesky consent screen renders the *requested* scope, not the metadata ceiling — so a narrow request = a short, legible consent. We moved to this because the enumerated 50-line union reads as *scarier* than `transition:generic`, which defeats the point of enumerating.

```js
const auth = new AuthClient();

// THE PATTERN: pass your site's own narrow scope. Short consent screen.
const HOOP_SCOPE = 'atproto repo:com.minomobi.hoop.story.save repo:com.minomobi.hoop.story.rumor /*…*/';
await auth.login('alice.bsky.social', { scope: HOOP_SCOPE });

// identity-only (no writes):
await auth.login('alice.bsky.social', { scope: 'atproto' });

// INCREMENTAL ESCALATION: when a write needs scope this session lacks, escalate
// just-in-time. ensureScope re-consents for the UNION of held + needed (so it never
// drops a grant the shared session already holds), then returns to this page. Call
// it from an explicit user gesture — it navigates away. No-op if already covered.
if (!auth.hasScope('com.minomobi.hoop.story.rumor')) await auth.ensureScope(HOOP_SCOPE);
```

**The SSO consequence (the one real tradeoff).** An OAuth token's scope is fixed at authorization — you can't widen a live token without a new consent. So with narrow scopes: **identity SSO stays instant** (the `.mino.mobi` cookie recognizes you everywhere with no re-login), but **write authorization is per-site** — a site you haven't granted writes for escalates on first write (one short consent). The shared session thus *accumulates* scope as you actually use sites, instead of asking for all 50 collections up front. There is no scope that is both short AND pre-authorizes every site's writes — except `transition:generic` (one line, maximally broad), which we're deliberately not using.

**Two derived strings in `workers/auth/src/oauth/scope.ts`:**
- `UNIFIED_SCOPE` — the enumerated union. **Back-compat fallback only**: what a `login()` with no `scope` still mints (so un-migrated sites keep working), and the long consent screen we're moving away from. New/updated sites pass a narrow scope instead.
- `METADATA_SCOPE` — the ceiling in `client-metadata.json`: `UNIFIED_SCOPE` **plus** `transition:generic` (grandfathered fluoddity/mmo). The auth server only grants what the metadata declares, so the ceiling must stay a superset — narrow per-site requests are always a subset, so **the ceiling is unchanged by the narrow-scope move.**

**When a new site ships a new lexicon, still add its collection to `WRITE_COLLECTIONS` in `scope.ts` and redeploy the auth worker** — that keeps the ceiling a superset so the site can request it (narrowly). The scope math (`hasScope`/`ensureScope`/`missingScopes`/`unionScopes`) is pure and node-tested in `packages/oauth-client/scope.selftest.mjs`.

**Migration status:** hoop is the first site on the narrow model (requests `HOOP_SCOPE`, escalates via `ensureScope`). The homepage and the other shared-lib sites (bakery, photo, wave, wiki) still mint `UNIFIED_SCOPE` by default — migrate them site-by-site (declare a scope + `ensureScope` before writes), then flip the worker's no-scope default from `UNIFIED_SCOPE` to `atproto` as the final step.

### Adding a new site to the shared OAuth worker

Three steps:

1. **Allowlist the origin**. Add `https://your-site.mino.mobi` to `ALLOWED_ORIGINS` in `workers/auth/src/index.ts:21-30`. (The wildcard `*.mino.mobi` check on line 36 catches subdomains, but list the explicit origin so future devs can see who's using the worker.)
2. **Import the client lib**. From your site: `import { AuthClient } from '../../packages/oauth-client/auth.js'`. Do **not** hand-roll an `auth.js` — photo/wave/wiki did, and they each diverge slightly. Use the shared lib.
3. **Pick a narrow scope**. Pass your site's own `{ scope }` to `login()` — only the collections you write (`'atproto repo:com.minomobi.yoursite.thing …'`) — so the consent screen is short. Add any new collection to `WRITE_COLLECTIONS` in `scope.ts` (the metadata ceiling must remain a superset) and redeploy the auth worker. For cross-site writes, escalate with `ensureScope()` rather than requesting the union. Omitting `{ scope }` falls back to the `UNIFIED_SCOPE` union — the long consent screen, avoid for new sites.

That's it. Push to a branch matching `deploy-auth.yml`'s trigger glob to update `ALLOWED_ORIGINS`; push your site's branch to deploy the frontend.

Per-site migration status and the grandfathered exceptions (poll, airchat,
mmo/draw/paint) are in [`docs/OAUTH.md`](docs/OAUTH.md).

### `POST /search` — the landing-page semantic search

`functions/search.js` (Pages Function, `POST /search`) answers fuzzy "which site does X" queries by stuffing the **whole** ~90-site catalogue into a Workers AI Llama 3.3 70B prompt (no vector DB — the corpus is ~4k tokens). Catalogue is generated from the PROJECTS array by `scripts/generate-search-catalog.mjs`. Frontend widget is inline in `index.html`. Uses the root project's existing `AI` binding (same as `functions/novelty.js`).

---

## Domain & Infrastructure

- **Domain**: `minomobi.com` (also `mino.mobi` — used in public-facing URLs)
- **Hosting**: Cloudflare Pages + Workers
- **Compute**: Cloudflare Workers + Durable Objects + D1
- **Email**: Cloudflare Email Routing — `tips@`, `editor@`, `modulo@`, `morphyx@minomobi.com`
- **DNS**: Cloudflare — CNAME records for subdomains → Pages deployments
- **ATProto**: PDS as backend for several apps (bakery, phylo, time, music, sweat)

---

## Deployment Model (read this — it's how everything ships)

**Every push to your Claude feature branch ships to production**, provided a `deploy-*.yml` workflow has a trigger glob that matches your branch and your changes touch its `paths:`. The human (`majormobius@gmail.com`) deploys *off Claude feature branches directly*, not just off `main`. There is no staging environment.

> **Read these two memos before touching deploys:**
> - **[`docs/DEPLOYS.md`](docs/DEPLOYS.md)** — the deploy pipeline in full (the registry system, Worker vs Pages, the golden rule, gotchas, onboarding).
> - **[`docs/REPO-STRUCTURE.md`](docs/REPO-STRUCTURE.md)** — where everything lives.
>
> **Source of truth is [`deploy-registry.json`](deploy-registry.json)**, not this file. Every surface → one Cloudflare resource → one `deploy-<surface>.yml` → one owning branch (`hero`) + `main`. Edit the registry, then run `node scripts/gen-deploy-triggers.mjs --write` (sync workflow triggers), `node scripts/lint-deploy-registry.mjs` (must print `✓ registry valid`), and `node scripts/gen-surface-map.mjs --write` (rebuild the landing-page table).

> ⭐ **THE GOLDEN RULE (do not skip — it has bitten us ~7 times).** A surface's `wrangler.jsonc` `name` **must** be the Cloudflare worker that owns the live custom domain, and the domain **must** be declared as a `routes: [{ pattern, custom_domain: true }]` entry. Otherwise `wrangler deploy` silently updates a stray `<name>.workers.dev` worker and **the live subdomain never changes** — a green deploy over a stale site. Don't assume `dir == subdomain` (`answers/` is live at `ask.mino.mobi`). Verify a deploy by confirming its log binds `<domain> (custom domain)`, not just that it's green. Full detection + fix in [`docs/DEPLOYS.md`](docs/DEPLOYS.md) §4.

What this means for you:

1. **Find your project's workflow first.** Before touching code, locate `.github/workflows/deploy-<project>.yml`. The `on.push.branches` list tells you which branches deploy that project. The `on.push.paths` list tells you what file changes wake it up.
2. **Match your branch name to an existing trigger glob, or add yours.** If you're working on a branch the workflow doesn't recognize, your commits won't ship. Either rename the branch to match (e.g. `claude/sentence-editing-drill-*` for rite), or open a small PR adding your branch to the trigger list.
3. **Prefer the workflow over local `wrangler deploy`.** The workflows hold the canonical build steps, secrets, D1 migration order, and post-deploy hooks. Local `wrangler deploy` skips migrations and post-deploy seeding and will drift.
4. **The user pushes to feature branches deliberately.** If you see them push to `claude/foo-Xy7Pq` directly, that *is* the prod deploy for that surface. Don't "fix" it by merging to main first.
5. **`workflow_dispatch` is your manual trigger.** Every deploy workflow has `workflow_dispatch:` so the human (or you, via the GitHub MCP tools) can fire a deploy out-of-band.

### Per-surface deploy map

**Do not hand-maintain a table here — it rots.** The live map is
[`deploy-registry.json`](deploy-registry.json) (`surface → dir → endpoint → type →
owning branch`). Read it as **[`docs/SURFACES.md`](docs/SURFACES.md)**, generated
from it; the visitor-facing rendering is the surface-map table on the landing
page, generated by `node scripts/gen-surface-map.mjs --write`. To see what
deploys what right now, read the index or run `node scripts/preflight.mjs`.

When designing a deploy for a new surface, copy the closest existing workflow —
they encode the build-order quirks (poll's `shared → web → api`, rite's "migrate
before deploy", audio's monorepo build) and the right secret names. Templates and
the full onboarding recipe are in [`docs/DEPLOYS.md`](docs/DEPLOYS.md) §5/§8.

---

## GitHub Actions

The full set of workflows lives under `.github/workflows/`. This section covers the non-deploy automation (provisioning, syncing, publishing, scoring). When in doubt, **read the workflow file** — these are short, declarative, and the source of truth.

### Deploy workflows

One `deploy-<surface>.yml` per surface (~45). Don't enumerate them here — `ls .github/workflows/deploy-*.yml`, or read [`deploy-registry.json`](deploy-registry.json) / [`docs/DEPLOYS.md`](docs/DEPLOYS.md).

### Provisioning / one-shots

| Workflow | Purpose |
|----------|---------|
| `create-mmo-db.yml` | Creates the `mmopaint-db` D1 database and binds it to the poll worker. Run once per environment. |
| `create-kv-namespace.yml` | Provisions Cloudflare KV namespaces. |
| `d1-migrate.yml` | Manual D1 migration runner — fallback when `deploy-*.yml` migration step isn't enough. |

### Content + data pipelines (these write to PDS, Bluesky, or commit data back to the repo)

| Workflow | Trigger | Side effect |
|----------|---------|-------------|
| `post-to-bluesky.yml` | Push to `time/posts/**.md` | **Posts to real Bluesky** (3 accounts). Danger zone — see Project 3. |
| `publish-whtwnd.yml` | Push to `time/entries/**` | Writes WhiteWind records to PDS. |
| `publish-answers-categories.yml` | Push tracked paths | Publishes Yahoo Answers ATProto categories. |
| `sync-phylo.yml` | Push tracked paths | Writes phylo records to PDS. |
| `sync-finance.yml` | Push tracked paths | Syncs finance datasets. |
| `sync-pm.yml` | Push tracked paths | Syncs project-management data. |
| `verify-phylo.yml` | Push/manual | Verifies phylo PDS state. |
| `register-feed-generator.yml` | Manual | One-time registration of the SimCluster feed generator on Bluesky. |
| `score-deep-wiki.yml` | Push/manual | Scores Wiki Cards, writes catalog to PDS. |
| `anchor-cosines.yml` | Push/manual | Commits embedding anchors back to the repo. |
| `build-complementarity.yml` | Push/manual | Builds complementarity dataset. |
| `build-cult-basis.yml` | Push to `scripts/build-cult-basis.mjs`, manual | Rebuilds `wars/cult/basis.*` artifacts. |
| `fetch-lexicons.yml` | Push, monthly cron, manual | Downloads NRC / AFINN / Concreteness / SUBTLEX-US; commits JSON to `rite/lexicon/data/`. |
| `fetch-atproto-data.yml` | Manual / scheduled | Pulls ATProto records into the repo. |
| `fetch-flavor-data.yml` | Manual / scheduled | Pulls flavor/recipe data. |
| `fetch-lexicon-json.yml` | Manual / scheduled | Earlier lexicon variant (kept for back-compat). |
| `fetch-yum-wikipedia.yml` | Manual / scheduled | Wikipedia scraping for yum/recipe dataset. |
| `query-otol.yml` | Manual | Queries Open Tree of Life. |
| `mine-fodder.yml` | Cron (every 6h) | Mines Project Gutenberg for rite/fodder candidates. |
| `write-test-recipe.yml` | Manual / test | Recipe-writing smoke test. |
| `bisk-digest.yml` | Cron (daily 13:00 UTC, **default branch only**) + dispatch | Builds the SimCluster digest, commits `bisk/data`, self-deploys bisk.mino.mobi. |
| `mirror-tangled.yml` | Push to `erdos/**` / dispatch | Force-pushes a self-contained site to its forkable tangled repo over SSH. |
| `bootstrap-tangled-key.yml` | Manual | Generates the tangled deploy keypair on a runner; stores private half as `TANGLED_SSH_KEY` (needs one-time `SECRETS_PAT`). |
| `remixify.yml` | Manual / marker push | **WIP** — writes a `sh.tangled.repo` record + pushes; incomplete (skips knot XRPC registration). |

The tangled remix pipeline (what these three workflows are for) is documented in [`docs/TANGLED.md`](docs/TANGLED.md).

### Key secrets (GitHub Actions environment)

- **Cloudflare**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — used by every `deploy-*.yml`.
- **Bluesky posting**: `BLUESKY_HANDLE`/`_APP_PASSWORD` (main), and `_MODULO_`/`_MORPHYX_` variants.
- **Rite/Airchat extras**: `OPENAI_API_KEY` (Whisper), `RITE_ADMIN_KEY`, `ADMIN_KEY` (airchat).
- **Poll worker secrets** (set via `wrangler secret put`, not Actions env): see Project 1 list — `RSA_*`, `OAUTH_*`, `ATPROTO_SERVICE_*`.

---

## Build Commands

```bash
# Root (builds bakery)
npm run build

# Poll monorepo
cd poll && npm install && npm run build    # shared -> web
cd poll && npm run deploy                  # wrangler deploy
cd poll && npm run test                    # shared + api tests
cd poll && npm run typecheck               # all packages

# Bakery standalone
cd bakery && npm install && npm run build

# D1 migrations (poll)
npx wrangler d1 execute atpolls-db --file=poll/apps/api/migrations/0001_init.sql --remote
```

---

## Wrangler compatibility dates

**Not listed here** — this used to be a hand-kept table of 10 surfaces out of
74, which is exactly the shape that rots. The compat date and flags for a
surface are in its own `<dir>/wrangler.jsonc`, and `scripts/build-spec.mjs`
reads all 69 of them into `spec/data.js` (rendered at `mino.mobi/spec/`).

A worker 500ing for no visible reason is often compat-date drift — check the
surface's own config first.

---

## Common Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Poll deploy fails | Build order wrong | Must build shared before web |
| Feed returns empty | Constellation relay down | Falls back to member feeds automatically |
| Feed communities stale | Cron failed | Check worker logs, rerun manually via `/health` |
| Zoom blank canvas | feed.mino.mobi unreachable | Check feed worker health, CORS |
| labglass blank page | Missing COOP/COEP headers | Check `labglass/_headers` |
| PWA won't install | Bad manifest.json or sw.js | Validate manifest, check service worker registration |
| ATProto auth fails | Expired app password | Regenerate in Bluesky settings |
| Worker 500s | Compatibility date drift | Update wrangler compat date |
| D1 schema mismatch | Missing migration | Run `d1-migrate.yml` workflow |
| Bluesky post fails | >300 chars or >12 posts | Check thread format constraints |
| DID resolution fails | Missing `.well-known/atproto-did` | Verify file exists and contains correct DID |
| Post pipeline fires unexpectedly | Pushed .md to time/posts/ | Workflow triggers on any push to that path |

---

## Working in this sandbox (capabilities audit)

You're running in Claude Code's managed remote-execution environment — an ephemeral container with the repo cloned fresh. Container is reclaimed after inactivity; anything worth keeping has to be committed and pushed.

### What works

- **File ops at any size**: `Read`, `Edit`, `Write` all work on large files. Prefer `Edit` for changes to existing files (sends only the diff); `Write` is fine for new files or full rewrites. The "800-line ceiling" warning from earlier CLAUDE.md revisions is no longer accurate — multi-thousand-line merges and edits land cleanly.
- **Git**: clone, branch, merge, commit, push to `origin` — all work. Push has retry-with-exponential-backoff guidance baked into the harness prompt.
- **GitHub via MCP**: `mcp__github__*` tools (scoped to `minormobius/agent01`) let you read PRs, post comments, list commits, create branches, open PRs, run secret scans, etc. **Use these instead of trying to install `gh`** — there is no `gh` CLI.
- **WebFetch / WebSearch**: public-internet reads work. Useful for checking docs, looking up library APIs, reading public Bluesky posts.
- **Subagents**: `Explore` for read-only multi-file search; `Plan` for architecture; `general-purpose` for catch-all. Spawn in parallel when work is independent.
- **Bash**: full local shell, multi-line, background runs, hooks.

### What does NOT work from here

- **No `wrangler deploy` to Cloudflare.** The sandbox can't authenticate to the Cloudflare API. Push to a deploy-triggering branch and let the Action run it.
- **No live Bluesky / PDS writes** (createSession, uploadBlob, createRecord). Same reason — auth secrets live in GH Actions, not here.
- **No remote D1 writes** (`wrangler d1 execute --remote`). Use `d1-migrate.yml` or let `deploy-*.yml` apply migrations.
- **No `gh` CLI / `hub` CLI** — use the GitHub MCP tools.
- **No persistent state between sessions.** Anything not committed is gone.

### Practical pattern

The deploy workflows ARE your network. The shape of a normal feature loop is:

```
1. Edit files locally in the sandbox.
2. Commit + push to a Claude feature branch whose name matches a deploy workflow's trigger glob.
3. The workflow fires, builds, migrates, deploys. The user reviews the live site.
4. (Optional) merge to main.
```

If step 2's branch doesn't match any trigger glob, the deploy won't fire and the change won't ship. Either rename the branch or edit the workflow's `branches:` list (small, low-risk PR).

---

## Principles

1. **Don't break what's working.** Read before changing. Test before pushing.
2. **Minimal changes.** Fix what's broken, nothing more. No drive-by refactors.
3. **Headers matter.** COOP/COEP, HSTS, CSP — get them right or features silently fail.
4. **Build order matters.** Poll monorepo: shared → web → deploy. Always.
5. **Push triggers Actions, and Actions ship to prod.** Know which workflow your push wakes up before you push it. A push to `time/posts/` posts to Bluesky. A push to a surface's `dir` on an owning branch deploys it. Which branch owns which surface is in [`deploy-registry.json`](deploy-registry.json) (one owner each — no wildcards); the pipeline is in [`docs/DEPLOYS.md`](docs/DEPLOYS.md).
6. **The deploy `name` must own the domain.** See the golden rule in the Deployment Model section / `docs/DEPLOYS.md` §4 — a `wrangler.jsonc` `name` that doesn't match the worker bound to the live subdomain ships green into a stray and the site never updates.
6. **Deploys belong in GitHub Actions, not in your bash session.** The sandbox can't reach Cloudflare/Bluesky/PDS — that's by design, and the deploy workflows already hold the right secrets, build steps, and migration ordering. If you find yourself wanting to `wrangler deploy` from here, you actually want to push to a branch the workflow recognizes.
7. **Feed, poll, rite, airchat share D1 (`atpolls-db`).** Migrations live in `poll/apps/api/migrations/` and apply to every consumer. Number sequentially; if two branches collide on the same migration number, the later merge renumbers (see commit `070f919` for the pattern).
8. **The user pushes to feature branches deliberately.** When you see commits land on a `claude/foo-*` branch and the site updates, that's the intended deploy path — not a mistake to "fix" by retargeting to `main`.
