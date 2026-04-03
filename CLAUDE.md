# minomobi — Production Operations

## Role

This branch is the **devops/production branch** for all minomobi web properties. Its job is site health: deployments work, pages load, workers respond, builds pass, PWAs install, headers are correct, and nothing is broken.

Content creation, research, editorial voice, and feature design happen elsewhere. This branch receives sites, stabilizes them, and keeps them running.

## Domain & Infrastructure

- **Domain**: `minomobi.com` (also `mino.mobi` — used in public-facing URLs)
- **Hosting**: Cloudflare Pages (cards site deploys from `claude/wiki-card-game-oJbLE` branch; other sites from `main`)
- **Compute**: Cloudflare Workers + Durable Objects + D1
- **Email**: Cloudflare Email Routing — `tips@`, `editor@`, `modulo@`, `morphyx@minomobi.com`
- **DNS**: Cloudflare — CNAME records for subdomains → Pages deployments
- **ATProto**: PDS as backend for several apps (bakery, phylo, time, music, sweat)

---

## Site Inventory

Every site, its stack, deployment type, and what to check.

### Tier 1 — Build Step Required

These have `npm install` + build pipelines. Breakage here blocks deployment.

| Site | Dir | Stack | Build | Deploy Target |
|------|-----|-------|-------|---------------|
| **Bakery** | `bakery/` | React + Vite | `npm run build` → `dist/` | Pages (bakery.mino.mobi) |
| **ATPolls** | `poll/` | React + Vite + Workers + D1 + DO | Monorepo: shared → web → api | Pages + Worker (poll.mino.mobi) |

**Poll specifics**:
- Workspace monorepo: `packages/shared`, `apps/web`, `apps/api`
- D1 database: `atpolls-db` (fee2f25a-8b4a-4d46-b245-9d5da93c117d)
- Durable Object: `PollCoordinator` (per-poll state machine)
- Migrations: `poll/apps/api/migrations/0001_init.sql` through `0004`
- Build order: `build:shared` → `build:web` → deploy worker
- Has its own `poll/CLAUDE.md` for implementation details

### Tier 2 — Static Sites with Wrangler Config

Served directly by Cloudflare. No build step, but have `wrangler.jsonc` for local dev or worker bindings.

| Site | Dir | Notes |
|------|-----|-------|
| **Root** | `/` | Landing page (`index.html`), `wrangler.jsonc` at root |
| **Mino Times** | `time/` | PDS-backed article viewer, podcast RSS |
| **Phylo** | `phylo/` | Tree viewer, PDS-backed clade data |
| **LABGLASS** | `labglass/` | DuckDB + Pyodide, needs COOP/COEP headers |
| **Music** | `music/` | PWA, ATProto lexicons |
| **Sweat** | `sweat/` | PWA, ATProto lexicons |
| **Noise** | `noise/` | Visualization PWA |
| **Flows** | `flows/` | Network flow viz |
| **Read** | `read/` | RSVP reader, has worker.js |
| **Cards** | `cards/` | Deep Wikipedia card game |

### Tier 3 — Pure Static (No Config)

Standalone HTML/JS dashboards. No workers, no build, no service workers.

| Site | Dir | What |
|------|-----|------|
| **Cluster** | `cluster/` | Social graph clustering |
| **Density** | `density/` | Post brevity metrics |
| **Echo** | `echo/` | Post density comparison |
| **Judge** | `judge/` | Posting profile analysis |
| **Novelty** | `novelty/` | Semantic novelty trajectory |
| **Seek** | `seek/` | Friend discovery |
| **Ternary** | `ternary/` | Ternary chart analysis |

### Infrastructure-Only

| Dir | Purpose |
|-----|---------|
| `modulo/` | `.well-known/atproto-did` for @modulo.minomobi.com |
| `morphyx/` | `.well-known/atproto-did` for @morphyx.minomobi.com |
| `.well-known/` | Root domain ATProto DID |
| `workers/bsky-bot/` | Scheduled cron worker (every 5 min), KV binding |
| `workers/cluster-batch/` | Batch processing worker |
| `functions/` | Serverless functions (cluster-batch, novelty, profile, seek-profiles, ternary, gutenberg-proxy) |

---

## Production Checks

### What "working" means per site type

