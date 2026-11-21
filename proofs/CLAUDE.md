# proofs — proofs.mino.mobi

An independent index of the **openai/math** release (github.com/openai/math,
2026-10-06): 722 model-written mathematics papers in 372 result families. For
every family it shows the claim, whether it has a Lean proof, and a
*widgetization tier*. One by one, it adds interactive pages for the results
that have something real to recompute. Repo-wide rules are in
[`../CLAUDE.md`](../CLAUDE.md). This surface sits beside `math` and `ns`.

## Facts

| | |
|---|---|
| Surface | `proofs` |
| Dir | `proofs/` |
| Endpoint | `proofs.mino.mobi`, a **plain route** (no custom-domain slot) |
| Worker | `proofs`: static assets plus `worker.js`, which adds one endpoint, `POST /api/ask` (Gemini first, then Workers AI: `AI` binding, `ASK_LIMIT` rate limit). One secret, `GEMINI_API_KEY`, which is optional. No storage |
| Owning branch | `claude/brave-allen-3un2fh` (taken over 2026-11-21 for `/riemann/`; `math` stays on `claude/3d-einstein-tile-math-n4t93d`) |
| Deploy | `.github/workflows/deploy-proofs.yml`: route DNS, then `wrangler deploy`, then fail unless the host serves |

## Files

| file | what | edited by |
|---|---|---|
| `index.html` | the landing page: tiles, built pages, field × tier bars, filterable list of all 372 | hand |
| `data.js` | `window.PROOFS`: every family joined with its assessment | **generated** by `build.mjs` |
| `abstracts.json` | paper abstracts, fetched only when a card is opened | **generated** by `build.mjs` |
| `assessment.json` | the editorial layer: tier, effort, page idea, related site pages, built `page` | hand (seeded by model readers) |
| `build.mjs` | joins the release with `assessment.json` | hand |
| `crossing/`, `hadamard/`, `seymour/`, `catalan/`, `mub/`, `petty/`, `ramsey/`, `sidorenko/` | the built pages (families 165, 179, 173, 005, 266, 088, 189, 161), one section each below | hand |
| `riemann/` | the Riemann hypothesis page. It is **not** a release family; the landing links it by hand above the built pages | hand (+ generated `zeros.js`, `audit.json`) |
| `.assetsignore` | keeps `CLAUDE.md`, `build.mjs`, `assessment.json` and `wrangler.jsonc` off the web | hand |

## Rebuilding the data

