// sim.js — hidden cell simulation.
//
// State:
//   - A closed 2D polyline of N sensor nodes (N=256 by default).
//   - Each node carries: world position (x,y), velocity (vx,vy), four channel
//     readings (adhesion/light/chem/tension), two intent fields (push, release),
//     a wrinkle accumulator, a retrograde-flow flag, and computed map coords.
//   - The polyline = nodes[0..N-1] connected nodes[i] -> nodes[(i+1) % N].
//
// Per-tick update is documented in tick() below.

const TWO_PI = Math.PI * 2;

// Multiply the chem field down inside a radius. Used during food dissipation
// so the gradient fades gradually rather than vanishing the instant the cell
// engulfs something. rate is per-call; call repeatedly each tick.
function decayChem(world, fx, fy, radius, rate) {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(fx - radius));
  const y0 = Math.max(0, Math.floor(fy - radius));
  const x1 = Math.min(world.w, Math.ceil(fx + radius));
  const y1 = Math.min(world.h, Math.ceil(fy + radius));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x - fx, dy = y - fy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2) {
        const fall = 1 - d2 / r2;
        world.chem[y * world.w + x] *= 1 - fall * rate;
      }
    }
  }
}

// Add a Gaussian-shaped chem hotspot. Used when respawning food.
function addChemHotspot(world, fx, fy, radius, amp) {
  const sigma2 = (radius * radius) * 0.25;
  const x0 = Math.max(0, Math.floor(fx - radius));
  const y0 = Math.max(0, Math.floor(fy - radius));
  const x1 = Math.min(world.w, Math.ceil(fx + radius));
  const y1 = Math.min(world.h, Math.ceil(fy + radius));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x - fx, dy = y - fy;
      const d2 = dx * dx + dy * dy;
      const f = amp * Math.exp(-d2 / sigma2);
      const idx = y * world.w + x;
      const v = world.chem[idx] + f;
      world.chem[idx] = v > 1 ? 1 : v;
    }
  }
}

// Spawn a new food point at a position far from the cell and from any other
// extant food. Adds the corresponding chem hotspot.
function spawnFood(world, sim) {
  const cx = sim.cellCx, cy = sim.cellCy;
  let best = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = 80 + Math.random() * (world.w - 160);
    const y = 80 + Math.random() * (world.h - 160);
    let dmin = Math.hypot(x - cx, y - cy);
    for (const f of world.food) {
      if (f.gone) continue;
      const d = Math.hypot(x - f.x, y - f.y);
      if (d < dmin) dmin = d;
    }
    if (!best || dmin > best.score) best = { x, y, score: dmin };
  }
  if (!best) return;
  world.food.push({
    x: best.x, y: best.y,
    value: 0.4,
    consumed: false,
    gone: false,
    dissipating: 0,
    lastWinding: 0,
    r: 14,
  });
  addChemHotspot(world, best.x, best.y, 160, 1.0);
}

