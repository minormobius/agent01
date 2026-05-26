// Cloudflare Pages Function — POST /search
//
// Landing-page semantic search over the mino.mobi catalogue. The whole
// catalogue (~90 sites, ~5k tokens) is small enough to stuff into the model
// context on every call, so there is no vector DB / RAG pipeline — the model
// reads the full list and does the matching natively.
//
// Backend: Workers AI Llama 3.3 70B via the `AI` binding already configured
// on this Pages project (same binding novelty.js / ternary.js use). To swap to
// a frontier model later, replace the env.AI.run() call with an Anthropic
// fetch — the request/response shape and the frontend stay the same.
//
// The CATALOG constant is generated from index.html by
// scripts/generate-search-catalog.mjs — do not hand-edit it.

/*CATALOG_START*/
const CATALOG = "- poll [bluesky] https://poll.mino.mobi — Anonymous polling with RSA blind signatures. The poll host can’t link your identity to your vote. {workers, d1, do}\n- airchat [bluesky] https://airchat.mino.mobi — Voice-first social on ATProto. Browser records, Whisper transcribes, PDS holds the audio. Identity via Bluesky OAuth. {workers, atproto, whisper}\n- zoom [bluesky] https://zoom.mino.mobi — SimCluster community viewer. Infinite-canvas visualization of feed communities with hex-packed profile pictures. {react, canvas}\n- weft [bluesky] https://mino.mobi/weft/ — Thread analysis. Tidy-tree canvas view of any Bluesky conversation with contributor weighting and YAML export for LLMs. {canvas, atproto}\n- bisk [bluesky] https://bisk.mino.mobi — The SimCluster Daily. A deterministic digest of a Bluesky neighborhood, recomputed each morning: top chickens (most-liked posts), delvers (deepest thread, rendered with weft's threadbeast), and a sentiment weather report. A fork of the mino times; morphyx and modulo will edit once the personas wake up. {worker, atproto}\n- photo [bluesky] https://photo.mino.mobi — Photo explorer. Every image from any handle, rendered as a filterable masonry grid with engagement analytics. {react, duckdb, wasm}\n- thread [bluesky] https://photo.mino.mobi/#/thread (part of photo) — Threaded post viewer. Full conversation tree rendering with quote-post expansion. {react}\n- astro [bluesky] https://photo.mino.mobi/astro/ (part of photo) — Astrology photo analyzer. EXIF timestamp + GPS coordinates feed an ephemeris that paints a chart for the moment the photo was taken. {react}\n- prism [bluesky] https://photo.mino.mobi/prism/ (part of photo) — Photo prism. Keratoconic global effect, hex toggle, EXIF-aware chromatic dispersion. {react}\n- ternary [bluesky] https://mino.mobi/ternary/ — Three lusts, one chart. Ternary plot of posting temperament—flesh, knowledge, and argument. {embeddings}\n- judge [bluesky] https://mino.mobi/judge/ — Posting profile. Personality traits and valence from post embeddings, topics via k-means clustering. {embeddings}\n- novelty [bluesky] https://mino.mobi/novelty/ — Semantic novelty trajectory. Track how an account’s posting content drifts or repeats over time. {embeddings}\n- echo [bluesky] https://mino.mobi/echo/ — Post density, head to head. Compare two handles side by side on posting volume and patterns.\n- density [bluesky] https://mino.mobi/density/ — Post brevity, measured. Filter posts by exact word count, ranked by character length.\n- seek [bluesky] https://mino.mobi/seek/ — Find a friend. Discover follows-of-follows you don’t yet follow, ranked by network density.\n- cluster [bluesky] https://mino.mobi/cluster/ — Find your tightest circle. The largest group of your follows who all mutually follow each other.\n- wild [bluesky] https://mino.mobi/wild/ — Group novelty on Bluesky. How wild is your corner? Semantic novelty analysis across a whole list. {embeddings}\n- disk [bluesky] https://mino.mobi/disk/ — Poincar&eacute; interaction map. Hyperbolic-disk view of account interactions with more room at the edge. {canvas}\n- answers [bluesky] https://mino.mobi/answers/ — Ask anything. Answered by the ATmosphere—questions, answers, votes, and best-answer picks stored on PDS. {atproto, oauth}\n- rite [bluesky] https://rite.mino.mobi — Sentence editing drill plus nine surfaces over Bluesky prose—fodder swipe deck, redactle, semantic search, atlas, lexicon lenses, list themes, link knowledge graph, and signal mapping. {workers, d1, ai}\n- fodder [bluesky] https://rite.mino.mobi/fodder/ (part of rite)\n- redact [bluesky] https://rite.mino.mobi/redact/ (part of rite)\n- ask [bluesky] https://rite.mino.mobi/ask/ (part of rite)\n- atlas [bluesky] https://rite.mino.mobi/atlas/ (part of rite)\n- lexicon [bluesky] https://rite.mino.mobi/lexicon/ (part of rite)\n- list [bluesky] https://rite.mino.mobi/list/ (part of rite)\n- web [bluesky] https://rite.mino.mobi/web/ (part of rite)\n- signal [bluesky] https://rite.mino.mobi/signal/ (part of rite)\n- org [work] https://org.mino.mobi — Organization hub. Create orgs, manage members and tiers, with calendar, CRM, PM, and Wave apps built in. {react, atproto}\n- pm [work] https://mino.mobi/pm/ (part of org) — Earned value project management. Gantt charts, S-curves, resource tracking, and Kanban—synced to PDS. {pwa, atproto}\n- wave [work] https://wave.mino.mobi (part of org) — Team messaging. Channels, threads, and collaborative documents with real-time Jetstream sync. {react, atproto}\n- wiki [work] https://mino.mobi/wiki/ (part of org) — Obsidian-like knowledge graph on ATProto. Rust/WASM markdown engine, WYSIWYG canvas editor, PDS-backed notes. {atproto, wasm}\n- crm [work] https://mino.mobi/crm/ (part of org) — Vault CRM. Encrypted contact records sealed to PDS with ECDH + AES-GCM; tiered sharing for team members. {atproto, vault}\n- bounty [work] https://mino.mobi/bounty/ — Anonymous bounty marketplace. Reputation-based ecash tokens with blind-signed denominations. {workers, d1}\n- time [data] https://mino.mobi/time/ — The Mino Times—agentic biotech intelligence. Research, articles, editorial panels, and podcast. {atproto, podcast}\n- mega [data] https://mino.mobi/mega/ — Interactive map of global megaprojects—construction, timelines, costs, and deep context on a 3D globe. {maplibre, deck.gl}\n- finance [data] https://mino.mobi/finance/ — Personal financial dashboard. Market data synced to ATProto records, rendered with dark-mode charts. {atproto}\n- bogo [data] https://mino.mobi/finance/bogo/ (part of finance) — Ice cream deals near you. Find discounts by zip code across major grocery chains.\n- agimet [data] https://mino.mobi/finance/agimet/ (part of finance)\n- stocks [data] https://mino.mobi/finance/stocks/ (part of finance)\n- wars [data] https://mino.mobi/wars/ — War factor analysis. Correlates of War dataset visualized by type, region, duration, and casualties.\n- cult [data] https://mino.mobi/wars/cult/ (part of wars) — Cultural decomposition. Decompose any text into culture-shaped axes using precomputed sentence embeddings of historical religious / philosophical / scientific corpora. {embeddings, wasm}\n- flows [data] https://mino.mobi/flows/ — Commodity flow maps. Geographic trade and movement data rendered as directional arcs. {maplibre}\n- phylo [data] https://mino.mobi/phylo/ — Interactive phylogenetic tree explorer. Open Tree of Life data synced to ATProto PDS records. {atproto, canvas}\n- cards [data] https://mino.mobi/cards/ — Wiki Cards. A deep Wikipedia card game—Lucky, Transmute, Nexus, and Library modes built on neural embeddings. {atproto}\n- geometry [data] https://mino.mobi/geometry/ — Hub for the extremal-geometry pack. Family-resemblance table sortable by era, technique, status — and an explicit roadmap of next entries (szemerédi–trotter, heilbronn, borsuk, viazovska, ...). Read this first if you want the lay of the series. {index, math}\n- erdos [data] https://mino.mobi/erdos/ (part of geometry) — Unit distance, disproven. Interactive visualization of Erdős's 1946 construction, in light of OpenAI's May 2026 disproof of the unit-distance conjecture. {canvas, math}\n- guthkatz [data] https://mino.mobi/guthkatz/ (part of geometry) — Distinct distances, almost-resolved. Sister page to erdős — the 1946 dual problem, climbed slowly from √n to n/log n by the polynomial method (Guth–Katz, 2015). {canvas, math}\n- hadwiger [data] https://mino.mobi/hadwiger/ (part of geometry) — Chromatic number of the plane. Interactive Moser-spindle 4-colouring puzzle plus Isbell's 7-colour hexagonal tiling. The 1950 question whose lower bound an amateur biogerontologist nudged from 4 to 5 in 2018. {canvas, math}\n- runner [data] https://mino.mobi/runner/ (part of geometry) — Lonely runner conjecture. k runners on a circular track at distinct integer speeds; at some moment each is at distance ≥ 1/k from every other. Proven for k ≤ 7, open since 1967. Animation-native. {canvas, math}\n- kakeya [data] https://mino.mobi/kakeya/ (part of geometry) — Finite-field Kakeya conjecture (Dvir 2008). Build a Besicovitch set in 𝔽 q 2 by clicking cells; watch q+1 directions get covered. Five-page polynomial-method proof that birthed the technique behind guthkatz. {canvas, math}\n- capset [data] https://mino.mobi/capset/ (part of geometry) — Cap-set problem in 𝔽 3 n . Find the largest subset with no three-term arithmetic progression — the game SET writ small. Ellenberg–Gijswijt 2016 crushed the bound from 3 n /n to 2.756 n . Closes the polynomial-method trilogy. {canvas, math}\n- szemeredi-trotter [data] https://mino.mobi/szemeredi-trotter/ (part of geometry) — Point-line incidence bound (1983): m points + n lines in the plane share at most O((mn) 2/3 + m + n) incidences. Build the Erdős tight construction — a thin K × 2K 2 grid plus K 3 lines — and watch the ratio I/(mn) 2/3 sit flat at 2 −2/3 . The seed crystal that the polynomial-method trilogy grew out of. {canvas, math}\n- heilbronn [data] https://mino.mobi/heilbronn/ (part of geometry) — Heilbronn's triangle problem (~1950, open). Place n points in the unit square; your score is the smallest of the C(n, 3) triangles they form. Heilbronn conjectured the optimum is Θ(1/n 2 ); Komlós–Pintz–Szemerédi disproved him in 1981 with c·log(n)/n 2 . Drag points, run the in-page annealer, beat your own record (saved per n in localStorage). {canvas, math}\n- borsuk [data] https://mino.mobi/borsuk/ (part of geometry) — Borsuk's 1933 partition conjecture. Every bounded subset of ℝ d splits into d+1 pieces of strictly smaller diameter — easy in 2D and 3D, false in dim 1325 (Kahn–Kalai 1993), and still false in dim 64 (Jenrich 2014). 2D demo + the dimension-race timeline showing the threshold shrinking over 21 years. {canvas, math}\n- viazovska [data] https://mino.mobi/viazovska/ (part of geometry) — Sphere packing in dimension 8 and 24. The E 8 and Leech lattices are the densest possible — proven exactly by Viazovska (2016) and CKMRV (2017) with magic functions built from modular forms. Scrub the iconic E 8 Coxeter projection (240 roots → 8 rings of 30), pack circles in 2D, and watch density crater with dimension. {canvas, math}\n- elements [data] https://mino.mobi/elements/ — Periodic table as a mandala. Concentric rings for the seven electron shells, angular sectors for the s/p/d/f orbital blocks sized by capacity. 118 element nodes coloured by category; hover for details, click out to the Wikipedia article. {canvas, chem}\n- techtree [data] https://mino.mobi/cards/collection/techtree.html (part of cards) — Tech tree. 179 technologies from stone tools to agentic LLMs, laid out as an infinite-canvas polar fan with sector-bound layout. {canvas}\n- grow [data] https://mino.mobi/cards/collection/grow.html (part of cards) — Grow. Generative plant simulation—children inherit grain lattice rotation; a stand-alone visual independent of the cards game. {canvas}\n- recipe [data] https://mino.mobi/cards/games/recipe.html (part of cards) — Recipe builder. Combine cards into recipes scored against the yum complementarity model. {embeddings}\n- yum [data] https://mino.mobi/cards/games/yum.html (part of cards) — Flavor pairing explorer. Neural embeddings of food compounds, complementarity scores, and recipe builder. {atproto}\n- labglass [tools] https://mino.mobi/labglass/ — Peer-to-peer biotech data workbench. SQL and Python running entirely in the browser. {duckdb, pyodide}\n- os [tools] https://os.mino.mobi — Browser-based terminal for your ATProto PDS. XRPC commands, DuckDB SQL, AI chat, and embedded bash container. {react, wasm, atproto}\n- read [tools] https://mino.mobi/read/ — Adaptive speed reader for Project Gutenberg texts and poetry. Bionic formatting, memorize mode, and eye-tracking pacing. {workers}\n- flow [tools] https://mino.mobi/read/flow/ (part of read) — Visualize reading. Text flowing through a curved path on the canvas with Project Gutenberg integration. {canvas}\n- post01 [tools] https://mino.mobi/read/post01/ (part of read) — Story pitch generator. Drafts, outlines, sharpening, and process notes for the first long-form essay in the read/ family.\n- noise [tools] https://mino.mobi/noise/ — Binaural beats, Shepard tones, harmonic overtones, and noise generator. Keeps playing when your phone sleeps. {pwa}\n- music [tools] https://mino.mobi/music/ — Browser-based sequencer that stores compositions as records on the personal data server. {pwa, atproto}\n- bakery [tools] https://bake.mino.mobi — Flour blend calculator—protein math, hydration targets, blend ratios. {pwa, atproto}\n- sweat [tools] https://mino.mobi/sweat/ — Workout logging with charts, progressive overload tracking, offline-first. {pwa, atproto}\n- clock [games] https://mino.mobi/clock/ — Helix Calendar. Fractal nested helix visualization of time with drill-down zoom from years to seconds. {webgpu, canvas}\n- emsim [games] https://mino.mobi/clock/emsim/ (part of clock) — Multi-physics torus field simulator. Position tori with gravity, magnetic, and force field interactions. {canvas}\n- stretch [games] https://mino.mobi/clock/stretch/ (part of clock) — Interactive 3D deformable blob geometry rendered with GPU acceleration. {webgpu}\n- globe [games] https://mino.mobi/clock/globe/ (part of clock) — Earth globe with analytical ocean currents. Land-masked particle drift, no visible mesh bands. {webgl}\n- hand [games] https://mino.mobi/clock/hand/ (part of clock) — Articulated hand rig for clock-family demos. {webgl}\n- scope [games] https://mino.mobi/clock/scope/ (part of clock) — Telescoping scope visualization inside the clock family. {canvas}\n- mole [games] https://mino.mobi/clock/mole/ (part of clock) — WebGPU molecular dynamics. Twelve molecules including C60 and exotic elements rendered at interactive frame rates. {webgpu}\n- ship [games] https://mino.mobi/clock/ship/ (part of clock) — Sail simulator. Wind-driven physics on the clock’s family of curved surfaces. {webgl}\n- helix [games] https://mino.mobi/clock/helix/ (part of clock)\n- corn [games] https://mino.mobi/clock/corn/ (part of clock)\n- mol [games] https://mino.mobi/clock/mol/ (part of clock)\n- torusworld [games] https://mino.mobi/clock/scape/ — Explorable 3D landscape with first-person controls. Local and networked multiplayer. {canvas, webrtc}\n- pac [games] https://mino.mobi/clock/pac/ (part of torusworld) — First-person Pac-Man on a torus. FPV view with physics simulation on a curved surface. {webgl}\n- torpac [games] https://mino.mobi/clock/torpac/ (part of torusworld) — Multi-torus Pac-Man. Play across multiple toroidal worlds with customizable configurations. {webgl}\n- knotpac [games] https://mino.mobi/clock/knotpac/ (part of torusworld) — Pac-Man on torus knots. Topological shapes—Hopf Link, Borromean Rings, and beyond. {webgl}\n- inpac [games] https://mino.mobi/clock/inpac/ (part of torusworld) — Interior Pac-Man. First-person gameplay inside the hollow interior of a large torus. {webgl}\n- chess [games] https://mino.mobi/clock/toruschess/ (part of torusworld) — 16&times;16 toroidal chess. Edges wrap, pieces move through the topology. Local and networked play. {canvas, webrtc}\n- pokemon [games] https://mino.mobi/pokemon/ — Critter Red. A browser-native monster RPG in the classic turn-based vein. {canvas}\n- proteus [games] https://mino.mobi/pokemon/proteus/ (part of pokemon) — Amoeba qualia prototype. Pressure-driven membrane simulation with cortex control, food engulfment, and live channel tuning. {canvas}\n- mmo [games] https://mino.mobi/mmo/ — Massively multiplayer paint. Shared canvases with append-only stroke log, tamper-evident chain, and ATProto identity gating. {workers, atproto, do}\n- draw [games] https://mino.mobi/draw/ (part of mmo) — Polygon drawing game. Trace a target shape; closer guesses score higher. Identity-only OAuth, scores on a public leaderboard. {atproto}\n- paint [games] https://mino.mobi/paint/ (part of mmo) — Single-player paint with the same stroke engine that powers mmo. Local canvas, no auth required. {canvas}\n- range [games] https://mino.mobi/range/ (part of mmo) — Practice range for the polygon drawing game. Try shapes, iterate, no scores recorded. {canvas}";
/*CATALOG_END*/

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_HISTORY = 6;        // trailing turns kept for multi-turn context
const MAX_QUERY_CHARS = 800;  // guard against oversized inputs

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const SYSTEM = `You are the site guide for mino.mobi, a personal hub of around ninety small interactive web projects built by one person. Below is the full catalogue; each line is "- name [category] url (parent) — description {tags}".

Answer the visitor's question by finding the best matches in the catalogue.

Rules:
- Recommend 1 to 5 sites, most relevant first.
- Write each site name as a markdown link to its exact url from the catalogue, e.g. [zoom](https://zoom.mino.mobi), followed by one short clause on why it fits.
- If the visitor is vague ("that site with the thread thing"), make your best guesses and offer a couple of candidates.
- If nothing in the catalogue fits, say so plainly and point to the nearest category instead of inventing something.
- Keep it tight: at most one sentence of framing, then the list. No preamble, no sign-off.
- Only ever recommend sites that appear in the catalogue below. Never invent or guess a URL.

CATALOGUE:
${CATALOG}`;

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestPost({ request, env }) {
  // Match the binding-name fallback used by novelty.js / ternary.js.
  const ai = env.AI || env.SemanticNovelty;
  if (!ai) {
    return json({ error: 'AI binding not configured on this Pages project.' }, 500);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected JSON body.' }, 400);
  }

  const query = String(body.query || '').slice(0, MAX_QUERY_CHARS).trim();
  if (!query) return json({ error: 'Empty query.' }, 400);

  // Sanitise prior turns into {role, content} pairs.
  const history = Array.isArray(body.history) ? body.history : [];
  const priorTurns = history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

  const messages = [
    { role: 'system', content: SYSTEM },
    ...priorTurns,
    { role: 'user', content: query },
  ];

  try {
    const stream = await ai.run(MODEL, {
      messages,
      stream: true,
      max_tokens: 700,
      temperature: 0.3,
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        ...CORS,
      },
    });
  } catch (err) {
    return json({ error: 'Inference failed: ' + (err && err.message ? err.message : String(err)) }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}
