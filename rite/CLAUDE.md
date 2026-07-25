# rite — rite.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Sentence editing drill plus nine surfaces over Bluesky prose—fodder swipe deck, redactle, semantic search, atlas, lexicon lenses, list themes, link knowledge graph, and signal mapping.

## Facts

| | |
|---|---|
| Surface | `rite` |
| Dir | `rite/` |
| Endpoint | `rite.mino.mobi` |
| Type | fullstack |
| Owning branch | `claude/procedural-name-generator-2qqwfq` |
| Deploy | `.github/workflows/deploy-rite.yml` |
| Uses | `atpolls-db` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "rite"`.

## Rite — the eleven surfaces

**Live at**: `rite.mino.mobi`
**Stack**: Cloudflare Worker (assets binding) + D1 + Workers AI
**Deploy**: `.github/workflows/deploy-rite.yml` — runs migrations, then `wrangler deploy`

Single Worker that hosts eleven surfaces, most over the same shared `rite/lib/atproto/` pipeline (CAR fetch → WASM parse → thread chains → reading-level scoring):

- **`/`** — sentence editing drill. User is shown a verbose sentence; rewrites it; gets scored on fidelity (BGE embedding cosine vs. reference rewrites), brevity (vs. median reference word count), clarity (Flesch delta), and speed.
- **`/fodder/`** — Tinder-style swipe deck for crowdsourcing new corpus entries. Cron mines Project Gutenberg every 6h, asks Llama 3.1 8B for three rewrites, queues candidates as `pending`. Yes-votes promote a candidate to `approved` once it hits 5 yes & ≥70% ratio.
- **`/redact/`** — Redactle-style game over a Bluesky user's longest prose threads. Pulls their full repo as a CAR, finds prose chains, picks ≈45% of content words to censor, scores guesses.
- **`/ask/`** — semantic search over a profile's prose threads. Embeds each thread once via BGE, stores `(did, thread_id, text, embedding BLOB, x, y)` in D1, renders a 2D PCA map; query box highlights matching threads.
- **`/atlas/`** — multi-view analytics over the same threads (scatter chars × Flesch, Pareto by length, Pareto by difficulty, Flesch histogram). Pure deterministic scoring, no inference.
- **`/lexicon/`** — word-level lenses tagged against open lexicons (NRC Emotion, Brysbaert Concreteness, AFINN, SUBTLEX-US baseline). Frequency, TF-IDF distinctiveness, emotion-color, sentiment-color, concreteness gradient. Lexicons fetched + committed by `.github/workflows/fetch-lexicons.yml` to `rite/lexicon/data/*.json`; page falls back to inline mini-lexicons if the fetched files aren't present.
- **`/list/`** — semantic analysis over a Bluesky list. Resolves a list URL via `app.bsky.graph.getList`, fans out to `/api/ask/check` + `/api/ask/map` per member, aggregates each indexed member's cluster labels into list-level themes (words appearing in cluster labels of ≥ 2 members). Members not yet indexed get a deeplink to ask (`/ask/?handle=…`); an "Index all" button runs the same in-tab pullProfile→analyzeProfile→POST /api/ask/index pipeline sequentially per member.
- **`/web/`** — outbound link knowledge graph. Pulls a writer's CAR, extracts every external link facet (skipping bsky.app / *.bsky.social), builds a co-occurrence graph (two URLs share an edge whenever they appear in the same thread), runs PageRank, lays it out with Fruchterman-Reingold. The query box runs *personalized* PageRank seeded on URLs whose domain or anchor text matches — top-ranked URLs are the writer's strongest connections to that idea. Domain rollup toggle. Pure client-side; multi-CAR union on roadmap.
- **`/signal/`** — semantic map of what a writer *reposts* (their taste, vs `/ask/`'s voice). Pulls the CAR, walks every `app.bsky.feed.repost` record, hydrates each `subject.uri` target via `app.bsky.feed.getPosts` (25 URIs/call), drops self-reposts and image-only targets, BGE-embeds, stores in D1 keyed by `(subscriber_did, target_uri)`, then PCA + k-means + cluster labels in the same shape as `/ask/`. Capped at most-recent 3000 reposts per index round. Server endpoints: `/api/signal/{check,index,query,map,target}`. Schema keyed by subscriber+target so the same target post can sit in many subscribers' indexes — leaves room for cross-user signal analytics later.
- **`/names/`** — procedural name-set generator. One seed → one coherent set of N names (default 300) that read as if they came from a single invented culture: 12 blendable culture packs (phonotactic wardrobes) × 5 setting registers (classical / fantasy / scifi / fey / wasteland) × 5 kinds (given / family / place / full / title). A per-seed "charter" subsamples the culture's wardrobe and Zipf-boosts favorite sounds so the set coheres; uniqueness is enforced hard (no dups, pairwise edit distance ≥ 2, no prefix containment). Epithets on `full` names are generated from per-setting grammars (templates like `the {times}-{part}`, `{count}-{body}`, `{noun}{bond}` over subsampled word banks; the `of {place}` token mints a toponym from the same charter) — unique within a set. Deterministic (xmur3+mulberry32, borges-style) — a URL is a namebook. The engine (`rite/names/engine.js`) is shared verbatim by the worker, the browser page, and the node selftest (`rite/names/engine.selftest.mjs` — run it before touching the engine). Public API, CORS open, pure compute (no D1/AI): `GET /api/names?seed=&culture=&setting=&kind=&count=` and `GET /api/names/cultures`. Sister to the `/name/` essay (name *families* via modal metaphor — different thing, cross-linked).
- **`/org/`** — procedural org-chart generator, sister to `/names/` (imports its engine to name the people). One seed → one whole organisation: 8 **verticals** (corp / startup / military / feudal / crime / monastic / academic / ecclesiastic — each a rank ladder + title vocabulary + departments) × 7 **shapes** (pyramid / tall / flat / wide / matrix / cellular / fractal — a topology transform over the ladder). A per-seed charter picks which departments the org runs and its name; titles are built from per-rank templates over `{dept}/{ic}/{spec}/{unit}/{ord}` tokens, people minted by the names engine (so crime reads *Salvatore the Rusted*, a duchy reads *Roderick the Grim, Baron of Aldermoor*). **The infinite org chart:** the bounded tree stops at the IC, but `/api/org/node?id=r.2.1.0` expands any node one level and *wraps* at the bottom — the lowest clerk is the apex of their own shadow sub-org, with its own C-suite, forever. Deterministic (xmur3+mulberry32) so a node id is a permanent address in an unbounded company. Engine (`rite/org/engine.js`) shared verbatim by worker, page, and node selftest (`rite/org/engine.selftest.mjs` — run it before touching the engine). Public API, CORS open, pure compute: `GET /api/org?seed=&vertical=&shape=&depth=&maxNodes=&names=`, `GET /api/org/node?…&id=`, `GET /api/org/verticals`. The browser page ships a canvas diagram (`rite/org/diagram.js`, no deps) with four mobile-first layouts — **radial** (default; tidy-tree in rings, fills a portrait screen), **tree** (left→right node-link, tall & narrow), **icicle** (rank strata as scrollable columns), and **force** (best for the `matrix` shape's dotted cross-links); pan/pinch-zoom, tap a node to select + drill through it (the infinite lens), and a **colour-by** selector that paints the chart by morale/output/competence/manager-load/flight-risk.
  **People + performance (`rite/org/person.js`).** Every box holds a deterministic *person* (demographics, a work-triad **craft/drive/wit** expressed into nine attributes, a temperament `cast`, quirks, `output` + `leadership`), rhyming with hoop's `stats.js` (same triad×power shape) and tagged with one of hoop's 13 civic **vocations** so an org person is a valid hoop NPC (the city-sim bridge). `generateOrg` then rolls the whole tree into a **performance** oracle: leadership multiplies reports, overloaded spans leak throughput, each management layer skims a depth tax, morale flows down from manager quality + workload → `{score, tier, efficiency, avgMorale, overloadedManagers, attritionRate, highlights}` — tiers borrowed verbatim from hoop/econ's vitality oracle (**Thriving/Healthy/Stable/Fragile/Failing**). The point: *same seed + people, different `shape` → different score* (a `flat` or `wide` org overloads its managers into Failing; `tall`/`cellular` keep spans sane). `/api/org/node` and `/api/org/person?id=` carry a local perf snapshot; `siteSeed(worldSeed, city, cell)` is the forward hook to reproducibly site an org into a **mappa** world (mappa seeds int→mulberry32; rite hashes the string first).

## Architecture

```
rite/worker.js (single entry)
  ├── ASSETS binding   → static (index.html, fodder/index.html, corpus.json)
  ├── AI binding       → @cf/baai/bge-base-en-v1.5  (drill grading)
  │                       @cf/meta/llama-3.1-8b-instruct (fodder rewrites)
  └── DB binding (DB)  → atpolls-db (shared with poll + feed)

Cron 0 */6 * * * → mineGutenberg(): proxy through read.mino.mobi/gutenberg-proxy
                   → harvest verbose sentences → Llama → D1 'pending'
