# OCTOPUS

Eight of [TENTACLE](../tentacle/)'s arms on a head, in 3D (to calibrate your eye) and in 4D. Each arm has its
muscles, its mass, the water's drag and its suckers. All eight are moved in one solve, so they press on one another and
on the head, and can't pass through either.

## What you see

- **3D / 4D**, and in 4D TENTACLE's slice controls: the pad twists your slice into w (J L, I K), the lever moves it ana
  and kata (R F), ⊞ or Z squares it up. A small view draws all eight arms with w as colour, gold where your slice holds
  them, and the readout counts the pieces your slice cuts them into.
- **The readout** also says what the physics costs your device each frame and the frame rate. On a slow device the page
  drops to 4 substeps, then lowers the resolution.
- **The blue arrow** is the force the arms put on the body (log length). The body is held still; it doesn't move.

| preset | what it shows |
|---|---|
| **sprawl** | floating: the arms droop toward the mouth near the root, their tips curling out |
| **writhe** | each arm writhing, out of step with the next |
| **sweep** | the stroke: all eight close fast (a quarter of a 2.2 s cycle) and open slowly. The readout gives the mean force over exactly the last whole stroke |
| **flare** | the arms curl back over the head and mantle, suckers turned out, draping over the body |
| **grab** | the arms coil in under the mouth, suckers inward |
| **reach** | one arm unrolls outward while the other seven hold |

## Where the arms grow

An octopus's arms root in a ring round its mouth: eight points on a circle, 45° apart, each with two nearest
neighbours.

In 4D the mouth is ringed by a **2-sphere**, not a circle. The eight most evenly spread points on a 2-sphere are a
**cube's corners**: 70.5° apart (cos θ = 1/3), each with **three** nearest neighbours. So the hyperoctopus's arms root at
a cube's corners. The cube is turned 45° in the z–w plane, so four corners (a rectangle round the mouth) lie in w = 0,
the slice you start in, and the other four sit two ana and two kata.

Each arm's frame at its root: T outward and 24° below level, e1 its aboral side (up, away from the mouth), the rest by
Gram–Schmidt, with the same handedness as TENTACLE's own base frame. The suckers are on −e1, facing the mouth.

The eyes are a choice, not a derivation: two in 3D (±x), four in 4D (±x and ±w), a ring round the head.

## The model (`js/octo.js`, no DOM)

- **The arms are TENTACLE's**: `../../tentacle/js/rod.js` gives each one's muscles, strains and shape, built from its own
  root and frame (`build(d, strains, x0, F0)`).
- **One solve**: `../../tentacle/js/dyn.js` takes the eight as one rod of eight **chains** laid end to end
  (`makeRod(…, { chains })`). Nothing joins the end of one arm to the start of the next. Every window, drag tangent and
  contact check stays inside its own chain, except contact between arms, which is the point.
- **Contact**: arm against arm (segment against segment in d dimensions), and every node against the head (a ball of
  0.42 m) and the mantle (a round cone), the `solids`. The first eight nodes of each arm root inside the head, crowded
  together, so they touch nothing.
- **Tone**: the resting tone is 0.45, plus whatever the muscles do. The sweep is held at 0.9.

### The cost, and what was done about it

One TENTACLE arm cost ~8–9 ms a frame. Most of that was not physics: `build()` ran a matrix exponential that allocated
memory at every step. Eight arms would have been ~70 ms. Now:

- `build()` uses a flat, allocation-free Taylor exponential, and the full step is the half step squared: ~0.4 ms an arm.
- The muscles and shapes are worked out every other frame (`every: 2`). They change slowly, and arms with mass smooth
  them anyway.
- Shape matching runs on every other window (`stride: 2`; windows are 5 nodes wide, so every node is still in two).
- Contact runs every other substep (`contactEvery: 2`), with a precomputed table of which segments can touch anything.
- 6 substeps, not 8.

The result, on the machine this was built on (node, no rendering): **~10 ms a frame in 3D, ~11 ms in 4D, for all eight
arms**. A phone is slower, and drawing eight arms with suckers is ~8× the shader work of one. The page drops substeps and
then resolution when it falls under 40 fps. **It has not been measured on a real phone.**

## The stroke

Drag goes as speed squared. Close the arms fast and the water pushes back hard; open them slowly and it barely resists.
Over a whole stroke the body is pushed away from the side the arms close toward: **up**, ~100 N in 3D. The same
stroke run backwards (close slowly, open fast) pushes it **down**. It's weaker (~15 N), because the shape of the stroke
isn't symmetric either (the arms curl under as they close and spread as they open). In 4D the numbers are 4D units (the
masses are per extra metre): ~8 N up, ~1–2 N down. Compare them with each other, not with 3D.

## Not yet

- **The body is anchored.** It's pushed (the arrow, the stroke's mean) but doesn't move. Letting it swim is next.
- **Suckers don't grip.**
- **No webbing.** In 4D a ring of arms can't hold anything by wrapping round it (a curve slips off in 4D, as TENTACLE's
  knot shows). The membrane between the arms is what would.
- **Arms can overlap by up to ~15%** of their summed radii in the hardest stroke, because contact runs every other
  substep.

## Testing

```bash
node kata/octopus/test/octopus.selftest.mjs   # ~60 s
```

It checks:
- **The roots:** 3D, nearest neighbours 45° away, two each. 4D, 70.53° (cos⁻¹ ⅓), three each, four of them in w = 0.
  Frames orthonormal.
- **Contact:** four seconds of every preset in 3D and 4D. No node inside the head or mantle, and no two arms closer than
  0.8 of their summed radii.
- **The stroke:** in 3D and 4D every stroke after the first pushes the body up, and the stroke backwards pushes it down.
