# BRIEF — that-2 / "Sixfold"

## Turn 3 update (this turn) — attacked the solver's actual failure mode, and wired it to the editor

Two asks in one message: "Looks like a squished up overlapping tetrahedron, how
do you know you've solved it? How do we unlock the solve for my drawn meshes."
Read as two connected requests, not one — the first is a real bug report about
the turn-2 solved shape's *correctness*, the second is turn 2's own named plan
item 2 (sort of — see below for what was actually built vs. deferred).

**What shipped:**

- **`relaxEmbedding()` now repels non-adjacent vertices, not just attracts
  edges.** The bug behind "squished, overlapping" is real and structural, not
  cosmetic: the spring force only acts between vertices joined by an edge, so
  nothing in the old solver stopped two *unconnected* vertices from landing on
  top of each other or the whole net folding back on itself while every edge
  still happened to measure length 1. That's a shape with near-zero edge error
  that is still wrong — exactly what "squished, overlapping" describes. Fix:
  any non-adjacent pair closer than one edge-length now gets a short-range
  repulsive force (same functional form as the spring force, gated to only
  push apart, never pull together). This is a real change to the solver's
  physics, not just a diagnostic bolted on after.
- **A second number is now solved-shape evidence, not just edge error:
  `minNonEdgeDist`** — the closest approach between any two non-adjacent
  vertices in the converged result. Printed next to the edge error on every
  solved shape, flagged with a red `.warn` style if it drops below 0.35. This
  directly answers "how do you know you've solved it": edge error alone was
  never sufficient evidence (see above), so now there are two independent
  numbers and the page's own copy explains why both are needed, in the new
  panel above the solid gallery.
- **"Solve this net" — a new button under the editor** wires the same solver
  to whatever the visitor has actually drawn, which is turn 2's plan item 2
  in spirit but NOT in the form that plan described. Turn 2's plan assumed
  the only way to "unlock the solve for my drawn meshes" was to build a real
  edge-gluing/closure UI so a hand-drawn net could become a genuinely closed
  6-net. That's still true for getting the *unique rigid solid* — but it's not
  the only way to "unlock the solve" at all. This turn solves the open net
  exactly as drawn (same relaxation, same edges-from-face-list machinery
  already built for the stellated bipyramid) and is explicit on the page,
  twice, that because the boundary is open the result is one *flexible*
  embedding among many, not the theorem's unique rigid shape — the same
  boundary-edge count already tracked live in the editor reappears next to
  the solved shape as the reason. This is the honest version of "unlock the
  solve": real, immediate, and scoped to what's actually being computed,
  rather than either refusing again or quietly building something that reads
  as solving a closed net when it isn't one.

**Why not build the gluing mechanic instead, since that's what was actually
planned?** Time. A boundary-edge identification UI needs a real data-structure
change (the plan already flagged this: "the triangular-lattice coordinate
model doesn't represent glued edges at all currently") — picking two boundary
edges, checking orientation compatibility, merging vertex identities across
the graft, and updating every place that reads `mesh`/`vertDeg` from lattice
coordinates. That's multi-turn work, not a twenty-minute add. Solving the net
*as drawn*, with the open-boundary caveat stated plainly, answers "unlock the
solve" today without pretending to be the closure feature. The gluing UI is
still the way to actually reach a closed net from the editor — see the plan
below, now item 1.

## Screenshot check (turn 1) — no changes made

Reviewed the post-build screenshot (1200×800). Heading, intro copy and the
Σ(6−deg)=12 panel all render correctly — readable, no overlap. The box under
"1 — grow a net" looks empty in the screenshot, but that's expected, not a
bug: the editor canvas is ~460px tall starting around y≈650 at this
viewport, and the starting triangle draws centered on `rectH/2` (≈y=880),
below the 800px crop — a below-the-fold framing artifact of the screenshot,
not a blank canvas. Left the code untouched.

## Turn 2 update (this turn) — a real numerical solver now exists

The requester's follow-up was blunt: "Real solving, go for it baby" — a direct
push back on turn 1's "no solver, honestly scoped" decision (see below,
preserved for context). Per this site's own operating rule, an explicit
request beats a stale plan, so this turn built a real one rather than
widening the gallery by hand-deriving more literature coordinates.

