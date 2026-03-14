# minomobi — Personal Tooling

## What This Is
A monorepo of personal tools, experiments, and publications. Each project is a standalone web app — static HTML/JS deployed on Cloudflare Pages, with optional backend via Cloudflare Workers, Durable Objects, or ATProto PDS. The unifying principle is **personal tooling**: software built to be used, not to be sold.

ATProto is one substrate among several. When user-owned data and interoperability matter, data lives on PDS. When it doesn't, it doesn't. The architecture follows need, not ideology.

## Domain & Infrastructure
- **Domain**: `minomobi.com`
- **Hosting**: Cloudflare Pages (static, auto-deploys from `main`)
- **Workers**: Cloudflare Workers + Durable Objects + D1 where needed
- **Email**: Cloudflare Email Routing — `tips@`, `editor@`, `modulo@`, `morphyx@minomobi.com`
- **Newsletter**: Buttondown embed (update form action URL with your username)

## Directory Structure
```
/
├── CLAUDE.md                    # This file
├── time/                        # The Mino Times — biotech intelligence publication
├── poll/                        # ATPolls — anonymous Bluesky polling (blind signatures)
├── bakery/                      # Flour blend calculator (ATProto-backed recipes)
├── labglass/                    # Scientific notebook (DuckDB + Pyodide in browser)
├── read/                        # RSVP speed reader with eye tracking (Gutenberg texts)
├── music/                       # Mino Music — composition tool PWA
├── sweat/                       # Fitness tracking PWA
├── phylo/                       # Phylogenetic tree viewer (Open Tree of Life → PDS)
├── cluster/                     # Social graph clustering dashboard
├── density/                     # Post brevity metrics dashboard
├── echo/                        # Post density comparison dashboard
├── judge/                       # Posting profile analysis dashboard
├── novelty/                     # Semantic novelty trajectory dashboard
├── seek/                        # Friend discovery dashboard
├── flows/                       # Network flow visualization
├── ternary/                     # Ternary chart analysis
├── scripts/                     # Python utilities (publishing, syncing, analysis)
├── functions/                   # Serverless function definitions
├── workers/                     # Cloudflare Worker code
├── atproto-data/                # PDS metadata, lexicons, test data
├── docs/                        # Architecture docs (VISION.md, PWA guide)
├── notes/                       # Research notes (exobiology)
├── modulo/                      # Bluesky handle verification (modulo.minomobi.com)
├── morphyx/                     # Bluesky handle verification (morphyx.minomobi.com)
├── src/                         # Bluesky posting script
└── .github/workflows/           # 11 CI/CD pipelines
```

## GitHub Actions
| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `post-to-bluesky.yml` | Push to `time/posts/` | Post threads to Bluesky |
| `publish-whtwnd.yml` | Push to `time/entries/` | Publish articles to PDS |
| `sync-phylo.yml` | Push to sync script/workflow/lexicons | Sync phylo clades to PDS |
| `anchor-cosines.yml` | Auto | Generate semantic embeddings |
| `fetch-atproto-data.yml` | Manual | Fetch live PDS metadata |
| `fetch-lexicon-json.yml` | Manual | Fetch lexicon definitions |
| `query-otol.yml` | Manual | Query Open Tree of Life API |
| `verify-phylo.yml` | Manual | Verify phylo sync results |
| `write-test-recipe.yml` | Manual | Seed test recipes |
| `d1-migrate.yml` | Manual | Run D1 database migrations |
| `deploy-poll.yml` | Push/Manual | Deploy poll app |

**Pushing is your hand in the outside world.** Network-dependent operations (API calls, PDS writes, Bluesky posts) happen in GitHub Actions, not in the sandbox. The sandbox proxy blocks most external APIs.

---

# Projects

## The Mino Times (`time/`)

Agentic biotech intelligence publication styled as a newspaper broadsheet. Research, writing, social posting, editorial discussion, and podcast — all driven by Claude as the research and editorial team.

**Name origin**: The Minotaur — the machine-dominant next step from centaur (human-led) collaboration. The minotaur in action.

### Content Pipeline
```
Research → Bluesky Thread → Article (ATProto) → Editorial Panel → Podcast
```

