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
| `wire {pts:[[x,y,z,w],…], r, dim?}` | a wire along straight runs, in 4D directly; with `dim` 2 or 3 it is a profile to extrude (a crimped sheet) |
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
holes), then thirteen assemblies that are the reason to have a 4D workshop:

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
- **cloth: ribbon on ribbon.** 4D cloth is a 3D slab, thin in w. Its plain weave is two families of sheets, one lying
  in x–y and one in x–z, crossing along lines parallel to x, each sheet ana of one neighbour and kata of the next.
  Looked at across (y, z, w) it is exactly our plain weave, every thread a sheet running off along x. A sheet cannot
  leave along y, z or w and slides only along x. **A third family cannot join in** (a derivation, not a test): two
  whole sheets keep one order along their entire crossing line, and where three families meet at a point the three
  pairwise orders must not be cyclic (A over B over C over A); chequering all three pairs makes exactly a quarter of
  the meeting points cyclic, and the only way out is for the third family to lie wholly above or below the others, a
  layer and not a weave. So whole sheets weave two ways; a three-way weave needs strips with gaps, which is open.
- **bundle in a sphere-hoop / in a ring.** Seven rods along w. A bundle's surroundings are 3D, so a ring leaves one
  sideways direction open and the outer rod walks out along z; a hoop that is a sphere closes all three, and the rod
  moves only along its own length, which is friction's to hold. The 4D yarn is hooped, not spun.
- **rope.** The two put together: a bundle of fibres in a woven sheath. The sheath is the cloth rolled into a hose,
  drawn in a half-plane (ρ, y, ℓ) and turned about its axis: arcs from pole to pole become hoops that are spheres,
  lines along ℓ become bands (a circle, the rope's length long), and where they cross one is outside and the other
  inside, chequered. No fibre can leave sideways; the hoops cannot slide along or across the bands; nothing touches at
  rest. Along its length a fibre is held by friction alone, which is not modelled.
- **pulley.** The first machine. A wheel turning in x–y on a pin that is a plane (z–w), in a block, with a rope over
  it. A rope on a rim can slip sideways two ways, so its seat must be a cup, curved across z and across w (here: the
  wheel cut by a ring). Open the seat along w (`open`) and it is our pulley's groove: the rope walks off through w.
  Take the flange away (`flange` 0) and the block's cheeks are all that hold it: a block like ours, cheeks across z
  only (`guard` 0), lets it out through w, so a 4D block has cheeks on all four sides of the wheel (`guard` 1). The rope is a plain wire standing in for any of the ropes above; nothing here bends or
  carries load.
- **block and tackle.** Two of those and one rope: made fast to the beam, under the moving sheave, over the fixed
  one, down to the hand. One parameter, `lift`: the load rises by it, the hand comes down by twice it, the wheels
  turn with the rope, and the rope's length does not change (15.805, to rounding). Twice the travel is half the pull:
  that is built into the rope's path, not measured from forces, which nothing here has.
- **room.** The first building: a floor that is a volume, eight walls, a doorway that is a hole in three directions,
  a door lying on the wall's face and hung on a plane, two windows, a table on four legs. [HOUSE](../house/) walks
  through it, using this tree for both the picture and the collisions.

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
node kata/cad4/test/cad4.selftest.mjs         # ~40 s, 18 checks: the kernel against closed forms
node kata/cad4/test/assemblies.selftest.mjs   # ~45 s,  8 checks: hinge, rings, lock, chains
node kata/cad4/test/textiles.selftest.mjs     # ~25 s,  6 checks: weave, cloth, bundles, rope
node kata/cad4/test/machines.selftest.mjs     # ~12 s,  3 checks: pulley, tackle, room
```