**What shipped:**
- `relaxEmbedding(n, edges, opts)` — a genuine gradient-descent mass-spring
  relaxation. Given only a vertex count and a list of unit-length edges (no
  coordinates), it starts every vertex at an independent random point in
  space and iterates an explicit-Euler spring simulation (force toward
  making every edge exactly length 1, with velocity damping) until the
  energy stalls or a hard iteration cap is hit. It reports max/mean edge
  error on the result — the actual evidence of correctness, not a claim.
- A 6th gallery entry, **"Split-face bipyramid (solved, not closed-form)"**:
  an irregular, non-vertex-transitive closed 6-net (a pentagonal bipyramid
  with one face split into three by a new degree-3 vertex), specified to the
  page *only* as a face list — `STELLATED_FACES`, no coordinates anywhere.
  `buildStellatedSolid()` runs the relaxation 3 times from independent
  random starts and keeps the lowest-error run. Its solver error numbers are
  printed live in the stats row, right next to the closed-form solids' exact
  numbers, so the difference in kind (measured evidence vs. arithmetic) is
  visible on the page, not just asserted in prose.
- The mesh editor now also tracks and displays **boundary edge count**, live.
  This closed a real gap in the previous plan: item 1 there ("closure
  detection for user-built nets") assumed a hand-drawn net could reach
  boundary=0. **It provably cannot** — any finite patch cut from an infinite
  planar triangular lattice has a nonempty boundary cycle by construction
  (basic planar topology: a bounded 2-cell complex embedded in the plane has
  an outer boundary). Closing a net into a sphere means gluing non-adjacent
  boundary edges together, which this tap-to-attach editor never does. So the
  stat is real and useful (shows how big the open boundary still is) but it
  will never hit zero, and the page now says so plainly instead of silently
  building a "Solve" button that could never activate.

**Why this is honestly still not "the paper's solver":** it's generic
spring relaxation, not the paper's numerical homotopy continuation from a
hyperbolic starting point (circle-packing / discrete-conformal machinery).
Convergence here is *evidence* the shape is right (shown as a printed
max/mean edge-length error), not *proof* the way the paper's own algorithm
would be — the footer says this explicitly. It has been verified once, by
hand, on paper: the split-face bipyramid's face list was checked against
Euler's formula (V−E+F = 8−18+12 = 2) and against the page's own
Σ(6−deg)=12 rule before being trusted to the solver (see Gotchas). It has
**not** been tried on a genuinely non-convex net — see the plan below.

## What this is (turn 1, preserved)

A reply to a factory-posted concept advert about "neoplatonic solids": every
triangulated sphere where no vertex touches more than six triangles (a
"6-net") folds uniquely into a rigid unit-triangle solid. The advert's own
pitch named the hard turn-one boundary explicitly — the paper's realization
method is a numerical homotopy continuation from a hyperbolic starting
point, not something to improvise client-side in one pass — and this build
took that boundary at face value rather than trying to beat it.

Shipped:
- A triangular-lattice mesh editor (canvas, tap to attach a triangle to the
  growing mesh). It enforces the degree cap live: every candidate triangle
  is colour-coded by the worst vertex degree it would create, and anything
  that would push a corner past 6 is drawn dim/blocked and refused on tap.
- A "finish" action that snapshots the current net (as a flat PNG + stats)
  into a localStorage gallery — "your net sketches," explicitly labelled as
  flat patterns, not solved solids.
- A five-item gallery of precomputed neoplatonic solids — the classic convex
  deltahedra (tetrahedron, triangular/pentagonal bipyramid, octahedron,
  icosahedron) — rendered in three.js, drag-to-rotate, with every edge
  length measured post-construction and displayed (not just claimed), plus
  a live Σ(6−degree)=12 check per solid so the Euler/Gauss-Bonnet fact in
  the explainer text is verifiable on the page, not just asserted.
- "Copy image" on both the editor canvas and the 3D viewport, per this
  requester's standing preference for a prominent copy-image action on any
  diagram (see the profile note on `want-pairwise`).

## Decisions

**No solver, and said so loudly, twice (on-page and in NOTE.txt).** [Turn 1
decision — superseded this turn by explicit request; kept for the reasoning,
since the tradeoff it names is still real and still applies to the editor's
hand-drawn nets, just not to the one closed example turn 2 added.] The
advert already flagged this as a stretch goal, not a turn-one promise. I
did not attempt a partial/fake solver (e.g. spring relaxation) because a
plausible-looking wrong shape is worse than an honest flat sketch — it
would misrepresent the paper's actual claim (a *unique*, *exact* unit-edge
embedding) with something approximate.

