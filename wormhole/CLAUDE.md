# wormhole — wormhole.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Academic Wormhole Roulette. Thin assets Worker (worker `wormhole`, custom_domain wormhole.mino.mobi) — no build, no D1, no AI, no secrets…

## Facts

| | |
|---|---|
| Surface | `wormhole` |
| Dir | `wormhole/` |
| Endpoint | `wormhole.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/wormhole-marginalia` (taken 2026-11-01 from `claude/academic-wormhole-roulette-lpuqfq` with `take-ownership.mjs`; no work lost) |
| Deploy | `.github/workflows/deploy-wormhole.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "wormhole"`.

## How it works

Academic Wormhole Roulette. Thin assets Worker (worker `wormhole`, custom_domain wormhole.mino.mobi) — no build, no D1, no AI, no secrets. Spin the wheel and fall down a niche: one seed → one entire fictional micro-field rendered as a dossier — the foundational open-access paper (title/authors/journal/DOI/abstract), total granted funding broken down by funder + a yearly trend sparkline, the roster of low-impact journals, and a force-directed graph of the incestuous web of labs, PIs, and feuding theories. Deterministic satire in the borges/names/org lineage (xmur3 + mulberry32): same seed → same field for ever, so /f/<seed> is a permanent permalink; the roulette's only random roll is which deterministic field to open. SUBPAGE /p/<id> (paper.html + paper.js) renders a FULL LaTeX/PDF-styled journal article for any paper id — id is '<fieldSeed>.f' (the field's foundational paper, matches the dossier card) or '<fieldSeed>.r<k>' (another paper in that field): two-column Computer-Modern-ish layout with abstract, numbered sections, display equations, a booktabs results table, acknowledgements, and a reference list. Every reference is itself a resolvable paper id, so citations tunnel to other coherent fake papers in-place (mostly same field — shared subject vocab/journals/author pool — with a minority of cross-field 'interdisc.' cites); reference metadata is produced by the same header() that titles the target, so the citation always matches the paper you open. 'Save as PDF' via the browser print dialog (print CSS → real Letter pages). PUBLICATION FIGURES AS MULTI-TECHNIQUE STORIES OF VARYING SHAPE: a paper (wormhole/analysis.js) is an analytical narrative over ONE generated DATASTREAM — a sequence of genome techniques, each answering a different question about the SAME fabricated data, usually ending in a SYNTHESIS figure that relates them (e.g. outcome-vs-PC1 coloured by the k-means clusters; the fitted spectral cycle overlaid on the raw series). STORY SHAPE varies: letter (1–2 techniques, no synthesis, ~6–11 refs, 'Brief communication' kicker), article (3 + synthesis), monograph (4–6 + synthesis, 20–30 refs, 'Extended study'). Steps are drawn as an ascending subsequence of each stream's narrative order (descriptive → structural → inferential) with the closing step always from the inferential half, so any sampled story still reads as an argument. Six datastreams: multivariate (distribution · dependence · density2d · PCA · MDS · k-means · hierarchy · anomaly · ANOVA · OLS · LDA · logistic), temporal (distribution · ACF · changepoint · spectral/DFT · OLS), grouped (distribution · ANOVA · chi-square · OLS), cohort (distribution · Kaplan–Meier · log-rank · OLS), counts (distribution · contingency · ranking · Poisson), network (distribution · community detection · MDS · rank correlation · ranking) — ALL 23 genome techniques now reach papers. Results renders as numbered technique subsections with figures + computed readouts interleaved; the synthesis lands in the Discussion. Because every technique runs on the shared stream, the synthesis cross-references are real. THE GENOME↔PAPER BRIDGE: A.plan(id) reports a paper's stream/shape/techniques WITHOUT building any data (it draws randomness in the same order as run()), so /lab can scan seeds cheaply and show 'Seen in the wild → /p/<id>' per technique, while each paper's technique subsection links back to /lab/#<tid>. Techniques no paper reaches are marked genome-only in the matrix (dashed) — the visible roadmap. Every figure is a real plot of a fabricated-but-coherent dataset invented first, with every reported statistic COMPUTED FROM IT by an in-house numerics core (wormhole/stats.js: OLS w/ SEs, correlation, quantiles, KDE, normal CDF/quantile, Jacobi eigen/PCA, DFT periodogram, one-way ANOVA) — so the scatter's cloud really has r ≈ the r in the Results, the heatmap's structure is the claim, the biplot's PCs are the reported %s. Stats + charts now live in the SHARED REPO LIBRARY packages/dataviz/ (stats.js + charts.js + index.mjs ESM facade + README + a known-answer selftest) — 24 chart types built to real-figure standards (Okabe–Ito colourblind-safe categorical palette validated w/ the dataviz skill, viridis sequential, blue–gray–red diverging; thin marks, recessive axes, SMART LEGENDS placed in the emptiest quadrant), usable by any project. wormhole/{stats,charts}.js are byte-identical SYNCED COPIES (the browser fetches them from the site's own asset root, so it can't import across dirs); scripts/sync-dataviz.mjs --check enforces that in CI and --write refreshes them — edit packages/dataviz/, never the copy. Figures interleave with computed 'readout' text; types vary by seed for range. THE ANALYSIS GENOME at /lab (lab.html + wormhole/genome.js): a standalone roulette that exposes the graph pack as a grammar — a 12 DATA TYPE × 11 ANSWER TYPE matrix whose cells hold TECHNIQUES that each yield CHARTS. Spin lands on a technique (23 and growing: linear regression, ANOVA, PCA, spectral/Fourier, correlation structure, k-means, hierarchical clustering, logistic+ROC, survival/Kaplan–Meier, distribution fit, contingency, ranking, MDS, changepoint, autocorrelation, chi-square, log-rank, Poisson, LDA, rank correlation, community detection, outlier detection, bivariate density); each build()s a fabricated dataset, runs the real stat over it, and renders live figures with a computed finding. The (data×answer) matrix is the browsable, expandable genome — click a marker to load its technique; adding a technique lights up new cells; empty cells are the roadmap. Everything is generated fiction — no real field, paper, person, or grant. Modules (engine/stats/charts/dataset/analysis/genome/paper.js) shared verbatim by worker, pages, and node selftests (engine/charts/dataset/analysis/genome/paper .selftest.mjs — run before touching them; the deploy workflow runs all six as gates, incl. the dataset/analysis/genome coherence checks). Graph renderer in wormhole/graph.js. Public API, CORS open, pure compute: GET /api/field?seed=, GET /api/roulette, GET /api/paper?id=, GET /api/genome, GET /api/technique?id=&seed=, GET /api/health. Pages: / (field roulette), /f/<seed>, /p/<id> (full paper), /lab (analysis genome), /flora (the herbarium).

