# Social / ATProto Tooling — Catalogue & Stack Audit

**Date:** 2026-07-01
**Scope:** every social-media / Bluesky / ATProto tool surface in the repo — the `b/` corner, the rite family, photo, the graph/feed stack, the writers, and the shared plumbing underneath.
**Method:** static code review of each surface (routes, imports, wrangler configs, deploy workflows) + live HTTP checks against every production endpoint on the audit date.
**Interactive rendering:** the same catalogue is walkable at **[b.mino.mobi/map/](https://b.mino.mobi/map/)** ("the quarter") — districts by function, the road east climbs the complexity tiers, per-tool cards carry stack chips and these health statuses. Data lives in `b/map/tools.js`; keep the two in sync.

---

## 1. Verdict

**The stack is in good shape.** Every live endpoint answered on the audit date — all 23 probed URLs returned 200 (or a clean trailing-slash 307), every rite API route has a matching handler, no broken imports were found anywhere in b/, rite/, or photo/, and the shared D1 (`atpolls-db`) is serving poll, feed, rite, airchat, and cat without schema drift. The issues that exist are almost all *policy drift* (stale OAuth forks, missing golden-rule routes, CLAUDE.md rot) rather than breakage. One genuine bug was found and fixed in this pass; one operational wound (the feed publisher takedown) predates the audit and has an appeal pending.

### Live checks (2026-07-01)

| Endpoint | Result |
|---|---|
| b.mino.mobi — `/`, `/disk/`, `/spark/`, `/dyad/`, `/gc/` (+mutuals/blockers/api), `/squares/`, `/feedgen/`, `/tetr/` | all 200 |
| rite.mino.mobi — `/`, `/fodder/`, `/redact/`, `/ask/`, `/atlas/`, `/lexicon/`, `/list/`, `/web/`, `/signal/` | all 200 |
| rite APIs — `/api/sentence` (serving corpus), `/api/fodder/stats` (112 pending, 122 votes, 26 voters) | 200, healthy payloads |
| photo.mino.mobi | 200 |
| feed.mino.mobi — `/health` `{ok:true, communities:10}`, `getFeedSkeleton`, `getCommunities` | 200 |
| zoom.mino.mobi, bisk.mino.mobi (`data/latest.json` current), poll.mino.mobi | 200 |
| airchat.mino.mobi `/api/airchat/health` | 200 — but `admin:false` (see F-06) |

---

## 2. The catalogue

Complexity tiers (the map's west→east road): **I** lone page · **II** heavy client · **III** worker-backed (D1/AI/cron/secrets) · **IV** citadel-grade (monorepo/DO/crypto).

### Analysis commons — point a handle, get insight (read-only)
| Tool | Tier | Stack | Data |
|---|---|---|---|
| empathy (empath.mino.mobi) | II | vanilla JS | public AppView |
| judge, novelty, ternary(+2,+3), echo, density, wild, track (root bundle) | I–II | vanilla JS, some embeddings via `functions/` | public AppView |
| b/spark | II | vanilla JS; synthesizes a TID cursor to seek the PDS server-side — clever and clean | raw PDS `listRecords` |
| b/dyad | II | vanilla JS; 12 parallel repo scans, stale-run guard | raw PDS + AppView |

### Graph quarter — the follow graph as terrain
| Tool | Tier | Stack | Data |
|---|---|---|---|
| zoom | II | canvas, no build | feed.mino.mobi API |
| bisk | III | static + daily GH cron, deterministic, no inference | AppView → baked JSON (current as of audit date) |
| cluster, seek | II | vanilla JS (cluster still on legacy inline OAuth) | AppView |
| b/disk | II | canvas + DuckDB-WASM (CDN) + Jetstream websocket | AppView + Jetstream |
| b/squares | III | worker fan-out with service token, 90s cache | repo scans via b worker |

### Thread alley
weft (II, tidy-tree canvas + YAML export), photo `/#/thread` (II), b/tetr (II — hex-polyomino thread tetris, genuinely nontrivial cube-coordinate math).

### Scriptorium — the rite family (one worker, `atpolls-db`, Workers AI)
drill `/` (III), fodder (III, cron + Llama), redact (II), ask (III), atlas (II), lexicon (II), list (III), web (II), signal (III). All routes verified against worker.js — **no dead routes, no missing files**. Plus three surfaces CLAUDE.md doesn't know about: `/name/`, `/wc/` (+`/api/wc/odds`), `/font/` (a full Rust→WASM crate built in CI).

### Gallery row
photo (III — React 19 + Vite 6, DuckDB-WASM + transformers.js from CDN, vendored Rust/WASM CAR parser + OCR, thin image-proxy worker), astro (II), prism (II), cat (III — Jetstream DO + D1).

### The watch — block intelligence
gc matrix (II), gc/mutuals (II), gc/blockers (III, clearsky index), gc/api (III — clean read-only JSON API, `lib/gc.js` is well-factored: bounded concurrency, subrequest budgets, typed errors).

### The citadel — the writers
poll (IV — the monorepo: DO coordinators, D1, RSA blind signatures, own OAuth BFF), airchat (III), answers (II), b/feedgen (III — stateless feed hosting, feeds live entirely on ATProto), io (III, scarred — see F-01), pod (III, awaiting domain), wave (II), wiki (II), time (II + the posting pipeline), fluoddity (II).

### The hamlet — your data on your PDS
bakery (II, the shared-auth reference), music (II, inline OAuth), sweat (I, inline OAuth), org (II, inline OAuth), os (II — the PDS shell), crm (II, domain pending).

### The undercroft — plumbing
workers/auth (III, the OAuth BFF), workers/feed (III), workers/scores (III), workers/bsky-bot (III), `packages/atproto` (pds/bsky/crypto — no deps, no build), `packages/oauth-client` (browser AuthClient + scope math), `rite/lib/atproto` (CAR→WASM→threads pipeline, deliberately vendored WASM), the post-to-bluesky pipeline.

---

## 3. Findings

Ranked. **Fixed in this pass** marked ✅; the rest are recommendations with owners.

### Operational

- **F-01 · feed publisher account takedown (pre-existing, highest attention).** The SimCluster feed's publisher (`simcluster`) was taken down 2026-06-01 as collateral from the io reply-bot incident (with `minomobi.bsky.social` and `modulomino`); appeal pending, documented in `io/DESIGN.md`. The worker itself is healthy (10 communities, skeleton serving) but the feed is orphaned from discovery in-app. io now runs on morphyx with `SWEEP_REPLY=off` and a drip-mint cap. *No code action here; track the appeal.*
- **F-02 · photo violates the golden rule.** `photo/wrangler.jsonc` has **no `routes: [{ pattern: "photo.mino.mobi", custom_domain: true }]`** — exactly the green-but-stale-deploy pattern DEPLOYS.md §4 warns about; the domain is only attached via the dashboard. One-line fix, but photo belongs to `claude/feature-merge-candidate-l4dkwq`, so flagged rather than fixed here. (b and rite are both compliant.)
- **F-03 · airchat `ADMIN_KEY` unset in prod** — `/api/airchat/health` reports `admin:false`, so the whitelist admin API is dead. Set the secret or accept list-based whitelisting as the only path.

### Bugs

- **F-04 ✅ · b/bees.js called a method that doesn't exist.** `eng.reset(cfg)` (twice) — `FluoddityEngine` only has `load(config)`; the TypeError was swallowed by `try/catch`, so "🎲 random hive" changed the rule without respawning the swarm. Fixed: both sites now call `eng.load(spread(...))`.
- **F-05 ✅ · feedgen and tetr were unlinked** — live wings of b.mino.mobi with no card on the index, absent from the registry `serves`. Fixed: cards added, `serves` updated, both placed on the map.

### Policy drift (the OAuth strategy is leaking)

- **F-06 · `b/feedgen/auth.js` is a stale fork of `packages/oauth-client/auth.js`.** It predates the scope helpers (`hasScope`/`ensureScope`), so feedgen logs in with the full `UNIFIED_SCOPE` (the long consent screen the repo is moving away from) and handles insufficient scope by full re-login. It should sync the shared lib and pass a narrow `repo:com.minomobi.feedgen.def repo:app.bsky.feed.generator` scope. (The fork exists because the ASSETS binding can't serve `../packages/` — same reason rite vendors its WASM — so "sync" means re-copy, with a header noting the provenance.)
- **F-07 · inline-OAuth stragglers**: music, sweat, cluster, answers, org, labglass still hand-roll OAuth (known; CLAUDE.md migration table). Also `b.mino.mobi` rides the `*.mino.mobi` wildcard instead of being listed explicitly in the auth worker's `ALLOWED_ORIGINS`, against the stated convention.

### Hygiene

- **F-08 · CLAUDE.md rot** (worth a docs pass on someone's next touch):
  - rite worker.js is **2,129 lines**, not "~620"; rite has **12 surfaces**, not 9 (`/name/`, `/wc/`, `/font/` undocumented); its deploy branch is `claude/font-generator-demo-f3pdfa`, not `claude/sentence-editing-drill-*`.
  - photo deploys from `claude/feature-merge-candidate-l4dkwq`, not `claude/atproto-arena-duckdb-8H9SQ`, and is a **Worker-with-assets, not Pages**; DuckDB-WASM/transformers.js are runtime CDN imports, not build deps.
- **F-09 · dead code**: `photo/src/lib/{memory,vectorstore}.js` imported by nothing; `b/engine.js` carries ~450 unused lines of fluoddity shader variants/genome ops (verbatim copy — harmless, but noted).
- **F-10 · gc duplication**: `/gc/` and `/gc/mutuals/` re-implement the block-walk client-side while the worker exposes the same queries (and the server's clearsky-intersection approach is much faster for mutuals). Two divergent implementations of the same question now exist; converging the pages onto `/api/gc/*` is the cheap win.
- **F-11 · external-endpoint exposure** (watch-list, all currently fine): hardcoded `jetstream2.us-east.bsky.network` (disk — dies silently if rotated), `api.clearsky.services/api/v1/anon` (gc), `bsky.social` createSession (b worker service token), CDN-pinned duckdb-wasm/arrow/transformers (disk, photo). Gemini-generated regexes execute unbounded in the feedgen worker per request — validity is checked, ReDoS complexity isn't (low severity, isolated per-request).
- **F-12 · registry/workflow drift elsewhere**: `deploy-duck.yml` carries a branch (`claude/oneill-golf-simulation-30ujnk`) that isn't in the registry — the trigger generator wants to remove it. Left untouched (duck isn't mine); duck's owner should re-run `gen-deploy-triggers.mjs --write` or add the branch to the registry.
- **F-13 · minor data gap**: `rite/lexicon/data/concreteness.json` was never fetched/committed (page falls back to the inline mini-lexicon by design). Re-run `fetch-lexicons.yml` to complete the set. Cosmetic comment rot in b/tetr (says odd-r/pointy-top, code is odd-q/flat-top) and disk's replay legend (advertises like events the scraper never collects).

---

## 4. What shipped with this audit

On branch `claude/social-tools-map-stack-review-odoveu` (now the registry owner of the `b` surface):

1. **`b/map/` — "the quarter"**: the walkable city catalogue (60 tools, 9 function districts, tier milestones I–IV along the avenue, per-tool cards with stack chips, tier pips, live-health dots and caution notes). Daylight rendering: 2.5D building facades whose storey count is the tool's tier, parkland, a canal with bridges in front of the underworks, warn-status pennants. A **passport** (localStorage, no auth) tracks which buildings you've found and which tools you've launched — visited buildings light their windows, and you earn a civic rank (stranger → tourist → wanderer → regular → citizen → alderman → keeper of the quarter) from a tier-weighted score. Vanilla canvas, no deps, no build; world layout is seeded/deterministic and self-tested (all POIs reachable, no collisions). *Phase 2 (designed, not built): cross-site usage profiles as `com.minomobi.quarter.stamp` records on the user's PDS via the shared auth worker — needs a `WRITE_COLLECTIONS` addition and auth-worker redeploy, which belongs to the auth surface's owner.*
2. **b index**: "✦ walk the map" entry, plus the missing feedgen and tetr cards (F-05).
3. **b/bees.js**: the `reset()`→`load()` fix (F-04) and a map bee.
4. **Registry**: `b` claimed by this branch; `serves` now lists feedgen/tetr/map; note updated; triggers regenerated and linted.
5. This document.

**Suggested next moves** (in value order): fix photo's golden-rule route (F-02, one line, photo's owner); re-sync feedgen's auth fork with a narrow scope (F-06); converge gc pages onto the API (F-10); a CLAUDE.md docs pass (F-08); re-run fetch-lexicons (F-13).
