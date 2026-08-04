# BRIEF — that-2 / "Sixfold"

## What this is

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

**No solver, and said so loudly, twice (on-page and in NOTE.txt).** The
advert already flagged this as a stretch goal, not a turn-one promise. I
did not attempt a partial/fake solver (e.g. spring relaxation) because a
plausible-looking wrong shape is worse than an honest flat sketch — it
would misrepresent the paper's actual claim (a *unique*, *exact* unit-edge
embedding) with something approximate.

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

1. **Closure detection for user-built nets.** Right now the editor is
   flat/open-patch only — it never checks whether a net has actually closed
   into a topological sphere. The honest signal is combinatorial: track
   which mesh edges are still boundary (touched by only one triangle) vs.
   interior (touched by two); a closed net has zero boundary edges. That's
   checkable without any geometry solving and would let "Finish" mean
   something stronger than "stop here" for closed nets specifically.
2. **A non-convex/irregular example in the gallery, by hand.** Before
   attempting the general solver, hand-derive (or find published)
   coordinates for one of the other five canonical convex deltahedra
   (snub disphenoid — 12 faces, mixed degree-4/5 — is the natural next one;
   coordinates exist in the literature) to at least widen the gallery past
   "all five are trivially symmetric." Still not the paper's harder claim,
   but a step toward it without touching the solver.
3. **The actual realization solver — the named hard part.** Homotopy
   continuation from a hyperbolic ideal polyhedron (the paper's own method)
   is real numerical work: circle-packing / discrete-conformal machinery,
   iterative, and almost certainly wants to run in a Web Worker so the page
   doesn't freeze. This is not a client-side afternoon project. If it's
   pursued, start by reproducing the paper's simplest non-trivial worked
   example (probably the smallest irregular 6-net they publish) as a fixed
   test case with a known-correct output, before wiring it to the live
   editor — otherwise there's no way to tell "solver is wrong" from "solver
   never converges" from inside a build with no way to check the answer.
4. **Pan/zoom on the mesh editor.** The lattice is unbounded but the canvas
   view is fixed and centred; a net that grows past ~15 triangles runs off
   the visible area with no way to re-centre. Small fix, just didn't fit.

## Gotchas

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