## Marginalia — `flora.js` (the procgen margin engine)

Every paper at `/p/<id>` grows a watercolour garden in its margins (after the
tikz-flora idea; written from scratch). Pure, seeded, DOM-free — it returns an
SVG string, so node tests it and the worker serves it.

- **Genome** — `genome(paperId, fieldSeed, overrides?)`. The **field is the biome**
  (ink palette + species pool + leaf forms), the **paper is the specimen** (habit,
  mirroring, which species of the pool, fauna, ornaments, density). So a field's
  papers are cousins, not clones. Axes today: 8 inks, 5 habits (climbing, meander,
  twining, frame, scatter), 10 species (rosette, cosmos, bell, umbel, forget-me-not,
  globe, berries, fern, bud, tendril), 6 leaf forms, birds/butterflies/moths, gilt
  sparkles/guide rules/star plates. Each gets a Latin binomial (`Indigofera serpens
  var. symmetrica`). **Adding an axis = a new entry in the tables at the top of the
  file**; the selftest's range check will insist it actually turns up.
- **Layout** — `grow(genome, {width, height, box}, opts)`. `box` is the TEXT BLOCK; nothing
  placed may enter it (the selftest checks every footprint on four page shapes).
  Order: habit vines + a companion vine per side (ribbon + hairline + wet highlight) →
  walk each by arc length every ~11px (big leaves, recursive `branch()` up to depth 2
  carrying leaves/sprays/blooms, dot-sprays, blooms) → **heroes** (~1 per 520px per side,
  with fanned leaves + bud; may spill past the page edge, never into text) → head/foot
  gardens (plants rising from the bottom edge, hanging from the top) → fauna/plates →
  **the fill**: a 9px coverage grid over the margins; random bare cells get planted until
  ~70–85% is painted (`SOLID` says how much of its footprint each species really paints —
  wiry sprays count for little). The density was raised ~10× on 2026-11-01 at the
  operator's request ("10% the requisite density and ornate"): the look to hold is a thicket
  with some paper breathing through, big saturated leaves (a third borrow the bloom inks),
  few showy heroes, texture from leaves and dot-sprays.
