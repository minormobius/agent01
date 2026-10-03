# Orb — `/orb/`

Minesweeper on a sphere of Voronoi cells. Drag to turn it. **Tap flags, hold
digs**: digging is the move that can end the game, so it gets the deliberate
gesture (right-click digs on desktop; the mode button or `f` swaps them).
Tapping an open number clears around it once its flags are placed. The first
tap of a game digs, since there is nothing to flag yet.

The **reticle** rings the cell facing you (the orb's nearest point) in white
and the cells it counts in teal, drawn above everything else. A readout
underneath gives its number, flags and hidden neighbours. On an irregular
mesh, counting the far side of a cell by eye is the chore; turn the cell you
care about to the middle instead.

Pure static, like the rest of the `/pressure/` family: ten script tags, no
build, served by the assets fallback in `games/worker.js`.

## Does Minesweeper stay solvable on a Voronoi mesh?

**No tiling guarantees it, the square grid included.** "Solvable without
guessing" is a property of a *mine layout*. Plenty of ordinary expert boards
force a coin-flip. What a tiling changes is *how often*. `test/analysis.mjs`
measures that: deal mines uniformly (first cell and its neighbours kept
clear), play from the first cell by exact deduction alone, and count the
boards that clear. ~400 cells, 300 deals per entry, all on closed surfaces
(tori for the grids) so edges and corners play no part:

| mesh | avg degree | 14% mines | 16% | 18% | 20% | 22% |
|---|---|---|---|---|---|---|
| square, 8-neighbour | 8.00 | 98% | 94% | 91% | 89% | 76% |
| hex | 6.00 | 99% | 94% | 90% | 85% | 74% |
| **orb** (Voronoi, 2 Lloyd rounds) | 5.97 | 94% | 88% | 82% | 64% | 31% |
| Voronoi, unrelaxed | 5.97 | 86% | 77% | 61% | 37% | 14% |

So an irregular mesh makes the game **less** fair, and more irregularity makes
it worse. The orb has the hex grid's average degree (6 − 12/n, by Euler) but
falls away much faster as density rises. What is measured about the cause:
the cells left undecided when the solver gets stuck skew toward low degree
(5.83 average against the mesh's 5.97), and a safe cell completely walled in
by mines accounts for only ~4% of stuck orb boards. The fuller explanation is
still open. The likely shape: a four- or five-sided cell is watched by fewer
numbers, so it is easier to leave underdetermined.

Lloyd relaxation is the knob (`relax` in `buildMesh`). Two rounds keep a real
spread of fives, sixes and sevens while killing the slivers. A near-zero
edge is an adjacency no player can see.

## So the game doesn't hope

`js/solve.js` holds an exact solver: single numbers, overlapping pairs, then
full enumeration of each frontier component combined against the total mine
count. A cell is certain iff no world consistent with what you can see
disagrees. The generator places mines after your first tap, plays the board
out by deduction, and if it gets stuck moves one stuck-frontier mine into the
unseen interior and tries again. At the game's densities that costs ~1 deal,
~0.1 repairs and about a millisecond.

Because knowledge only grows, the solver's proof survives any order of play.
**At every moment some cell is certain**, however you got there. That gives
the family its readout. This game's shape of correctness is **a certainty**:
each move you make is checked against what was provable when you made it, and
the ones that weren't are counted as guesses. A clear with zero guesses is
`CLEARED — PURE`. Lose, and it shows you the cells that were certain when you
clicked.

### What counts as a guess

A tap is a guess iff the cell was not provably safe from the numbers on
screen at that moment. Flags are ignored either way (they're your opinion,
not knowledge), so tapping before you flag costs nothing. "Provably" means
the *complete* certain set: `certainties()` runs the cheap rules to a
fixpoint, then the exact solver over what's left. An early version asked
`deduce()`, which stops at the first rule that finds anything. That is right
for solving and wrong for judging. A 1 touching three cells, two of which
another number says hold exactly one mine, makes the third safe, but that
version called it a guess whenever some single number elsewhere happened to
clear a cell too. The selftest now pins `certainties()` to the exact
solver's answer in every position it walks.

## Leaderboard: read live off ATProto, no server

🏆 shows the fastest **pure** clears per size (zero guesses, no hints), one
row per player, all-time / week / today.

**Writing.** A pure clear is posted as a `com.minomobi.lab.score` record in
*your own* repo, through the shared auth worker, with one narrow permission
(`repo:com.minomobi.lab.score`):

```json
{ "site": "orb", "game": "pure-320-62", "value": 83412, "unit": "ms",
  "higherIsBetter": false, "detail": "seed=kor-lith-26 first=60 guesses=0",
  "createdAt": "…" }
```

Signing in, or upgrading an existing mino.mobi session to that permission,
leaves the page, so the time is parked in localStorage and posted on return.

**Reading** (`js/corpus.js`). Nobody hosts the board. Every browser rebuilds
it:

1. The relay lists every repo holding the collection
   (`com.atproto.sync.listReposByCollection`).
2. Each repo's DID document names its PDS, and the PDS lists its records.
3. Jetstream (`wantedCollections=com.minomobi.lab.score`) streams every
   create and delete live, from a cursor a minute before the backfill
   started, so nothing falls in the gap.

All of these are CORS-open public endpoints. A score posted anywhere
reaches every open board within about a second, and deleting the record
takes it off. Against the real network: cold start to live in ~2 s.

Names and avatars come from the appview's `getProfiles`, which only reports
handles that verify both ways. A DID document's `alsoKnownAs` is a bare
claim and is never shown. A failed lookup (the appview does hiccup) is
retried with backoff whenever the board redraws, so a row can't get stuck
showing a raw DID. Avatars use the CDN's thumbnail size. The collection is shared with other lab sites, so `accept()`
keeps only well-formed Orb records.

**Cost and limits.** One PDS request per player per page load. That's
nothing now, and it's the moment to add a cache (or an appview) once there
are thousands of players. The relay's list can include repos that moved or
were deleted; they contribute nothing.

**The board trusts the record.** Anyone can write any number into their own
repo; that is what user-owned data means. `detail` carries the seed and
first cell, which pin the exact board, so a replay check can be added later
without changing the format.

## Files

| file | what |
|---|---|
| `js/prng.js` | seeded RNG (local copy of the repo's xmur3 + mulberry32) |
| `js/sphere.js` | random points → Lloyd → convex hull = spherical Delaunay → Voronoi cells and adjacency; nearest-site hit test |
| `js/pretzel.js` | the double torus bent into 3D: a map from the octagon onto a pretzel (see below) |
| `js/bend.js` | the 3D view's Web Worker: builds that map and the board's cells on it |
| `js/hyper.js` | the double torus: a hyperbolic octagon's Voronoi diagram, Möbius maps of the Poincaré disk, and the camera that scrolls through it (see below) |
| `js/torus.js` | the torus: Voronoi diagrams of the flat torus and the honeycomb torus, plus the donut camera and the flat map both games draw with (see below) |
| `js/rules.js` | state, reveal/flood, flag, chord. Talks to the mesh only through `nbrs`, so the same rules run on the analysis tori |
| `js/solve.js` | `deduce`, `solveFrom`, `generate` (no-guess), `certainties` |
| `js/view.js` | Canvas 2D orthographic renderer, rotation, picking |
| `js/main.js` | input (drag vs tap vs hold vs pinch), the guess readout, overlays |
| `js/corpus.js` | the score corpus: relay + PDS backfill, Jetstream live, per-player ranking (ES module, no DOM) |
| `js/forge.js` | hard mode's Web Worker: loads the engine, rebuilds the mesh, runs the climb, reports progress |
| `js/board-kit.js` | the same leaderboard, portable: `mountBoard(config)` builds its own overlay; Fathom and One Side mount it (a score board ranks highest first: `corpus.top(…, higher)`) |
| `js/board.js` | the leaderboard UI and the write path (ES module; imports `../../lib/auth.js`, which the deploy vendors) |

A board is a pure function of `(seed, size, first cell)`. `?seed=…&size=s|m|l|x|ts|tm|tl`
is a permalink (also `ks|km`, the Klein bottle, `ps|pm`, the projective plane, and `hs|hm`, the double torus).

## Even walls

On a raw Voronoi mesh about one wall in eleven is under a quarter of the
median wall, and one in thirty under a tenth: four sites nearly on a circle
leave a sliver of a wall that you can only find with the reticle. Every
board here is evened out (`evenWalls` in `js/sphere.js`, used by every
surface) until no wall is under a quarter of the median.

You can't put a minimum on the walls of a Voronoi diagram of given sites,
but you can move the sites. Each short wall pulls its two cells together and
pushes the two cells at its ends apart, which lengthens it by about four
times the step. Then the diagram is rebuilt from the moved sites, so it is
still exactly a Voronoi diagram of slightly different points. Collapsing
short walls into four-way corners was rejected: it isn't Voronoi any more,
and two cells touching at a point is a worse ambiguity than a short wall.
Each cell only ever moves itself, in its own local frame, so the torus's
wrap, the Klein bottle's flip and the double torus's gluings never come
into it. It takes 4–9 rounds and a few tens of milliseconds (0.2 s on the
double torus, which rebuilds only the cells near those that moved). The
selftest checks every tier's shortest wall against the median, and that
every corner is still equidistant from its three sites. Evening is opt-in
(`O.meshFor` asks for it), so Strand's baked Voronoi levels and the analysis
controls are untouched.

## Tiers

| tier | cells | mines | density | to prove a board (median / worst) | hard moments per board |
|---|---|---|---|---|---|
| small | 160 | 28 | 17.5% | <1 ms | ~0 |
| medium | 320 | 62 | 19.4% | <1 ms | 0.3 |
| large | 600 | 132 | 22% | 5 / 13 ms | 0.9 |
| huge | 1000 | 250 | 25% | 83 / 325 ms | 1.3 |

They're defined in `O.SIZES` (`js/rules.js`). The generator's cost climbs
steeply past a quarter mined: 1000 cells at 28% takes ~0.25 s median, and
1500 cells at 28% takes 5 s median, 11 s worst. The ceiling is the repair
loop, not the solver.

A **hard moment** is a point in the solve where single numbers, chased to a
fixpoint (flag what one number forces, clear what that frees, repeat),
settle nothing anywhere on the board, yet something is still certain. The
only way on is two numbers read together, or the full exact reasoning.
Normal boards have almost none, even the dense ones: the no-guess repair
smooths hard spots away. More mines makes a board longer, not deeper.

## Hard mode

The **HARD** toggle (remembered; `&hard=1` in the permalink) forges boards
*for* hard moments. Choosing the hardest of 32 random boards barely moves
the count (to 1–3), so `generateHard` climbs instead:

1. Start from a proved board.
2. Move one mine at a time.
3. Keep the move whenever the board still clears without a guess *and* has
   at least as many hard moments. `hardSolve` answers both in one pass, and
   ties are kept so the search can cross plateaus.

| tier | climb steps | hard moments, normal → hard (median) | forge time (median / worst, desktop) |
|---|---|---|---|
| small | 600 | 0 → 3 | 0.1 / 0.3 s |
| medium | 600 | 0 → 6 | 0.6 / 0.7 s |
| large | 500 | 1 → 7 | 1.4 / 2.1 s |
| huge | 350 | 2 → 6 | 3.0 / 3.5 s |

It runs in a Web Worker (`js/forge.js`) with a live counter, and the clock
starts once the board is ready. The HUD's **hard** counter shows hard
moments cracked out of the board's total, and glows while you're in one. A
certain move made at a hard moment cracks it; a guess out of one doesn't
count. The total is what the easy-first route meets. Another order of play can meet
fewer or more (the HUD then just counts), because the board isn't forged
around one route.

Hard clears go to their own leaderboard, `hard-<cells>-<mines>-<climb>`
(the climb budget is part of what the board is). Each record's detail
carries `cracked=x/y`.

A tier's cells and mines are its leaderboard game id (`pure-1000-250`).
Retune a tier and its old times drop off instead of being ranked against a
different board.

## The torus (`ts`, `tm`, `tl`)

The same game on a **Voronoi torus**: random sites in a W × H rectangle whose
opposite edges are glued, each cell clipped against its neighbours' images in
the eight surrounding copies, three rounds of Lloyd. A torus has Euler
characteristic 0, so V − E + F = 0 and the average cell has **exactly six**
neighbours, with no defects needed. (The sphere's average is 6 − 12/n.) The
tiers keep the sphere's cell and mine counts, prove boards the same way, and
have their own leaderboard ids (`torus-pure-…`, `torus-hard-…`).

W/H = 4/√3. Drawn as a donut with tube radius r = R·H/W, cells are
true-shaped along the top and bottom of the tube, stretched on the outside
and squeezed on the inside, as on any real torus.

Two views (`◎`/`▭`, or `v`):
- **donut**: a fixed camera looking down at 50°. A drag slides the *skin*:
  sideways turns it round the ring, up and down rolls it over the tube, so
  any cell can come to the front. The reticle sits at the sweet spot, the
  point that faces you squarely. Cells are drawn back to front, back faces
  dropped, and a ray-march decides which centres the near tube hides. The
  corner map is the flat torus; tap it to go there.
- **flat**: the rectangle itself, the torus's exact map, tiled so the wrap
  fills the screen. Nothing is distorted and every neighbour is where it
  looks. On a portrait screen it turns a quarter, so the long way runs down
  the screen.

**Zoom grows round the cursor.** At zoom 1 the donut is centred; zooming in
scales it about the reticle's point, which drifts toward the middle of the
screen, so what you were looking at stays under your finger.

## The Klein bottle (`ks`, `km`)

The same rectangle with one pair of edges glued **with a flip**: walk off the
right edge and you come back on the left, upside down. Minesweeper only reads
the adjacency graph, so it works exactly as on the torus: Voronoi cells
(each site clipped against its neighbours' images, mirrored ones included,
in the plane that covers the surface), V − E + F = 0, an average of six
neighbours, and boards proved guess-free. The selftest checks that every
edge across the glued side joins mirrored images.

What's hard is showing it. A Klein bottle can't sit in space without passing
through itself, so the 3D view is the **classic bottle**: a body, and a neck
that bends over and passes back in through the wall, flaring into the base
from inside. Three cheats make it playable:

1. **The cursor never moves; the skin slides.** As on the torus, the reticle
   is parked on the body (its fattest ring, on the side nearest you) and a drag
   slides the surface under it, glued to the finger through the exact screen
   Jacobian at that spot. Sliding *along* the bottle is free. Sliding *round*
   it is not: the gluing flips v, so turning the whole skin is only
   consistent by 0 or half a turn. So the turn is full at the cursor and fades
   to an allowed value half a lap away, (u, v) ↦ (u + ou, v + k·H/2 +
   ε·cos π(u − su)/W). That is consistent with the flip, and its shear is
   zero at the cursor. The twist lives in the neck and round the back.
2. **Cells are round where you work.** Flat u runs along the bottle
   unevenly, dU/du ∝ C(U)^½ / S(U) (C the girth of the cross-section, S the
   speed along it), scaled so cells are exactly round on the body. Exponent
   1 would be round everywhere, but the neck is 12× thinner than the body and
   the board would be 10× longer than it is round. ½ gives neck cells about a
   third the size and three times as long, in a place nobody works. The same
   choice sets the board's proportions: W/H = 4.42. The small tier is 200
   cells, so there are enough cells round the body.
3. **Text fits its cell**, clipped to it, so silhouette cells don't spill and
   the neck's small cells take small type.

It's two-sided (there is no outside), so painter's order does the hiding,
picking takes the front-most cell, and the parking spot is chosen on the
*near* wall (the inside of the far wall faces you too). The selftest checks
that a tap on the cursor hits the cursor's cell.

The **flat map** is the honest view. The cursor is a point in the plane that
covers the surface, the same point the bottle slides to, and every cell is
drawn at its copy nearest the cursor, so panning across the flipped edge is
seamless. Further out, the copies beyond it are drawn mirrored, because they
are.

## The Clifford torus (the torus's `4D` view)

The `◎ / 4D / ▭` toggle cycles the torus through the donut, the Clifford
torus and the flat map. The Clifford torus is the flat torus as it really
sits, in 4D: (a cos θ, a sin θ, b cos φ, b sin φ), with a : b = W : H, on the
unit 3-sphere. It is *exactly* our flat rectangle, every cell the same size
and shape, which no torus in 3D can be. To see it, it is tilted a little in
4D (β = 0.3 in the x–w plane; `[` and `]` change it) and projected into 3D
stereographically, from the pole w = 1. That projection keeps angles, so
every cell stays round and only sizes change. Sliding the skin is a true
rigid motion here (the θ and φ slides are 4D rotations), so cells swell as
they come round the outside and shrink through the hole. With the tilt, the
3D shadow is a Dupin cyclide, a lopsided donut. Occlusion is exact: a 3D
point lifts back to the 3-sphere, the torus splits the 3-sphere into two
solid tori, and inside is the one the projection pole isn't in. Switching
views keeps the cell under the cursor.

In every 3D view, cell edges are sampled along the surface, not drawn as
chords between corners, so coarse meshes keep their shape at the silhouette.

## The projective plane (`ps`, `pm`)

The sphere with every point glued to the point opposite it. Its Voronoi
diagram is the sphere's diagram of antipodal *pairs* of sites, kept
symmetric through Lloyd relaxation, and each pair is one game cell
(`buildProjective` in `js/sphere.js`). Euler characteristic 1, so
V − E + F = 1 and the average cell has 6 − 6/n neighbours. The selftest
checks that, and that no cell touches itself or the same neighbour twice.

It needs no new view. Any hemisphere is the whole projective plane, once,
so the globe already is its honest map. The mesh carries the double cover
for drawing, and every cell is drawn on both sides of the sphere. Turn the
globe and a cell sinking under one rim comes back up on the opposite rim,
mirrored. The reticle always outlines the copy facing you, so near the rim
its neighbours jump across the globe: that is the gluing, seen. Like the
Klein bottle, it can't sit in 3D without passing through itself, but it can
in 4D.

## The double torus (`hs`, `hm`)

Two holes, so Euler characteristic −2. Gauss–Bonnet says the total
curvature is 2π·χ = −4π, so a double torus cannot be flat the way a torus
can: its honest geometry is **hyperbolic**. The board is a regular octagon
in the hyperbolic plane whose corners are 45° each, with opposite sides
glued. All eight corners become one point with 8 × 45° = 360° round it, and
V − E + F = 1 − 4 + 1 = −2. Each gluing is a hyperbolic translation by twice
the octagon's inradius (cosh r = cot π/8); the four of them generate a group
whose copies of the octagon tile the whole plane, eight round every corner.

`js/hyper.js` works in the **Poincaré disk**, where isometries are Möbius
maps `z ↦ (az + b)/(b̄z + ā)`. Voronoi cells are clipped in the **Klein
model**, where hyperbolic bisectors are straight lines: each cell is cut
with its own site moved to the centre, against every site's images in the
octagons that touch the fundamental one, then Lloyd-relaxed. The average
cell has 6 + 12/n neighbours, the mirror of the sphere's 6 − 12/n. The
selftest checks V − E + F = −2, symmetric adjacency, that every edge's
neighbour copy really shares the edge, and that the cells' hyperbolic areas
(n − 2)π − Σ angles sum to exactly 4π.

The view is the disk, centred on the cursor and larger than the screen
(hyperbolic space shrinks so fast toward the rim that a whole-disk view
makes the cells under your finger tiny). It shows every copy of every
cell in reach, so a cell's neighbours are always the cells round it. A
drag is the isometry that carries the point under your finger to your
finger, so the board scrolls without end in every direction. Each time
the cursor crosses a side of the octagon, the camera swaps to the
equivalent copy: the picture doesn't change, and the numbers stay small
however far you go. The dashed lines are the octagons' sides. The corner
map is the fundamental octagon in the Klein model, where its sides are
straight, with each glued pair of sides in one colour. Tap it to travel
there.

### The donut with two holes (the double torus's `∞` view)

The disk is the honest picture; the `∞` button bends the same board into
the shape you'd draw, a pretzel you turn with a finger. It is less useful
(cells stretch, about 2× on average, and the outer walls' cells are many
times the inner ones'), and that's the point: a hyperbolic surface can't sit
in 3D without it. The octagon's four glued pairs of sides are drawn on it
in the corner map's colours: four loops through one point, the octagon's
eight corners.

The map (`js/pretzel.js`) rests on one coincidence. The regular octagon
with opposite sides glued is the **Bolza surface**, and turning it half a
turn about its centre is its hyperelliptic involution, fixing six points:
the centre, the corner, and the four side midpoints. A pretzel lying flat
has the same symmetry, half a turn about its long axis, which pierces it
six times. Quotient both by the half turn and you get a sphere with six
marked points, where any four disjoint arcs from one point to four others
lift to four loops that cut the surface into exactly the octagon. So it:

1. meshes the pretzel z²/s² + g² = δ² with g = x⁴ − x² + c·y² (Gerono's
   figure eight), then evens the mesh out on the surface itself;
2. draws four arcs on its top face from the corner's axis point to the
   midpoints' and closes each through the bottom face: corner and centre
   opposite, two midpoints between them either way round, as on the Bolza
   surface, where the six points are an octahedron's vertices;
3. cuts along them and checks the resulting disc reads
   x₀x₁x₂x₃x₀⁻¹x₁⁻¹x₂⁻¹x₃⁻¹, lays it into the octagon (Tutte), then lets
   the seams slide: every vertex relaxes to the hyperbolic barycentre of
   its neighbours, the ones across a seam carried over by the gluing. That
   is a harmonic map, so an embedding, and it agrees across every seam;
4. looks points up by triangle.

A flat-lying pretzel has mirror symmetries the Bolza surface lacks, so no
choice of proportions makes the map conformal. They were chosen by
measuring the stretch. The map takes under a second, in a worker
(`js/bend.js`), while the disk stands in. The selftest checks the mesh's
V − E + F = −2, the eight-sided cut, that glued points land together, that
the layout covers the octagon, and that no cell lies folded over. To centre
a cell inside a hole, the view looks down through the hole (a ray march
finds a direction nothing blocks).

## Shared with Strand

`/strand/` loads `js/prng.js`, `js/sphere.js` and `js/torus.js` from here
for its Voronoi and torus boards, and draws its torus with the same camera
and map. Its levels are data on these meshes, so a change to either file must
keep `games/strand/test/strand.selftest.mjs` green: it re-proves every
shipped Strand level against the current mesh.

## Tests

```bash
node games/orb/test/orb.selftest.mjs   # invariants; preflight runs this
node games/orb/test/analysis.mjs 300   # the solvability table above, ~3 s
```

The selftest checks the mesh against Euler (V−E+F=2, every ring closes on its
own site). It checks the exact solver against brute force over every mine
layout on small meshes, for soundness *and* completeness. It checks that
every generated board clears by deduction and is deterministic. And it checks
that a player who opens random safe cells never reaches a position with
nothing certain. It also drives the score corpus against a fake network:
backfill with a dead repo and paginated records, foreign and malformed
records dropped, best time per player, the period filter, verified names,
and live create and delete through a fake Jetstream.
