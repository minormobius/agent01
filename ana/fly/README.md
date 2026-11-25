# FLY — flying over a four-dimensional planet

`ana.mino.mobi/fly/`. In the vein of the studio's colour cycle (Voxel Space, a palette, haze), one dimension up.

## The planet

In 4D the ground is **three-dimensional**. Here it is the surface of a 4-ball, the 3-sphere S³, 8,192 m round (radius
R0 ≈ 1304 m): a point of the ground is a unit 4-vector X (times R0 + its height), and up is X. Fly straight and you are
home after one great circle, whichever way you set off.

You turn three ways on the ground: left/right (forward toward right), **ana/kata** (forward toward the ground's third
direction) and **swing** (right toward ana). Your eyes see the 3D slice through you that holds forward F, right R and up
X. That slice passes through the planet's centre, so in it the ground is an ordinary planet with hills, and Voxel Space
draws it exactly: each column follows the great circle its ray runs along.

On a planet this small the horizon at a few hundred metres is 30–40° below level; looking straight out you'd see only
sky. The camera looks down by 0.8 of the dip (`tilt`). The sun is a fixed 4D direction: one side of the planet is day,
the other night.

## How it works (`js/fly.js`, no DOM)

- **The land**: 4D value noise sampled on the sphere (no seams anywhere): rolling ground, ridged mountains under a slow
  mask. Each (frequency, seed) lattice is hashed once into a table (`table`, resolved once per seed: looking it up by
  string key per call cost more than the noise). Kept on **eight 56³ grids, one per cell of a tesseract** (the 4D cube
  map): a point belongs to the cell of its largest coordinate, and its other three divided by that one place it in the
  grid (`locate`, `nodeDir`). Sea level at the 14th percentile. Each node keeps its material and the height's gradient, a
  tangent 4-vector solved from the grid neighbours (3 × 3, Cramer, no allocations). Built in ~2.3 s.
- **`surface`**: just the height (land, sea, roofs): what the march needs at every step. **`ground`**: height,
  gradient, material (jittered), building: only for pixels that get drawn.
- **Cities**: `packages/morph` (the studio's city series: streets, plots, seven centuries of buildings), vendored byte
  for byte in `vendor/morph/` (geom, morph, rand; `scripts/sync-dataviz.mjs` keeps them so). Two cities on low dry
  ground, ≥ 1.4 rad apart, the land under each levelled. A plan is flat and the ground is 3D, so a city is the plan
  laid in **7 layers across the third direction e3, 64 m apart**: in layer k, building b stands with depth ±(√area/2,
  5–22 m) if a hash keeps it (all in the plan's own layer), its height scaled 0.6–1.4. `buildingAt`: gnomonic
  coordinates at the city's centre, a 2 m raster of building ids, then the layer test.
- **`render`**: per column, ray angle φ along the great circle of X and u = (F + sR)/|F + sR|: the ground point X cos φ +
  u sin φ at radius r = R0 + h is forward r sin φ / |F + sR|, up r cos φ − (R0 + alt). Palette 16 materials × 16 shades
  (8 natural, 7 building styles, window glass); lit by the 4D normal against the sun; **facades** per row: the row's
  height on the building gives the storey, windows in bays.
- **`skyline(d)`**: the same from X turned toward A by d / R0 (the ghosts at ±150 m), with the view's own step sizes
  (coarser ones jumped over towers and missed by 25 px).
- **`fly`**: moving is a turn of X toward F by distance / radius; X and F turn together, R and A stay put, which carries
  your heading over the curve without twisting it. Turns in the tangent space; Gram–Schmidt each step.
- **Beacons** (`course`, `relative`, `inside`): balls of 40 m, 40–120 m up; `relative` is the straight 4D line in your
  ahead, right, ana, up. **`local`**: the log map at you, for the map.

## The page (`js/main.js`)

The view (pixelated), the overlay (ghosts, beacon slices, the ana gauge, HUD), and the map: the ground round you laid
flat from where you are (forward up the map, right and ana across), 3 km across, with peaks, cities, your track,
beacons and the square of your view plane. ~2.3 s to build, ~28 fps in a headless browser.

## Checks

`node ana/fly/test/fly.selftest.mjs` (~5 s): the vendored morph is byte-identical; the tesseract map round-trips and
the ground is continuous across its faces; the grids hold the noise; 14% sea; two cities, far apart, ~24% built in a
plan's own layer, level ground; the layers; the curved renderer within 1 px of a ray marched every metre along its great
circle; the ghost at 0 m is the view's skyline exactly; the tilt; flying straight comes home after one great circle;
20,000 random steps keep X, F, R, A orthonormal and never under ground or roof; beacons where the HUD says.

## Next

A predicted path (where your turn rates take you, in the view and on the map), a velocity marker, land and buildings
hiding beacons; then other aircraft as 4D objects you see only as slices, a lead indicator, dogfighting.