- **Paint** — watercolour baked into geometry: wobbled outlines, base→tip gradient
  washes, darkened edge, translucent inner streak, white granulation flecks, vein.
  **Instancing**: every species/leaf/spray is built ~6–8 times as a prototype `<g>` in
  `<defs>` and stamped with `<use>` (~100 bytes each; a page carries 3–7k things in
  ~0.5–1 MB). Prototypes contain *real paths, never nested `<use>`* — nesting made Chrome
  clone tens of thousands of shadow trees (1.5 s first paint; flat is ~0.6 s).
- **Tiles** — `opts.tile: px` also returns `tiles[]`: the garden cut into horizontal SVGs
  (defs + full-length vines in tile 0, overflow visible). `paper.html` inserts them one per
  frame so the text paints first. Growth animation: bands (140px per layer) fade up
  top-down, stems first; off under reduced-motion. `opts.inline` / `opts.flat` drop
  `<use>` / gradients for consumers that can't resolve references.
- **On the page** — `paper.html` inserts the tiles behind the text (`z-index:-1`; the
  sheet is its own stacking context, `overflow:hidden` clips the garden at the paper edge),
  regrows on resize. Sheet margins are 160px sides / 110 top / 170 bottom (46px on phones).
  `❀ margins` toggles (localStorage `wormhole-flora`). **Print**: `.print-frame` holds one
  Letter page of garden as an **`<img>` of the SVG**, `position:fixed`, which Chrome repeats
  on every printed page. It must be an image: inline SVG in a repeated fixed element lost
  everything inside nested groups past page 1 (only bare paths survived). Needs zero
  horizontal `@page` margin, so the page rule is swapped in by script (`#pageRule`) and the
  sheet takes 128px side padding; the sheet must be transparent in print or it covers the frame.
- **/flora** (`flora.html`) — the herbarium: one specimen sheet + six neighbours
  (three from the same field, three from elsewhere), ink/habit dials, `#<paperId>`
  permalinks; a kind dial (flora / serpents) and dials that follow the kind showing.
  **`GET /api/flora?id=&field=&kind=&w=&h=&margin=&ink=&pattern=&habit=`** returns the
  SVG for the paper's own kind unless `kind` forces one (`&format=json` → the description).
- Gate: `node flora.selftest.mjs` (in the deploy workflow).

## Marginalia — `serpent.js` (the second engine) and `margins.js` (the dispatcher)

**`margins.js`** picks each paper's margin kind by a seeded coin on the paper id
(`kindOf(id)`, 50/50 today) and owns the shared contract: `genome(id, field, overrides,
kind?)` stamps `g.kind`; `engine(g)`, `grow`, `describe` dispatch. `paper.html`, the
herbarium and `/api/flora` all go through it. A third engine = a file with the same
contract + one entry in `ENGINES`/`KINDS`. Load order: flora.js → serpent.js → margins.js.

