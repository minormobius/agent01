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
| `/aztec/` | Aztec diamond domino tilings + the **Arctic Circle theorem** (Jockusch–Propp–Shor 1995) | Sample a uniform random tiling by **domino shuffling** (EKLP), colour dominoes by the four types N/S/E/W → four frozen monochromatic corners + a roiling temperate centre, separated by the inscribed circle of radius n/√2. Sliders for order n (1..64), resample, grow +1 (one authentic shuffle step), auto-grow-to-max, arctic-circle overlay, temperate-fraction → π/4 readout. Dimer-model cousin of meander/TL. Shuffle node-validated before commit: reproduces tiling counts 2/8/64/1024, samples AD₂/AD₃ uniformly, 0 invalid over 45k samples, stable to AD₁₀₀. | ice cobalt `#2456b8` |
| `/temperley-lieb/` | Temperley–Lieb algebra & loop models | The algebra under /meander/, made playable. Hero = a loop-tiling explorer: fill an L×M grid with the two non-crossing TL tiles, trace the loops, weight each by δ. Boundary toggle disk/cylinder/torus → on cylinder/torus loops wind (non-contractible, the **affine/annular TL**); a 3D-donut tab (knotpac parametrization in Canvas 2D) shows the winding. Algebra tab = a real TL calculator: generators eᵢ, the relations eᵢ²=δeᵢ / eᵢeᵢ₊₁eᵢ=eᵢ / far-commute shown as live verdicts, dim=Cₙ, and a Markov-trace "close it up" that ties back to the meander matrix. Both engines node-validated before commit (lattice: 0 failures/4320 configs; algebra relations PASS n=2..6). | viridian `#0d6e63` |
| `/meander/` | Counting closed meanders | A closed loop crossing a line at 2n points = a pair of non-crossing arch systems (Catalan each) that fuse into ONE loop. Meandric numbers 1, 2, 8, 42, 262, 1828, … (OEIS A005315) have no closed form; growth exponent α=(29+√145)/12 comes from a c=−4 CFT coupled to 2D quantum gravity (Di Francesco–Golinelli–Guitter 1997). Hero = arch-superposition explorer with live loop-component colouring + meander/meandric-system badge; tabs: brute-force counter, M_{n+1}/M_n → R²≈12.26 ratio chart, stamp-folding bijection. Open since Poincaré 1912. | amaranth `#a01f4c` |
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

## Roadmap — the loop / diagram / statistical-mechanics vein

A second track opened with `/meander/` and `/temperley-lieb/`: not "extremal bound, long climb, open endpoint" but **"poke a simple object, watch deep structure fall out."** Future picks in this vein should hit all four marks:

- **A dead-simple object you can poke** — arcs across a line, tiles in a grid, crossings in a knot.
- **…that secretly carries deep structure** — an algebra, a limit shape, a topological invariant.
- **…with a physics-grade punchline** — CFT, quantum gravity, modular forms, integrability, universality.
- **…one manipulable canvas** with a verb (*find / sample / wrap / verify*) and a clear verdict.

The spine: **meander** (count the loops) → **temperley–lieb** (the algebra of loops, and how it wraps onto a torus). Three tracks hang off it.

**Track 1 — the loop/tiling family (direct descendants):**
- **`/aztec/`** — Aztec diamond domino tilings + the **Arctic Circle theorem** (Jockusch–Propp–Shor 1995). Sample a uniform random tiling by *domino shuffling* (EKLP), watch the frozen corners + disordered center crystallize into a circle. The dimer model = a cousin of TL's loop model; the limit-shape reveal is the biggest "wow" in the space. **✓ SHIPPED — see Built table.**
- **`/jones/`** — Jones polynomial via the **Kauffman bracket**: draw a knot/braid, resolve each crossing by the skein `A·)( + A⁻¹·≍`, state-sum to the polynomial. The literal payoff of TL's Markov trace; tightest possible sequel to `/temperley-lieb/`.
- **`/six-vertex/`** — ice model arrows → height-function landscape → alternating-sign matrices → its own arctic curve. Bridges TL to the integrable-lattice world.
- **`/catalan/`** — the Rosetta hub: the ~10 things Catalan numbers count (Dyck paths, triangulations, non-crossing matchings, trees, parenthesizations) **morphing into each other** via live bijections. Cheap, foundational, ties meander + TL at the root.

**Track 2 — limit shapes & universality:**
- **`/lozenge/`** — lozenge tilings / boxed plane partitions: MacMahon's box formula, the arctic *ellipse*, a rotatable 3D cube-stack. Dimer model in its second costume (pairs with `/aztec/`).
- **`/rsk/`** — Robinson–Schensted–Knuth: type a permutation, watch the bumping build two Young tableaux; longest-increasing-subsequence; the Tracy–Widom punchline.
- **`/kpz/`** — TASEP → KPZ: hopping particles, the growing interface, `t^{1/3}` fluctuations, the universality class.
- **`/sandpile/`** — abelian sandpile: drop sand, topple, the fractal identity element; self-organized criticality.

**Track 3 — the torus / modular vein (where "wrapping" lives):**
- **`/modular/`** — fundamental domain of SL(2,ℤ), the j-function, q-expansions. A torus *is* ℂ/Λ — the deep reason the TL torus matters; wires to `/viazovska/`'s modular forms and to moonshine.
- **`/farey/`** — Farey tessellation / Stern–Brocot tree / Ford circles: the modular group as a tessellation, rationals as a tree.
- **`/apollonian/`** — Descartes' circle theorem, integer curvatures, number theory hiding in a packing.
- **`/penrose/`** — aperiodic order via cut-and-project from a 5D lattice shadow; inflation rules; quasicrystals.

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
