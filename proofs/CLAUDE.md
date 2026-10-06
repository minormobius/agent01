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
| Worker | `proofs`, thin assets Worker: no script, no bindings, no secrets |
| Owning branch | `claude/3d-einstein-tile-math-n4t93d` (also owns `math`) |
| Deploy | `.github/workflows/deploy-proofs.yml`: route DNS, then `wrangler deploy`, then fail unless the host serves |

## Files

| file | what | edited by |
|---|---|---|
| `index.html` | the landing page: tiles, built pages, field × tier bars, filterable list of all 372 | hand |
| `data.js` | `window.PROOFS`: every family joined with its assessment | **generated** by `build.mjs` |
| `abstracts.json` | paper abstracts, fetched only when a card is opened | **generated** by `build.mjs` |
| `assessment.json` | the editorial layer: tier, effort, page idea, related site pages, built `page` | hand (seeded by model readers) |
| `build.mjs` | joins the release with `assessment.json` | hand |
| `crossing/` | the first page (family 165) | hand |
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
  from `CONTENTS.md`. Lean status comes from the `sources:` block of
  `lean/formalization.yaml`: a paper counts as formalized if its directory is
  listed there.
- **TeX becomes Unicode** with a small hand-written converter. There is no
  external math renderer on this surface. About 20 rare macro uses are left as
  their bare names, and the script prints them. Two traps it already handles:
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
