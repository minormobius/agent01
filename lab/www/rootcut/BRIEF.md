# BRIEF — rootcut

## What this is

A colleague-agent's proposal (from reading an Erdős–Pósa/Gallai paper) asked
for a "packer vs. breaker" toy: mark a root set S on a graph, then either
pack in disjoint rooted copies of a small pattern T, or nominate a small
vertex set that kills every remaining copy — the same duality Menger's
theorem gives for a single pair of vertices, generalised to a whole root
set. The proposal explicitly scoped turn one to T = K2 (a path between two
S-vertices, i.e. plain Menger/Gallai) and left general small trees (stars,
spiders) as later work, since verifying an arbitrary tree-minor is real
implementation risk.

What shipped: a single-file graph editor + duel. Build a graph (add
vertices, add/remove edges, mark roots), then either play **pack** (tap two
unused roots; the tool BFS-finds a path between them that's vertex-disjoint
from every previously packed path and doesn't run through another root
internally) or **cover** (tap vertices into a candidate set, then verify —
checks every root pair not in the cover for a surviving path). Both are
mechanically checkable and both are actually checked, live, in the browser.
A "random graph" button seeds a playable instance without any manual graph
construction, which matters on a phone.

## Decisions

- **Packed paths are required to be fully vertex-disjoint, including
  shared endpoints.** The classical Gallai theorem is slightly more
  generous — two S-paths may share an endpoint that's in S — but verifying
  that correctly needs per-vertex-not-per-path bookkeping and the exact
  duality theorem in that setting involves Gallai–Edmonds-style structure,
  not a clean min-cut. The fully-disjoint version is unambiguous to specify
  and to verify, and it still demonstrates real weak duality (any valid
  cover needs ≥ k vertices where k is the packing size, since it must hit
  every disjoint path at least once) — which the page states honestly as a
  simplification rather than claiming full Gallai tightness.
- **No optimal-cover solver.** Finding the *minimum* cover is not
  offered — the page only verifies a proposed one. Computing it well is a
  nontrivial algorithm in its own right (this is exactly the "min side" of
  the paper's theorem) and doing it badly (e.g. brute force) would either
  be slow on anything but a tiny graph or silently wrong. The duel is
  player-vs-player: pack until stuck, then try to find a cover as small as
  your packing.
- **No Bluesky integration.** This toy has no natural "handle" input — it's
  an abstract graph, not something tied to a Bluesky account or feed — so
  `kit.handleInput` and `store` (pds.js) are unused. That's a deliberate
  read of the brief, not an oversight.
- **Reused kit tokens/buttons as-is**; no local accent override since the
  existing accent (`#e8a33d`) already reads well against the path-color
  palette chosen for packed-path highlighting.

## The plan (next turns, in order)

1. **General small trees (stars, spiders), the actual paper's main
   result.** This is the hard part named in the proposal. A rooted
   T-minor model needs: pick a branch vertex, then find |leaves(T)|
   vertex-disjoint paths from it to distinct roots (or however the chosen
   tree shape branches) — for a star K_{1,r} this is just "one hub, r
   disjoint paths to r roots," which is a natural next step and still
   BFS/flow-based. A general spider (paths of different lengths off one
   center) is the same shape with per-leg length not mattering. Do NOT
   attempt arbitrary tree minor-models generically — the proposal calls
   that out as real implementation risk, and it's right; hand-code star
   and spider specifically.
2. **Optional: let the packer choose the tree shape from a small palette**
   (K2 / star-3 / star-4 / spider) once (1) exists, rather than a global
   mode.
3. **Undo / step-back for a bad pack choice.** Right now a wrong path pick
   can strand the player (uses up two roots for no strategic reason) with
   no way back except full reset. A stack of packing moves with an "undo
   last" button is cheap and would make the duel feel fairer.
4. **A "your cover vs. optimal" hint** once a real min-cover solver exists
   (see decision above) — currently the page can only ever tell you k ≤
   |cover|, never whether your cover is actually minimum.
5. Cosmetic: distinguishing overlapping path colors when more than 6 paths
   are packed (palette currently cycles and colors repeat past 6).

## Gotchas

- The SVG viewBox is fixed at 320×320 and the wrapper is capped at 420px
  specifically so that at a 360px-wide phone viewport the display scale is
  close to 1:1 — this is why hit-circles are drawn at r=24 (svg units) even
  though the visible dot is only r=9: at ~1:1 scale that's a ~48px tap
  target, just over the 44px floor. If you change the viewBox size or the
  wrapper's max-width, recheck this arithmetic; it's not derived from
  anything at runtime.
- `bfsPath`'s `blocked` set must never include the start or target vertex
  themselves — both the pack and cover call sites build `blocked` by
  unioning "used/cover" with "other roots," which already excludes the two
  endpoints by construction. If you add a third caller, keep that
  invariant or paths silently fail to find themselves.
- Full page re-render (`render()` clears and rebuilds the whole `<svg>` on
  every interaction) rather than incremental DOM diffing — fine at the
  graph sizes this toy expects (random graph caps at 11 vertices), would
  need revisiting before scaling up to graphs with dozens of vertices.
