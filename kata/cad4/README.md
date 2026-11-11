# CAD⁴

A solid-modelling kernel for four dimensions, and a page to use it: [kata.mino.mobi/cad4/](https://kata.mino.mobi/cad4/).

A part is a **feature tree**, plain JSON, and the tree is the model. From it the kernel (`js/kernel.js`, no DOM, no
dependencies) derives a JavaScript function and the same thing in GLSL, and from those the numbers, the slices, the
meshes and the picture.

## Why implicit

Our 3D CAD ([cad.mino.mobi](https://cad.mino.mobi)) is a boundary representation: faces, edges, vertices. One dimension
up, a boundary is made of 3D cells meeting in 2D faces meeting in edges meeting in vertices, and every boolean is an
intersection of curved 3-manifolds. Nobody has that kernel. An **implicit** one is short: a part is a function f(p),
negative inside, and every operation is arithmetic on functions that doesn't care how many coordinates p has. What it
gives up is named faces and exact edges; what it keeps is everything a feature tree needs.

## The tree

Nothing is drawn in 4D directly. Shapes start in 1D and 2D and climb the ladder.

| op | makes |
|---|---|
| `interval {h}` | 1D: \|x\| ≤ h |
| `disc {r}`, `rect {size:[a,b]}`, `ngon {n, r}` | 2D |
| `ball {dim, r}`, `box {size:[…]}` | any dimension, centred |
| `product {of:[A, B]}` | A in the first coordinates, B in the next (disc × disc = duocylinder) |
| `extrude {of, h}` | a product with an interval along a new last axis |
| `revolve {of, axis}` | one dimension more: coordinate `axis` becomes the radius in the plane of it and the new axis |
| `union`, `cut`, `intersect {of:[…], r?}` | booleans; `cut` is the first minus the rest; `r` blends |
| `move {of, by:[…]}`, `rotate {of, plane:[i, j], deg}`, `scale {of, k}` | a rotation has a **plane**, not an axis |
| `round {of, r}`, `shell {of, t}` | offset outward; the skin, t thick (`t: 0` is the bare surface, for a `round` to thicken) |
| `wire {pts:[[x,y,z,w],…], r}` | a wire along straight runs, in 4D directly (the one shape that doesn't climb the ladder) |
| `ref {name}` or just `"name"` | a part from the tree's `parts` |

A lower-dimensional shape where a higher one is expected is an infinite prism along the missing axes. So cutting a 4D
part with a `disc` drills it, and the hole is a plane long.

A number may be a parameter's name or arithmetic on them (`"leaf/2+k+gap"`). A whole tree:

```json
{ "params": { "a": 1.1, "b": 0.9, "r": 0.3 },
  "show": { "op": "round", "r": "r", "of": { "op": "product", "of": [
    { "op": "shell", "t": 0, "of": { "op": "disc", "r": "a" } },
    { "op": "shell", "t": 0, "of": { "op": "disc", "r": "b" } } ] } } }
```

That is the tiger: a circle times a circle, thickened. `show` may be a list of part names (an assembly); `check` lists
pairs that should not overlap; `path` is a motion, a list of parameter settings; `ranges` sets the sliders' ends.

## What the kernel gives

- `compile(tree, overrides)` → `{ dim, sdf(x, y, z, w), bbox, glsl, parts }`. The GLSL takes parameters as a uniform
  array, so a viewer moves a hinge without recompiling.
- `measure(shape)` → volume (4-volume in 4D), the boundary's measure, centroid, second moments. `inertia(m, i, j)` is
  the moment for turning in the plane of axes i and j: a 4D part has six.
- `slice(shape, origin, E)` → the 3D cross-section through any point at any orientation; `mesh()` → triangles by
  marching tetrahedra (closed); `stl()` → a binary STL you can print.
- `fit(tree, a, b)` → the volume two parts share and, if none, the gap between them. `sweep()` → the same along a
  motion.

How good the numbers are: distances are exact for the primitives, products and revolves, and never too large after a
boolean. Measuring cuts the bounding box into 32 cells a side in 4D, skips the cells that are wholly in or out and
cuts the rest three ways more, so the 4-volumes of the ball, tesseract, spherinder, cubinder, duocylinder and tiger
come within 0.3% of their closed forms and their boundaries within 0.6%. A thin part is worse (the ring, 0.3 thick:
1.1%). Overlap is counted sharply, so two parts 0.03 apart read as exactly nothing; an overlap thinner than the grid
(reported as `h`) can hide.

## The page

Your 3D slice, sphere-traced from the compiled GLSL. Drag to look round it, pinch to zoom; the pad twists the slice
into w about what you see as across and up; the lever moves it ana and kata; ⊞ squares it up. Where the surface leans
into the direction you can't see it is tinted teal (the part grows as you go ana) or rose. Top right, where the four
axes lie in your slice.

Beside it: a slider per parameter; **fit**, each checked pair clear or overlapping; the numbers of the whole 4D part,
rough at once and refined a moment later; this slice's volume and area, and **the strip**, each part's cross-section
along the direction you can't see with a line where your slice is (a part that has left your picture is a bump
further along the strip); and the tree, editable: **build** compiles what you typed, **copy link** carries it in the
address. **linked?** (on the chain assemblies) is the test a slice can't make. A ring is filled in with a film and what comes
through it is drawn; then the ring is lifted along each of the four axes, a disc a step. If the piercing ends with the
rim untouched, the ring is free that way; if the other part reaches the rim, that is a collision. The two plain rings
are free along ±w and nowhere else; the lock and both chains are held all eight ways. Why: a curve need not meet a
film in 4D (1 + 2 < 4), a surface meets one at points no nudge removes (2 + 2 = 4). It tests straight lifts along the
axes, which shows the mechanism; it is not a proof.

**slice → STL** downloads the cross-section you are looking at. **▶ run** plays a part's motion, and only as far as it can go: the worker first walks the path to each contact
(a checked pair within 0.05, or overlapping where the fit is closer than that by design), and the run stops there and
comes back. The fake chain runs its whole path; the lock and both real chains move a few tenths and are bound.

## The library

Ball, tesseract, spherinder, cubinder, duocylinder, tiger, ring, and a bracket (plate, blended boss, three drilled
holes), then eight assemblies that are the reason to have a 4D workshop:

- **hinge.** A 4D door turns in a plane about a plane, so the pin is a disc times a square, not a rod. Swung from 0°
  to 150° the leaves never touch; folded flat, or with a pin 0.04 too fat, the fit turns red.
- **chain (it isn't one).** Two linked rings. Pulled apart inside your slice they collide. Lifted along w, slid clear
  and lowered, they never touch: loops don't link in 4D.
- **lock.** What does hold a ring: a hollow sphere. The ring enters it through w, and all twenty straight ways out
  that the selftest tries pass through the sphere's skin.
- **ring–sphere chain.** The lock, repeated: ring, hollow sphere, ring, each ring through the sphere's skin by way of
  w. The sphere cannot leave either ring; a pulled ring bears on the sphere.
- **tiger chain.** A chain of one kind of link. Three tigers, big, small, big, in a line. One circle of the small tiger threads
  both big ones as surfaces (a loop and a surface are what link in 4D: 1 + 2 = 3). At rest nothing touches; the middle
  link cannot leave either end by any straight way; the ends alone slide apart freely, so they hold each other only
  through the middle; pull an end and it bears on the middle link. Three things we learned placing it: two surfaces in
  4D generically meet at points, so most placements collide; identical tigers cannot do it (the threading link's other
  circle must be smaller than the circles of the link it threads); and the stable arrangement is the 3D one, the
  middle link's one loop passing through both neighbours.
- **weave: thread and ribbons.** What catches on what. In 4D two things obstruct each other only if their dimensions
  add to 3 or more, so a thread (1) catches on nothing made of threads and on anything with a 2D face. Three ribbons
  and a thread passing ana, kata, ana of them: the thread cannot move along w or along its own crimp, and slides
  freely along the ribbons. Narrow the ribbons to threads and it steps aside and leaves.
- **bundle in a sphere-hoop / in a ring.** Seven rods along w. A bundle's surroundings are 3D, so a ring leaves one
  sideways direction open and the outer rod walks out along z; a hoop that is a sphere closes all three, and the rod
  moves only along its own length, which is friction's to hold. The 4D yarn is hooped, not spun.

**ways out** (on assemblies with a part to free) tries that part along each axis, both ways, and says where it stops.
An assembly may also give `view`, the slice to start in: the weave and the bundles start with w in view.

## From a terminal

```bash
node kata/cad4/cli.mjs measure duocylinder a=1.5
node kata/cad4/cli.mjs fit hinge frame door open=176     # exits 2 on an overlap
node kata/cad4/cli.mjs sweep chain a b pull 0 3
node kata/cad4/cli.mjs slice tiger tiger.stl w=0.2
node kata/cad4/cli.mjs glsl my-tree.json
```

## Not here

Named faces, exact edges and STEP (there is no 4D STEP); threads and gears; a sketcher (the tree is typed); a ghost of
what lies outside your slice (the strip stands in for it). Smooth blends are not exact distances, so a `shell` or
`round` of a blended part is a little off near the blend.

## Test

```bash
node kata/cad4/test/cad4.selftest.mjs   # ~85 s, 29 checks
```