**Turn 2: built the spring relaxation anyway, but reports its own error
rather than presenting it as exact.** The distinction that made turn 1's
refusal correct — a wrong shape presented as certain is worse than nothing —
is preserved by *showing the max/mean edge error next to the shape* instead
of hiding it. A visitor can see the difference between the closed-form
solids (error not applicable — they're arithmetic) and the solved one
(error printed, real, sometimes non-trivial). That is the honest version of
"go for it": attempt real solving, and let the number on the page carry the
epistemic weight instead of the copy's confidence.

**Applied the solver to a hand-picked example, not to whatever a visitor
draws.** The editor's hand-drawn nets are provably always open (see the
boundary-edge-count reasoning above) — there was no closed net available
from the editor to solve even if the requester had wanted the solver wired
to it. Building a fake "close the net" gluing mechanic to make the editor's
output solvable was out of scope for this turn (it's a real, separate
feature — see the plan).

**The five gallery solids are closed-form, not solved.** A regular n-gon
base plus an apex at the height that makes every edge exactly 1 is
arithmetic, not the paper's realization algorithm. They're real, correct,
unit-edge, and genuinely satisfy the ≤6 degree cap (degrees 3, 4, 5 only)
— but they're the *easy* case (convex, vertex-transitive-ish). The paper's
actual interesting claim — irregular, non-convex nets still fold uniquely
— is stated in the intro copy but not demonstrated by anything on the page.
Said plainly in the footer rather than let the gallery imply otherwise.

**No crowd-shared gallery.** The advert's pitch says "every finished net a
visitor builds joins a growing shape gallery" — read literally that's a
gallery shared across *all* visitors, which needs a backend this kit
doesn't have (no lab database, and a shared collection filled by strangers
is exactly the unreviewed-content shape the kit's docs warn against). Built
the honest version instead: a personal, local (localStorage) gallery, with
a one-line note on the page explaining why it isn't global. This is a
deliberate deviation from the advert's literal wording — flagging it here
so nobody "fixes" it back to a real shared backend without reading this.

**No sign-in / no `labPds`.** This concept has no natural need for a
Bluesky handle (no comparison-between-people, no leaderboard), so I didn't
bolt on OAuth just to get local storage to survive a device switch. If a
future turn wants cross-device persistence, `labPds().save('nets', list)`
is the natural fit — see kit README's "backend is the visitor's own
repository" section.

## The plan (next turn, in order)

1. **A gluing / closure mechanic for the hand-drawn editor — the way to get
   from "solve my open net" to "solve my *closed* net."** Turn 3 solved the
   editor's net as-is (flexible, open-boundary, clearly labelled); the actual
   unique-rigid-solid answer for a visitor's own drawing still needs this.
   The editor needs a way to mark two boundary edges as identified (glued),
   most naturally by letting the visitor tap two boundary edges to fuse them,
   updating vertex identity across the graft. Real UI+data-structure project
   (the triangular-lattice coordinate model doesn't represent glued edges at
   all currently) — not a quick add. Once it exists, `meshToIndexed()` and
   `solveYourNet()` (both added this turn) need almost no changes: they
   already turn `mesh` into an index/face list and hand it to the same
   solver; only the boundary would actually reach zero and the "flexible,
   not rigid" caveat could then legitimately drop for a fully-glued net.