export function createSim({ world, N = 256, radius = 60, cx, cy } = {}) {
  const nodes = new Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TWO_PI;
    nodes[i] = {
      id: i,
      x: cx + Math.cos(a) * radius,
      y: cy + Math.sin(a) * radius,
      vx: 0, vy: 0,
      fx: 0, fy: 0,
      adhesion: 0, light: 0, chem: 0, tension: 0,
      // Player input directive. -1 = full inward pull (retract this region),
      // +1 = full outward push (extend pseudopod), 0 = no input. Recovers
      // toward 0 over a second so taps fade naturally. The cell membrane is
      // mechanically uniform; this is the entire input-to-force pipeline.
      directive: 0,
      wrinkle: 0,
      // ~25% of nodes carry a slower retrograde counter-flow (Grebecki 1986).
      retroFlag: (i * 7) % 4 === 0,
      // Membrane material balance. 1.0 = baseline. Grows when budget feeds
      // this segment (relaxes high tension), shrinks when wrinkle drains
      // material here back into the budget.
      restLenRatio: 1.0,
      // Cached map coordinates (recomputed each tick when not detached).
      mapU: i / N,
      mapV: 0.5,
      // Scratch fields used by tick().
      _proj: 0, _perp: 0, nx: 0, ny: 0,
    };
  }

  // Initial perimeter and area (target for conservation).
  let perimeter0 = 0;
  let area0 = 0;
  for (let i = 0; i < N; i++) {
    const a = nodes[i], b = nodes[(i + 1) % N];
    perimeter0 += Math.hypot(b.x - a.x, b.y - a.y);
    area0 += a.x * b.y - b.x * a.y;
  }
  area0 = Math.abs(area0) * 0.5;

  // Seed initial readings so the first frame isn't empty.
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    n.adhesion = world.sample(world.adhesion, n.x, n.y);
    n.light    = world.sample(world.light, n.x, n.y);
    n.chem     = world.sample(world.chem, n.x, n.y);
  }

  return {
    world,
    N,
    nodes,
    perimeter: perimeter0,
    perimeter0,
    targetArea: area0,

    // Tuning constants. Live-editable from the toolbar.
    springK: 6.0,             // uniform spring stiffness
    // Bending / curvature stiffness. Acts like discrete Laplace surface
    // tension -- pulls each node toward the midpoint of its neighbors with
    // a force proportional to its displacement from that midpoint, i.e. to
    // local curvature. Sharp tips have large displacement -> strong inward
    // pull -> the tip blunts. Live slider in the toolbar.
    bendK: 0.5,
    // Small constant outward radial force on every node. Just enough to
    // discourage folds; not enough to drive motion. Player input rides on
    // top via pushStrength * directive.
    basePressure: 0.05,
    // Force coefficient for player-driven extension/retraction. f =
    // basePressure + pushStrength * directive. With directive in [-1, +1],
    // this caps the per-node player-force at +/- pushStrength.
    pushStrength: 2.0,
    directiveRecover: 1.0,    // per second, drift toward directive = 0
    flowAlpha: 0.012,         // base anterograde mixing per tick
    retroAlpha: 0.006,        // slower retrograde rate
    detachThreshold: 4.0,     // sum-of-adhesion below which cell is "lifted"

    // Per-tick scratch (preallocated).
    segLen: new Float32Array(N),

    // Cell-level state, updated each tick.
    cellCx: cx, cellCy: cy,
    southIdx: 0,
    southPoint: { x: cx, y: cy + radius },

    // Virtual pole readings. The polyline is the equator; these are the
    // ventral (south) and dorsal (north) apexes the renderer interpolates
    // toward. Filled in each tick from world samples at the cell centroid.
    poleSouth: { adhesion: 0, light: 0, chem: 0, tension: 0 },
    poleNorth: { adhesion: 0, light: 0, chem: 0, tension: 0 },

    // Membrane material budget. Wrinkled low-tension segments shed material
    // into this pool; high-tension segments draw from it to relax. Food
    // engulfment dumps a chunk in. Clamped to [0, budgetMax].
    budget: 0.4,
    budgetMax: 1.0,
    engulfedCount: 0,

    // Membrane texture phase (drifts to show flow, advanced by render too).
    flowPhase: 0,

    detached: false,
    tickCount: 0,
  };
}