```

## Routes

| Route | Purpose |
|-------|---------|
| `GET /api/sentence` | Drill: random verbose sentence (or `?id=v007` for a specific one) |
| `POST /api/grade` | Drill: score user's edit |
| `GET /api/fodder/next` | Fodder: next batch of unvoted-by-this-voter pending candidates |
| `POST /api/fodder/vote` | Fodder: record `yes` / `no` / `skip` swipe |
| `GET /api/fodder/promoted` | Approved candidates in corpus.json shape (used by sync script) |
| `GET /api/fodder/stats` | Counts: pending / approved / rejected / total votes / total voters |
| `POST /api/fodder/admin/mine` | Manual mining trigger; requires `X-Admin-Key` matching `ADMIN_KEY` secret |

## Key Files

| File | Purpose |
|------|---------|
| `rite/worker.js` | All routes + cron handler (~620 lines, single file) |
| `rite/index.html` | Drill UI |
| `rite/fodder/index.html` | Swipe deck UI (vanilla JS, pointer events, no build) |
| `rite/corpus.json` | 45 hand-curated sentences with multiple references each |
| `rite/wrangler.jsonc` | Worker + ASSETS + AI + D1 + cron (0 */6 * * *) |
| `poll/apps/api/migrations/0014_fodder.sql` | D1 schema for `fodder_candidates`, `fodder_votes`, `fodder_state` |
| `scripts/sync-fodder-to-rite.mjs` | Pulls approved fodder back into `rite/corpus.json` (idempotent) |

## Deploy workflow (`deploy-rite.yml`)

Triggers on push to `main` or `claude/sentence-editing-drill-*` that touches `rite/**`. Steps:

1. Apply `poll/apps/api/migrations/0014_fodder.sql` to `atpolls-db` (idempotent — failure is treated as already-applied and continues).
2. `npx wrangler deploy` from `rite/` — uploads worker + assets, provisions `rite.mino.mobi`.
3. Best-effort POST to `/api/fodder/admin/mine` to seed the first batch (skipped silently if `RITE_ADMIN_KEY` secret isn't set).

Required secrets:
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — already set, shared with poll/feed deploys.
- `RITE_ADMIN_KEY` (optional) — must match the worker's `ADMIN_KEY` to enable post-deploy seed.

## Crowdsource → drill sync

```bash
node scripts/sync-fodder-to-rite.mjs --dry      # preview new approvals
node scripts/sync-fodder-to-rite.mjs            # append to rite/corpus.json
git add rite/corpus.json && git commit && git push
```

Idempotent: candidate IDs (`f-2833-abc1234`) live in a different namespace from hand-curated rite IDs (`v001`).

## Cost on $5 Workers Paid

- Drill grading: ~1 neuron per submission (BGE batched).
- Fodder mining: ~11 neurons × 5 candidates × 4 cron runs/day = ~220 neurons/day.
- Voting: zero AI calls (pure D1).

10,000 free neurons/day comfortably covers everything.

---


## Deploying

Pushes to `claude/procedural-name-generator-2qqwfq` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-rite.yml`](../.github/workflows/deploy-rite.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