The release is 2.4 GB (1.8 GB of it is the Lean library), so it is **not
vendored**. Clone it outside the repo and point the script at it:

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/openai/math ~/openai-math
node proofs/build.mjs --src ~/openai-math          # writes data.js + abstracts.json
node proofs/build.mjs --src ~/openai-math --check  # exit 1 if stale
```

Preflight cannot run this, because the input is outside the repo. Re-run it
whenever the release moves (it promises versioned corrections) or
`assessment.json` changes, then commit both outputs. `data.js` records the
source commit, and the landing footer shows it.

The release is **third-party data**. `build.mjs` only reads text from it
(`overview.tex`, `CONTENTS.md`, `lean/formalization.yaml`) and never runs
anything inside the clone. Keep it that way.

Things to know about the build:

- **Families come from `overview.tex`** (`\cataloguesection` gives the field,
  `\resultentry{id}{title}{summary}{links}` the rest). Paper abstracts come
  from `CONTENTS.md`.
- **Lean status has two levels.** `lean` counts a family's papers listed in
  the `sources:` block of `lean/formalization.yaml`, which the release calls
  its "catalog of papers with a formalized main result" (127 families).
  `leanDoc` is set when `lean/docs/<id>.md` exists. That file is the
  release's scope note, and it exists for 108 more families. Their scope
  varies: 005 proves the full result, while 266 proves only a weaker bound. So
  the landing gives them a dashed "Lean, uncatalogued" badge that links to the
  note, and never the green one. Only the directory listing is read.
- **TeX becomes Unicode** with a small hand-written converter. There is no
  external math renderer on this surface. About 20 rare macro uses are left as
  their bare names, and the script prints them. A text-mode control word
  swallows the space after it (`Zauner\textquotesingle s` → Zauner's). Two
  more traps it already handles:
  an optional `\}?` in the `\mathbb` pattern ate the brace of an enclosing
  `\overline{…}`, and superscripts must run *after* macros resolve, or
  `2^\infty` becomes `2^(ı)nfty`.
- **Titles in CONTENTS.md must not span entries.** A non-greedy match across
  `](preprints` once paired family 338 with the next paper's abstract. The
  title pattern now excludes `]` and newlines.

## Tiers

`assessment.json` holds one entry per family:

- **A, computable.** There is a finite object or certificate to recompute in
  the browser, held to the paper's numbers by a selftest.
- **B, illustrative.** The setting can be simulated or drawn honestly, but the
  theorem can't be checked here.
- **C, card only.**

The first pass (2026-10-06) came from six model readers working one rubric
over the abstracts plus targeted reads of the TeX: **39 A, 145 B, 188 C**.
Their calibration varied by chunk (4–9 A each), so treat every A as a lead
that needs a human read before building. When a page ships, set its family's
`page` (path relative to `proofs/`) and rebuild. The landing page lists built
pages first.

The `related` field holds slugs of existing math.mino.mobi pages a family
touches (heilbronn, erdos, kakeya, borsuk, hadwiger, viazovska, voronoi,
chair44, grad, …). These are candidates for "2026 update" sections on those
pages. `conj` marks families that touch an entry in `/conjectures/`. That
index lists open problems only, so update it only once a result is accepted,
or mark it as claimed.

## Honesty rules for every page here

- The release says its results are at "different stages of verification", and
  that some unformalized ones "could have issues". Every page states what is
  claimed, whether a Lean proof exists, and that **we did not run the Lean
  check** unless we did.
- When a family has a Lean proof, read its Comparator challenge
  (`lean/ComparatorChallenges/<Name>.lean`) and write the page's formulas
  *exactly* as that statement does.
- Say what the page's selftest checks and what it cannot check.
- Not affiliated with OpenAI. Their papers are Apache-2.0: link to their
  repository, attribute, and say what was reformatted.

## `/crossing/` (family 165): Harary–Hill and Turán's brickyard

```bash
node proofs/crossing/crossing.selftest.mjs   # ~2.5 s, 1264 checks
```

The engine is `crossing/crossing.js`, the only copy of the maths, which the
page, the Web Worker and the selftest all import. Both main theorems are
in the release's Lean "main results". The `hill` and `axisPairs` definitions
follow the Comparator statements literally (natural-number floor division).

- **Kₙ uses the paper's own optimal drawing.** Vertices go on a line, and edge
  ij goes above iff (i + j) mod n < ⌊n/2⌋. Crossings are same-page pairs with
  alternating endpoints. The count is exact, and it is checked against real
  semicircle intersections (y² = (x−a)(b−x), so each pair meets at most once)
  at generic positions, with no triple points.
- **The exhaustive search** is branch-and-bound over all 2^(E−1) page
  assignments, pruning on min(conflicts above, conflicts below) for every
  unplaced edge. It finds nothing below Hill for n ≤ 11 (K₁₁ visits about
  6.8M nodes in 2 s; K₁₂ takes 35 s, so the page stops at 11). It checks the
  2013 *two-page* theorem, not the 2026 claim, and the page says so.
- **K_m,n uses Zarankiewicz's axis drawing** with integer coordinates and exact
  orientation tests. Dragging uses floats, which is fine for a toy.
- History is taken from the two papers' introductions (Guy 1972 for n ≤ 10 is
  the one line not from them).

## `/hadamard/` (family 179): Ryser's circulant Hadamard conjecture and the Barker lengths

```bash
node proofs/hadamard/hadamard.selftest.mjs   # ~2.3 s, 1513 checks
```

The engine is `hadamard/hadamard.js`, imported by the page, `search.worker.js`
and the selftest. The Lean main result is
`OAI.CirculantHadamard.exists_iff_order_one_or_four`. The page quotes its
definitions, and `circulant()` and `gram()` implement them literally
(H i j = h (j − i), and H·Hᵀ as a real matrix product).

- **Two equivalent conditions, both kept.** `gram()` is the Lean form and
  `periodic()` is the paper's. The selftest asserts that (H·Hᵀ)_ij =
  P((j − i) mod n) on random rows, so the page can use either.
- **Brute force uses no theory.** `bruteCirculant` tries all 2ⁿ rows with no
  row-sum filter, so its "only n = 1 (2 rows) and n = 4 (8 rows) up to 20"
  is independent of the s² = n argument.
- **The Barker search fills from both ends.** With d signs fixed at each end,
  C(t) is determined for every t ≥ n − d. Up to 40 it is about 1.8 s total
  in node, and n = 48, 56 and 64 take 2, 13 and 74 s, so the page caps at 44.
  It is checked against brute force for n ≤ 16. Length 4's two classical
  sequences (+++− and ++−+) count as **one** class here, because the symmetry
  group includes the alternating sign flip.
- **The order funnel is labelled honestly.** Two conditions are proved and
  checked (s² = n; Hadamard orders are 1, 2 or ≡ 0 mod 4). Two are Turyn's
  (u odd; u not a prime power) and are labelled *cited*. Up to 10⁴ the
  survivors are 1, 4, 900, 1764, 4356, 4900, 6084 and 8100.
- **EvenBarker is not counted as formalized.** The library has an
  `EvenBarker` challenge file, but it is not in `formalization.yaml`'s main
  results, and the page says so.

## `/seymour/` (family 173): Seymour's second-neighbourhood conjecture

```bash
node proofs/seymour/seymour.selftest.mjs   # ~2.4 s, 5214 checks
```

The engine is `seymour/seymour.js`, imported by the page, `search.worker.js`
and the selftest. The Lean main result is
`OAI.SeymourSecondNeighborhood.exists_goodVertex`, and its whole statement is
quoted on the page.

- **Graphs are bitmasks** (`out[v]`, bit u set iff v → u, n ≤ 31; the page
  caps at 24). `second()` is the Lean `secondNeighbors` (w ≠ v, not
  already an out-neighbour, reachable in two steps). The selftest compares
  it with a literal transcription (`leanSecondNeighbors`) on 300 random
  graphs.
- **The exhaustive check covers all 3^C(n,2) labelled graphs** (14,348,907 at
  n = 6, about 0.7–2.3 s in node), counted in base 3 with incremental mask
  patches. The sink-free count is checked against inclusion–exclusion over
  the set of sinks, an independent formula. n = 7 would be 3²¹ ≈ 10¹⁰, which
  is out of reach.
- **Sinks are trivially good (0 ≤ 0).** Statistics that matter therefore
  exclude them: sink-free graphs can have as few as 2 good vertices for
  n = 4–6. The hunt charges 10⁶ per sink, or it just builds sinks.
- **Paley tournaments are exactly tight at every vertex**: |N⁺| = |N⁺⁺| =
  (p−1)/2 for p = 3, 7, 11, 19, 23. They make good demos of how little room
  the theorem leaves.
- History comes from the paper's introduction. The 1990 date for Seymour's
  posing is the conventional one; the paper credits the written record to
  Dean and Latka (1995).

## `/catalan/` (family 005): Catalan's constant is irrational

```bash
node proofs/catalan/catalan.selftest.mjs   # ~5 s, 166 checks
```

The engine is `catalan/catalan.js`, imported by the page, `search.worker.js`
and the selftest. The proof sets two bounds on L = log|Δ_N|/(48N)² − ½ log 2
against each other. If G were p/q, arithmetic forces L > −2.29084. Analysis
gives L ≤ −2.290939875. Both bounds rest on finite certificates printed in
the paper, and the page replays both.

- **Certificate 1, the matrices.** `buildB()` follows the paper's recipe
  step by step: the m_i and k±, the 65 × 59 matrix Y, the E/I polynomials
  by `S_m = 2S_{m−1}/t − S_{m−2}`, the rows y_r and z_r, then four rounds
  of differencing, giving 49 × 48. All 144 pivots mod 101 and the two
  σ = 1 swaps match the printed tables. The selftest also computes all three
  determinants exactly over ℚ (numerators of about 2,000 digits) and checks
  that each one reduces mod 101 to ± the product of the pivots.
- **Certificate 2, the barriers.** Trial coefficients are stored ×10⁻⁸
  exactly as printed. Complex tails come as `[re, im, a, b]` with
  r = (a − ib)/2, and `expandTails` adds the conjugates. `numerators()`
  works over ℚ(i) and asserts that the result is real. Descartes counts,
  the 43 brackets (each with a sign change) and all 50 values are checked,
  each 0 ≤ bound − value ≤ 10⁻¹² (60-digit `flog`/`farg`). The final sum is
  exactly −2.290939875.
- **G digits** come from two independent routes, Ramanujan's log(2 + √3)
  formula and the Cohen–Villegas–Zagier acceleration of the defining series.
  They agree to 600 digits. This is a sanity display, not part of the proof.
- **Not checked here:** the arithmetic lower bound (it needs the prime number
  theorem), and the reduction from the growing 48p determinants to the three
  fixed matrices. The page says so.
- **Lean status.** The release has a complete Lean development and a
  Comparator challenge (`catalan_irrational`). The paper is **not** in
  `formalization.yaml`, so `build.mjs` counts it as not formalized. The
  page's tagline reads "Lean proof in library, uncatalogued", and we did not
  run it. `build.mjs` now marks it `leanDoc` (see above).

## `/mub/` (family 266): exactly three mutually unbiased bases in dimension six

```bash
node proofs/mub/mub.selftest.mjs   # ~3 s, 1387 checks
```

The engine is `mub/mub.js`, imported by the page, `search.worker.js` and the
selftest. The headline claim (N(6) = 3) is **computer-assisted**. It is a
binary64 cover of every second basis, stated "under the arithmetic and
compiler conditions" of the paper's appendix, and **Lean does not cover it**.
The Lean statement `OAI.MUB6.fourier_and_family_bound` proves the
companion's Fourier vanishing and a family bound of **five**. The page says
this in its tagline and quotes the statement whole.

- **Three bases, exactly.** Every entry of the tensor-product bases is a
  ζ₁₂-power over 1 or √6. The page therefore checks all 216 inner products in
  ℤ[ζ₁₂] (`Z`: BigInt coefficients mod Φ₁₂ = x⁴ − x² + 1) with no floats. A
  perturbed basis fails the check (selftest).
- **The F₆ pair is the paper's Stage C in miniature.** Random-start
  Gauss–Newton finds the vectors unbiased to I and F₆. It always gets
  exactly 48, all found within about 300 of 2,000 starts. Every phase is a
  multiple of 15°, offset by θ or 2θ where sin θ = (√3 − 1)/2, so entries
  involve 3^¼ and the field is not cyclotomic. That is why this part uses
  floats with a stated margin: edges are decided to about 10⁻¹⁴, and every
  other overlap is at least 0.012 away from both 0 and 1/6. The results are
  16 bases (6-cliques of 𝒪), and among their 120 pairs, 40 share a vector,
  32 have 0/36 unbiased cross edges and 48 have 12/36. None is a fourth
  basis. That the list of 48 is *complete* is Grassl's (Gröbner) theorem, and
  the page cites it rather than claiming it.
- **The search for a fourth is evidence, labelled as such.** Adam minimises
  a misfit that is zero exactly at a MUB family. It reaches 0 for 3 in ℂ², 4 in
  ℂ³ and ℂ⁵, and 3 in ℂ⁶, and stalls at f ≈ 0.051 for 4 in ℂ⁶. The gradient
  is checked against finite differences.
- **Fourier vanishing.** `gValue`, `hadamardError`, `charges` (the 20 =
  `permuteCharge π alpha`) and `randomEquivalent` follow the Lean
  definitions. Tao's T gives |6g|² = 9 exactly at all 20 charges, and F₆ gives
  exactly 0. Random Hadamard matrices from Newton land in T's class about 13%
  of the time (it is isolated and attracting). `isCubic` (cube-root entries
  after dephasing) recognises that class, which is unique by the Butson
  classification the companion cites. Every other matrix gives |g| < 10⁻¹¹.
- **Not rerun:** the paper's exclusion (its documented run took 4,470 s
  wall-clock, which the paper says is not a CPU time) and the companion's
  `verify.py` exact moment certificates. The latter is a multi-modular rank
  computation over combinatorial invariants, and porting it is a project of
  its own. The release directory is
  untrusted, so its Python was read but never run.

## `/petty/` (family 088): projection bodies, Petty's minimum and Brannen's maximum

```bash
node proofs/petty/petty.selftest.mjs   # ~0.5 s, 2926 checks
```

The engine is `petty/petty.js`, imported by the page, `search.worker.js` and
the selftest. Both papers are in the Lean catalogue:
`OAI.PettyProjection.petty_projection_volume` (n ≥ 4, with the equality
case) and `OAI.Paper092.product_counterexample` (ℝ²⁰). The page quotes both
and uses their definitions (`simplexConstant`, `pettyConstant`).

- **One formula carries the whole page:** the facet lemma ΠP = Σ [−s_F ν_F/2,
  s_F ν_F/2] together with the zonotope volume Σ_{|S|=d} |det v_S|.
  `zonotopeVolume` evaluates it exactly: BigInt Bareiss on integerised
  generators, with the denominators carried separately.
- **The counterexample is brute-forced.** The 22 facet area-normals of
  T₁₀ × T₁₀ (a factor's own facet vector times the other factor's volume,
  which is elementary) give 231 determinants of 20 × 20 in about 50 ms. They
  yield exactly 5588869/5505024, which is 22355476/22020096 reduced by 4,
  without using the paper's product formula. The page prints both forms
  because the Lean statement uses the unreduced one. Thirteen other
  products (two and three factors, including 8+12 and 9+11, which also win in
  ℝ²⁰, and 7+13, which does not) match the formula by brute force.
- **Priority is stated.** The paper itself credits Feng, Hu, Liu and Xu with
  counterexamples in every d ≥ 9. The new part is an exact product witness,
  and the page says so.
- **Dimensions beyond the paper.** `bestPartitions` (DP on log c_a) finds
  that no product of simplices wins below n = 20, rechecked exactly to 30
  and for every two-factor split below 20. Its asymptotic rate
  e^{max_a log c_a / a − 1} ≈ 1.034 (factors of size 12–13) is **this
  page's computation**, labelled as such. The paper only claims some λ > 1.
- **Low dimensions are illustration.** In the plane R₂ = |K − K|/|K| ∈ [4, 6]:
  every centrally symmetric shape gives 4, so Petty starts at n = 3. In
  space, R₃ runs from 3π²/4 for the ball to 18 for the tetrahedron, both
  from the 2026 ℝ³ theorem of Chen et al. The facet lemma is checked against
  measured shadows in both. `hull3` is brute force over triples, fine
  to about 80 points. `zonotopeFaces` merges parallel generators and draws
  each face as a zonogon; faces run into thousands for big hulls, so the
  page stops auto-spinning above 800 faces.
- **Not checked:** Petty's inequality for n ≥ 4, which is analysis
  (harmonics, a strict norm estimate, a fixed point).

## `/ramsey/` (family 189): cycle–clique Ramsey numbers

```bash
node proofs/ramsey/ramsey.selftest.mjs                        # ~17 s, 3675 checks
node proofs/ramsey/build-traces.mjs --src ~/openai-math       # rewrites traces.json
node proofs/ramsey/build-traces.mjs --src ~/openai-math --check
```

The engine is `ramsey/ramsey.js`, imported by the page, `search.worker.js`
and the selftest. The release's Lean library proves the **whole** main
theorem (`OAI.CycleClique.thm_main`, which the scope note calls "the
complete parameter range"). The paper is not in `formalization.yaml`, so
the tagline says "uncatalogued", as for 005.

- **The finite check is reimplemented from the paper's text**, not from
  the release's Python. That covers the pattern recursion (and the paper's
  separate generating-function count), the label construction, the
  extension rule, the required-path rule (states of visited set and
  endpoint), the ball bounds with their exception, the packing test, and the
  strengthening rounds. On the first run it agreed with the release on
  every one of the 3,099 patterns, down to the initial flag matrix and the
  exact set of prohibitions added in each round. The output table is 3,049
  ones, 50 twos and no zeros, matching the paper. It takes about 10 s in a
  browser worker and 7 s in node.
- **`traces.json` is a compacted copy** of the release's
  `verification/data/certificates.jsonl` (Apache-2.0). Initial flags are
  3.4 MB of its 3.8 MB, so `build-traces.mjs` replaces them by an FNV-1a
  checksum (`flagsHash`). The page recomputes the flags and compares.
  Witnesses are kept, and `checkTrace` validates every one against
  rebuilt data, as both round trials and final packings. A dominated radius
  inherits the bound of the last retained radius, as the paper's "removing
  redundant radii" allows. The selftest also tampers with three traces and
  expects rejection. Re-run the build if the release changes the file.
- **Small cases are exhaustive and theory-free:** vertex-extension search
  keeping graphs with no C_m and α < n (both hereditary). (3,3)…(6,3) take
  well under a second; (7,3) and (4,4) take 15–25 s, so they are in the
  page but not the selftest.
- **Not checked:** Sections 2–8 (expansion, the clique bound, k = 3, 4, t ≥ 9).
  They are proofs in words, and the Lean development covers them.
- The release's Python files were never opened or run. The paper's
  appendix describes them, and that was enough. The trace file was read
  as data.

## `/sidorenko/` (family 161): a counterexample to Sidorenko's conjecture

```bash
node proofs/sidorenko/sidorenko.selftest.mjs   # ~7 s, 205 checks
```

The engine is `sidorenko/sidorenko.js`, imported by the page,
`search.worker.js` and the selftest. The Lean library proves the
counterexample (`OAI.SidorenkoCounterexample.main`, an existence statement).
The forcing corollary is out of its scope, and the paper is uncatalogued. The
page quotes `faces` and `main` verbatim, and `FACES` is the Lean list.

- **The host is not explicit, and the page never pretends otherwise.** It
  is sampled from a kernel over symmetric matrices in 𝔽_q in a large fixed
  dimension, with q → ∞. What *is* finite is the paper's Proposition on the
  complex, and the selftest replays all four items against Tables 1 and 2:
  pairs in two faces, opposite faces, exposure orders, a_e, the degree
  table and its three tied pairs, and colour refinement (2 → 4 → 10 → 20 →
  35 classes). It also checks the sign identity.
- **The complex is a triangulated 2-sphere.** It has χ = 2, every link is a
  cycle, and it is orientable. This is **our observation**, labelled as such,
  and it is what makes the counting cheap. Hom(H, G) = Σ over 13 point
  assignments of Π_faces codeg(a, b, c), so the face vertices are summed out
  first. The rest is variable elimination along `ELIM`, an order of width 5
  found offline. Any order gives the same value, and the selftest compares
  two. The float path is inlined and does n = 16 in about 2.5 s. BigInt
  exact runs to 10 vertices (Petersen in about 0.6 s). Both are checked
  against a direct 13-point sum (all graphs on 3 vertices) and against
  brute force over all maps (into K₂).
- **Small hosts never break it.** Complete graphs fall toward 1 from above
  (K₁₀ gives 1.0468), random graphs on 6–13 vertices sit far above, and random
  local search on 2 × 2 and 3 × 3 kernels slides to the constant kernel
  (ratio exactly 1, consistent with Lovász's local theorem). The page uses
  this to show why nobody found the counterexample by search.
- **The drawing** is a Tutte embedding with outer face 19, reweighted 4
  rounds by edge length. Any positive weights stay crossing-free, and the
  selftest checks it.

## `/riemann/`: the Riemann hypothesis, and the November 2026 claim

```bash
node proofs/riemann/riemann.selftest.mjs           # ~0.9 s, 3047 checks
node proofs/riemann/riemann.selftest.mjs --write   # rewrites zeros.js
node proofs/riemann/audit.mjs --src <lean dir> --write   # rewrites audit.json
```

This is not a family of the openai/math release. It was built after a claimed
proof of RH and GRH (alpo.ge/remark.pdf, 2026-11-20, "working with Claude")
went round Bluesky. It explains RH, computes it, gives a history of attempts,
and states plainly what has been checked about the claim. The landing links
it with a hand-written card above the built pages, because `build.mjs` only
knows release families. Family 003 (quasi-RH, Re s > 7/8) is its nearest
relative and is cross-linked.

- **The engine is `riemann/riemann.js`**, imported by the page and the
  selftest. ζ uses Euler–Maclaurin with 20 Bernoulli terms, and N is chosen
  so |s + 40| ≤ πN, so every term shrinks about 4×. Below Re s = −½ it goes
  through the functional equation. θ comes from complex log Γ (Stirling
  after shifting Re z ≥ 12) with principal logs, which makes θ continuous
  rather than wrapped. Z(t) = Re(e^{iθ} ζ(½+it)).
- **The selftest is independent where it can be.** It checks known values
  (ζ(2), ζ(3), ζ(½), ζ(−1), trivial zeros), the functional equation at 40
  random points, θ against its asymptotic series, Im(e^{iθ}ζ) = 0 along the
  line, the first ten zeros against Odlyzko to 1e-9, N(100) = 29 and
  N(1000) = 649, and the count against θ(T)/π + 1 at every gap. It also
  checks that `zeros.js` is byte-for-byte what the engine finds. Zeros come
  from sign changes at step 0.05, refined by bisection. The step is well
  under the closest pair below 1000, and a miss would show as 648.
- **The explicit formula** uses the ψ₀ convention (half the jump at a prime
  power). With 649 zeros the mean error on [10, 100] is about 0.06.
- **The classical zero-free region** is drawn with the shape σ > 1 − 1/(R log t)
  and R = 5.558691 (Mossinghoff–Trudgian–Yang). The 7/8 band is family
  003's *claim*, drawn in the claim colour.
- **`audit.json` is a static read of the claim's Lean archive** (14 parts,
  about 240 MB compressed and 1.4 GB unpacked: 175,187 files and 17.4M lines,
  Lean v4.33.1, Mathlib pinned). `audit.mjs` reads text only. Nothing from
  the archive was built or run; it is third-party, so keep it that way. The
  archive is **not** vendored. Findings: `Main.lean` proves
  `riemannHypothesis : RiemannHypothesis` (Mathlib's definition) plus four
  GRH statements in `Statements.lean`, which imports only Mathlib. There are
  zero `axiom`, `sorry`, `admit`, `native_decide`, `implemented_by`,
  `extern`, `opaque` or `unsafe` uses. Custom tactics (`kexactB`, `kcopy`)
  and an `addDecl`-based copier exist, but they all pass terms to the
  kernel. The `run_cmd` lines only edit a library-suggestion deny list.
- **The page must keep saying "unverified"** until someone reports a build
  with `#print axioms` and an independent replay. Once that happens, update
  the 2026 tab, the timeline's last entry and the tagline together. Do not
  add RH to `/conjectures/` as solved before it is accepted.

