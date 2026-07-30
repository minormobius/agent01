# BRIEF — static-demonstrating

## What this is

The task was a static site demonstrating arXiv:2607.25274, "Proper Hat-Guessing
on Two-Spine Book Graphs" (Yulin Zhai, 2026). The paper studies a hat-guessing
game on the book graph B_{k,n} (k mutually-adjacent spine vertices, each also
adjacent to n independent page vertices) under a *proper* coloring constraint
(spines differ from each other, and every page differs from both spines). Its
headline results, for k=2: an explicit 7-color winning strategy for B_{2,3} and
B_{2,4} (Theorem 5.4 / 5.6), and a coverability argument proving the number of
colors the team can ever force a win with tops out at C_2 = 11 for any number
of pages (Theorem 1.2 / Lemma 4.2).

What shipped: one page, two demos.

1. A **live, playable** version of the exact q=7 strategy on B_{2,3}. Pages
   guess with the paper's affine formula g_i(x,y) = x + λ_i(y−x) mod 7 for
   λ=(2,3,6). Spines guess by computing, at request time, a real bipartite
   matching (Kuhn's algorithm) that decomposes the "escaping" configuration
   T_z into a column-saturated set (spine 1) and a row-saturated set (spine
   2) — this is a general implementation of the paper's coverability
   criterion (Lemma 3.2 / 4.1), not a lookup of the paper's precomputed
   9-orbit table. The visitor can deal random adversarial colorings or
   hand-pick every one of the five colors via cycling swatch buttons, and the
   team wins every single time, exactly as Theorem 5.4 claims.
2. A small **interactive proof** of why C_2=11: a 2×3 grid representing the
   extremal K_{2,3} obstruction, where the visitor assigns each of 6 edges to
   "Spine 1" (≤1 edge per column) or "Spine 2" (≤1 edge per row) and sees live
   conflict-highlighting. Capacity is 3+2=5 < 6, so no assignment ever
   succeeds — the visitor discovers the pigeonhole themselves rather than
   being told.

## Decisions

- **Computed the spine strategy generically instead of hardcoding the paper's
  orbit table.** The paper gives full edge lists for only one of nine AGL(1,F7)
  orbits in the fetched text (the rest are said to be "in Appendix A," which
  wasn't in what the harness fetched). Rather than hardcode one orbit and fake
  the other eight, I implemented the actual coverability decomposition
  (Lemma 3.2's Hall's-theorem argument) as a real bipartite matching that
  works for any z. This is more code but it is honestly correct for every
  input, not just the documented example — and it doubles as a decent proof
  that the paper's construction really does produce a pseudoforest for every
  z, since the matcher would fail visibly (see next point) if it didn't.
- **Added a visible warning path if the matcher ever fails to fully assign
  T_z.** It shouldn't — Theorem 5.4 guarantees T_z is always a pseudoforest
  for this construction — but "shouldn't" is not "can't have a bug," so a
  failed decomposition surfaces a warning banner instead of silently
  mis-reporting a win.
- **Skipped a literal SVG node-link diagram for live game state** in favor of
  a card-per-player layout (color swatch + guess swatch + check mark). A
  positioned SVG graph is nicer looking but fiddlier to keep responsive at
  360px; the static topology diagram at the top explains the graph shape once,
  and the cards carry the actual state. Traded a bit of visual polish for
  robustness given the time budget.
- **Picked page colors' own palette by eye** (7 hex values spread across hue
  and lightness) rather than running the dataviz skill's validator — this
  sandbox has no Bash tool, so the script couldn't actually run. Worth an
  eyeball pass by a human with it if the palette is ever revisited.

## The plan (not built yet, in order)

1. **The general-k box bound (Theorem 1.4) and the n+3 linear bound (Theorem
   5.6) have no visual/interactive treatment** — they're mentioned only in the
   "why not 8 colors" prose paragraph. A natural next demo: a small calculator
   where the visitor picks k and sees the box-bound product formula evaluate,
   or a plot of the n+3 vs. 11 bounds crossing as n grows past the point where
   the constant bound takes over.
2. **The probabilistic stabilization argument (Theorem 4.5, the ~4×10^8
   threshold)** is stated only in prose. It's inherently about scale (2^110
   configurations, 9^-7 probabilities) so a literal simulation isn't
   practical, but a *toy* version — the same union-bound argument on a much
   smaller synthetic "configuration count" — could make the shape of the
   argument tangible without the real numbers. Not started.
3. **Fetch or vendor Appendix A** (the full orbit table for B_{2,3} at q=7) if
   a future turn wants to cross-check the live matcher's output against the
   paper's own precomputed decomposition, rather than only trusting internal
   consistency. Would need the harness to re-fetch arxiv.org/html/2607.25274
   further past where this turn's fetch was truncated.
4. **General k>2 is entirely unaddressed** on the page — the demo is
   B_{2,3}/B_{2,n} only, matching where the paper's exact results live, but
   the box-bound section (7) generalizes to any k and could get its own demo.

## Gotchas

- **Orientation direction matters and is easy to get backwards.** Spine i's
  guess function depends on x_{-i} (everyone *else's* spine color), so
  "1-saturated" (injective under π_1, which deletes coordinate 1) means
  distinct *second*-coordinate values — i.e. spine 1's assigned set has at
  most one edge per **column**, keyed by y. It is very easy to accidentally
  swap this and key spine 1's slots by x instead of y; the matching will
  still "succeed" (it's still a valid decomposition into two 1-per-something
  sets) but the resulting spine guess functions will be answering the wrong
  question and silently guess wrong on real data. I verified by hand against
  the paper's own (0,0,0) example (two disjoint 6-cycles, the C_(0,0,0) /
  R_(0,0,0) sets given explicitly in Section 5.1) before trusting the general
  matcher on other orbits.
- **z entries need not be distinct from each other**, only from both spine
  colors — only the spine pair (x,y) itself needs x≠y. Don't add a "z_j all
  distinct" constraint by reflex; the paper explicitly allows repeated page
  colors (Section 2.1: "There is no restriction among the page colors").
- No Bash/WebFetch/WebSearch in this sandbox, so nothing here was checked in
  an actual browser — only read carefully and hand-traced against the paper's
  worked (0,0,0) example.