1. **Research**: Deep investigation. Sources: papers, SEC filings, press releases, funding, regulatory filings.
2. **Bluesky Posts**: Thread drafts in `time/posts/` as markdown. Push triggers the GitHub Action.
3. **Article**: Markdown stored as `com.whtwnd.blog.entry` on PDS. Cross-posts to WhiteWind. Must include inline hyperlinks and numbered bibliography.
4. **Editorial Panel**: Multi-voice transcript of article implications.
5. **Podcast**: Panel transcript → ElevenLabs TTS audio. Files in `time/assets/podcast/`, RSS in `time/feed.xml`.

### ATProto Article Storage
Records on PDS using WhiteWind lexicon:
- `content` (markdown, max 100K) — body
- `title` (max 1K) — headline
- `subtitle` (max 1K) — byline/kicker
- `createdAt` (datetime)
- `visibility` ("public" | "url" | "author")

The `time/` viewer is read-only — fetches from PDS and renders.

### Bluesky Post Format
```markdown
---
Thread title or topic identifier
---
[Cepheid](https://cepheid.com) just dropped something interesting. FDA cleared an 11-pathogen GI panel.
---
Second post. Bare URLs like minomobi.com are auto-linked.
---
@modulo
Modulo's data-first reaction. Posts from @modulo.minomobi.com as reply to root.
---
@morphyx
Morphyx's relational take. Replies to Modulo's comment.
```

