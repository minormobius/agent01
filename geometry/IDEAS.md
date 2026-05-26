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
| `/szemeredi-trotter/` | Point-line incidences in ℝ² | Szemerédi–Trotter 1983 — I ≤ C(mn)^(2/3) + m + n. The Erdős tight construction (K × 2K² grid + K³ lines) matches the bound at I/(mn)^(2/3) = 2^(−2/3) ≈ 0.63 for every K. The seed crystal that the polynomial-method trilogy grew out of. | wine `#5a1a3a` |
| `/heilbronn/` | Maximize the smallest triangle | Heilbronn ~1950, open. Place n points in unit square; score is min over C(n, 3) triangles. Heilbronn conjectured Θ(1/n²); KPS 1981 disproved with c·log(n)/n². Drag + in-page annealer + localStorage personal-best tracker. Bounds plot includes Cohen–Pohoata–Zakharov 2024 upper bound. | moss `#2a6a4a` |
| `/borsuk/` | Partition into smaller pieces | Borsuk 1933 conjectured ℝᵈ subsets need only d+1 pieces. True in dim ≤ 3; Kahn–Kalai 1993 disproved at d=1325 via Frankl–Wilson. 2D demo (drag polygon, rotate radial 3-cut) + dimension-race timeline 1325 → 65 → 64. The "open band 4..63" is the still-unknown zone. | midnight `#3a3060` |
| `/viazovska/` | Sphere packing in dim 8 & 24 | Viazovska 2016 (E₈) + CKMRV 2017 (Leech) — densest packings, proven exactly via modular-form magic functions (Cohn–Elkies LP bound). Hero is the E₈ Coxeter projection (240 roots → 8 rings of 30, projection plane computed offline as top-2 eigenspace of C+Cᵀ) with a scrub slider that morphs Coxeter↔generic. Plus a 2D circle-packing tab and a density-by-dimension chart marking the 5 solved dims. | gold `#97781a` |
| `/elements/` | Periodic table as mandala | Concentric rings = shells (n=1..7); angular sectors = s/f/d/p blocks sized by capacity, ordered to follow atomic number; chemistry-view toggle aligns nobles with helium and straddles hydrogen across alkali + halogen columns. Each of 118 element nodes deeplinks to Wikipedia. Branch from the main pack — chem-not-geometry, but same scaffold | indigo `#3d4a72` |

## Next priorities

(Top of list when extending the pack. Keep this ordered.)

1. **`/elekes/`** — Sum-product bound. Erdős–Szemerédi 1983 (same year as ST, sister problem with shared machinery); progress over decades; current bound ~|A|^{4/3 - ε}.

2. **`/orchard/`** — Orchard visibility / ordinary lines. Green–Tao 2013 resolved the asymptotic.

3. **`/kepler/`** — Dimension-3 sphere packing (Hales 1998, Flyspeck 2014). Natural prequel to `/viazovska/`; computer-assisted-proof angle pairs with hadwiger's SAT story.

## Other candidates

- **`/cohn-elkies/`** — the LP bound behind `/viazovska/`. Interactive "magic function" explorer: drag the auxiliary function, watch the bound move; the modular-form construction is the punchline.
- **`/cohen-pohoata-zakharov/`** — explicit 2024 improvement on Heilbronn's upper bound, via polynomial method. Could spin off from `/heilbronn/` as a technique-focused explainer.
- **`/frankl-wilson/`** — the rank-of-incidence-matrix theorem that drove the original Kahn–Kalai counterexample on `/borsuk/`. Adjacent to capset; could anchor a "finite-field linear-algebra toolkit" page.
- **Leaderboard for `/heilbronn/`** — the current version stores personal bests in localStorage; future iteration could wire it to the poll/draw backend for a global leaderboard with submission verification.

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
