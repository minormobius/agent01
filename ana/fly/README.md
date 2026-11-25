# FLY — flying over a four-dimensional landscape

`ana.mino.mobi/fly/`. In the vein of the studio's colour cycle (Voxel Space, a 256-colour palette, haze), one dimension up.

## The idea

In 4D the ground is **three-dimensional**: a height h(x, y, z) over a 3D floor, the sky above it in the fourth
direction. You fly over that floor, turning in three ways: left/right (forward toward right), **ana/kata** (forward
toward the floor's third direction) and **swinging** (right toward ana: the slice you see swings round your nose).
Your eyes see the 3D slice through you that holds forward F, right R and up. Inside it the ground is an ordinary
heightmap, and Voxel Space draws it exactly.

## How it works (`js/fly.js`, no DOM)

- **The land**: tileable 3D value noise (each octave's period divides the 8,192 m world, so it wraps) on a 128³ grid
  (64 m): rolling ground plus ridged mountains under a slow mask. `gridHeights` tabulates each octave's lattice cell and
  blend weight per axis, so the build is plain array reads (1 s; it was 6 s calling the noise per node). Sea level is
  the height under which 14% of the land lies, so every world has lakes. Each node keeps its material (deep, water,
  sand, grass, forest, scrub, rock, snow) and the height's gradient.
- **`ground`**: trilinear height and gradient; the material from a nearby node chosen with a jitter hashed from the
  position, so material edges wander instead of following the grid.
- **`render`**: Voxel Space, 480 × 270: per column a ray over the heightmap in your slice, each rise filling the column
  from a 256-colour palette (8 materials × 32 shades). Lit by the **4D normal** (−∇h, 1) against a sun with some of its
  light from ana: slopes facing ana are brighter. A hashed grain (±2 shades) near you, haze with distance. Optional
  **ana tint**: land coloured teal/rose by which way it climbs along your ana.
- **`skyline(d)`**: the skyline of the land a distance d along your ana; the page draws d = ±150 m as the teal and rose
  **ghosts**.
- **`fly`**: the frame (F, R, A) turned by yaw, ana and roll rates and re-orthonormalised; pitch; speed. Within 12 m of
  the ground you're pushed back up (no crashing yet).
- **Beacons** (`course`, `relative`, `inside`): balls of radius 70 m hung 150–450 m above the ground along a course.
  `relative` gives a beacon's ahead, right, ana and up (the short way round the wrapping floor).

## The page (`js/main.js`)

The overlay: ghosts; beacons as the **slice** of their ball (a disc of radius √(r² − ana²) when within r of your slice,
a dashed teal/rose ring when not, no occlusion by the land yet); an arrow to the next beacon when it's off screen; the
**ana gauge** (how far ana/kata the next beacon is, ±600 m). The **map**: the 3D floor 4 km round you (the peaks, your
track, the beacons, your F/R/A arrows, and the square of the plane you see), drag to turn. Controls: the stick (pad),
the ana/kata lever, the swing buttons; keys arrows, A/D, Q/E, W/S.

## Checks

`node ana/fly/test/fly.selftest.mjs` (~1.5 s): the land wraps, the fast grid equals the noise, the ground is continuous,
14% sea; the shading slope against the noise's true slope (50% mean difference: the 64 m grid misses what varies inside a
cell, but it's the grid's land that is drawn); Voxel Space's skyline within 1 px of a ray marched every metre; the ghost
at 0 m is the view's skyline; 20,000 random steps keep the frame orthonormal and never go under the ground; turning ana
and back is exact; beacons where `relative` says.

## Next: a comprehensible flight path, then dogfighting

What v1 has for the path: the map's track and view plane, the ghosts, the gauge. What it lacks: a predicted path
(where your current turn rates take you in 4D, drawn in the view and on the map); occlusion of beacons by land; a
velocity-vector marker; and for dogfighting, other aircraft as 4D objects whose slices you see, a lead indicator
decomposed into turn and ana-turn, and their tracks on the map.
