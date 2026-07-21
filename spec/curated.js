// spec/curated.js — the HAND-AUTHORED layer of the site-wide spec.
// spec/data.js is generated (scripts/build-spec.mjs); this file is edited by
// humans/Claudes. The renderer (app.js) merges the two.
//
// Contents: family taxonomy (the dimensionality reduction — 66 surfaces fold
// into 10 families), description capsules for surfaces the landing catalogue
// doesn't cover (mostly headless infra), per-host health paths for API workers
// whose / is a 404 by design, and the platform-wide capability matrix.

window.SPEC_CURATED = {

  // ------------------------------------------------------------- families --
  familyOrder: [
    { id: 'platform',   label: 'Platform & shared infra',
      blurb: 'The load-bearing layer every other surface leans on: the landing bundle, shared OAuth/SSO, the leaderboard worker, the cron trampoline, and the CORS proxies. Break something here and it ripples.' },
    { id: 'social',     label: 'Bluesky & ATProto social',
      blurb: 'Apps that read or write the ATProto network: polling, feeds, voice posts, digests, analytics, issue tracking. Most share the atpolls-db D1 database and the public Bluesky APIs.' },
    { id: 'work',       label: 'Work & personal tools (PDS-backed)',
      blurb: 'Productivity apps where YOUR data lives on YOUR personal data server: notes, projects, workouts, music, finance, a browser terminal for the PDS itself.' },
    { id: 'science',    label: 'Science & lab tools',
      blurb: 'Client-side scientific computing — WASM-compiled analysis (imaging, OCR, molecular biology), data workbenches, engineering benches, and a dataset explorer. Nothing leaves the browser.' },
    { id: 'oneill',     label: 'The O’Neill cylinder pack',
      blurb: 'One coherent modelling project split across seven surfaces: game (hoop), structure (rind), thermodynamics (tide), end-cap (iris), ecosystem (biome), flight (duck), and the megaproject/world dashboards (mega).' },
    { id: 'generative', label: 'Generative & procedural engines',
      blurb: 'Seeded, deterministic generators where a page number IS a permalink: endless books, certified puzzles, board games, phylogenies, voxel creatures, civilizations. Determinism is load-bearing everywhere here.' },
    { id: 'games',      label: 'Games & toys',
      blurb: 'Playable things: WebGPU galleries, toroidal arcade games, multiplayer canvases, a Pokémon-like, a Rust roguelike, swarm evolution.' },
    { id: 'reference',  label: 'Reference wing',
      blurb: 'Fast, pastable lookup sites generated from canonical standards data: emoji, Unicode, units, FIX protocol. No backend, no auth — the data is committed at build time.' },
    { id: 'reading',    label: 'Reading & language',
      blurb: 'Deep-reading apparatus for medieval tales, sentence-editing drills with AI grading, and conversation practice.' },
    { id: 'math',       label: 'Math & explainers',
      blurb: 'Interactive single-file explainers of extremal geometry and other results, plus AI-pair numerics education.' },
  ],

  families: {
    root: 'platform', auth: 'platform', scores: 'platform', cron: 'platform',
    autopilot: 'platform', bounty: 'platform', 'duffel-proxy': 'platform', 'fred-proxy': 'platform',
    poll: 'social', feed: 'social', zoom: 'social', b: 'social', airchat: 'social',
    bisk: 'social', cat: 'social', empathy: 'social', io: 'social', photo: 'social',
    pod: 'social', answers: 'social',
    bakery: 'work', wave: 'work', org: 'work', crm: 'work', pm: 'work',
    finance: 'work', os: 'work', audio: 'work',
    labglass: 'science', j: 'science', ocr: 'science', splice: 'science',
    cable: 'science', ar: 'science', tjs: 'science', wars: 'science',
    hoop: 'oneill', rind: 'oneill', tide: 'oneill', iris: 'oneill',
    biome: 'oneill', duck: 'oneill', mega: 'oneill',
    fable: 'generative', borges: 'generative', games: 'generative',
    phylofiction: 'generative', golem: 'generative', reef: 'generative', civ: 'generative',
    g: 'games', torus: 'games', canvas: 'games', pokemon: 'games',
    aub: 'games', fluoddity: 'games', cards: 'games',
    moji: 'reference', uni: 'reference', unit: 'reference', fix: 'reference',
    read: 'reading', rite: 'reading', chat: 'reading',
    math: 'math', 'ai-edu': 'math',
  },

  // ----------------------------------------------- description capsules ----
  // Only for surfaces with no landing-catalogue description (mostly headless
  // workers). Frontends inherit their curated <li> description via data.js.
  descOverrides: {
    root: 'The landing page (minomobi Pages project) plus ~19 bundled pure-static subsites served at mino.mobi/<name>/ — one deploy unit. Also carries the Pages Functions (search, novelty, proxies) and the generated office + spec site maps.',
    auth: 'The shared ATProto OAuth worker (BFF confidential client: PKCE + DPoP + PAR + private_key_jwt). One login = SSO across every *.mino.mobi site via a domain cookie; narrow per-site scopes with just-in-time escalation; browsers never hold PDS tokens — writes go through the DPoP-bound /pds/* proxy. Sessions in D1 mino-auth-db.',
    scores: 'Shared multi-game leaderboard worker. One generic game_scores table (own D1: mino-scores-db) keyed by game slug; identity delegated to auth.mino.mobi bearer tokens. Any static game can submit scores with zero worker changes.',
    cron: 'The cron trampoline. GitHub’s schedule: triggers proved unreliable on this repo (zero cron runs ever), so this worker fires the same workflows on Cloudflare cron via workflow_dispatch: bisk digest (daily 13:00), autopilot brief (13:30), finance sync (weekdays 21:30), lexicon fetch (monthly).',
    autopilot: 'The unattended site factory. A daily routine builds one self-contained site per run under auto/<slug>/, deploys it to auto-<slug>.workers.dev, and announces from the bot account. Promotion to the curated front page is manual.',
    feed: 'SimCluster — a Bluesky feed generator. Every 6h it fetches seed DIDs from a list, builds the mutual-follow graph, finds communities (Bron-Kerbosch cliques + shell peeling), then serves a ranked feed skeleton scored by cross-community engagement from the Constellation relay. Also the data API behind zoom.',
    'duffel-proxy': 'CORS/auth proxy for the Duffel flight-search API — holds the bearer token as a worker secret so the browser never sees it. Backs the flights explorer.',
    'fred-proxy': 'CORS proxy for FRED (Federal Reserve economic data) CSV series, with 1-hour edge caching. Backs the finance pages.',
    bounty: 'Anonymous bounty marketplace backend — reputation-based ecash tokens with Ed25519 blind-signed denominations (own D1: bounty-board). Frontend bundled at mino.mobi/bounty/.',
    'ai-edu': 'AI-pair numerics for engineers — an education site (draft) on doing numerical engineering work with an AI pair.',
    cards: 'Deep Wikipedia card game — collectible cards minted from deep Wikipedia articles (Ed25519-signed by the cards-mint worker), with collection views and mini-games (techtree, grow, recipe, yum, diffract).',
    read: 'The deep-reading wing: annotated medieval tales (Gawain, Culhwch, Orfeo, the Mabinogi branches…) each with a seven-layer apparatus — parallel text, storybook with AI illustrations, character webs, Propp story graphs, Thompson motif indexes, computed mythographs — plus the Pendragon comparative hub and divination/alchemy readers.',
    hoop: 'The GAME wing of the O’Neill cylinder pack: “the infinite game” — a canvas glyph-world stitched from an endless deterministic ship engine where every place is an ATProto record anchoring a message thread. Live presence over WebSockets (HoopRoom DO), auth via the shared OAuth worker, versioned world snapshots (v100 stable → v105 dev with seeded quest spines).',
    chat: 'Conversation-practice dojo. An AI partner (Workers AI Llama 3.3 70B) plays your counterpart and a theory-grounded rubric scores the exchange; multiplayer DO rooms are roadmap.',
    math: 'The math/explainer pack at math.mino.mobi: the geometry hub plus every single-file interactive explainer (Erdős distances, Kakeya, cap sets, sphere packing, Aztec diamonds, Ising, traffic, …), staged from the root bundle at build time.',
    canvas: 'The multiplayer-canvas hub: collaborative drawing (draw), MMO pixel canvas (mmo), paint, curve-tracing and pizza-cutting score games — frontends staged out of the root bundle; backends stay in the poll and scores workers.',
    audio: 'Audio Rooms — a voice-room app (Vite monorepo web + worker with a RoomCoordinator Durable Object for signaling). Deployed to workers.dev; audio.mino.mobi not yet attached.',
    crm: 'Vault CRM SPA (Vite + TS). Deployed as its own worker but still served through the root bundle at mino.mobi/crm/; crm.mino.mobi not yet attached.',
    pod: 'Podcast studio on ATProto: record in a WebRTC lobby (/room), edit multitrack clips and publish (/prod), listen per-show (/listen) or in a general RSS client (/app). Episodes, tracks and subscriptions are records + blobs on the author’s own PDS — no database; the worker only builds RSS feeds and stitches chunked audio blobs into streamable enclosures.',
  },

  // Per-host health paths for workers whose / is a 404 by design — the
  // client-side prober uses these instead of /.
  healthPaths: {
    'auth.mino.mobi': '/client-metadata.json',
    'feed.mino.mobi': '/health',
    'scores.mino.mobi': '/api/scores/top?game=curve',
  },

  // ------------------------------------------------- capability matrix -----
  capabilities: {
    can: [
      { head: 'Identity & auth', items: [
        'Single sign-on across every *.mino.mobi site: one Bluesky OAuth login, recognised everywhere via the shared auth worker’s domain cookie.',
        'Narrow per-site OAuth scopes with just-in-time escalation (short consent screens; scope accumulates as sites are actually used).',
        'PDS writes without the browser ever holding a token — DPoP-bound proxy at auth.mino.mobi/pds/*.',
      ]},
      { head: 'Data & storage', items: [
        'Three D1 databases: atpolls-db (shared by poll, feed, rite, airchat, cat, io, reef, canvas backends), mino-auth-db (sessions), mino-scores-db (leaderboards).',
        'Durable Objects for anything needing serialized writes or rooms: poll coordinators, party-game rooms, AR relays, hoop presence, audio/pod signaling.',
        'The user’s own PDS as free storage — records + blobs (airchat voice audio, pod episodes, music, notes, photos): we pay $0.',
      ]},
      { head: 'AI inference', items: [
        'Workers AI on the $5 plan: BGE embeddings (drill grading, semantic maps), Llama 3.1/3.3 (fodder rewrites, site search, chat dojo) — ~10k free neurons/day covers everything.',
        'OpenAI: Whisper transcription (airchat, ~$0.006/min) and gpt-image-1 / dall-e-3 storybook illustration (~$0.04/spread, idempotent pipeline).',
        'Gemini 2.5 Flash free tier for borges live tellings, cached as ATProto records (first-write-wins).',
      ]},
      { head: 'Realtime & compute in the browser', items: [
        'WebSocket multiplayer via DOs (games platform, ar two-phone AR, hoop live positions).',
        'Rust→WASM engines built in CI and committed: OCR, phylofiction evolution, biome/rind solvers, the aub roguelike, wiki markdown.',
        'WebGPU sims (duck flight, hourglass, the g gallery), DuckDB-WASM + Pyodide workbenches (labglass, photo, os).',
      ]},
      { head: 'Publishing & pipelines', items: [
        'Markdown → threaded Bluesky posts across 3 accounts (time/posts/ pipeline); WhiteWind blog publishing; PDS record sync workflows.',
        'Scheduled jobs that actually fire: Cloudflare worker crons (feed 6h, rite mining 6h, cat firehose) + the cron trampoline for GitHub workflows (bisk daily digest, autopilot, finance, lexicons).',
        'CI quality gates: node selftests gate deploys (golem, duck, reef…), wasm parity tests, idempotent D1 migrations applied on every deploy.',
      ]},
      { head: 'Deploy machinery', items: [
        'Registry-driven deploys: deploy-registry.json maps 66 surfaces → one workflow → one owning branch each; three scripts keep triggers, linting, and the landing table in sync.',
        'Any surface deployable on demand via workflow_dispatch (GitHub UI or MCP tools).',
        'Multi-zone custom domains work — the shared Cloudflare API token can bind routes beyond the primary zone where needed.',
      ]},
    ],
    cant: [
      { head: 'No staging, no safety net', items: [
        'Every push to an owning branch that touches a surface’s paths deploys to production. There is no staging environment anywhere.',
        'A push to time/posts/*.md posts to the real Bluesky accounts. Immediately.',
        'GitHub schedule: crons never fire on this repo — anything scheduled must go through the minomobi-cron worker or run on main.',
      ]},
      { head: 'The sandbox cannot touch prod directly', items: [
        'No wrangler deploy, no Cloudflare API, no live PDS/Bluesky writes, no remote D1 from the Claude sandbox — all secrets live in GitHub Actions. The deploy workflows ARE the network.',
        'Dashboard-only operations (human required): attach/detach custom domains, set worker secrets, provision KV/R2/Containers, delete orphan workers, disconnect git integrations.',
      ]},
      { head: 'Known gaps & sharp edges (audit 2026-07-16)', items: [
        'cat.mino.mobi is UNREACHABLE — domain likely never attached; the worker config declares no custom_domain route.',
        'audio.mino.mobi and crm.mino.mobi are not attached (apps deploy to workers.dev / root bundle respectively); os/api Containers backend is not deployed (frontend gates the feature off).',
        'The golden rule: a wrangler config `name` that doesn’t own the live domain deploys green into a stray worker forever (bit zoom, poke, wars, mega, os, ask). bakery still has no routes block — bake.mino.mobi is dashboard-attached only.',
        'Orphan workers awaiting dashboard deletion: mino-zoom, mino-poke, wars-minomobi, mega-minomobi, pds-os, mino-answers, clock-minomobi, mino-disk, mino-atmosphere.',
        'SSO cannot reach labglass.minomobi.com (different registrable domain); grandfathered own-OAuth sites (poll, airchat, mmo/draw/paint) join SSO only if migrated.',
        'Bluesky hard limits: 300 chars/post, 12 posts/thread; Whisper uploads capped at 16 MB; airchat whitelist removal does not auto-revoke.',
        'The ~19 root-bundled subsites deploy as ONE unit — none can ship independently until carved out to its own worker.',
      ]},
    ],
  },
};