// Single simulation step. dt is in seconds.
export function tick(sim, dt) {
  const { nodes, world } = sim;
  let N = sim.N;     // mutable: tectonics can splice nodes within this tick

  // --- 1. Sample world fields at each node's current position. ----------
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    if (!world.isObstacle(n.x, n.y)) {
      // Direct samples: these are the "raw" sensory signals before advection.
      n._rawAdh   = world.sample(world.adhesion, n.x, n.y);
      n._rawLight = world.sample(world.light,    n.x, n.y);
      n._rawChem  = world.sample(world.chem,     n.x, n.y);
    } else {
      n._rawAdh = n.adhesion; n._rawLight = n.light; n._rawChem = n.chem;
    }
  }

  // --- 2. Cortical spring + bending forces; track tension. --------------
  const restLen = sim.perimeter0 / N;
  for (let i = 0; i < N; i++) { nodes[i].fx = 0; nodes[i].fy = 0; }

  // Edge springs. Stiffness is now uniform; the player input doesn't
  // modulate spring K (it goes into a separate per-node directive force).
  for (let i = 0; i < N; i++) {
    const a = nodes[i], b = nodes[(i + 1) % N];
    let dx = b.x - a.x, dy = b.y - a.y;
    let len = Math.hypot(dx, dy);
    if (len < 0.001) len = 0.001;
    const localRest = restLen * (a.restLenRatio + b.restLenRatio) * 0.5;
    const stretch = (len - localRest) / localRest;
    a.tension = a.tension * 0.7 + Math.abs(stretch) * 0.3;
    const f = sim.springK * (len - localRest) / len;
    a.fx += dx * f; a.fy += dy * f;
    b.fx -= dx * f; b.fy -= dy * f;
  }

  // Bending: pull each node toward midpoint of its two neighbors.
  for (let i = 0; i < N; i++) {
    const prev = nodes[(i - 1 + N) % N];
    const me = nodes[i];
    const next = nodes[(i + 1) % N];
    const mx = (prev.x + next.x) * 0.5;
    const my = (prev.y + next.y) * 0.5;
    me.fx += (mx - me.x) * sim.bendK;
    me.fy += (my - me.y) * sim.bendK;
  }

  // --- 3. Per-node force: small baseline outward + directive-driven push. -
  // Baseline pressure (small) keeps the cell convex by gently pushing every
  // node radially outward -- this is the "balloon" that resists folding.
  // Player input adds a signed directive-driven force at brushed nodes:
  // positive directive = extra outward push (extend), negative directive
  // = inward pull (retract).
  const ccx = sim.cellCx, ccy = sim.cellCy;
  for (let i = 0; i < N; i++) {
    const me = nodes[i];
    let nx = me.x - ccx, ny = me.y - ccy;
    const nlen = Math.hypot(nx, ny);
    if (nlen > 0.001) {
      const inv = 1 / nlen;
      nx *= inv; ny *= inv;
      const f = sim.basePressure + sim.pushStrength * me.directive;
      me.fx += nx * f;
      me.fy += ny * f;
    }
    me.nx = nx; me.ny = ny;
  }

  // --- 4. Integrate. Adhesion damps velocity. Cap |v| as a safety net so
  //        ill-tuned parameters can't blow up to vmax=1000. -------------
  const dampBase = Math.pow(0.92, dt * 30);
  const V_CAP = 8.0;
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    n.vx += n.fx * dt;
    n.vy += n.fy * dt;
    const adhDamp = Math.pow(1 - n.adhesion * 0.15, dt * 30);
    n.vx *= adhDamp * dampBase;
    n.vy *= adhDamp * dampBase;
    // Speed clamp.
    const sp = Math.hypot(n.vx, n.vy);
    if (sp > V_CAP) {
      const s = V_CAP / sp;
      n.vx *= s; n.vy *= s;
    }
    let px = n.x + n.vx * dt * 30;
    let py = n.y + n.vy * dt * 30;
    if (world.isObstacle(px, py)) {
      n.vx *= -0.3; n.vy *= -0.3;
    } else {
      n.x = Math.max(2, Math.min(world.w - 2, px));
      n.y = Math.max(2, Math.min(world.h - 2, py));
    }
  }

  // --- 5. Area conservation: rescale toward target around centroid. -----
  let area = 0, cx = 0, cy = 0;
  for (let i = 0; i < N; i++) {
    const a = nodes[i], b = nodes[(i + 1) % N];
    area += a.x * b.y - b.x * a.y;
    cx += nodes[i].x; cy += nodes[i].y;
  }
  area = Math.abs(area) * 0.5;
  cx /= N; cy /= N;
  if (area > 1) {
    const scale = Math.sqrt(sim.targetArea / area);
    // Very soft (~1% per tick). With springK at 60, cortical hoop tension
    // now does most of the equilibrium work, so this just gently drags the
    // cell back to baseline area over several seconds instead of clamping
    // it down every frame. Earlier 0.04 was still eating the spring
    // differential that gives cortex weakening its purchase.
    const corr = 1 + (scale - 1) * 0.01;
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      n.x = cx + (n.x - cx) * corr;
      n.y = cy + (n.y - cy) * corr;
    }
  }
  sim.cellCx = cx; sim.cellCy = cy;

  // --- 6. Directive recovery: drift toward 0. ---------------------------
  // Player input pushes directive away from 0 (positive = extend, negative
  // = retract). Without sustained input, every node relaxes back to neutral.
  const dirRate = Math.min(1, sim.directiveRecover * dt);
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    n.directive += (0 - n.directive) * dirRate;
  }

  // --- 7. Membrane flow: advect readings + intents along the polyline.  -
  // Anterograde direction = +1 in node index. A subset of nodes (retroFlag)
  // carries a slower retrograde counter-flow (Grebecki 1986). Flow rate slows
  // in the dorsal-posterior quadrant (Taniguchi et al. 2023), accumulating
  // a "wrinkle" scalar that feeds the texture layer.
  //
  // Posterior direction in world space: opposite the chemistry gradient at the
  // centroid (the cell heads up the chem gradient). Dorsal = high light reading.
  const epsG = 5;
  const gx = world.sample(world.chem, cx + epsG, cy) - world.sample(world.chem, cx - epsG, cy);
  const gy = world.sample(world.chem, cx, cy + epsG) - world.sample(world.chem, cx, cy - epsG);
  const gMag = Math.hypot(gx, gy);
  let posteriorX = 0, posteriorY = 0;
  if (gMag > 0.0005) { posteriorX = -gx / gMag; posteriorY = -gy / gMag; }

  const nAdh   = new Float32Array(N);
  const nLight = new Float32Array(N);
  const nChem  = new Float32Array(N);
  const nWrink = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    let alpha = n.retroFlag ? sim.retroAlpha : sim.flowAlpha;
    const rx = n.x - cx, ry = n.y - cy;
    const posteriorDot = rx * posteriorX + ry * posteriorY;
    const isPosterior = posteriorDot > 0;
    const isDorsal    = n.light > 0.5;
    if (isPosterior && isDorsal) {
      alpha *= 0.3;
      nWrink[i] = Math.min(1.0, n.wrinkle + dt * 0.6);
    } else {
      nWrink[i] = n.wrinkle * Math.exp(-dt * 0.7);
    }
    // Anterograde flow takes its content from the upstream neighbor; retro
    // takes from the downstream side. The raw channel sample is fresh at the
    // node's current world position; we blend in the upstream value so the
    // membrane "remembers" what it just felt.
    const src = n.retroFlag ? (i + 1) % N : (i - 1 + N) % N;
    const s = nodes[src];
    nAdh[i]   = n._rawAdh   * (1 - alpha) + s.adhesion * alpha;
    nLight[i] = n._rawLight * (1 - alpha) + s.light    * alpha;
    nChem[i]  = n._rawChem  * (1 - alpha) + s.chem     * alpha;
  }
  for (let i = 0; i < N; i++) {
    nodes[i].adhesion       = nAdh[i];
    nodes[i].light          = nLight[i];
    nodes[i].chem           = nChem[i];
    nodes[i].wrinkle        = nWrink[i];
  }

  // Advance the texture flow phase (renderer reads this).
  sim.flowPhase = (sim.flowPhase + dt * 0.05) % 1.0;

  // --- 7b. Materials cycle. --------------------------------------------
  // High-tension segments draw from sim.budget to relax (restLenRatio grows,
  // their next-tick spring stretch falls). Wrinkled low-tension segments
  // shed material into the budget (their restLenRatio shrinks). Sum-of-
  // restLenRatios drifts slowly back toward N (cell tries to keep its
  // baseline membrane allocation), but engulfed food can push it temporarily
  // higher.
  // Materials cycle thresholds. TEN_THRESH must sit above the baseline
  // strain induced by basePressure + active push, or the cycle would drain budget on every
  // node continuously.
  const TEN_THRESH = 0.35;
  const WRK_THRESH = 0.08;
  const K_GEN = 2.5;
  const K_CON = 4.0;
  let totalSupply = 0, totalDemand = 0;
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    if (n.wrinkle > WRK_THRESH) totalSupply += n.wrinkle - WRK_THRESH;
    if (n.tension > TEN_THRESH) totalDemand += n.tension - TEN_THRESH;
  }
  const wantSupply = totalSupply * K_GEN * dt;
  const wantDemand = totalDemand * K_CON * dt;
  const actSupply = Math.min(wantSupply, sim.budgetMax - sim.budget);
  const actDemand = Math.min(wantDemand, sim.budget);
  const sRatio = wantSupply > 1e-6 ? actSupply / wantSupply : 0;
  const dRatio = wantDemand > 1e-6 ? actDemand / wantDemand : 0;
  sim.budget += actSupply - actDemand;
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    if (n.wrinkle > WRK_THRESH) {
      const drain = (n.wrinkle - WRK_THRESH) * K_GEN * dt * sRatio;
      n.wrinkle = Math.max(0, n.wrinkle - drain * 1.4);
      n.restLenRatio = Math.max(0.7, n.restLenRatio - drain * 0.45);
    }
    if (n.tension > TEN_THRESH) {
      const give = (n.tension - TEN_THRESH) * K_CON * dt * dRatio;
      n.tension = Math.max(0, n.tension - give * 0.5);
      n.restLenRatio = Math.min(1.5, n.restLenRatio + give * 0.55);
    }
    // Slow recovery toward 1.0 so the cell doesn't lock into permanent distortion.
    n.restLenRatio += (1.0 - n.restLenRatio) * 0.05 * dt;
  }

  // --- 7c. Food engulfment + dissipation + respawn. ---------------------
  // Winding number of the polyline around each unconsumed food point. Food
  // is "engulfed" when |winding| >= 0.75. Engulfment dumps food.value into
  // the budget AND grows targetArea / perimeter0 so the cell physically
  // wants to be bigger (driving tectonic splits as it stretches). After
  // engulfment, food enters a dissipation phase: its chem gradient fades
  // gradually over FOOD_DISSIPATE_T. When fully dissipated, food.gone is
  // set and a fresh food point spawns somewhere else.
  if (world.food && world.food.length) {
    const FOOD_DISSIPATE_T = 1.5;     // seconds
    const FOOD_GROWTH = 0.08;         // 8% area gain per engulfment
    for (const f of world.food) {
      if (f.gone) continue;
      if (!f.consumed) {
        // Compute winding number to check if the polyline has wrapped this point.
        let total = 0;
        const Nnow = nodes.length;
        for (let i = 0; i < Nnow; i++) {
          const a = nodes[i], b = nodes[(i + 1) % Nnow];
          const aA = Math.atan2(a.y - f.y, a.x - f.x);
          const aB = Math.atan2(b.y - f.y, b.x - f.x);
          let d = aB - aA;
          if (d > Math.PI)  d -= TWO_PI;
          else if (d < -Math.PI) d += TWO_PI;
          total += d;
        }
        const winding = total / TWO_PI;
        f.lastWinding = winding;
        if (Math.abs(winding) >= 0.75) {
          f.consumed = true;
          f.dissipating = FOOD_DISSIPATE_T;
          sim.budget = Math.min(sim.budgetMax, sim.budget + f.value);
          sim.engulfedCount++;
          sim.targetArea  *= (1 + FOOD_GROWTH);
          sim.perimeter0  *= Math.sqrt(1 + FOOD_GROWTH);
        }
      } else if (f.dissipating > 0) {
        // Gradual chem fade. Radius grows slightly so the dissipation is
        // "outward diffusing" rather than localized erosion.
        f.dissipating -= dt;
        const t = 1 - Math.max(0, f.dissipating) / FOOD_DISSIPATE_T;
        const radius = 50 + t * 120;
        decayChem(world, f.x, f.y, radius, Math.min(1, 2.4 * dt));
        if (f.dissipating <= 0) {
          f.gone = true;
          spawnFood(world, sim);
        }
      }
    }
  }

  // --- 7d. Tectonics: merge close nodes, split far ones. ----------------
  // One operation per tick (stable, no oscillation). Find the single best
  // candidate edge:
  //   - longest edge above SPLIT_FACTOR * rest -> split (insert new node)
  //   - shortest edge below MERGE_FACTOR * rest -> merge (collapse pair)
  // Splits cost SPLIT_COST from the budget; merges refund MERGE_REWARD.
  // This is how cell mass cycles: wrinkle drains into budget, budget pays
  // for splits when membrane stretches, merges return material at the rear.
  {
    const Nnow = nodes.length;
    const baseRestLen = sim.perimeter0 / Nnow;
    const MIN_NODES = 64;
    const MAX_NODES = 1024;
    const MERGE_FACTOR = 0.45;
    const SPLIT_FACTOR = 2.20;
    const MERGE_REWARD = 0.025;
    const SPLIT_COST = 0.04;

    let bestSplit = null, bestMerge = null;
    for (let i = 0; i < Nnow; i++) {
      const j = (i + 1) % Nnow;
      const a = nodes[i], b = nodes[j];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > baseRestLen * SPLIT_FACTOR && sim.budget > SPLIT_COST && Nnow < MAX_NODES) {
        if (!bestSplit || len > bestSplit.len) bestSplit = { i, j, len };
      } else if (len < baseRestLen * MERGE_FACTOR && Nnow > MIN_NODES) {
        if (!bestMerge || len < bestMerge.len) bestMerge = { i, j, len };
      }
    }
    // Prefer split (growth) when available.
    const op = bestSplit || bestMerge;
    if (op) {
      if (op === bestSplit) {
        const a = nodes[op.i], b = nodes[op.j];
        const newN = {
          x: (a.x + b.x) * 0.5,
          y: (a.y + b.y) * 0.5,
          vx: (a.vx + b.vx) * 0.5,
          vy: (a.vy + b.vy) * 0.5,
          fx: 0, fy: 0,
          adhesion: (a.adhesion + b.adhesion) * 0.5,
          light:    (a.light    + b.light)    * 0.5,
          chem:     (a.chem     + b.chem)     * 0.5,
          tension:  (a.tension  + b.tension)  * 0.5,
          directive:(a.directive + b.directive) * 0.5,
          wrinkle:  (a.wrinkle  + b.wrinkle)  * 0.5,
          restLenRatio: 1.0,
          retroFlag: (Nnow * 7) % 4 === 0,
          mapU: 0, mapV: 0.5, _proj: 0, _perp: 0, nx: 0, ny: 0,
        };
        nodes.splice(op.j === 0 ? nodes.length : op.j, 0, newN);
        sim.budget = Math.max(0, sim.budget - SPLIT_COST);
      } else {
        const a = nodes[op.i], b = nodes[op.j];
        // Collapse into a; b is removed. Material is recycled.
        a.x = (a.x + b.x) * 0.5;
        a.y = (a.y + b.y) * 0.5;
        a.vx = (a.vx + b.vx) * 0.5;
        a.vy = (a.vy + b.vy) * 0.5;
        a.adhesion = (a.adhesion + b.adhesion) * 0.5;
        a.light    = (a.light    + b.light)    * 0.5;
        a.chem     = (a.chem     + b.chem)     * 0.5;
        a.tension  = (a.tension  + b.tension)  * 0.5;
        a.directive = (a.directive + b.directive) * 0.5;
        a.wrinkle  = Math.min(1, a.wrinkle + b.wrinkle * 0.5);
        a.restLenRatio = (a.restLenRatio + b.restLenRatio) * 0.5;
        if (op.j === 0) nodes.shift();
        else nodes.splice(op.j, 1);
        sim.budget = Math.min(sim.budgetMax, sim.budget + MERGE_REWARD);
      }
    }
    sim.N = nodes.length;
    N = nodes.length;     // refresh local for the rest of the tick
  }

  // --- 8. South pole: adhesion-weighted centroid -> nearest node. -------
  let wsum = 0, sx = 0, sy = 0;
  for (let i = 0; i < N; i++) {
    const w = nodes[i].adhesion;
    sx += nodes[i].x * w; sy += nodes[i].y * w; wsum += w;
  }

  if (wsum < sim.detachThreshold) {
    // --- 8a. Detached: no south pole, freeze map coords, drift slowly. --
    sim.detached = true;
    // Tiny passive drift in a random-ish direction; this is "no traction".
    const driftAng = (sim.tickCount * 0.013) % TWO_PI;
    const dxd = Math.cos(driftAng) * 0.4 * dt * 30;
    const dyd = Math.sin(driftAng) * 0.4 * dt * 30;
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const nx = n.x + dxd, ny = n.y + dyd;
      if (!world.isObstacle(nx, ny)) {
        n.x = Math.max(2, Math.min(world.w - 2, nx));
        n.y = Math.max(2, Math.min(world.h - 2, ny));
      }
    }
    sim.tickCount++;
    return;
  }

  sim.detached = false;
  sx /= wsum; sy /= wsum;
  sim.southPoint = { x: sx, y: sy };

  // Find polyline node nearest to the adhesion centroid (kept for debug overlay).
  let bestI = 0, bestD = Infinity;
  for (let i = 0; i < N; i++) {
    const dx = nodes[i].x - sx, dy = nodes[i].y - sy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) { bestD = d2; bestI = i; }
  }
  sim.southIdx = bestI;

  // --- 9. Segment lengths + perimeter (the renderer's wrinkle pass uses them
  //        indirectly through tension; we recompute here for the debug view). -
  // Resize the preallocated segLen if tectonics has grown the cell.
  if (sim.segLen.length < N) sim.segLen = new Float32Array(N * 2);
  const segLen = sim.segLen;
  let perim = 0;
  for (let i = 0; i < N; i++) {
    const a = nodes[i], b = nodes[(i + 1) % N];
    segLen[i] = Math.hypot(b.x - a.x, b.y - a.y);
    perim += segLen[i];
  }
  sim.perimeter = perim;

  // --- 10. Per-node map coordinates: ARC LENGTH along the polyline. -----
  // The map's horizontal axis is now the actual cell-surface coordinate,
  // not the world-frame azimuth around the centroid. Two nodes that share
  // a world-frame angle (e.g. an outer shell node and a tucked-in folded
  // node) now get DIFFERENT mapU values because they're at different
  // positions along the perimeter. A brush stroke targets the specific
  // membrane patch at that arc position, never both at once.
  //
  // Anchor: the south pole node (closest to the adhesion centroid). South
  // sits at mapU = 0; we walk forward around the polyline accumulating
  // arc length. Every node's mapU = its forward arc-distance from south
  // divided by total perimeter.
  if (perim > 0.001) {
    const southI = bestI;
    nodes[southI].mapU = 0;
    nodes[southI].mapV = 0.5;
    let arcAcc = 0;
    for (let k = 1; k < N; k++) {
      // edge that we cross to reach the kth-forward node
      const edgeIdx = (southI + k - 1) % N;
      arcAcc += segLen[edgeIdx];
      const curI = (southI + k) % N;
      let u = arcAcc / perim;
      if (u >= 0.9999) u = 0.9999;
      nodes[curI].mapU = u;
      nodes[curI].mapV = 0.5;
    }
  } else {
    for (let i = 0; i < N; i++) { nodes[i].mapU = i / N; nodes[i].mapV = 0.5; }
  }

  // --- 11. Virtual pole readings, sampled at the cell centroid. ---------
  // Ventral pole = full substrate contact, no light. Dorsal pole = exposed to
  // sky, no adhesion. Chem partially diffuses to both. Tension averaged from
  // adhesion-weighted (ventral) and unweighted (dorsal) node tensions.
  const cellLight = world.sample(world.light,    cx, cy);
  const cellChem  = world.sample(world.chem,     cx, cy);
  const cellAdh   = world.sample(world.adhesion, cx, cy);
  let tenSum = 0, tenAdhSum = 0, adhSum = 0;
  for (let i = 0; i < N; i++) {
    tenSum    += nodes[i].tension;
    tenAdhSum += nodes[i].tension * nodes[i].adhesion;
    adhSum    += nodes[i].adhesion;
  }
  const meanTen     = tenSum / N;
  const meanVenTen  = adhSum > 0.001 ? tenAdhSum / adhSum : meanTen;
  sim.poleSouth.adhesion = cellAdh;
  sim.poleSouth.light    = cellLight * 0.04;
  sim.poleSouth.chem     = cellChem  * 0.30;
  sim.poleSouth.tension  = meanVenTen;
  sim.poleNorth.adhesion = 0;
  sim.poleNorth.light    = cellLight;
  sim.poleNorth.chem     = cellChem  * 0.50;
  sim.poleNorth.tension  = meanTen * 0.7;

  sim.tickCount++;
}