### `/riemann/learn/`: the deck

A phone-shaped deck of 17 slides. Each slide is a live widget (`mount(el, ctx)`
in the `SLIDES` array) with a notes sheet over it. The sheet peeks with a
title, a caption, an optional **predict** card (commit to an answer, then the
reveal) and a **do** task (`ctx.done()` ticks it). Drag or tap the handle to
open the lecture notes. Swiping sideways on the sheet or using ← → turns the
page; the widget area is left alone so sliders keep their gestures. `#n` deep-links
a slide. Progress, predictions and quiz answers stay in localStorage
(`riemann-learn-v1`, every access in try/catch).

- **One engine.** The deck imports `../riemann.js` and `../zeros.js` and
  computes nothing of its own beyond a sieve to 10⁶ (prefix counts) and
  plotting. The selftest also covers what only the deck uses: `li` (Ramanujan
  series, held to li(10⁶)), π(10⁶) = 78498, unfolded gaps (mean 1, < 3% below
  0.2), the Wigner surmise, and `ecCount` (Legendre symbols against brute force
  for p < 60, Hasse on every sampled curve to 200, and y² = x³ − x having
  p + 1 points for p ≡ 3 mod 4).
- **The ζ map** (slide 5) draws the Re ζ = 0 and Im ζ = 0 curves as
  sign-change pixels on a grid at 1.5 px per cell. Zeros are where they cross.
  A plain |ζ| heatmap was tried first and failed: the plane is drawn
  anisotropically (3 units of σ against 35 of t), so holes smear into
  horizontal bands.