**Static sites**: `index.html` loads, no 404s on assets, links resolve.

**PWAs** (bakery, music, sweat, noise, poll): `manifest.json` valid, `sw.js` registers, icons load, `display: standalone` works, offline shell loads.

**Worker-backed sites** (poll, read, labglass): Worker responds on routes, CORS headers present, D1 queries succeed (poll), Durable Object binds (poll).

**PDS-backed sites** (time, phylo, bakery, music, sweat): ATProto fetch calls resolve, records render, auth flows work where applicable.

**Security headers**:
- `labglass/`: Requires `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: credentialless` (SharedArrayBuffer for DuckDB)
- `poll/`: Full security header set (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy)

### Wrangler compatibility dates

Keep these current. Stale dates can cause Worker runtime behavior changes.

| Project | Compat Date | Flags |
|---------|-------------|-------|
| Root | 2026-02-20 | — |
| Bakery | 2026-02-20 | — |
| Poll (Pages) | 2026-02-20 | — |
| Poll (API) | 2024-07-18 | nodejs_compat, sqlite |
| Labglass | 2026-02-25 | — |
| Read | 2026-03-14 | — |
| Music | — | — |
| Sweat | — | — |
| Noise | — | — |
| Flows | — | — |
| Cards | — | — |
| bsky-bot | 2026-02-20 | — |
| cluster-batch | 2024-12-01 | — |

---

## GitHub Actions

Workflows that affect production. Understand what each pushes and where.

| Workflow | Trigger | Deploys To |
|----------|---------|------------|
| `deploy-poll.yml` | Push to `main` (poll/**) or manual | Cloudflare Worker + Pages |
| `post-to-bluesky.yml` | Push to `time/posts/` | Bluesky (3 accounts) |
| `publish-whtwnd.yml` | Push to `time/entries/` | PDS (WhiteWind records) |
| `sync-phylo.yml` | Push to tracked paths | PDS (phylo records) |
| `d1-migrate.yml` | Manual | D1 database |
| `anchor-cosines.yml` | Push/manual | Commits embeddings to repo |
| `score-deep-wiki.yml` | Push/manual | PDS (card catalog) |

**Key secrets** (GitHub Actions environment):
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`
- `BLUESKY_MODULO_HANDLE`, `BLUESKY_MODULO_APP_PASSWORD`
- `BLUESKY_MORPHYX_HANDLE`, `BLUESKY_MORPHYX_APP_PASSWORD`

---

## Build Commands

```bash
# Root (builds bakery)
npm run build

# Poll monorepo
cd poll && npm install && npm run build    # shared → web
cd poll && npm run deploy                  # wrangler deploy
cd poll && npm run test                    # shared + api tests
cd poll && npm run typecheck               # all packages

# Bakery standalone
cd bakery && npm install && npm run build

# D1 migrations (poll)
npx wrangler d1 execute atpolls-db --file=poll/apps/api/migrations/0001_init.sql --remote
```

---

## Common Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Poll deploy fails | Build order wrong | Must build shared before web |
| labglass blank page | Missing COOP/COEP headers | Check `labglass/_headers` |
| PWA won't install | Bad manifest.json or sw.js | Validate manifest, check service worker registration |
| ATProto auth fails | Expired app password | Regenerate in Bluesky settings |
| Worker 500s | Compatibility date drift | Update wrangler compat date |
| D1 schema mismatch | Missing migration | Run `d1-migrate.yml` workflow |
| Bluesky post fails | >300 chars or >12 posts | Check thread format constraints |
| DID resolution fails | Missing `.well-known/atproto-did` | Verify file exists and contains correct DID |

---

## Principles

1. **Don't break what's working.** Read before changing. Test before pushing.
2. **Minimal changes.** Fix what's broken, nothing more. No drive-by refactors.
3. **Headers matter.** COOP/COEP, HSTS, CSP — get them right or features silently fail.
4. **Build order matters.** Poll monorepo: shared → web → deploy. Always.
5. **Push triggers actions.** Know what workflows fire before you push. A push to `time/posts/` posts to Bluesky. A push to `poll/` deploys the worker.
6. **Sandbox can't reach the internet.** All network operations (API calls, deploys, PDS writes) happen via GitHub Actions, not here.
