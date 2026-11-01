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
- **Layout** — `grow(genome, {width, height, box})`. `box` is the TEXT BLOCK; nothing
  placed may enter it (the selftest checks every footprint on four page shapes).
  Stems by habit → walk by arc length emitting leaves/branches/blooms → heroes →
  sprigs in free margin → forget-me-not dust → fauna → ornaments.
- **Paint** — watercolour baked into geometry: wobbled outlines, base→tip gradient
  washes, darkened edge, translucent inner streak, vein. Blades are **instanced**: 8
  wobbled prototypes per form in `<defs>`, each leaf/petal a scaled `<use>` (cut
  markup ~4×; a normal paper's margin is ~0.8 MB of SVG). Keep it that way — paths
  per blade are what makes it heavy.
- **On the page** — `paper.html` inserts the SVG as the sheet's first child at
  `z-index:-1` (the sheet is its own stacking context), regrows on resize, animates
  the growth top-down (off under reduced-motion). `❀ margins` toggles (localStorage
  `wormhole-flora`). **Print**: a separate Letter-page frame sits in
  `.print-frame` with `position:fixed`, which Chrome repeats on every printed page;
  that only works with zero horizontal `@page` margin, so the page rule is swapped
  in by script (`#pageRule`) and the sheet takes 104px side padding instead.
  The sheet must be transparent in print or it covers the frame.
- **/flora** (`flora.html`) — the herbarium: one specimen sheet + six neighbours
  (three from the same field, three from elsewhere), ink/habit dials, `#<paperId>`
  permalinks. **`GET /api/flora?id=&field=&w=&h=&margin=&ink=&habit=`** returns the
  SVG (`&format=json` → the description).
- Gate: `node flora.selftest.mjs` (in the deploy workflow).

## Deploying

Pushes to `claude/wormhole-marginalia` that touch this surface's paths trigger [`.github/workflows/deploy-wormhole.yml`](../.github/workflows/deploy-wormhole.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