- **Slide 13's σ = 1 bar** is drawn at x itself and labelled o(x). There is no
  fudge constant; the de la Vallée Poussin saving depends on an unspecified c.
- The last content slide reads `../audit.json`, so the deck and the reference
  page always agree about the 2026 claim.

**The format has laws: [`riemann/learn/LAWS.md`](riemann/learn/LAWS.md).** Read
them before adding a slide or starting another deck. The machine-checkable ones
are enforced by:

```bash
node proofs/riemann/learn/browser.selftest.mjs   # ~20 s, 215 checks, real Chromium at 390 px
```

It walks every slide. For every chart it sweeps the pointer diagonally,
requiring a tooltip and different points, then checks that the keyboard steps
the cursor and does not turn the page. It also cycles the theme toggle (the
background and the chart strokes must change, and the choice must survive a
reload), checks the sheet's peek height and the absence of horizontal scroll,
and requires zero console errors in both themes. It serves `proofs/riemann/`
itself on a random port. Preflight runs it as a slow selftest whenever
`proofs/riemann/learn/` changes. Without Playwright it skips with exit 0.

- **`learn/kit.js` holds the format's shared parts**: `frame`/`axes`/`path`,
  `cursor()` (law 3), `tip()` and `theme` (law 4). `cursor(svg, f, series,
  {snap: 'x'|'y'|'xy'})` must be called after every redraw. It snaps to the
  `pts` it is given, so give it the points the chart was drawn from, with an
  optional third element as the display label. Duplicate x values make the
  keyboard cursor look stuck (slide 2 had this from rounding a log grid), so
  dedupe.