2. **A genuinely non-convex test case for the solver.** Still undemonstrated:
   the split-face bipyramid is irregular but basically convex. Construct one
   by hand the same way turn 2 did (verify Euler's formula and Σ(6−deg)=12
   before trusting it to the solver — see Gotchas), aiming for an operation
   more likely to force concavity (e.g. an inward stellation). The repulsion
   term added this turn (see Gotchas) may actually make this *harder* to
   demonstrate cleanly — a genuinely concave solved shape will have some
   non-adjacent vertices that are legitimately supposed to be close together,
   and the new repulsion will resist that. Watch for this specifically: if a
   real non-convex test case can't converge cleanly with repulsion on, that's
   worth a note on the page rather than silently weakening the term.
3. **Self-intersection / non-manifold *face* detection.** Turn 3's repulsion
   term is a vertex-level proxy for "did this fold into itself" — cheap and
   real evidence, but not the same claim as "no two faces cross in 3D." A
   segment/triangle intersection pass (O(faces²), fine for the sizes seen so
   far) would be the actual test; nothing here does that yet.
4. **Move the relaxation off the main thread for large hand-drawn nets.** The
   editor's solve button already scales iteration count and attempt count
   down as `n` grows (see the `iters`/`attempts` ternaries in the click
   handler) and skips the O(n²) repulsion pass above n=150, but a really
   large net (many dozens of vertices, high attempt count) would still want
   a Web Worker or an rAF-chunked loop rather than a bigger synchronous
   block. Not measured against a real large net yet — the caps above are a
   guess, not a benchmark.
5. **Pan/zoom on the mesh editor.** Unchanged from turn 1 — the lattice is
   unbounded but the canvas view is fixed and centred; a net past ~15
   triangles runs off the visible area with no way to re-centre.

## Gotchas

