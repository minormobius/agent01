# KNOTPAC Daydream Doc

Future directions for getting weirder. Come back here when the knots work.

---

## 1. Electrostatic Surfaces

Each surface carries a charge sign (+/-). Player has a charge too.

**Mechanics:**
- Hopf link: surface A is +, surface B is -
- Borromean: +, -, + (or cycle through)
- Player starts + charge
- Near warp points, a radial force pulls/pushes based on charge product
  - Opposite charges: pulled toward the other surface (warp feels like being sucked through)
  - Same charges: repelled (have to fight the current to reach the warp)
- Power pellet inverts player charge (or a dedicated "flip" key)
- Ghost behavior modulated by charge:
  - Same-charge ghosts: aggressive, faster chase
  - Opposite-charge ghosts: confused, slower, take wrong turns

**Shader:**
- Charge tint overlay: + surfaces glow warm (red/gold aura), - surfaces glow cool (blue/violet)
- Player charge shown in HUD (colored border or icon)
- Warp tiles pulse with attraction/repulsion color (warm pull, cool push)

**Implementation:**
- `surface.charge = +1 / -1` field
- `playerCharge = +1 / -1` state
- In `updatePlayer()`, add force vector toward/away from nearest warp point based on `playerCharge * surface.charge`
- In `tryWarp()`, charge affects warp speed/cooldown
- Shader: multiply tintR/G/B by charge-dependent color shift

**Complexity: Medium.** Mostly game logic. Small shader overlay.

---

## 2. Day/Night Rotation

The torus rotates around its axis while you play. Sun stays fixed. Day/night emerges from topology.

**Mechanics:**
- Surface angular velocity: 1 full rotation per ~60 seconds
- Player feels Coriolis-like drift when walking (frame-drag from rotating surface)
- Ghosts speed up in shadow ("night"), slow down in sunlight ("day")
- Pellets glow brighter at night (easier to see, but ghosts are faster)

**Implementation:**
- Add `rotationAngle += angularVelocity * dt` to game loop
- Two options:
  - Rotate the curve buffer each frame (expensive but simple): apply rotation matrix to all curvePoints before upload
  - Rotate sunDir in the opposite direction (cheap): shader sees a moving sun, same visual effect
- For Coriolis: add `omega x v` pseudo-force to player velocity when grounded
  - omega = angular velocity vector (along torus axis)
  - v = player velocity in 3D
  - Effect: walking "forward" causes a slight sideways drift

**Shader:**
- Already has `sunDir` uniform. Just rotate it: `sunDir = rotateY(-rotationAngle) * baseSunDir`
- Shadow areas get darker ambient (0.05 instead of 0.15)
- Night side: ghost point lights brighter (2.0x instead of 1.5x)

**Complexity: Low-Medium.** sunDir rotation is trivial. Coriolis force is a cross product.

---

## 3. Ouroboros Sliding

The knot slides through its own tube. The 3D embedding shifts while UV coords stay fixed.

**Mechanics:**
- Curve parameter offset: `C(t + drift(time))` where drift increases monotonically
- Player stands on surface in UV space -> moves in 3D as surface slides
- Jump: player enters 3D inertial frame, surface slides beneath them
- Land at different UV position because surface moved during hang time
- Long jumps = larger UV displacement = riskier but faster traversal
- Ghost AI unaffected (they live in UV)

**Implementation:**
- In `uploadCurve()`, offset each segment: read from `curvePoints[(i + driftSegs) % numSegs]`
  where `driftSegs = Math.floor(driftParam * numSegs)`
- `driftParam += slideSpeed * dt` in game loop
- During jump: track player's 3D world position (already done)
  - On landing: `worldToTile(px, py, pz)` with the *current* (post-drift) curve
  - Player appears at a different UV tile than where they jumped from
- Slide speed could pulse/oscillate for extra disorientation

**Visual:**
- Walls scroll past at slide speed when standing still
- Standing still feels like riding a conveyor belt
- The maze itself doesn't change, but your view of it rotates

**Complexity: Medium.** Curve offset is simple. UV remapping during jumps needs care with the drift delta.

---

## 4. Squishy Donuts / Harmonic Deformation

The tube radius oscillates via standing waves or impact ripples.

### 4a. Standing Waves

**Mechanics:**
- `tubeR(u, v, t) = TUBE_R + A * sin(n * 2pi * u/WORLD_W + omega * t)`
- The tube breathes: walls and corridors expand and contract
- When a section compresses, walls close in (claustrophobic); when it expands, gaps open
- Walking through a compression zone is like squeezing through a narrowing tunnel
- Could modulate n over time for evolving patterns