- **The theme** is `data-theme` on `<html>` (absent means follow the system),
  stored as `proofs-theme`. The CSS defines dark tokens twice: under
  `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and
  under `:root[data-theme="dark"]`. Canvas code must ask `theme.isDark()`,
  never `matchMedia`, or it ignores the toggle.
- **No text selection from a chart drag.** On phones a press-and-drag across
  a chart used to select its SVG axis labels, a stray highlight. Charts are
  now `user-select: none` with `-webkit-touch-callout: none` (deck CSS plus
  `noSelect()`, which `cursor()` applies and the ζ map's canvas calls). Touch
  `pointerdown` is `preventDefault`ed, but mouse is not, so a click still
  focuses the chart for the keyboard. `.sheet .sbody` is explicitly
  selectable. The selftest drags corner to corner over every chart and
  requires an empty selection, and it requires that the caption can still be
  selected.
- **The ζ map's cursor** redraws only the SVG overlay. Recomputing the map on
  every pointer move costs about 400 ms. Its data points are the grid cells.
- **Headings** must name their section (law 14). A lint in
  `riemann.selftest.mjs` fails teaser headings and teaser slide titles.
- **The chatbot** (law 15) is `proofs/worker.js`, `POST /api/ask`. It asks
  **Gemini first** (`gemini-flash-latest` through `:streamGenerateContent?alt=sse`,
  with the key in the `x-goog-api-key` header; `GEMINI_MODEL` overrides the
  model). On any Gemini failure it falls back to **Llama 3.3 70B on Workers
  AI** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, the same model `chat/`
  uses). After a 429 it skips Gemini for Google's `retryDelay` (60 s by
  default) in that isolate. Both streams leave the worker in one format: a
  first event `{provider, model, label, fellBack?}`, then
  `{"response": …}` events. Gemini's thought parts are dropped.
  - **The key is its own Google project's**, synced from the repo secret
    `GEMINI_API_KEY_PROOFS` by `deploy-proofs.yml`. Never reuse
    `GEMINI_API_KEY`: `b` and `hoop` live on that project's free quota, which
    is about 20 requests a day for Flash as of November 2026. Without the
    secret, Workers AI answers alone.
  - **Free tier versus billing.** On Gemini's unpaid tier Google may use
    prompts to improve its products, and the free tier may not serve users in
    the EEA, Switzerland or the UK. A billing-enabled project avoids both.
    The panel tells readers their question goes to Google or Cloudflare.
  - **Workers AI's stream carries each token twice.** One copy is `response`,
    which turns numeric tokens into JSON numbers and loses the space before
    them ("In1933"). The other is OpenAI-style `choices[0].delta.content`, which
    has the exact text. `normalizeWorkersAI()` re-encodes the stream as
    `{"response": <delta text>}`, using `response` only when there is no
    delta. So every token reaches the client as a string, and the client
    doesn't have to guess about spaces (an earlier version did, and got it
    wrong).
- **Serving and context.** Static assets are matched first, so the script only
  sees requests no file matched. The context is
  `riemann/learn/context.txt` (about 36 KB, about 10k tokens, under the
  model's 24k window), generated by `learn/build-context.mjs` from the deck's
  `SLIDES` source text, the reference page's panes and timeline, and
  `audit.json`. **Re-run it whenever a slide, the reference page or the audit
  changes**; `riemann.selftest.mjs` fails while it is stale. Adding another
  deck means a context file and an entry in `DECKS` in `worker.js`. The
  rate limit is a `ratelimits` binding (`ASK_LIMIT`, 8 per 60 s per IP), and
  `wrangler deploy --dry-run` lists it. `worker.js` and `build-context.mjs`
  are in `.assetsignore`.

```bash
node proofs/worker.selftest.mjs                    # guards, Gemini path and fallback, stream normalising, against fakes, 32 checks
node proofs/riemann/learn/build-context.mjs        # rewrite context.txt
```

- The reference page (`riemann/index.html`) predates the laws: its charts have
  no cursor and it has no theme toggle.
