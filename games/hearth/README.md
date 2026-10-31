# Hearth

A town 3 km across on a world of its own, at `games.mino.mobi/hearth/`. Its
core is a fusion-forged mass that holds you down at a full g and keeps the
lights on; its heat is why everyone lives on the shell. Nothing grows here
and nothing is mined: food, water, steel and people come in through the
rocket port, and what the town makes goes out the same way.

This is the first slice: the orb, its lots, a settlement that grows by
itself, one rocket port, and a renderer good enough that a building's
height reads. The player's tools (transit, more ports, radiators for the
core's heat) come next.

## What a 3 km world is like

With a 1 g core under a 1500 m radius (`js/orb.js`):

| | |
|---|---|
| surface | 28.3 km², a third of Paris inside the Périphérique |
| horizon (standing) | 70 m |
| gravity at the top of a 200 m tower | 0.78 g (it falls as 1/r² from the core) |
| escape speed | 171 m/s |
| a circular orbit at the rooftops | 121 m/s, round once every 78 s |

So the horizon is close and the towers lean away from each other (every
wall is pushed straight out from the core), and launching is cheap.

## The settlement (`js/sim.js`)

The ground is a spherical Voronoi diagram from Orb's `sphere.js` (3000
cells, Lloyd-relaxed): every cell is a lot of about 9400 m², every cell
boundary a street. A year:

1. **Reach.** Each lot's access is everyone it can walk to, weighted by the
   walk (exp(−t/9 min), at 80 m a minute with a 1.25 detour), plus the
   port's pull. It is the land value.
2. **How big the town can be.** Strictly import and export: every person's
   food and water comes through the port, and so does everything their jobs
   make on its way out, so the **port** sets how many people the town can
   hold. One pad grows logistically from 9k toward 800k. (The first version
   let access alone set heights: more building raised access, which raised
   heights, and the town ran to four million people in towers on every lot.)
3. **Where it stands.** That many people need so much floor (45 m² a person,
   30 m² a job, a job for every second person), shared between the lots by
   land value, access^3.5 ±35% lot to lot: the size comes from the port, the
   skyline from access. Each lot is capped by the structure (90 floors) and by
   the pad's clearance (launches need clear sky: past the 170 m apron a
   building may rise 0.42 m for every metre from the pad), so the skyline has
   a crater round the port and its towers stand in a ring beyond it.
4. **Building.** Floors are imported steel too; the lots furthest below their
   target, weighted by access, build first, a floor or two a year.
5. **Uses.** Offices where access is highest, industry round the port, homes
   everywhere else.

Measured on world 7: 64k people at year 40, 376k at 80, 644k at 140, the
tallest building 57 floors at year 80; the best-reached tenth of built lots
average 22 floors to the bottom half's 1.8 (the selftest pins that height
follows reach).

## The renderer (`js/render.js`, `js/geometry.js`)

Ecumene's buildings were drawn flat with a fake extrusion and never read as
height. Hearth is WebGL2 throughout:

- **A perspective camera** that orbits the planet: one finger slides the view
  over the sphere (carrying the heading along, so it never flips at a pole),
  two pinch, twist and tilt from straight down to near the horizon.
- **Massing.** A lot is not one building. Its plate (the cell inset by half
  a 14 m street) is cut into parcels, each its own building: a row of houses
  (up to 3 floors), a perimeter block of three or four buildings of different
  heights round a courtyard with alleys between (up to 10), or a podium ring
  with a tower rising from the courtyard, a narrower crown on the tallest and
  a plant room on top. (One prism per lot, the first try, read as a field of
  hexagonal crystals.) Polygons are wound counter-clockwise from outside, so
  every wall's outward normal is (edge × up), courtyard walls included; the
  selftest checks that every street wall faces the street.
- **Shadows.** The sun's depth map is drawn each frame in an orthographic box
  round what you're looking at (tight up close, the whole orb from afar) and
  deep enough to hold the whole planet, so the night side falls in the
  planet's own shadow. 3×3 PCF, normal offset, a slope-scaled polygon offset.
- **Facades** from the walls' own coordinates (metres along, metres up):
  homes in render, brick, limewash and terracotta with punched windows;
  offices in tinted curtain-wall glass (blue, green, bronze, silver) between
  mullions; industry in concrete with strip windows; a shopfront at street
  level; blinds window by window. Where a window is under a pixel the pattern
  fades to its average instead of shimmering.
- **The sky** is black (a world this small holds no air: escape speed is
  171 m/s), with stars and the sun. The sun goes round once every four
  minutes, so shadows sweep and the night side lights up, room by room up
  close and as a glow from afar.
- **The ground** is a fan per lot whose triangles carry their distance to
  the street, so streets, kerbs, the port's pad rings and the parks are drawn
  without extra geometry.
- The worker builds the triangles each year (100 ms late in the game, a
  stutter on the main thread) and hands them over without a copy.

Two bugs worth knowing about. Roofs speckled at oblique angles, and it
wasn't shadows, depth precision, multisampling or overlapping geometry
(each ruled out in turn): a parcel's seed was an interpolated varying, and
the `fract(sin(x)·43758)` hash of a seed off by 10⁻⁶ jumped pixel to pixel.
Parcel attributes are `flat` now. And the near plane was 0.5 m, which a
16-bit depth buffer can't afford; it is 4% of the camera's distance now.

## Next

- **Transit**: lines and stops from Ecumene's sim (gravity demand, mode share
  against walking, assignment), with vertical trips in the towers.
- **Ports** the player builds: each one raises what the town can import and
  carves its own clearance crater; and freight between the ports and the
  buildings on the network.
- **Heat**: the core's power is free but its waste heat must be radiated from
  the surface, so radiator fields compete with buildings for lots.
- A century, scored as Ecumene's is.

## Files

| file | what |
|---|---|
| `js/orb.js` | the world: R, lots, the port, tiers, gravity at height |
| `js/sim.js` | the settlement, a year at a time |
| `js/geometry.js` | lots and floors → triangles (pure, testable) |
| `js/render.js` | WebGL2: camera, shadows, facades, sky |
| `js/worker.js` | runs the settlement and builds the triangles |
| `js/main.js` | the page: gestures, the sun, the panels |
| `test/hearth.selftest.mjs` | `node games/hearth/test/hearth.selftest.mjs` (~7 s) |

Borrows `../orb/js/prng.js` and `sphere.js`, so a change there is checked by
this selftest too.