**Implementation:**
- Per-segment tube radius in the curve buffer (already 12 floats per segment, could add radius as 13th)
- Or: add wave parameters to Params uniform, compute in shader
- Shader `knotDDS`: replace `surfTable[si].tubeR` with `tubeR + A * sin(...)`
- JS physics: `tileHeight` needs same modulation for collision

### 4b. Impact Ripples

**Mechanics:**
- Player lands from jump -> shockwave propagates from landing point
- Wave travels along the tube surface at fixed speed
- Amplitude decays with distance and time
- Ghosts hit by wave get knocked back or stunned
- Pellets near the impact jiggle (visual only)
- Standing on a passing wave crest bounces you up slightly

**Implementation:**
- `ripples[]` array: `{u0, v0, time0, amplitude, speed, decay}`
- On landing: `ripples.push({u0: playerX, v0: playerY, time0: gameTime, amplitude: jumpHeight * 0.3, ...})`
- Per-frame: for each tile, sum contributions from all active ripples
- Shader: same summation in `knotDDS` for visual displacement
- Physics: add vertical impulse when standing on a wave crest

**Complexity: Medium-High.** Standing waves are easier. Impact ripples need careful summation in both JS and shader.

---

## 5. Destructible Terrain

Walls become breakable. Minecraft meets Pac-Man meets space.

**Mechanics:**
- New key (F or click): "punch" the wall tile you're facing
- Wall takes N hits to break (visual cracks appear)
- Broken wall becomes empty tile -> new path opened
- Debris particles fly outward (visual only, or physics objects?)
- Gravity recalculates: broken terrain changes the traversable surface
- Could "mine" pellets hidden inside thick walls
- Ghosts can't break walls -> player creates asymmetric advantages
- Rebuilding: walls slowly regenerate over time? Or permanent destruction?

**Implementation:**
- `wallHealth[]` array parallel to maze: `wallHealth[idx] = 3` for full wall
- Punch: `wallHealth[idx]--; if (wallHealth[idx] <= 0) maze[idx] = T.EMPTY; uploadTiles()`
- Shader: wall tile height = `WALL_H * wallHealth / maxHealth` (walls sink as damaged)
- Debris: spawn particle objects with 3D physics (use `surfacePos` for initial position)
- Ghost pathfinding: already tile-based, automatically routes through new gaps

**Advanced: Gravity recalculation**
- If walls are removed, the local curvature perception changes
- Could dynamically recompute `tileHeight` to create slopes at broken edges
- Rubble tiles: half-height, walkable but slow

**Complexity: Low (basic) to High (full physics debris + regeneration).**

---

## 6. Linked Torus Knots

Beyond circles: link actual (p,q) knots together.

**Geometry:**
- Two trefoils interlinked (like a molecular bond)
- One trefoil + one circle (knot threading a loop)
- (2,3) knot linked with (3,2) knot (different winding)
- The linking number determines how many times they thread through each other

**Implementation:**
- Already have `makeSurface(p, q, R, r0, tubeR)` and `makeCircleSurface()`
- For linked knots: offset the center of the second knot to thread through the first
- The offset depends on the knot geometry — need to compute a "gap" in knot A where knot B can thread
- `findWarpPoints()` already handles arbitrary surface pairs

**Complexity: Medium.** The hard part is computing valid threading offsets.

---

## 7. Combo Ideas

These combine multiple features for emergent weirdness:

**Electrostatic + Squishy:** Opposite-charge surfaces attract, and the attraction physically deforms the tubes toward each other near warp points. Tubes bulge toward each other, making warps visually dramatic.

**Day/Night + Ouroboros:** The tube slides AND rotates. Day/night cycle is coupled with the slide — standing still, you watch the sun sweep past AND the maze scroll beneath you.

**Destructible + Ripples:** Breaking a wall sends a shockwave. The shockwave can chain-break weakened walls, causing cave-ins.

**Charge + Ghosts:** Same-charge ghosts are repelled from the player but attracted to the surface they share. Opposite-charge ghosts are attracted to the player but pushed off their surface. Creates a tug-of-war dynamic.

---

## Priority When We Return

1. Get current multi-surface rendering stable (test Hopf, Borromean, single knot)
2. Electrostatic charge (deepens multi-surface gameplay)
3. Day/night rotation (quick atmospheric win)
4. Ouroboros sliding (unique to knots, moderate work)
5. Standing wave deformation (most visually wild)
6. Impact ripples (builds on standing waves)
7. Destructible terrain (easy basics, long tail)
8. Linked torus knots (geometry challenge)
