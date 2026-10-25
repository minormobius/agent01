# ATOM⁴ — the write-up: kit survey and plan (pinned)

**Status: pinned, 2026-10-25.** Writing waits while the science moves forward. When it starts, take it slowly: a few
days to get it right. The bar is arXiv's (checkable claims, verified references, reproducible numbers), whether or
not anything is submitted.

The first paper is the 4D periodic table. If that goes well, the rest becomes a series: the forces between
molecules, Pxygen and Xater, the census, and the lens vacuum. The prior art and what is new against it are in
[`LITERATURE.md`](LITERATURE.md).

## What the repo already has

| Need | What exists | Fit |
|---|---|---|
| **Page layout** | `wormhole/paper.css` (151 lines) and the `paper.html` shell. A two-column, Computer-Modern-style sheet on a PDF-viewer grey, booktabs tables, centred display equations with right-hand numbers, a two-column reference list, `@page` letter with print margins, and one column on phones. | Good. It's written for wormhole's generated `flow` ({p, eq, fig, table}), but the CSS stands alone. |
| **Figures** | `packages/dataviz/charts.js`: 24 SVG chart types with an Okabe–Ito colour-blind-safe palette, viridis, quiet axes and legends placed in the emptiest quadrant. `stats.js` holds the estimators. A known-answer selftest covers both. | Good. SVG prints crisply. ATOM⁴'s own figures are dark-theme screen canvases (`js/main.js`), so the paper's figures are redrawn from the same baked data through dataviz. |
| **Equations** | Wormhole sets them by hand in HTML (Unicode, `<sub>`/`<sup>`). No KaTeX or MathJax anywhere in the repo. | Not enough for this math (Γ functions, integrals, fractions, matrices). See below. |
| **PDF** | Chromium and Playwright are installed in the sandbox, so `page.pdf()` prints the page's print CSS to a real PDF headlessly. | Good. |
| **LaTeX** | None in the sandbox (no pdflatex, xelatex, pandoc or tectonic), and no matplotlib. | Needed only for an actual arXiv submission. Tectonic is a single binary that may be fetchable; unverified. |
| **Numbers** | Every figure the paper would quote is baked: `js/table.js`, `pairs.js`, `response.js`, `molecules.js`, `census.js`. Each chapter page is generated from those bakes (the scratch `genpages.py`), so its prose can't drift from the computation. | Reuse the pattern: the paper reads the bakes too. |
| **Hosting** | `games.mino.mobi` serves anything under `atom4/`, with no CSP on the games surface. | `atom4/paper/` and its PDF. |

## Decisions for when it's unpinned

1. **Layout: fork wormhole's CSS rather than share it.** The paper needs things a satire generator doesn't: a title
   block with real authors and affiliations, cross-referenced figure and equation numbers, appendices, and A4 or
   letter. Credit the origin in a comment. (The alternative is a byte-identical copy kept by a sync check, as dataviz
   is. That's right only if wormhole should get the same improvements.)
2. **Math: pre-render, don't load at view time.** Render TeX to static HTML/MathML once, at generation (KaTeX's
   `renderToString` in node), so the page has no runtime dependency and prints the same everywhere. The fallbacks are
   KaTeX from a pinned CDN version, or hand-written MathML. Pre-rendering needs `katex` installed in the sandbox
   (npm), to be checked.
3. **References: a structured file with the verification status in it.** `refs.json`, one entry per reference, each
   carrying `verified: read | index | cited`, as in LITERATURE.md. The generator refuses to cite anything marked
   `cited`, and a selftest enforces it.
4. **Numbers: from the bakes, with a check.** Every number in the text comes from a baked file, and a selftest checks
   the rendered paper against them, as the chapter pages already do.
5. **Figures (draft list for paper 1):**
   - the 4D table;
   - first ionization energy against Z, both worlds;
   - the noble gases against the shell-theorem counterfactual;
   - subshell energies against Z (where the transition metals turn toward d);
   - the 3D validation (ionization computed against measured);
   - a neutral atom's far pull.
6. **Before writing:** the citation-index forward search, and the paywalled book and paper (LITERATURE.md, "Next").
7. **People:** authors and affiliation, and how the AI assistance is stated.
8. **Page size and style:** letter or A4; two columns (a Phys. Rev. A–like look) or one.

## Draft outline, paper 1

*Atoms in four spatial dimensions with a Coulomb (1/r) interaction: a self-consistent periodic table.*

1. **Introduction.** Ehrenfest; dimensional scaling; Négadi & Kibler's generalized Madelung rule; Pyykkö & Zhao in D = 2.
   What is new: the first self-consistent table for D = 4.
2. **Model.** V = −Z/r with the 4D kinetic operator; why 1/r and not the Poisson r⁻²; spin-½ electrons; nuclei to
   Z = 78; non-relativistic.
3. **Method.**
   - The radial equation with L = l + (D − 3)/2, Numerov on a log grid, Sturm bisection.
   - The sphere-averaged 1/r kernel in 4D (k(min/max)/max, k(1) = 8/3π).
   - Local exchange from the 4D electron gas (citing Loos & Gill), with self-interaction correction and Hund spins.
   - The ground-configuration search, which accepts converged fields only.
4. **Validation.**
   - Hydrogen exact in both worlds.
   - Helium against Hartree–Fock, both worlds (in 4D against an independent Gaussian Hartree–Fock code).
   - Our own table: 32 of 36 configurations, ionization within a few percent.
5. **Results.**
   - Periods 2, 10, 10, 28, 28 and noble gases at 2, 12, 22, 50, 78, as the generalized Madelung rule predicts.
   - The configurations, including the transition metals' lean toward d.
   - Ionization energies and radii.
6. **Partial screening.** No shell theorem; noble-gas ionization against the shell-theorem counterfactual; a neutral
   atom's far pull, −Σ⟨r²⟩/8s³.
7. **Limitations.** Local exchange and no correlation; spherical averaging; non-relativistic; nuclear stability assumed.
8. **Conclusion.**

Appendices: the 4D kernel; the 4D electron-gas constants; numerical convergence.
