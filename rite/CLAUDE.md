# rite — rite.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Sentence editing drill plus a dozen surfaces over Bluesky prose and English itself—fodder swipe deck, redactle, semantic search, atlas, lexicon lenses, list themes, link knowledge graph, signal mapping, procedural names and org charts, and a monosyllable engine that mints English-shaped words nobody has claimed.

## Facts

| | |
|---|---|
| Surface | `rite` |
| Dir | `rite/` |
| Endpoint | `rite.mino.mobi` |
| Type | fullstack |
| Owning branch | `claude/syllable-word-generator-yhw8wj` |
| Deploy | `.github/workflows/deploy-rite.yml` |
| Uses | `atpolls-db` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "rite"`.

## Rite — the twelve surfaces

**Live at**: `rite.mino.mobi`
**Stack**: Cloudflare Worker (assets binding) + D1 + Workers AI
**Deploy**: `.github/workflows/deploy-rite.yml` — runs migrations, then `wrangler deploy`

Single Worker that hosts twelve surfaces, most over the same shared `rite/lib/atproto/` pipeline (CAR fetch → WASM parse → thread chains → reading-level scoring):

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

- **`/sharp/`** — a monosyllable engine, in three parts. **Mint**: procgen single-syllable words that obey English phonotactics and have no English definition — the wardrobe is not hand-written, it is *measured*. `build-corpus.mjs` cuts every real English monosyllable into onset/nucleus/coda (`str·e·ngth`, `m·o(e)·l`) and tallies P(nucleus | onset) and P(coda | nucleus); the minter samples those tables, so a minted word is shaped by English's own habits. A candidate ships only if it re-segments to the parts it was built from, reads as one syllable, does not look like an inflection of a word that does not exist, and appears in **no** word list (~250k strings). **Draw**: a real single-syllable word from the 7,625 English has, dialled from commonest to most obscure by SUBTLEX frequency. **Check**: any string — how many syllables, and is it taken, and by which list. Every word carries a guessed pronunciation (the onset's usual phones plus the rime's, both learned from real words spelled the same way), so it also knows its real-word rhymes and its homophones — `cind` is free on the page and already taken in the ear. Deterministic (xmur3+mulberry32, same lineage as `/names/`). **Is it free?**: the same string put to the registries over **RDAP**, routed through IANA's own bootstrap — see below. Public API, CORS open, no D1 and no AI: `GET /api/sharp?seed=&style=&count=&mode=mint|real&obscurity=&inflected=&distinct=`, `GET /api/sharp/check?w=`, `GET /api/sharp/styles`, `GET /api/sharp/domain?label=&tlds=`, `GET /api/sharp/tlds?endswith=`. Engine (`rite/sharp/engine.js`) shared verbatim by worker and node selftest; **run all three selftests before touching it** (`engine.selftest.mjs`, `tld.selftest.mjs`, `routes.selftest.mjs`).

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
| `GET /api/sharp` | Sharp: minted (default) or real single-syllable words |
| `GET /api/sharp/check` | Sharp: adjudicate a string — syllables, taken, rhymes |
| `GET /api/sharp/styles` | Sharp: mint styles + corpus stats + sources |

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
| `rite/sharp/engine.js` | Monosyllable engine — segmentation, syllable counting, mint, draw, check |
| `rite/sharp/corpus.js` | Runtime indexes over the built data (rimes, homophones, ranks) |
| `rite/sharp/tld.js` | TLD verifier + what an RDAP response means. Pure: decides, never fetches |
| `rite/sharp/rdap.js` | The only code that talks to registries — caps, backoff, memo |
| `rite/sharp/hunt.mjs` | CLI: mint words, ask the registries which are free |
| `rite/sharp/shelf.js` | Kept words — local store, ATProto records, the scope-ceiling check |
| `rite/sharp/auth.js` | Byte-identical copy of `packages/oauth-client/auth.js`. **Never edit** |
| `rite/sharp/lexicons/` | `com.minomobi.sharp.word` — the record a kept word becomes |
| `rite/sharp/data/` | `taken.txt` (250k claimed words + CMUdict syllable counts), `mono.json` (7,625 real monosyllables with pronunciations), `phono.json` (the model), `tlds.json` (IANA's TLDs + RDAP bootstrap) |
| `rite/sharp/build-corpus.mjs`, `build-tlds.mjs` | Rebuild those four. **Need the network** — not part of preflight |

## Deploy workflow (`deploy-rite.yml`)

Triggers on push to `claude/syllable-word-generator-yhw8wj` that touches `rite/**`. (`main` does not deploy — see the repo-wide `CLAUDE.md`.) Steps:

1. Apply `poll/apps/api/migrations/0014_fodder.sql` to `atpolls-db` (idempotent — failure is treated as already-applied and continues).
2. `npx wrangler deploy` from `rite/` — uploads worker + assets, provisions `rite.mino.mobi`.
3. Best-effort POST to `/api/fodder/admin/mine` to seed the first batch (skipped silently if `RITE_ADMIN_KEY` secret isn't set).

Required secrets:
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — already set, shared with poll/feed deploys.
- `RITE_ADMIN_KEY` (optional) — must match the worker's `ADMIN_KEY` to enable post-deploy seed.

### /sharp — the TLD verifier and RDAP

Two facts from IANA, both baked into `sharp/data/tlds.json`: the list of every
delegated TLD, and the **RDAP bootstrap** mapping a TLD to its registry's
service. `sharp/tld.js` is pure — it decides what a response *means* and never
fetches one, which is why the interesting part is testable offline.

**The trap, and why the code is shaped this way.** The public `rdap.org`
redirector answers `404 {"title":"No RDAP service is available for this
resource"}` for `.io`, `.sh`, `.co` and `.me` — for *every* name, registered or
not. Read that as "available" and the tool reports that `github.io` is going
spare. So:

- a `404` counts as **free** only from a registry resolved through the bootstrap,
  and never when the body says the *service* is missing;
- a TLD absent from the bootstrap is **unverifiable** — real, but uncheckable
  (236 of 1,438), and it costs no request;
- a 429, a 5xx or a timeout is **unknown**. Nothing is ever rounded down to free.

`sharp/rdap.js` is the only code that talks to registries, and they are somebody
else's infrastructure: 16 TLDs per request, one host at a time, a 6s timeout,
exponential backoff on 429, and a per-isolate memo. Availability is cached for
five minutes, not a day — a stale yes reaches someone about to spend money.

**`free` means unregistered, not purchasable.** Premium, reserved and
registry-held names all answer 404. The API says so in every response.

### /sharp — the shelf, and words in your own repo

`sharp/shelf.js` holds what someone decided to keep. **Keep & check** mints the
entry, runs the word checker, then asks the registries and files the verdicts on
the same entry — one gesture, three answers.

Two places a kept word lives:

- **local** — `localStorage`, always on, no account. Storage is *injected*
  (`browserStore` / `memoryStore`), which is what makes the logic testable in
  node and what keeps the module honest that localStorage can simply refuse: in
  a private window every call throws, the shelf falls back to memory for the
  session and says so rather than pretending it saved.
- **the keeper's repo** — one `com.minomobi.sharp.word` record each. Lexicon at
  `sharp/lexicons/`, collection in the auth worker's `WRITE_COLLECTIONS`, scope
  `atproto repo:com.minomobi.sharp.word` and nothing else, so consent is one
  line. This site stores none of it.

They reconcile by word, newest wins; an older repo copy still teaches a newer
local one where its record lives, so nothing gets written twice.

**The ceiling check is the part worth keeping.** A new collection only works
once the auth worker has been *redeployed* — the authorization server validates
against the live `client-metadata.json`, so requesting a scope above it fails
after the redirect, where the error belongs to somebody else and reads like a
bug here. `ceilingAllows()` reads that metadata first and returns `{ok, known}`:

- `known && !ok` → say plainly that repo sync is waiting on the auth worker, and
  stay local. It starts working by itself the day that worker ships.
- `!known` (a 5xx, a dropped request) → **offer sign-in anyway**. A request we
  could not make says nothing about what the server would grant, and reporting
  it as "unshipped" is a different claim from the truth.

**Repo sync is live** since 2026-09-22: `com.minomobi.sharp.word` is in the
deployed ceiling (88 collections), so the page offers sign-in and writes
records with no redeploy here — it reads the ceiling at load, which is the
whole point of checking it there.

> **`auth` is not this branch's to deploy.** It is owned by
> `claude/bsky-app-view-feasibility-8sdflz`; adding `sharp.word` meant asking
> that owner, not taking the surface. Run `node scripts/check-auth-scope.mjs`
> before **any** auth change, from any branch: this tree was 7 collections
> behind the live ceiling (`cad.*`, `dweet.dweet`, recoverable from
> `claude/browser-cad-ideation-ollmd3`) and that owner's tree was 9 behind
> (those plus `hopper.run` and `app.bsky.graph.follow`). Either would have
> narrowed the ceiling from a green build, and every site writing a dropped
> collection would start failing PAR with `invalid_scope`.

`rite/sharp/auth.js` is a byte-identical copy of
`packages/oauth-client/auth.js` — static sites cannot import across directories.
**Edit the package, never the copy**; `shelf.selftest.mjs` fails if they diverge.

### Hunting domains from the command line

```bash
node rite/sharp/hunt.mjs --pool 60000 --count 200 --score 45 --distinct 8 \\
  --style native --min 5 --max 7 --tlds com --delay 400 --hacks
node rite/sharp/hunt.mjs --words lounce --tlds com,dev,app,ai,xyz --delay 400
```

Same engine and same RDAP reader as the worker, so the CLI and the site cannot
disagree. `--score` and `--distinct` exist to filter *before* spending queries:
the words worth owning are the ones that read as English, and those are exactly
the ones already registered, so a useful hunt mints a large `--pool` and checks
only the top of it. Expect ~90% of scoring 5-7 letter `.com`s to be taken.

`--distinct N` (also the `distinct` API param) rejects a word sitting one edit
from a real word commoner than N per million. `grought` and `fruilt` are legal
shapes that read as typos of `brought` and `built`; a name you have to spell out
loud is worth less than one you do not.

## Rebuilding the /sharp corpus

`rite/sharp/data/` is committed, not generated by preflight: the build fetches
CMUdict over the network, and the result is deterministic given the same inputs.
Re-run it only to refresh the corpus, and re-run both selftests after.

```bash
node rite/sharp/build-corpus.mjs            # fetches CMUdict, writes the three word data files
node rite/sharp/build-tlds.mjs              # fetches IANA's TLD list + RDAP bootstrap
node rite/sharp/engine.selftest.mjs         # gates segmentation, syllable accuracy, the mint contract
node rite/sharp/tld.selftest.mjs            # gates the verifier + RDAP reader against a stub registry
node rite/sharp/shelf.selftest.mjs          # gates the shelf, the record shape, the lexicon, the vendored client
node rite/sharp/routes.selftest.mjs         # gates the worker routes against the real data
```

A stale `tlds.json` only means a brand-new TLD reads as "not a TLD", which is
the safe direction to be wrong in. None of the selftests touch the network.

`taken.txt` is a sorted, newline-delimited list read through a binary-search
index (`WordIndex`), **never** parsed into a `Set` — 250k strings as a JS Set
costs tens of MB per isolate; as one string plus an `Int32Array` of offsets it
costs about 3MB and needs no parse on a cold start. Each line is
`word` TAB `<syllables><kinds>`, where kinds is a subset of `e` (ENABLE1),
`f` (SUBTLEX-US), `c` (CMUdict) — a string only CMUdict claims is nearly always
a proper name, and the checker says so rather than calling it a dictionary word.

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

Pushes to `claude/syllable-word-generator-yhw8wj` that touch this surface's paths trigger [`.github/workflows/deploy-rite.yml`](../.github/workflows/deploy-rite.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
