# minomobi

**Personal tooling for the open web.** 24 sites built in conversation — one human, one model, the open web.

Static files on Cloudflare Pages. Data on ATProto PDS. No backend servers. No SaaS dependencies.

[mino.mobi](https://mino.mobi) · [@mino.mobi](https://bsky.app/profile/mino.mobi) · [tips@mino.mobi](mailto:tips@mino.mobi)

---

## Sites

### Publications & Applications

| Site | URL | Stack | Description |
|------|-----|-------|-------------|
| **Mino Times** | [time.mino.mobi](https://time.mino.mobi) | ATProto, Podcast | Agentic biotech intelligence — research, articles, editorial panels, and podcast. Content stored as ATProto records, rendered in a newspaper broadsheet layout. |
| **ATPolls** | [poll.mino.mobi](https://poll.mino.mobi) | Workers, D1, Durable Objects | Anonymous polling on Bluesky. RSA blind signatures ensure the poll host can't link your identity to your vote. |
| **LABGLASS** | [labglass](https://mino.mobi/labglass/) | DuckDB, Pyodide | Peer-to-peer biotech data workbench. SQL and Python running entirely in the browser. Notebooks stored locally, shareable via WebRTC. |
| **Read** | [read](https://mino.mobi/read/) | Workers | Adaptive speed reader for Project Gutenberg texts. Bionic formatting, variable character chunks, color-changing frames, and eye-tracking-driven pacing. |
| **Wiki Cards** | [cards](https://mino.mobi/cards/) | ATProto | Deep Wikipedia card game — Lucky, Transmute, Nexus, and Library modes built on scored and embedded articles. |
| **Noise** | [noise](https://mino.mobi/noise/) | PWA | Binaural beats, Shepard tones, harmonic overtones, and noise generator. Keeps playing when your phone sleeps. |
| **Mega** | [mega](https://mino.mobi/mega/) | MapLibre, deck.gl | Interactive map of global megaprojects — construction, timelines, costs, and deep context on a 3D globe. |
| **OS** | [os](https://mino.mobi/os/) | React, Wasm, ATProto | Browser-based terminal for your ATProto PDS. XRPC commands, DuckDB SQL, AI chat, and embedded bash container. |
| **Finance** | [finance](https://mino.mobi/finance/) | ATProto | Personal financial dashboard. Market data synced to ATProto records, rendered with dark-mode charts. |
| **Wars** | [wars](https://mino.mobi/wars/) | — | War factor analysis. Correlates of War dataset visualized by type, region, duration, and casualties. |
| **Pokemon** | [pokemon](https://mino.mobi/pokemon/) | Canvas | Critter Red — a pixel-art monster RPG with overworld exploration and turn-based battles. |

### ATProto Tools

| Site | URL | Stack | Description |
|------|-----|-------|-------------|
| **Phylo** | [phylo](https://mino.mobi/phylo/) | ATProto, Canvas | Interactive phylogenetic tree explorer. Syncs taxonomic data from the Open Tree of Life into ATProto PDS records. |
| **Music** | [music](https://mino.mobi/music/) | PWA, ATProto | Browser-based sequencer that stores compositions as records on the personal data server. |
| **Bakery** | [bakery.mino.mobi](https://bakery.mino.mobi) | React, Vite, ATProto | Flour blend calculator for bakers who mix their own blends — protein math, hydration targets, blend ratios. |
| **Sweat** | [sweat](https://mino.mobi/sweat/) | PWA, ATProto | Workout logging with charts, progressive overload tracking, offline-first. |

### Bluesky Dashboards

| Site | URL | Description |
|------|-----|-------------|
| **Flows** | [flows](https://mino.mobi/flows/) | Commodity flow maps. Geographic trade and movement data rendered as directional arcs. |
| **Ternary** | [ternary](https://mino.mobi/ternary/) | Ternary plot of posting temperament — flesh, knowledge, and argument — from anchor cosine embeddings. |
| **Judge** | [judge](https://mino.mobi/judge/) | Posting profile. Personality traits and valence from post embeddings, topics via k-means clustering. |
| **Novelty** | [novelty](https://mino.mobi/novelty/) | Semantic novelty trajectory. Track how an account's posting content drifts or repeats over time. |
| **Echo** | [echo](https://mino.mobi/echo/) | Post density, head to head. Compare two handles side by side on posting volume and patterns. |
| **Density** | [density](https://mino.mobi/density/) | Post brevity, measured. Filter posts by exact word count, ranked by character length. |
| **Seek** | [seek](https://mino.mobi/seek/) | Find follows-of-follows you don't yet follow, ranked by network density. |
| **Cluster** | [cluster](https://mino.mobi/cluster/) | Find your tightest circle. The largest group of your follows who all mutually follow each other. |
| **Photo** | [photo](https://mino.mobi/photo/) | Bluesky photo explorer. Every image from any handle as a filterable masonry grid with engagement analytics. |

---

## Infrastructure

| Layer | Provider |
|-------|----------|
| Hosting | Cloudflare Pages (auto-deploy from `main`) |
| Compute | Cloudflare Workers + Durable Objects + D1 |
| Data | ATProto Personal Data Server |
| DNS + CDN | Cloudflare |
| Email | Cloudflare Email Routing |
| CI/CD | GitHub Actions |

---

## Repository Structure

```
├── bakery/          React + Vite PWA (bakery.mino.mobi)
├── poll/            Monorepo: apps/web, apps/api, packages/shared
├── time/            Mino Times — articles, posts, podcast RSS
├── phylo/           Phylogenetic tree viewer
├── labglass/        DuckDB + Pyodide workbench
├── read/            Adaptive speed reader
├── cards/           Wikipedia card game + neural embeddings
├── music/           Music sequencer PWA
├── sweat/           Workout logger PWA
├── noise/           Audio visualization PWA
├── flows/           Network flow visualization
├── cluster/         Social graph clustering
├── density/         Post brevity metrics
├── echo/            Post density comparison
├── judge/           Posting profile analysis
├── novelty/         Semantic novelty trajectory
├── seek/            Friend discovery
├── ternary/         Ternary chart analysis
├── mega/            Global megaprojects map (MapLibre + deck.gl)
├── os/              ATProto PDS browser terminal (React + Wasm)
├── finance/         Financial dashboard with ATProto sync
├── photo/           Bluesky photo explorer (React + DuckDB)
├── wars/            Correlates of War data visualization
├── pokemon/         Pixel-art monster RPG (Canvas)
├── workers/         bsky-bot (cron), cluster-batch, cards-mint
├── functions/       Serverless functions (profiles, proxy, etc.)
├── scripts/         Build and data processing scripts
├── modulo/          ATProto DID for @modulo.minomobi.com
├── morphyx/         ATProto DID for @morphyx.minomobi.com
└── .well-known/     Root domain ATProto DID
```

---

## Build

```bash
# Root (builds bakery)
npm run build

# Poll monorepo (build order matters: shared → web)
cd poll && npm install && npm run build

# Bakery standalone
cd bakery && npm install && npm run build
```

---

## Stats

~30 days of active development. 400+ commits. 24 sites.

Built in conversation — one human, one model, the open web.