- **Verify any new combinatorial net by hand against Euler's formula and
  Σ(6−deg)=12 *before* trusting it to the solver.** With no network access
  there's no way to look up whether an invented face list is actually a
  valid closed manifold — a typo'd face list could produce something that
  isn't a topological sphere at all, and the solver would still *try* to
  relax it (silently converging to nonsense, or failing to converge, with
  no way to tell which from the error number alone). The split-face
  bipyramid in this turn (`STELLATED_FACES`) was checked by hand: every one
  of its 18 edges appears in exactly 2 faces (manifold, closed), V−E+F=2
  (sphere), and Σ(6−deg)=12 (matches the page's own theorem) — all worked
  out in the BRIEF math above before being trusted. Do this for any new
  hand-built net; it's cheap and it's the only check available here.
- **A finite patch of an infinite planar triangular lattice can never have
  zero boundary edges.** This is not a missing feature of the editor, it's
  a topological fact (a bounded planar 2-complex always has an outer
  boundary cycle) — don't "fix" the boundary-edge stat to ever show 0
  without first adding an actual edge-gluing mechanic (see the plan).
- **Vertex identity in `meshStats()` is done by rounding coordinates to 3
  decimals and grouping.** This works because every shape here is built
  from exact closed-form trig, so shared vertices land on *identical*
  floats (same expression evaluated the same way), not just close ones.
  If a future geometry is built by two different code paths that both
  compute "the same" vertex independently (e.g. a solver with floating
  drift), this grouping will silently split one vertex into several and
  the Σ(6−deg)=12 check will read wrong instead of erroring — worth
  switching to an explicit shared vertex/index buffer before that happens.
- **`THREE.TetrahedronGeometry`/`OctahedronGeometry`/`IcosahedronGeometry`
  are core three.js, not addons** — no vendoring needed, they come from
  the same `three.module.min.js` already in the kit. Only the two
  bipyramids needed hand-built `BufferGeometry`.
- **Winding order is fixed generically**, not per-shape: `trisToGeometry()`
  computes each face's centroid-outward direction against the solid's own
  centroid and flips the vertex order if the raw winding points inward.
  Saved having to hand-verify CCW/CW for every face of every shape by hand
  — trust that function rather than re-deriving winding if you add a
  sixth shape.
- Untested in a real browser by me, but the harness screenshots after this
  build — if the mesh editor's tap targets feel off on the screenshot,
  the likely cause is the `pixelToTri()` ⟷ `toPixel()` coordinate inverse;
  both are derived from the same `x = i + j·0.5, y = j·√3/2` lattice map
  and should be exact inverses — check that pair first before suspecting
  the degree logic.
- **`buildStellatedSolid()` caches the *solved vertex array*, not the THREE
  geometry object.** `showSolid()` disposes the previous geometry on every
  switch (`solidMesh.geometry.dispose()`); if the solver's result had been
  cached as a `BufferGeometry` and handed back on a second visit to the same
  gallery entry, the second `showSolid('stellated')` would render an
  already-disposed geometry. Caching the raw `[x,y,z]` array and rebuilding
  a fresh geometry via `trisToGeometry()` each time sidesteps this — cheap,
  since that step is pure arithmetic with no solving involved. Re-running
  the actual relaxation on every click was deliberately avoided too (it
  would make the printed error number wobble every time a visitor re-opens
  the same shape, which reads as instability even when it's really just the
  random restart doing what it's supposed to).
- **The solid-gallery material was switched to `THREE.DoubleSide`** this
  turn, as a safety net for the new solved shape: `trisToGeometry()`'s
  winding-correction step assumes the solid's own centroid lies "inside"
  every face in a way that's reliable for convex-ish shapes but not
  guaranteed for a general (possibly concave) solved net. `DoubleSide` means
  a winding mistake shows up as slightly-off lighting rather than an
  invisible/culled face. This is a band-aid, not a fix — if a future
  non-convex test case (plan item 2) renders with visibly wrong shading,
  suspect the centroid-outward winding test before suspecting the solver.
- **`relaxEmbedding`'s new repulsion term is gated at `d < 1`, using the
  same functional form as the spring force (`f = k*(1-d)/d`), not a inverse-
  square Coulomb force.** Chosen because it's cheap, has no singularity blow-
  up risk at `d→0` the way `1/d²` does with this explicit-Euler integrator,
  and only activates in the regime that actually matters (closer than one
  edge-length apart — anything farther isn't a folding risk). It is O(n²)
  per iteration; `relaxEmbedding` skips it above n=150 (see `const repel =
  n <= 150`) rather than let a big hand-drawn net's solve hang the tab. That
  threshold is a guess, not a measurement — see plan item 4.
- **`minNonEdgeDist`'s warning cutoff (`0.35`, in `showSolid`'s `tight`
  check) is a hand-picked number, not derived from anything.** It's roughly
  "closer together than a third of an edge length," chosen to flag genuinely
  suspicious convergence without false-alarming on normal geometry (e.g. two
  vertices on opposite sides of a thin wedge can legitimately end up
  somewhat close without anything being wrong). If a future non-convex net
  legitimately needs its non-adjacent vertices closer than this, expect false
  warnings — this is a heuristic tripwire, not a hard correctness bound.
- **The editor's "Solve this net" button reuses `showSolid`'s existing
  dynamic-key branch (`key === 'yournet'`)** rather than adding `yournet` to
  the static `SOLIDS` array — it isn't a fixed shape, it changes every time
  the button is pressed. `ensureYourNetButton()` adds the gallery button only
  once (checks for an existing `[data-key="yournet"]` node first); re-solving
  updates `yourNetData` and re-renders through the same `showSolid('yournet')`
  call, so the button doesn't multiply on repeat solves.
