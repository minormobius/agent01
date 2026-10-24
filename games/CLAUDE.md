# games — games.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Multiplayer party games for Bluesky, with real-time rooms orchestrated by Durable Objects.

## Facts

| | |
|---|---|
| Surface | `games` |
| Dir | `games/` |
| Endpoint | `games.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/minesweeper-voronoi-mesh-4hc4ir` |
| Deploy | `.github/workflows/deploy-games.yml` |
| Uses | `auth.mino.mobi` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "games"`.

## How it works

These live here:

- **the arcade at `/`** — `index.html` + `arcade/arcade.{css,js}`: a wall of
  cabinets, one per game, each playing a 7-second attract loop of real play
  from `arcade/clips/<id>.{mp4,webm,jpg}`. The list of cabinets (name, genre,
  colour, lines) is `GAMES` in `arcade/arcade.js`; a new game needs an entry
  there **and** a clip. Clips are recorded by `tools/attract.mjs` (playwright +
  ffmpeg; each game has a little `setup`/`play` script there) against a local
  `python3 -m http.server 8765` in `games/`: `node tools/attract.mjs <id>`.
  A game too heavy for the recorder's software GL films in time-lapse: its
  entry's `slow(p)` measures how many times slower than real time it runs
  with a fixed step a frame (PLATEAU's `?dt=24`), and ffmpeg speeds it back up.
  The page fetches each clip whole and plays it from a blob URL, because the
  asset host answers a Range request with a 200 and the whole file, which
  Safari won't play from; WebM is there for browsers built without H.264.
  `tools/` is `.assetsignore`d. `BOARDS` there marks the cabinets with a
  global leaderboard (a 🏆 on the cabinet); keep it in step.
- **leaderboards** — every game with a board mounts Orb's portable kit
  (`orb/js/board-kit.js`, `mountBoard`): records are
  `com.minomobi.lab.score` in each player's own repo, read back live. Each
  game has `js/score.js` (no imports: the record builder and a strict
  `accept()` that refuses what the game's own rules make impossible, its
  constants cross-checked against the source in that game's selftest) and
  `js/board.js` (mounts it, fires `<game>-board` so the 🏆 and post buttons
  appear only once it loads). Boards: molt, tessera, orb (its own older
  board), fathom, oneside, twelve, horde, telegraph, ratchet, outbound,
  switchboard, tempest, ziggurat, plateau. None yet: naught, strand, skein, bucky, onecoast,
  ecumene, hearth. The kit's overlay sits at z-index 60, over every game's
  own overlays. Bump a game's score `VERSION` whenever its rules change what
  a number means.
- **the party platform**, also at `/` (the panel under the wall) — phone+TV,
  OAuth rooms, `RoomCoordinator` DO. Games are markdown in `games/games/`,
  compiled by `engine/runtime.js`; the catalogue is the hand-maintained
  `games/index.json` (the ASSETS binding exposes no directory listing).
- **The Ludographer at `/gen/`** — a borges-shaped procedural board-game
  catalogue (seed n -> a complete, coherent, deterministic board game: theme,
  board, mechanics, components, rulebook, win condition, twist).
- **Hold the Line at `/horde/`** — a one-thumb horde-defence game: six arcs, a
  gun that overheats, and a timed upgrade choice after every wave. Seeded, so
  `?seed=` is a permalink to a run. See [`horde/README.md`](horde/README.md).
- **Telegraph at `/telegraph/`** — a perfect-information tactics puzzle: every
  enemy shows the tile it will hit, and you never have enough actions. Its
  companion piece to `/horde/`, built from the opposite direction — no clock, no
  hidden state, so a turn can be searched exhaustively and the game can tell you
  how many of your options were right. See
  [`telegraph/README.md`](telegraph/README.md).
- **The Ratchet at `/ratchet/`** — a road crossed once with single-use tools.
  Third in the family; its solver answers "does any future still complete this
  road" after every choice and stays silent until the run ends, then names the
  move that actually killed it. See [`ratchet/README.md`](ratchet/README.md).
- **Switchboard at `/switchboard/`** — six lines, one operator, and a shift
  visible in full before the clock starts. The family's real-time game WITH an
  exact optimum: the shift is a scheduling problem, so a bitmask DP gives the
  best possible board and the shortfall is denominated in points. See
  [`switchboard/README.md`](switchboard/README.md).
- **Outbound at `/outbound/`** — The Ratchet rebuilt around a body, set in the
  Europan ice war of the twenty-fourth century: the tools are a named crew,
  spending one is a person going outside into Jupiter's radiation belt, and two
  trips is all anyone has in them. The setting is load-bearing — it gives the
  central number a physical cause instead of an abstract one. Same solver, same perfect information —
  what changed is that the resource has a name and the run leaves a log you can
  scroll back through. Its `rest` action is the one move that could have made
  the state graph cyclic; the selftest walks ~22k reachable states to prove it
  did not. See [`outbound/README.md`](outbound/README.md).
- **Tempest at `/tempest/`** — a Tempest whose levels are *proved before they
  ship*. Sixth in the family and the first written in **Rust**: the engine,
  the exact solver and the generator live in
  [`tempest/core/`](tempest/core/) and compile to a committed 64 KB
  `tempest.wasm`. Every wave in `levels.json` carries a certificate — a play
  that holds the rim, from **every lane** the previous wave could have left you
  in — and the difficulty curve is a band on a measured quantity (ticks of
  slack), not a set of knobs. Its readout is the family's newest shape of
  correctness: a *direction*, priced in ticks. See
  [`tempest/README.md`](tempest/README.md).
- **Orb at `/orb/`**: Minesweeper on a sphere of Voronoi cells (convex hull =
  spherical Delaunay; Lloyd-relaxed, then sites nudged until no wall is under a
  quarter of the median: `evenWalls`, opt-in, so Strand's meshes are untouched). An irregular mesh is measurably *less*
  guess-free than a regular one, so every board is proved solvable by an exact
  solver from the first tap before it ships. The readout counts the moves that
  weren't certain when you made them. Also on a projective plane (antipodal
  pairs of sphere cells, `buildProjective`), and on a Voronoi torus and a Klein
  bottle (`js/torus.js`: Voronoi diagrams of the flat torus and of the flat
  Klein bottle, whose gluing flips; drawn as a donut, the Clifford torus (4D,
  stereographically projected) or the classic bottle, all with a skin that
  slides under a fixed cursor, or as the exact flat map), and on a double torus
  (`js/hyper.js`: genus 2, so hyperbolic; a Voronoi diagram of the 45° octagon,
  scrolled through the Poincaré disk, or bent onto a pretzel in 3D by
  `js/pretzel.js`, a harmonic map built on the Bolza surface's hyperelliptic
  symmetry). Canvas 2D, no build. See [`orb/README.md`](orb/README.md).
- **Fathom at `/fathom/`**: Minesweeper in 3D. Sea mines in nested shells of
  Voronoi cells (each shell Orb's `buildMesh`); a number counts its ring and
  every cell it overlaps on the shells just above and below (bricks, ~10
  neighbours), so information crosses the layers. Zeros flood within their
  own shell, the water is denser with depth, and the goal is to dive to the
  core (or clear it all). Drawn as a perspective cutaway: pinch through the
  shells, look down through opened cells. Plays with Orb's rules, solver and
  no-guess generator unchanged (`mesh.flood` and `mesh.weight` are opt-in
  hooks there). See [`fathom/README.md`](fathom/README.md).
- **One Side at `/oneside/`**: a maze chase on a Möbius strip. The maze is
  painted on the strip's double cover (both faces of the paper: a band twice
  as long, `back(x, y) = (x + L, H − 1 − y)`). The ghosts walk the maze on the
  other side of the paper: bound by the maze half a strip away, targeting
  through the twist, catching you through the paper; you see them glide
  through your walls along its faint rails. And there's only one side: walk
  half a strip and you're on their maze. Arcade ghost minds; a 3D band view.
  See [`oneside/README.md`](oneside/README.md).
- **Bucky at `/bucky/`**: logic gates on C60. Every atom has three bonds,
  which is exactly a two-in, one-out gate or a one-in, two-out splitter.
  Arrows that meet join, and a join is an OR (so no OR part); the rules are
  the ball's and the same on every level, never there to block one answer.
  Synchronous, one tick per atom, so loops are delay lines and a NOT in a
  pentagon is a clock. Twelve levels from a wire to an SR latch and a
  three-sensor boot; every edit re-runs the level's truth table. Par is the
  fewest parts a randomized router found (`tools/bake.mjs` → `js/par.js`),
  re-checked by the selftest. See [`bucky/README.md`](bucky/README.md).
- **Ecumene at `/ecumene/`**: a transit game on a small planet from mappa's
  engine (`js/mappa-engine.js`, a byte-identical copy; the selftest fails on
  drift). Towns grow where the water is; each year a Dijkstra per settled
  zone over roads and the player's lines gives gravity demand, logit mode
  share, and transit trips assigned to ride segments, so every line knows
  its load and strands what it can't carry. A zone's ceiling scales with
  its reach (access to jobs) and its water, so a line grows the city along
  it, which the selftest measures with a counterfactual on three worlds (+21% on average). Dense
  zones split and the spherical Voronoi is rebuilt (`ORB.voronoi`, now
  exposed by `orb/js/sphere.js`). The sim runs in a module worker; it names
  its towns and keeps a log of events. Commodities (`js/freight.js`): food grown
  on open country and ore mined at geology-placed deposits, traded between
  towns through a market: a price per town, found by successive averages,
  goods flowing by road, ship or the player's freight wagons to where they
  net the most, and a toll on a full line that is its margin; dear food
  draws farmers, a hungry city stops growing, dear food pays for better farms
  (know-how per town, faster with ore, spread by trade and faster by rail), and the selftest measures a
  freight line feeding one and the prices' no-arbitrage condition. The economy is ramped (a charter round your home
  city, widened by riders and a fee; prices that follow the world's wealth;
  dearer building in dense cities; a levy on fares; ships for coastal
  freight) and measured by `test/economy.mjs`. Farmers live on the land (their numbers set by
  what it yields, falling as farms mechanize) and the countryside empties into
  the cities. The ground is WebGL (`js/gl.js`: biomes blended across tiles,
  lit relief, a shaded sea; `?gl=0` falls back to 2D), rivers follow district
  boundaries and end at the coast, and deep zoom shows a city's blocks and
  buildings. Lines are shaped as you go: build from either end, stops put in
  on the track, loops (no turnbacks), and interchanges where two lines share a
  stop (a quick change, and jobs gather there). A run is a century
  (1900–2000) scored by the hours its trains give back against the road,
  with a report against the same planet run without a railway in a second
  worker; track grades cap how closely trains follow (single, double,
  electric, rapid), and from 1912 the car speeds up the roads. See
  [`ecumene/README.md`](ecumene/README.md).
- **Hearth at `/hearth/`**: a town 3 km across on a world of its own, held
  down by a fusion core at 1 g (a 70 m horizon; 0.78 g at the top of a 200 m
  tower). Strictly import and export: the rocket port sets how many people the
  town can hold, land value (walking access) shares out the floor, and the pad's
  launch clearance carves a crater in the skyline. 3000 Voronoi lots from Orb's
  `sphere.js`. Drawn in WebGL2 (`js/render.js`): a perspective camera that
  orbits the planet, sun shadows from a shadow map holding the whole planet,
  facades from the walls' own metres, lots cut into parcels (houses, courtyard
  blocks, podium and tower), a black sky and a night side that lights up. The
  worker builds the triangles. First slice: transit, ports to build and the
  core's heat come next. See [`hearth/README.md`](hearth/README.md).
- **Tessera at `/tessera/`**: a snake on a tiling that changes shape, a
  prototype. The board cycles hexagons ↗ → squares → hexagons ↘ → squares on
  a visible clock (36 ticks each, the change in one tick); when the corners
  close, the snake is cut at its first diagonal joint and the rest falls off
  as pellets (length is conserved through the cut). Drawn on a real torus
  (24 × 10) through Orb's `TorusCam` (`../orb/js/torus.js`): the skin slides
  so the head always faces you, and a flat wrapped map is one tap away. The
  snake selftest checks the parts of `TorusCam` it uses. Leaderboards
  through Orb's `board-kit.js`: today's daily (one seed for everyone per UTC
  day) and open play, each by score and by longest snake (a run posts both
  records), as `com.minomobi.lab.score` records in the player's repo,
  refusing the impossible (`js/score.js`). The kit's sign-in field suggests
  handles (`handleTypeahead`: the shared `packages/oauth-client/typeahead.js`,
  vendored into `games/lib/` with `auth.js` by the deploy). `js/snake.js` is the
  game with no DOM. The tiling underneath (`js/tiling.js`) is a fixed square
  lattice whose corners split: every wall is one curve owned by the wall, so
  coverage holds by construction. `lab.html` checks the laws live (Euler,
  1/f̄ + 1/v̄ = 1/2, area as a flux, walls that never cross). See
  [`tessera/README.md`](tessera/README.md).
- **Molt at `/molt/`**: snake on the snake. The world is the surface of a
  snake's body made of cubes (one per body cell, every face a 3 × 3 grid),
  built from the body's word of turns alone (`js/duct.js`; yaw S/L/R about
  the snake's up and pitch U/D over the folds of the world it lay on, so a
  body that wrapped round a tube comes back as a ring): always a sphere,
  C²(4L + 2) cells whatever the shape, every cell a square with 4
  neighbours, the curvature at the cube corners (3 squares meet outside a
  bend, 5 inside). Arcade rules: at 8 + depth long you molt automatically
  (your body becomes the next world), each world a step is 5% quicker, and a
  1:00 clock gains 10 s a food (game time, so it's in the rules and the selftest).
  Drawn as a smooth tube (every point pushed onto a circle round the
  body's centreline; watertight, checked), a camera riding above the head
  whose up turns with the snake's straight lines so arrows and swipes stay
  classic; a minimap of the whole world; the surface unfolded flat (a cube's
  net) is a toggle. The molt dives into the head and shows the new world whole.
  Food about: 2, then 3 from level 3 and one more every third level (`foodAt`).
  Leaderboards (v3) for score and deepest molt through Orb's board kit (a run
  posts both; `js/score.js` refuses the impossible, clock included). `ouro.html` is
  a lab for the fully recursive version (`js/ouro.js`): the world is your body
  live, one cube per cell of you, your turns bending it every step. Every
  "same place" rule is a toggle; measured, the ground must be the skin (space
  falls away three times faster than you walk), and the body must be re-laid
  by its own turns rather than carried cell by cell (1.6 cuts per 100 steps
  against 14). `cascade.html` zooms forever into snake on snake on snake: every
  layer is the same game, its tube swept from the world's skin in tube
  coordinates (`js/cascade.js`; layer 0 is Molt's tube exactly, each next one a
  third the size on the last one's back, the heads closing in at about a third a layer, every layer slithering continuously along its own path),
  and the zoom loops a layer at a time. `compute.html` runs a tag system on the
  snake's own body (`js/tag.js`: the word is the tape, moves write at the head
  and delete at the tail, the program reads the tail; De Mol's Collatz system):
  exact in a quiet world (a ghost to itself), noisy in the real one, where the
  tape's own bends knock the snake into itself. See [`molt/README.md`](molt/README.md).
- **Naught at `/naught/`**: noughts and crosses on the n-dimensional torus
  (ℤ₃)ⁿ, n = 2 … 6 (9 to 729 cells). Three cells are a line exactly when they
  sum to zero mod 3, so any two cells lie on one line whose third is −(a + b):
  `js/group.js` precomputes that table and everything is lookups in it. One
  board, three views: nested wrapping grids, cards whose attributes are the
  coordinates, and a donut (Orb's `TorusCam`) for any 2-dimensional slice.
  "Make a line" is a race the first player wins by move 7 from n = 3 (every
  pair is a threat); "avoid a line" (misère: each side building a cap under
  pressure) is the deep game; the cap puzzle is the research problem (caps
  2, 4, 9, 20, 45, 112). Selftest: the zero-sum rule against brute force, no
  draws, both 3 × 3 games solved, the engine. See [`naught/README.md`](naught/README.md).
- **Ziggurat at `/ziggurat/`**: the hopping-pyramid arcade game one dimension
  up. The top of a staircase of tesseracts is a tetrahedral pile of cubes
  ((a, b, c) ≥ 0, a + b + c ≤ N − 1; six hops ±a ±b ±c), and every slice of it is
  an ordinary pyramid one smaller each step in, so it's drawn as N pyramids side
  by side: four hops round a pyramid, two to the same spot on the next. Which
  axis it's sliced along is a view choice (T turns it; cubes glide between
  pyramids), never the game. Red balls, a coil that hatches at the bottom and
  chases by hop distance, discs that lure it off, green freeze, a cyan reverter;
  colour rules by level as the classic. `js/zig.js` is the game with no DOM and
  an `autopilot()` (the selftest's player and the attract loop's). Leaderboard
  through Orb's board kit. See [`ziggurat/README.md`](ziggurat/README.md).
- **Anakata at `/anakata/`**: a puzzle game in four spatial dimensions. Walk
  in x and y (z up), see w only by turning your sight (three frames: x·y,
  x·w, w·y, each a right-handed frame of x-y-w, turned by quaternion slerp so
  the slice sweeps through 4D), and cross w only with the hook (fires along
  any visible axis, ≤ 6 cells: an anchor pulls you, a crate comes to you).
  Crates, plates and doors; a state is you + the crates, so `World.solve` is
  an exact BFS. `js/render.js` ray-traces the 4D grid in one WebGL2 shader
  (4D DDA through a `X × Y × (Z·W)` texture; crates and you as 4D box/ball;
  neighbouring slices ghosted; tint by slice). Levels are text in
  `js/levels.js`; the selftest pins every par and proves the `needsW` ones
  impossible without w. `js/gen.js` generates rooms (easy/medium/hard) kept
  only when proved solvable, impossible without w and in band; a sound cheap
  pre-check (`World.relaxedReach`: you alone, crates granted for free) does
  most of the rejecting. Every room's link IS the room (`?room=CODE`,
  run-length + base64url; "B" codes now, "A" codes from before ramps still
  read), so shares survive generator changes; `?daily` is a hard room seeded
  by the date; rooms build in a Web Worker (`js/gen-worker.js`). **Ramps**
  (`> < v ^` in level text): on a ramp, the floor continues one slice over, so
  walking off one carries you a slice along w (`World.rampStep`); crates
  don't take them; `solveFlat` treats them as plain floor for the needs-w
  proof. **Wrapped w** (`wrap: true`; "C" codes): slice W−1 neighbours slice 0
  in the neighbour table, so ramps climb for ever and the hook flies round;
  the shader reads cells mod W and repeats the room along w. Fourteen
  onboarding levels, walk → penrose → downhill → round → behind. See
  [`anakata/README.md`](anakata/README.md).
- **Anabasis at `/anabasis/`**: Anakata's engine with w made a second down
  (`gravW: true` on a world; "D"/"E" room codes, without/with wrap). Things
  settle along −z then −w; you rest only where held from below *and* kata
  (kata: a block, or a ramp under you, `World.resting`/`onRamp`). Gravity
  takes you kata; only a ramp takes you ana: you climb steps in z only, and
  a block in your slice is in your way (an earlier version climbed blocks
  ana; it looked like walking into dissolving walls, and broke the thesis).
  Off the kata end you fall
  out, and round a wrapped w with nothing to land on you fall for ever (both
  lose). The page (`anabasis/js/main.js`) imports `../../anakata/js/` for
  the world, codes and renderer: one engine, two cabinets. Views keep x and
  rotate y-z-w: z up, w up, or (x, w) across with z up; the renderer takes
  `Ez` (which way is up), a sky, and two cutaways (`ceil`, `cut`) so a
  wrapped w drawn upward isn't a tower the camera is buried in. Walking
  only, no hook yet (the selftest proves the hook would save nothing).
  Seven levels, held → slip → around → stair → bridge → plumb → ascending (a
  Penrose staircase of ramps round a wrapped w), each proved impossible
  without what it's about. `anabasis/js/gen.js` builds rooms round a
  **spine** (a self-avoiding path with a height profile in w: ramps at its
  rises, slips at its drops, crate-filled dips), the rest of the room walls
  and holes relative to it; kept only when proved solvable walking, in band,
  impossible without its ramps (and its crates, mostly); `?room=` (D codes),
  `?daily`, `?gen=tier.seed`, built in a worker; made rooms open with w up. See
  [`anabasis/README.md`](anabasis/README.md). **Changing `anakata/js/world.js`,
  `gen.js` or `render.js` changes both games: run both selftests.**
- **Hinton at `/hinton/`**: Anakata's and Anabasis's rooms in first person,
  as two lanes of one cabinet (the same levels, generators, dailies, pars;
  a room code's letter gives its lane). `hinton/js/walker.js` (no DOM) moves
  you continuously in x and y but asks `World.act` at every cell boundary:
  blocked → stopped `R` short; a step/push/fall commits when your centre
  crosses, then you land under gravity; a climb or ramp step commits at once
  and glides; the hook pulls you along its line. One rules move per cell
  crossed, so the selftest walks every level of both lanes along the
  solver's solution and requires par and the solver's state after each move.
  The camera sits behind your eyes in the lane's frame (sight turns as in
  each game); the renderer's `hideYou` and `ghostNear` keep your own ball
  and the solid slice kata of you out of your face. A w strip on the HUD
  shows the slices where you stand and ahead. See
  [`hinton/README.md`](hinton/README.md).
- **Foam⁴ at `/foam4/`**: an understanding toy, not a game (no arcade cabinet):
  a 4D Voronoi foam seen one 3D slice at a time. Four species at unit
  density, random (jittered Z⁴, jitter ≤ 0.5 so the 80 surrounding seeds are
  exactly the possible neighbours), A₄* (permutohedra: the 4D Kelvin foam),
  D₄ (24-cells), Z⁴ (tesseracts). `foam4/js/foam.js` (no DOM) has the exact
  slice: each cell clipped from the box by its bisectors in slice coordinates
  (a power diagram: a seed h off the slice carries h²), run in a worker; the
  shader steps rays membrane to membrane. Sweep and tilt the slice; births,
  deaths and flips are counted exactly between successive slices. PLATEAU
  borrows its `clip` and `boxPoly`, so run both selftests after a change there. See
  [`foam4/README.md`](foam4/README.md).
- **Lumen⁴ at `/lumen4/`**: an understanding toy (no cabinet): light in
  four dimensions beside our own, 3D warm and 4D ice. `lumen4/js/optics.js`
  (no DOM) has falloff by codimension (1/r^(n−k−1)), Gaussian beams (a laser
  is a line; on axis (w₀/w)^(n−1)), the flash (u₃ = f(t−r)/4πr; u₂ and u₄
  as η-integrals, u₄ = (1/4π²r)∫cosh η f′(t − r cosh η)dη: a negative wake,
  no Huygens in even n), round-hole diffraction ((2J₁/x)² vs (3j₁/x)², first
  dark 1.22 vs 1.43 λ/D), Fresnel with n − 1 polarizations (4D glare
  polarized in a plane), Planck in n dimensions (ν^n/(eˣ − 1), T^(n+1),
  colours via CIE), the rainbow cut by a slice (ρ = arccos(cos θ/cos β)),
  and that bow on a flat screen as a conic section (e = sin γ / cos ρ: leaning
  the sun into w turns a hyperbola into a parabola, an ellipse, a point). Who
  moved doesn't matter: with the antisolar direction in your own frame
  (`antisolarInFrame`: sun's lean, turn, twist, look into w), the bow exists iff
  |a_N| ≤ sin θ and e = √(a_R² + a_U²)/cos θ, so looking into w never changes
  its shape.
  The selftest checks each against closed forms, the wave equation itself and
  brute force. See [`lumen4/README.md`](lumen4/README.md).
- **IRIS⁴ at `/iris4/`**: an understanding toy (no cabinet): a rainbow you
  shape, in first person. `iris4/js/world.js` (no DOM) is a 4D heightfield of
  0.25 m tesseract voxels (192 × 192 × 64 cells over x, z, w; periodic value
  noise, lakes), the two-level march (blocks of 8³ skipped on their tallest
  column, cells inside; `march()` is the shader's twin, line for line) and
  walking (0.5 m step-up, slide along cliffs, wrap). The same land grained by
  Kelvin's foam (A₄*) or the 24-cell foam (D₄): Foam⁴'s lattices (imported from
  `../../foam4/js/foam.js`) at 1.4 voxels, a cell solid when its seed is under
  the land, `marchFoam()` walking facet to facet (the ray's facing facets once
  per ray, skips on dilated block maxima + circumradius, the cell kept across
  blocks; the shader's twin), the ground the foam's, no wrap. `js/render.js` shades it
  in a low sun, with fae colours by how far off in w a surface is from you, and
  draws Lumen⁴'s bows (primary and secondary per wavelength, Alexander's band,
  mirrored in the lakes). The page shows the bow's conic from the antisolar
  direction in your camera frame (e = √(a_R² + a_U²)/cos θ, dashed over the
  rendered bow) and a map of it. Layout: the view on the top two thirds, the
  controls below (side by side on wide screens). Imports
  `../../lumen4/js/optics.js` and `../../foam4/js/foam.js`, so run their selftests after a change there. See
  [`iris4/README.md`](iris4/README.md).
- **ATOM⁴ at `/atom4/`**: an understanding toy (no cabinet): the periodic
  table of a 4D world with the potential pinned at 1/r (Gauss's 1/r² has no
  ground state). `atom4/js/atom.js` (no DOM) is the solver: Numerov on a log
  grid with L = l + (d−3)/2, energies by Sturm bisection (stop where h²f/12 >
  ½ or Numerov fakes nodes), Hartree SCF with the sphere-averaged kernel
  (1/max in 3D; k(min/max)/max in 4D, k(1) = 8/3π), and the ground-config
  search. `js/fields.js` is the "rewrite Maxwell" closed forms (1/k³, the
  unitarity bound, ε(k) = ℓk light, the compact dimension). `js/periodic.js`
  is the layout and our real table. `js/table.js` is **generated** by
  `atom4/tools/bake.mjs` (~6 min, worker threads; re-run it after any change
  to `atom.js`, since the selftest recomputes a sample and fails on drift).
  The 3D run gets 34 of 36 configurations right, missing Cr and Cu (no
  exchange). `js/polytopes.js` (no DOM) builds the six regular 4D polytopes
  (edges by least distance, faces as planar cycles, cells from the dual's
  directions), sp^d hybrids and the honeycomb/diamond/darbon's-diamond nets
  (two A_d lattices a bond apart); `js/tile.js` is a small 4D viewer (shadow
  coloured by w, or the 3D slice at w = h; drag turns in 3D or through w;
  draws only while on screen), used for the solids and darbon (element 7) in
  `js/shapes.js`, and meant to grow into the 4D molecular-dynamics view.
  Imports `../../lumen4/js/optics.js` for line colours. See
  [`atom4/README.md`](atom4/README.md).
- **PLATEAU at `/plateau/`**: flight through Foam⁴'s foam, from the
  cockpit. You're a rigid body in 4D (P and R, U, F, N); every turn is a
  double rotation that turns its plane and, by `COUPLING` (0.5) as much, the
  plane perpendicular to it (roll R→U with F→N, so rolling tips your nose
  into w and flying forward drives you through it); pitch and yaw turn the
  nose in a plane tilted `W_TILT` (30°) into w (up-and-ana, right-and-ana),
  since their perpendicular planes don't hold the nose and couldn't move it
  into w. Don't touch the edges
  (the slice's Plateau borders) or a solid cell's walls. `plateau/js/flight.js`
  (no DOM) has the craft, the seeds (`Foam.rand`: five numbers a grid cell, which the shader reads from a 26⁴ texture window round you, refilled a strip at a time),
  the exact in-slice `clearance` (your cell clipped by its bisectors with
  Foam⁴'s `clip`; the cell you're in is never solid) and the phases by
  distance (crystal, melt, clot, press, deep: jitter, solid fraction and
  scale, all continuous), and an `autopilot` (lookahead) that the balance
  report and the attract loop fly. The shader draws each edge as a tube of
  the collision radius from the exact in-face distance to the face's rim.
  Three modes by seed crystal (`MODES`): tesseract (Z⁴, the grid, the
  launch game), kelvin (A₄*: a run opens in Kelvin's truncated octahedra)
  and cell24 (D₄): a seed sits at B (g + ½ + jitter), each basis chosen so
  every neighbour is within one step (D₄ also lists 8 corner contacts), and the
  lattices melt only to 0.2 / 0.25, short of where they'd grow faces two steps
  away (measured; the selftest checks the lists). Leaderboards for distance
  per mode (today's foam and any foam; tesseract keeps its launch board names).
  `foam.html` is the players' page on the phases and crystals. See
  [`plateau/README.md`](plateau/README.md).
- **Katabasis at `/katabasis/`**: a cave in four dimensions, walked in first
  person, on voxels a quarter of your height (body 2 × 4 × 2 × 2 along R, U, F,
  N). Up is quantized, the rest of you isn't: your view turns freely among R,
  F and N (`js/body.js`: `turn` in a plane tilted into w (`TILT` = 45° at full
  lean, so a half turn swings w by 90°); `twist` R toward N; `tidy` keeps up exactly its
  grid axis), you walk where you face, w included, and floors stay exact
  because gravity is always a grid axis. The body is a cube in the three
  directions that aren't up, so facing never changes what you can do: the
  rules' state is box + up. The other verb is the flip, named by the wall
  that becomes your floor (ahead, behind, left, right, ana, kata), found on the
  grid directions nearest your frame (`snap`, `flipUp`); the rules define flips
  as PLATEAU's coupled turn at full coupling, quantized (16 orientations, any
  of 8 ups), and only the up counts. A flip needs a clear 4D ball round your
  centre (radius √7). `katabasis/js/cave.js` (no DOM) has the cave, the moves
  (step along ±R ±F ±N with a one-voxel step-up, fall, flip, `flipToward`),
  `solve` (BFS; `steps: 4` walks only the starting slice) and `fewestFlips`
  (0-1 BFS, par in flips; `noW` never stands on a wall in w), which prove
  each level's par and what it's about (walking, turning, flipping, w); both
  run on `explore`, a layered search over (box, up) at ~10 µs a state. The
  body's flip asks the solver's own `flipFrom`, and the selftest drives the
  body along a par solution of every level (and of made caves) and requires
  the solver's state after every move. `js/gen.js` (no DOM; run in
  `js/gen-worker.js`) makes caves of par 1/2/3 (easy/medium/hard): rooms,
  passages, wall-flush shafts, pillars and, for hard, a loft reachable only by
  falling up a 3-voxel hole (two flips in); one `reach` search gives every
  voxel's fewest flips, and the crystal goes on a voxel at exactly par with
  nothing within a voxel reachable sooner, then the solver re-proves it.
  `?gen=tier.seed36`, `?daily` (hard, seeded by the date), `?level=n`.
  `js/guide.js` (no DOM; run in `js/guide-worker.js`) is the tactical guide
  (✦/H): from where you stand, flips left, the next flip's spot (drawn as a
  gold wisp, an extra light in `Rd.draw`'s `extra`) and the ups that keep you
  on a fewest-flips route from right here ("Flip KATA (Q) here", the pad
  button glowing). Lean into w is a start-screen setting (off/gentle 20°/full
  45°, default gentle); the mouse buttons and wheel twist, X squares up to the
  grid, space goes on to the next cave. The reticle (`reticle()` in
  `js/main.js`, a 2D canvas over the crosshair, V hides it) draws x, y, z, w as
  they lie in your view (depth on a slant), with a ring growing with each
  axis's part in w, up heavy, and a gold mark at the wall a "flip here" lands on.
  Where a flip is legal: fairy rings (`flipFloor` in `js/guide.js`, run in the
  guide worker on every cave and landing, into texture bit 4 by `Rd.rings`)
  light the floor under every flip place for your current up, and the
  reticle's ready ring (`canFlipAt`, the same test as `Body.tryFlip`, which the
  selftest checks) lights when you can flip from where you stand; the flip
  buttons dim when you can't.
  `js/render.js` is a 4D voxel DDA (the cave in a 2D R8UI texture, kind |
  deco << 2) lit by a fae grotto's ray-traced 4D point lights: falloff 1/r³
  (light spreads over a 3-sphere), a shadow ray through the 4D grid per light,
  the 8 nearest a frame, each seen as the 3D cross-section of a 4D ball, so
  lights off your slice in w are dimmer and smaller. `js/grotto.js` (no DOM)
  places the lights and the gemstone and moss; render-only, so every proof
  stands, and the selftest checks it. Levels are recipes (boxes, balls, tubes),
  weathered by `Cave.erode` (rock to air only; re-proved). See
  [`katabasis/README.md`](katabasis/README.md).
- **Strand at `/strand/`**: Flow on a sphere, on C60's atoms and panels and
  on Voronoi spheres, and on the torus (a carbon nanotorus, honeycomb and
  Voronoi tori, drawn with Orb's `torus.js`). Panel levels are carved with walls and bridges by a
  solver until exactly one answer is left; levels are baked
  (`tools/bake.mjs`) into a committed `js/levels.js`, and the selftest
  re-proves each one unique. Borrows `../orb/js/sphere.js` and `torus.js`, so a
  change there is checked by Strand's selftest too. See [`strand/README.md`](strand/README.md).
- **One Coast at `/onecoast/`**: a tile-laying world builder on the icosahedral
  Goldberg spheres (C60–C240). Land/sea sides, free placement with cliffs,
  scored by coastlines (one continent + one ocean = exactly one coast). The bag
  is a generated perfect world, which the selftest proves reachable through the
  rules. The atelier paints worlds freely and exports a token that mappa grows
  into a planet (`mappa/lib/coast-mask.js`; `mappa/lib/onecoast/` holds
  byte-identical copies of `geo.js` and `world.js`, which our selftest checks).
  See [`onecoast/README.md`](onecoast/README.md).
- **Skein at `/skein/`**: a word search wound round a Goldberg sphere (C80,
  C180, C240), in the manner of NYT Strands. Every tile is a letter of exactly one
  theme word, and the theme itself (the span) runs between two antipodal pentagons.
  Boards are generated in the page from a seed, so the daily ball is the date.
  Each board is proved by an exact-cover solver to have exactly one answer, in
  milliseconds. Also on honeycomb tori (32, 72, 128 tiles), where the span runs
  between two tiles half way round both ways; drawn as the flat map or the
  donut with Orb's `torus.js`. Borrows `../onecoast/js/geo.js` and
  `../orb/js/torus.js`. Hints are earned with words
  from `dict/words.txt`, which is derived from `words/dict/enable1.txt` by
  `tools/dict.mjs`; the selftest checks it is current. See
  [`skein/README.md`](skein/README.md).
- **Twelve at `/twelve/`**: 2048 on the buckyballs (C60–C240). A sphere has no
  global "that way" (the hairy ball theorem), so drains replace walls: a move
  picks one and every tile pours toward it. There are two flows. **Gravity**, the
  default, takes the steepest way down; contested cells go to the nearer tile,
  and an aiming preview shows every landing. **Vortex** (C60/C80) turns each
  pentagon into five spiral arms that partition the cells, so each arm is a row
  of 2048. Bigger spheres add drains on the icosahedron's 3-fold axes (C180) or
  2-fold axes (C240), plus rain (one more new tile a move every 100 moves);
  otherwise they're too roomy to ever end. `test/analysis.mjs` measures every
  board and flow against classic 2048 using the same simulator. Borrows
  `../onecoast/js/geo.js`. See [`twelve/README.md`](twelve/README.md).
- **Pressure at `/pressure/`** — the hub for the whole family: the thesis behind
  them, what each one can measure about a decision, and briefs for the two still
  unbuilt. A single hand-written page. Start here before adding another game
  to this family: [`pressure/README.md`](pressure/README.md).

**A game's keyboard handler must not eat what's typed into a field.** The
leaderboard overlay has a handle field, and a handler that `preventDefault`s
its control keys on the page swallows those letters there: Tessera ate `a d`,
One Side `w a s d p`, Orb and Fathom `f`, all of them space. Every handler
starts by returning for events whose target is an input/textarea/select or
contenteditable (and for Ctrl/Cmd/Alt chords), and the board kit's overlay
stops keydown from bubbling out of it, so a new game that mounts the kit is
covered either way.

`/gen/`, `/horde/`, `/telegraph/`, `/ratchet/`, `/switchboard/`, `/outbound/`,
`/tempest/`, `/orb/`, `/fathom/`, `/oneside/`, `/bucky/`, `/ecumene/`, `/hearth/`, `/tessera/`, `/molt/`, `/naught/`, `/ziggurat/`, `/anakata/`, `/anabasis/`, `/hinton/`, `/foam4/`, `/lumen4/`, `/iris4/`, `/atom4/`, `/plateau/`, `/katabasis/`, `/strand/`, `/onecoast/`, `/skein/`, `/twelve/` and `/pressure/` are all **pure
static** (no worker or DO changes) and serve through the existing assets
fallback in `games/worker.js`. That is the pattern to copy for anything new that doesn't need a room: a
directory, its own script tags, no build step.

`/tempest/` is static in the same sense, with one wrinkle worth knowing before
you touch it: its engine is **Rust compiled to wasm and committed**, not built
at deploy time. That keeps `deploy-games.yml` free of a Rust toolchain — the
deploy stays a `wrangler deploy` and nothing else — at the cost of the artefact
being able to drift from its source. `tempest/test/golden.json` closes that:
`cargo test` asserts the Rust reproduces it and the node selftest asserts the
committed wasm does. Rebuild instructions are in
[`tempest/README.md`](tempest/README.md#why-the-wasm-is-committed); the Rust
side also has its own CI at `.github/workflows/tempest-core.yml`, which
deploys nothing.

### Testing the static sub-games

They all carry node tests that need no browser, because their engines are plain
IIFEs attaching to `globalThis` — importing them for side effects is enough:

```bash
node games/horde/test/horde.selftest.mjs         # invariants; preflight runs this
node games/horde/test/balance.mjs 400            # difficulty-curve report
node games/telegraph/test/telegraph.selftest.mjs # invariants; preflight runs this
node games/telegraph/test/analysis.mjs 40        # choice-tightness report
node games/ratchet/test/ratchet.selftest.mjs     # invariants; preflight runs this
node games/ratchet/test/analysis.mjs 40         # difficulty + foresight report
node games/switchboard/test/switchboard.selftest.mjs  # invariants; preflight runs this
node games/switchboard/test/analysis.mjs 40      # shortfall-from-perfect report
node games/outbound/test/outbound.selftest.mjs   # invariants; preflight runs this
node games/outbound/test/analysis.mjs 25         # difficulty + foresight report
node games/outbound/test/sweep.mjs 12            # parameter sweep — slow (~15 min)
node games/tempest/test/tempest.selftest.mjs      # invariants + the wasm drift gate; preflight runs this
node games/orb/test/orb.selftest.mjs             # mesh, solver vs brute force, generator; preflight runs this
node games/orb/test/analysis.mjs 300             # guess-free rate: Voronoi orb vs square/hex grids (~3 s)
node games/fathom/test/fathom.selftest.mjs       # the onion's layers, flood and depth rules, every size proved guess-free
node games/oneside/test/oneside.selftest.mjs     # the surface and its back, the maze, the through-the-paper rules
node games/bucky/test/bucky.selftest.mjs         # C60, the clock's claims, every level's par design passes
node games/bucky/tools/bake.mjs                  # re-bake Bucky's pars (minutes)
node games/ecumene/test/ecumene.selftest.mjs     # mappa copy current, mesh and splits, determinism, crowding, no runaway, the log, a line's reach, the economy's rules, fares, loops and interchanges, track grades, the car, the century's score
node games/ecumene/test/loop.selftest.mjs        # the claim: a line grows the city along it, on three worlds
node games/ecumene/test/market.selftest.mjs      # freight feeding a hungry city, the market's prices and tolls, farms answering the price
node games/ecumene/test/farms.selftest.mjs       # farm know-how: a century on the planet still eats; know-how travels by rail
node games/ecumene/test/economy.mjs 60            # the economy oracle: bots play headless, the money curve per world (~2 min)
node games/hearth/test/hearth.selftest.mjs       # the orb and its lots, the port's limits and clearance, height follows reach, every wall upright and facing its street
node games/tessera/test/tessera.selftest.mjs     # the morphing tiling: Euler, coverage, shared walls, area as a flux, topology changes only at zero length
node games/tessera/test/snake.selftest.mjs       # the snake: the clock, cuts only at pinches, length conserved through a cut, the body always a path
node games/molt/test/molt.selftest.mjs           # body → world: always a sphere, 720° of curvature, C²(4L+2) cells, 4 neighbours each; the game dives 5 deep; the clock and the speed-up
node games/molt/test/ouro.selftest.mjs           # the world is you, live: names carried world to world, the body re-laid by its turns, every rule set's invariants and measured findings (~6 s)
node games/molt/test/cascade.selftest.mjs        # snake on snake on snake: every layer watertight and a third the last, each on the one before, the heads converge, the slithering continuous (~6 s)
node games/molt/test/tag.selftest.mjs            # ouroboros computes: the tag system is Collatz, glyphs never cross, the body spells the machine's tape in a quiet world, the real world's successes pinned (~7 s)
node games/naught/test/naught.selftest.mjs       # (ℤ₃)ⁿ: lines are exactly zero-sum triples, one line per pair, no draws, both 3 × 3 games solved, the engine (<1 s)
node games/ziggurat/test/ziggurat.selftest.mjs   # the pile and its slices, the hops, the colour rules, the enemies and the lure, an autopilot that clears it, the board's records (<1 s)
node games/anakata/test/anakata.selftest.mjs     # the rules on small worlds; every level solved, par pinned, proved impossible without w where it says so; ramps; room codes round-trip, old links still open; generated rooms deterministic, in band, proved to need w; the cheap proof sound (~12 s)
node games/anabasis/test/anabasis.selftest.mjs   # two downs on small worlds (held, slip, no climbing in w, ramps round walls and holding you up, fall out, fall for ever, crates); every level solved walking, par pinned, proved impossible without its gravity / ramps / crates / wrap; generated rooms deterministic, in band, proved, opened from their codes (<1 s)
node games/hinton/test/hinton.selftest.mjs       # every level of both lanes walked continuously to the goal at par, the solver's state after every move; walls stop you short; landing keeps you in your cell (a few s)
node games/foam4/test/foam4.selftest.mjs         # the species (unit covolume, relevant vectors), nearest vs brute force, every slice an exact partition, Plateau's topology in the random foam, A₄* sliced = Kelvin's foam, sweeping back undoes every event (~5 s)
node games/lumen4/test/lumen4.selftest.mjs       # falloff and beams, the flash (each field solves its own wave equation, u₄ from u₂, the wake), Airy vs 3-ball (zeros, Rayleigh, totals), Fresnel and polarizers, Planck (totals, Wien, T⁴/T⁵, colour), both bows against the closed form, the rainbow in a slice vs brute force, the bow on a screen a conic with e = sin γ / cos ρ, and in any frame e = √(a_R² + a_U²)/cos θ (<1 s)
node games/iris4/test/iris4.selftest.mjs         # the land deterministic and seamless, every block's max, the two-level march vs brute force (seams, axes), faces met from outside, walking's step-up and slide; for both foams the circumradius, the facet march vs brute force, the ground straight down, walking; lakes over the foam (~10 s)
node games/atom4/test/atom4.selftest.mjs         # hydrogen exact in 3D and 4D (levels, radius), shells, the kernel k (closed values, series, Monte Carlo), helium vs Hartree–Fock, the baked table complete and reproducible, the 3D run vs our table (only Cr, Cu differ; nobles; ionization), the 4D table's shape, partial screening vs the shell-theorem counterfactual, a neutral atom's far pull, the field theory's closed forms, the six polytopes' f-vectors and cells, simplices and sp³/sp⁴ hybrids, the three diamond nets, no regular 5-cell in a tesseract, chirality by parity, half a turn through w as a mirror, the five-fold rotation (~25 s)
node games/plateau/test/plateau.selftest.mjs     # the craft stays rigid, the coupling tips the nose sin(kθ) into w, seeds vs brute force, the shader's seed window and how far a ray reaches, the clearance a true distance, your cell never solid, the phases continuous, the board's speed limit (~7 s)
node games/plateau/test/pilot.mjs 4 1600         # balance: how far a lookahead autopilot gets, and what kills it (minutes a run)
node games/katabasis/test/katabasis.selftest.mjs # the flips (rotations, every axis turned perpendicular, each onto its named wall, every up reachable), the flip ball, the free view frame (rigid, up fixed, a half turn swings w by twice the tilt, flips land on the named wall from any facing), every level's par the fewest flips and what it's about proved (on foot, turning, w), the game's body along a par solution of every level, made caves deterministic and proved (par, none on foot, needs-w, nothing near the crystal sooner, the body walks one per tier), the guide counting par and naming flips that each leave one fewer, the ready ring agreeing with tryFlip and the fairy rings covering every flip place, the grotto's lights in open air and the cave untouched by it (~25 s)
node games/strand/test/strand.selftest.mjs       # boards, solver vs brute force, every shipped level unique; preflight runs this
node games/strand/tools/bake.mjs                 # re-bake Strand's levels (minutes)
node games/onecoast/test/onecoast.selftest.mjs   # maps, the perfect world is reachable, coast continuity, mappa copies
node games/skein/test/skein.selftest.mjs         # every theme on every sphere: a board, proved one answer; rules; word list current
node games/twelve/test/twelve.selftest.mjs       # drains per board, both flows' invariants, 2048 row cases, rain, the balance claim
node games/twelve/test/analysis.mjs 40           # random/greedy reach, every board and flow, vs classic 2048 (~30 s)
node games/gen/test/smoke.mjs                    # Ludographer coherence sweep
```

Tempest's analysis lives in its Rust crate rather than in a `.mjs`, because the
solver it reports on is the same code the game runs:

```bash
cd games/tempest/core
cargo test                                    # ~90 invariants, ~20s
cargo test -- --ignored                       # the whole curve, every lane — minutes
cargo run --release --bin tempest -- sweep 12 4   # THE BALANCE REPORT (~12 min)
cargo run --release --bin tempest -- audit        # re-derive every promise in the pack
cargo run --release --bin tempest -- level 42 7   # one level and its certificates
```

The analysis reports are built on
[`packages/pressure-lab/`](../packages/pressure-lab/), which owns the parts every
game in this family needs — policy spreads, tightness bands, the
generate-check-repair loop — and encodes as warnings the traps these games fell
into. It is **not** a solver: what "correct" means differs per game, which is the
whole point of the family. Read its README before adding another.

`/outbound/` also carries a **parameter sweep** (`test/sweep.mjs`). Reach for it
rather than tuning by feel: four consecutive changes to that game's numbers each
looked like an improvement and each made the decisions emptier, which only the
sweep showed.

`preflight` picks up `*.selftest.mjs` under any directory this branch touched,
so a change under `games/` runs every one of these selftests automatically. The reports
are *measurements*, not pass/fail — read each after moving any number in that
game's config or generator. They take a minute or so.

The reports do not run in CI. The **selftests** do, via preflight — and
Tempest's is the one that matters most there, because it is the only thing
standing between a stale `tempest.wasm` and a site that silently plays a
different game from the one its certificates describe.

## Deploying

Pushes to `claude/minesweeper-voronoi-mesh-4hc4ir` that touch this surface's paths trigger [`.github/workflows/deploy-games.yml`](../.github/workflows/deploy-games.yml).

Ownership moved here from `claude/procedural-board-games-iFAiZ` when /horde/ was
added, again to `claude/tempest-procgen-game-vwj0f1` when /tempest/ was, and
to `claude/minesweeper-voronoi-mesh-4hc4ir` when /orb/ was (checked with
`scripts/take-ownership.mjs`: every file the old owner shipped had landed) — a
surface has exactly one owning branch (`main` deploys nothing), so whichever branch is
actively shipping this surface holds it. Change it in
[`deploy-registry.json`](../deploy-registry.json), never in the YAML, then
`node scripts/preflight.mjs --fix` to rewrite the trigger.
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