**`serpent.js`** — the Garden after the fall (operator's brief, 2026-11-01: "beguiling
and, dare I say, sexy… the content of the paper is the fruit of the forbidden tree…
a big emphasis on the patterning of the scales"). It borrows flora's geometry core
(`WORMHOLE_FLORA.core`).
- **Genome**: biome (field) → skin (8: emerald, coral, obsidian*, golden python, sand
  viper, rose, midnight*, jade & gold; *iridescent-capable), fruit (apples, golden apples,
  pomegranates, figs), leaf ink, bark; specimen (paper) → scale pattern (8: diamondback,
  tricolour bands, reticulated net, saddles, stripes, dorsal zigzag, eyespots,
  iridescent), rows (7/9), viper/slender head, habit (entwined / coiled / slithering),
  sheen, girth. Binomial e.g. `Jadeophis reticulatus var. spiralis`.
- **The tree**: gnarled trunks up both side margins (bark ribbon + dashed fissures +
  highlight; about as thick as the serpent), twigs with leaves, hanging fruit, blossom; the
  trunks keep a coil's reach (`RB + 2·W0`) clear of text and page edge.
- **Bones before skin** (operator, 2026-11-01: "get a snake skeleton and wrap it around a
  tree. Like forces and muscles"). Every serpent is `simulate()`d: a chain of vertebrae
  `DS = 0.8·W0` apart in **3D**, position-based dynamics, 120 steps × 5 iterations —
  fixed segment lengths; a minimum bend radius (~1.25 body widths); optional straightening
  stiffness (`cfg.stiff`; **0 for page-bound serpents**, which hold their muscular shape —
  straightening with nothing opposing it is what flattened them); gravity; the trunk as a
  solid cylinder (`onTrunk()`, a per-row segment index) with **friction** on contact;
  **grip** muscles pulling coils onto the bark; no passing through itself (typed-array
  spatial hash); a **neck controller** pinning the last four vertebrae to a head pose just
  off the text, lifted toward the viewer; the text and page edge as walls. Habits:
  *entwined* (helix of varying pitch round 20–32 body-widths of trunk, tail hanging free,
  loose grip), *coiled* (tight, touching coils, strong grip), *slithering* (pose = the
  **serpenoid curve**, heading θ(s)=θ0+a·sin(2πs/λ) — the shape of lateral undulation —
  then relaxed), plus a *resting coil* in a deep foot margin (a compaction muscle holds the
  rings). A wave-muscle term exists in `simulate()` (`cfg.wave`) but knotted bodies — the
  serpenoid pose replaced it for slithering.
- **Skin from the pose**: `body()` Catmull-resamples the bones, and works out **which way the
  back faces** — away from the trunk axis where the body grips, toward the viewer where it's
  free — smoothed along the body. The scale lattice lives in body coordinates round the
  *whole* circumference (vp ∈ [−2,2]: 0 the spine, ±1 the flanks, beyond ±1.12 the belly),
  so where the body rolls round the branch the pattern rolls with it and the pale
  **ventral plates** come into view. Lighting from the 3D normal of each scale; specular
  streak at the half-vector. Body chunks (~40px) are **painter-sorted by depth z**: behind the
  bark → `snakeBack`, in front → `snake`, the head last; each serpent is one band entry so
  its own crossings sort correctly.
- **Pattern & shading**: `makePattern()` (u, vp) → (palette index, lightness); one `<path>`
  per colour per chunk; a hairline on the flanks only (never across chunk ends — that seams
  the body). Head: top-down outline (viper = broad), crown arrowhead, gold iris with a slit
  pupil and glint, brow ridges, nostrils, foreshortened when it tips in depth; the tongue is
  `<g class="tongue">`, which CSS flicks (`paper.css` / `flora.html`; off under reduced-motion).
- **Text safety**: walls inside the simulation, then `pushOut()` on every rendered sample
  (smallest on-page move); footprints for every body sample, head and tongue are checked by
  `serpent.selftest.mjs` on four page shapes (in the deploy workflow; ~18 s).
- **Cost**: ~0.3 s (node) to ~0.55 s (browser) per tall page, almost all simulation.
  `paper.html` therefore grows the margin after the text has painted (rAF + timeout) and the
  print frame later still; the herbarium grows thumbnails one at a time.
- Weight: ~1–2 MB of SVG for a long paper, but it is generated in the browser (parse
  ~80 ms) — only `/api/flora` ships it over the wire.

## Deploying

Pushes to `claude/wormhole-marginalia` that touch this surface's paths trigger [`.github/workflows/deploy-wormhole.yml`](../.github/workflows/deploy-wormhole.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
