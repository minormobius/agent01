# Geometry pack — ideas

Interactive sites on extremal-geometry conjectures: each follows the same shape (one interactive viz, growth/history view where useful, prose docs) with a single-file static HTML scaffold. Style varies slightly per page — distinctive accent colour, sister-site cross-links in the header, optional play tab. Series cross-referenced through the root landing page's `data` category.

## Built

| Path | Subject | Story-shape | Accent |
|------|---------|-------------|--------|
| `/geometry/` | Meta-index for the pack | Family-resemblance table sortable by era / technique / status, plus an explicit roadmap. Marketing page + navigation hub. | ochre `#5a4a14` |
| `/erdos/` | Erdős unit-distance problem | AI built a new construction that beats the grid; 80-year conjecture disproven (OpenAI 2026) | red `#8b0000` |
| `/guthkatz/` | Erdős distinct-distances problem | Polynomial-method lower bound matches the grid optimum up to √log n (Guth–Katz 2015) | steel blue `#1a5e7a` |
| `/hadwiger/` | Chromatic number of the plane | Amateur biogerontologist nudged the lower bound from 4 to 5 after 68 years (de Grey 2018). Procedural play mode added. | purple `#5e3b8b` |
| `/runner/` | Lonely runner conjecture | Wills 1967, proven k ≤ 7, open for k ≥ 8 — animation-native | teal `#0aa19c` |
| `/kakeya/` | Finite-field Kakeya conjecture | Dvir 2008 five-page polynomial-method proof; ancestor of Guth–Katz | rust `#a35a00` |
| `/capset/` | Cap-set problem in 𝔽₃ⁿ | Ellenberg–Gijswijt 2016 broke 3ⁿ/n to 2.756ⁿ — polynomial method again | pine green `#3a8a40` |
| `/elements/` | Periodic table as mandala | Concentric rings = shells (n=1..7); angular sectors = s/f/d/p blocks sized by capacity, ordered to follow atomic number; chemistry-view toggle aligns nobles with helium and straddles hydrogen across alkali + halogen columns. Each of 118 element nodes deeplinks to Wikipedia. Branch from the main pack — chem-not-geometry, but same scaffold | indigo `#3d4a72` |

## Next priorities

(Top of list when extending the pack. Keep this ordered.)

1. **`/szemeredi-trotter/`** — Point-line incidence bound, O((mn)^(2/3) + m + n). 1983, foundational, underlies guthkatz. Interactive grid + lines, drag to see incidences match the bound. The "missing ancestor" of the polynomial-method trilogy.

2. **`/heilbronn/`** — Place n points in unit square to maximize the smallest triangle. Records get updated regularly via heuristic search; site as a record-attempt sandbox with leaderboard via poll/draw infrastructure.

3. **`/borsuk/`** — Borsuk's 1933 partition conjecture, disproved by Kahn–Kalai 1993 with a high-dimensional counterexample. Same shape as erdős: unexpected construction wrecks low-dim intuition. Hard to viz in dim ≥ 64 — solving that part is most of the work.

## Other candidates

- **`/viazovska/`** — Sphere packing in dim 8 (E_8) and dim 24 (Leech). 2016 Fields Medal. The modular-form trick is gorgeous; viz via 2D projections of the lattice + density argument.
- **`/elekes/`** — Sum-product bound. Erdős–Szemerédi 1983; progress over decades; current bound ~|A|^{4/3 - ε}.
- **`/orchard/`** — Orchard visibility / ordinary lines. Green–Tao 2013 resolved the asymptotic.

## Pattern notes

Every entry should have:

- Single-file static HTML page in its own top-level directory (`/<name>/index.html`).
- Header: crumb to `mino.mobi`, h1, subtitle, sister-site crossref strip.
- Format bar (theme + reveal-all) if there's coloring or hover-driven viz.
- Tabs: at least one interactive viz tab, optional growth/history/play tabs, docs tab.
- Distinct accent colour from the siblings (record above).
- Entry added to root `index.html` PROJECTS array (category: `data`, age: `hot`).
- Cross-links to sister sites in `<footer>`.
- Math validated in a smoke test (run inside the deploy commit body).

## Anti-patterns

- **No server-side compute.** Everything static HTML + canvas JS. The polynomial-method demos in particular tempt one toward server-side SAT solvers; resist.
- **Don't pick problems that need > 500 vertices to demonstrate.** The page becomes click-uncolourable. (Reveal-only static rendering is fine — see hadwiger's plan for the actual de Grey graph.)
- **Don't draw a log-log growth chart for problems with two data points.** A prose timeline reads better.
- **Don't overclaim.** Be honest when a procedural construction doesn't quite reach the claimed bound (see hadwiger's "Moser flower"); the page can still be educational.

## Branching ideas (not in the main series but adjacent)

- **`/dvir/`** — explicitly a polynomial-method explainer page that walks through Dvir's 5-page proof in interactive steps. Could share material with `/kakeya/`.
- **`/polymath/`** — page about the Polymath collaborative projects. Polymath16 (hadwiger) is the most natural entry.
- **`/erdos-problems/`** — interactive index of all the Erdős open problems with progress trackers. Linked from `/erdos/` and `/guthkatz/`.