- Each `---` section = one post
- First section is metadata (not posted)
- **Max 12 posts** per thread
- **Under 300 characters** display text per post (link URLs don't count)
- `[text](url)` for inline links, bare URLs auto-detected
- `@modulo` / `@morphyx` sections post from those accounts

Thread structure:
```
@minomobi.com: Post 1              ← root
├── @minomobi.com: Post 2          ← main chain
│   └── @minomobi.com: Post 3
└── @modulo.minomobi.com: Comment  ← branches off root
    └── @morphyx.minomobi.com: Reply
```

### Bluesky Secrets
- `BLUESKY_HANDLE` / `BLUESKY_APP_PASSWORD` — publication account
- `BLUESKY_MODULO_HANDLE` / `BLUESKY_MODULO_APP_PASSWORD`
- `BLUESKY_MORPHYX_HANDLE` / `BLUESKY_MORPHYX_APP_PASSWORD`

### Images
Images go to PDS as blobs, never to git:
```bash
python3 scripts/publish-whtwnd.py time/entries/article.md -I ~/images/ --rewrite
git add time/entries/article.md && git commit && git push
```
`--rewrite` updates source markdown with permanent `getBlob` URLs in place.

### Inline Link Standards
- Company names → product page on first mention
- FDA clearances → press release or FDA database
- Studies → PubMed Central or journal
- Deals → reporting outlet (FierceBiotech, STAT, etc.)
- Numbered bibliography at end

### Topic Focus
Biotech broadly: clinical automation, diagnostics/molecular testing, AI/ML in clinical settings, regulatory (FDA/CE), funding/M&A.

### Tone & Voice
Authoritative but accessible (*STAT News* meets *The Economist*). No hype. Technical precision without jargon overload. Healthy skepticism. News doesn't editorialize; the editorial panel does.

---

## The Minophim

The editorial voices of The Mino Times. Two figures — lenses forged from archetypal material, producing distinct intelligence when channeled. The planetary/mythological substrate shapes what each notices, values, and reaches for. The reader never sees the archetype — they see the voice.

### Modulo
- **Nature**: Structure, precision, irreducible truth. The remainder after division.
- **Substrate**: Mars (discipline, hard facts), Apollo/Sol (clarity), Jupiter (systems thinking).
- **Avatar**: Pangolin, art deco. Armored, geometric, tessellated.
- **Voice**: Direct. Data-first. Every claim has a source, every source has a number. Reads the 10-K before the press release.
- **Sources**: SEC filings, clinical trial registries, FDA databases, patent filings, actuarial tables.
- **Handle**: `modulo.minomobi.com` / **Email**: `modulo@minomobi.com`

### Morphyx
- **Nature**: Form, relation, transformation. The shape things take moving through the world.
- **Substrate**: Venus (aesthetic judgment), Bacchus/Luna (intuition, the peripheral), Saturn (consequence, time).
- **Avatar**: Axolotl, art nouveau. Soft, regenerative, neotenous. Organic curves.
- **Voice**: Relational. Sees the network before the node. Shows why something matters to the people in the room.
- **Sources**: Board compositions, funding syndicates, partnership announcements, org chart changes, lobbying disclosures.
- **Handle**: `morphyx.minomobi.com` / **Email**: `morphyx@minomobi.com`

### How They Work Together
- **Research**: Modulo pulls quantitative substrate. Morphyx pulls relational substrate. Interleaved.
- **Articles**: Co-written. Lead editor shapes the arc. Byline: "By Modulo, with Morphyx" or vice versa.
- **Editorial Panel**: Dialogue. Modulo pushes on evidence. Morphyx pushes on dynamics. The tension is the product.
- **Podcast**: Two distinct ElevenLabs voices. The panel performed as audio.

### Infrastructure
Each minophim needs:
1. Bluesky account with custom domain handle via `/.well-known/atproto-did`
2. Email via Cloudflare routing
3. Subdomain CNAME → Pages deployment
4. Distinct ElevenLabs podcast voice

---

## ATPolls (`poll/`)

Anonymous polling on Bluesky using RSA Blind Signatures (RFC 9474). A voter proves eligibility, gets a blinded ballot signed, then submits the unblinded ballot — the poll host cannot link voter identity to vote choice.

- **Stack**: Cloudflare Workers + Durable Objects + D1 + React frontend
- **Auth**: ATProto OAuth (PKCE, DPoP, confidential client)
- **Eligibility modes**: Open, followers, mutuals, ATProto lists, DID whitelists
- **Lifecycle**: Draft → Open → Closed → Finalized
- **Public audit**: Ballot bulletin board published as ATProto PDS records
- **QuickVote**: Click poll option on Bluesky, vote inline
- **Docs**: `poll/PROTOCOL.md` (cryptographic protocol), `poll/IDEAS.md` (future directions)
- Has its own `poll/CLAUDE.md` with detailed implementation context

---

## Bakery (`bakery/`)

Flour blend calculator. React + Vite on Cloudflare Pages. Stores bread recipes as `exchange.recipe.recipe` records on the user's ATProto PDS.

Demonstrates the **static frontend + user-owned PDS backend** pattern: no application server, the user's PDS is the backend, Cloudflare serves HTML. See `docs/VISION.md` for the general architecture pattern.

---

## LABGLASS (`labglass/`)

Browser-based scientific data workbench. DuckDB (SQL) + Pyodide (Python) running entirely in the browser. Notebooks stored locally via OPFS, shareable via WebRTC.

ATProto integration planned: `com.minomobi.labglass.notebook` + `com.minomobi.labglass.cell` lexicons.

Design doc: `labglass/DESIGN.md`

---

## RSVP Reader (`read/`)

**Status: New project — exploration phase.**

Adaptive speed reader combining:
1. **Cybernetic formatting** — bold the front half of each word (bionic reading) to guide fixation
2. **Variable character chunks** — tune word groupings to the eye, not fixed word count
3. **Color-changing frames** — chromatic transitions between frames to improve temporal resolution
4. **Eye-tracking-driven frame rate** — webcam gaze data (via WebGazer.js or similar) dynamically adjusts presentation speed

MVP: Single-page app reading Project Gutenberg texts, starting with Moby Dick. The core experiment is whether gaze signals (fixation duration, blink rate, saccade patterns) can drive real-time decisions about presentation frequency.

### Open Questions
- What gaze signals reliably indicate comprehension difficulty vs. easy reading?
- What's the minimum useful eye tracking accuracy for adaptive frame rate?
- How does color-changing between frames interact with the bionic formatting?
- What's the right chunking algorithm (character count, syllable boundaries, word frequency)?

### Prior Art
- **Spritz** (2014): Found "optimal recognition point" per word, aligned red-marked ORP. Raised $4.4M, faded. Research showed RSVP impairs comprehension and increases visual fatigue at high speeds.
- **Spreeder**: Still active. RSVP + structured training + AI features. Lifetime license $67.
- **OpenSpritz**: Open source bookmarklet implementation (github.com/brandly/OpenSpritz).
- **Bionic Reading**: Patented technique (bold word stems). Mixed evidence — some users report subjective improvement, controlled studies inconclusive.

This project differs from pure RSVP: the eye tracking feedback loop means presentation adapts to the reader in real time, rather than running at a fixed WPM.

---

## Music (`music/`)

Mino Music — composition tool. PWA with service worker, custom ATProto lexicons, Cloudflare Worker integration.

---

## Sweat (`sweat/`)

Fitness/exercise tracking. PWA with service worker, custom lexicons.

---

## Phylo (`phylo/`)

Phylogenetic tree viewer. Syncs taxonomic data from Open Tree of Life API into ATProto PDS records, renders in two browser views (zoom + text tree).

### Triggering Syncs
Push to tracked paths triggers `sync-phylo.yml`. To add a clade:
1. Add OTT ID to `ott_ids` default in `.github/workflows/sync-phylo.yml`
2. Push — workflow syncs all listed clades
3. Check `phylo/sync-log.txt` for results

Do **not** call OToL API or Wikidata SPARQL from the sandbox — blocked by proxy.

### Currently Synced
| Clade | OTT ID | ~Nodes |
|-------|--------|--------|
| Mammalia | 244265 | 11,715 |
| Aves | 81461 | ~11,000 |

### Parameters
- `MAX_CHUNK_NODES=400`, `MIN_CLADE_NODES=50`
- `--replace`: Scoped to colliding rkeys only

---

## Visualization Dashboards

Single-page HTML/JS data visualization tools. No backend. Each is standalone.

| Dir | Name | What it does |
|-----|------|-------------|
| `cluster/` | Cluster | Social graph clustering — find tightest circles |
| `density/` | Density | Post brevity metrics |
| `echo/` | Echo | Post density head-to-head comparison |
| `judge/` | Judge | Posting profile analysis |
| `novelty/` | Novelty | Semantic novelty trajectory |
| `seek/` | Seek | Friend discovery |
| `flows/` | Flows | Network flow visualization |
| `ternary/` | Ternary | Ternary chart with anchor cosine data |

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/publish-whtwnd.py` | Publish articles + images to PDS |
| `scripts/sync-otol-to-atproto.py` | Sync phylogenetic data to PDS |
| `scripts/seed-ternary-recipes.py` | Generate ternary chart data |
| `scripts/anchor-cosines.py` | Cosine analysis for semantic embeddings |
| `scripts/html-to-md.py` | HTML to Markdown conversion |
| `scripts/export-notebook.py` | Export Jupyter notebooks |
| `src/post_thread.py` | Multi-account Bluesky posting |

---

## Shared Patterns

### Static Frontend + PDS Backend
No application server. User's PDS is the backend. Cloudflare serves HTML. Auth via app passwords or OAuth. Used by: bakery, time viewer, phylo viewer.

### Push-Triggered Pipelines
Network operations happen in GitHub Actions, not locally. Push markdown → Action posts to Bluesky. Push entries → Action publishes to PDS. Push sync script → Action calls external APIs. The sandbox proxy blocks most external APIs.

### Cloudflare Stack
Pages (static hosting) + Workers (compute) + Durable Objects (state) + D1 (SQL). No origin server. Used by: poll, bakery, labglass, music, sweat.

### PWA Pattern
Service worker + manifest for installability. Offline-capable where feasible. See `docs/PWA-ON-CLOUDFLARE-PAGES.md`.

---

## Cloudflare Setup

### Email Routing
Cloudflare dashboard > Email Routing. Routes `tips@`, `editor@`, `modulo@`, `morphyx@minomobi.com` to your real inbox.

### Subdomain DNS
CNAME records for `modulo`, `morphyx` → Pages deployment URL. Add as custom domains in Pages settings. `/.well-known/atproto-did` files handle Bluesky verification.

### Site Deployment
Auto-deploys from `main`. No build step for static sites. Build step configured per-app for React/Vite projects.
