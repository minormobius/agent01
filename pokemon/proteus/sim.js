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

// Subtract a Gaussian bump from a Float32Array field in-place. Used to dissolve
// the chem gradient at a consumed food site so the cell stops being pulled
// toward empty space.
function dissolveChem(world, fx, fy, radius) {
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
        world.chem[y * world.w + x] *= 1 - fall * 0.97;
      }
    }
  }
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
      // Cortex stiffness. 1.0 = baseline cortical tension. Player input
      // pushes this lower (extend, pressure wins locally) or higher
      // (retract). Recovers toward 1.0 over a second or two.
      cortexK: 1.0,
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

    // Tuning constants. Adjusted so the cell feels viscous and slow.
    springK: 6.0,
    bendK: 0.18,
    // Internal hydrostatic pressure. Every node feels a constant outward
    // normal force of this magnitude. Cortex springs (variable per-node
    // stiffness) resist; the cell is a balloon, and low-cortex regions
    // bulge outward where pressure wins locally. Tuned so baseline strain
    // stays below the materials-cycle tension threshold -- only player-
    // weakened regions trigger material consumption.
    pressure: 0.04,
    cortexRecover: 0.6,      // per second, drift toward cortexK = 1.0
    flowAlpha: 0.012,        // base anterograde mixing per tick
    retroAlpha: 0.006,       // slower retrograde rate
    detachThreshold: 4.0,    // sum-of-adhesion below which cell is "lifted"

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
  const { nodes, world, N } = sim;

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

  // Edge springs and per-node tension (smoothed local stretch magnitude).
  for (let i = 0; i < N; i++) {
    const a = nodes[i], b = nodes[(i + 1) % N];
    let dx = b.x - a.x, dy = b.y - a.y;
    let len = Math.hypot(dx, dy);
    if (len < 0.001) len = 0.001;
    // Edge rest length scales with the average restLenRatio of its endpoints.
    // High ratio = this segment has been "fed" material and sits longer at rest
    // (relaxed). Low ratio = membrane drained from this segment, sits tighter.
    const localRest = restLen * (a.restLenRatio + b.restLenRatio) * 0.5;
    // Cortex stiffness varies per segment based on the average of endpoint
    // cortexK. Low cortex = weak spring, lets internal pressure win locally
    // and that region bulges out; high cortex = stiff spring, retracts.
    const localK = sim.springK * (a.cortexK + b.cortexK) * 0.5;
    const stretch = (len - localRest) / localRest;
    a.tension = a.tension * 0.7 + Math.abs(stretch) * 0.3;
    const f = localK * (len - localRest) / len;
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

  // --- 3. Internal pressure as a radial outward force. -----------------
  // Constant hydrostatic pressure pushes every node away from the cell
  // centroid. We do NOT use the local polyline normal here: once a fold
  // appears, the polyline travels "backwards" through it and the local
  // normal points *into* the cell, so pressure would deepen the fold
  // instead of pushing it out. Radial-from-centroid stays correct under
  // arbitrary deformation -- nodes tucked inside the shell sit radially
  // closer to centroid than the convex bulk, so the force pushes them
  // back outward and unfolds tucks.
  const ccx = sim.cellCx, ccy = sim.cellCy;
  for (let i = 0; i < N; i++) {
    const me = nodes[i];
    let nx = me.x - ccx, ny = me.y - ccy;
    const nlen = Math.hypot(nx, ny);
    if (nlen > 0.001) {
      const inv = 1 / nlen;
      nx *= inv; ny *= inv;
      me.fx += nx * sim.pressure;
      me.fy += ny * sim.pressure;
    }
    me.nx = nx; me.ny = ny;
  }

  // --- 4. Integrate. Adhesion damps velocity. ---------------------------
  // Adhesion factor at 0.15 (down from 0.55): even max adhesion keeps 85%
  // of velocity per tick. With this and the new pressure default, low-cortex
  // regions produce visible extension over 1-2 seconds, not 30.
  const dampBase = Math.pow(0.92, dt * 30);
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    n.vx += n.fx * dt;
    n.vy += n.fy * dt;
    const adhDamp = Math.pow(1 - n.adhesion * 0.15, dt * 30);
    n.vx *= adhDamp * dampBase;
    n.vy *= adhDamp * dampBase;
    let px = n.x + n.vx * dt * 30;
    let py = n.y + n.vy * dt * 30;
    if (world.isObstacle(px, py)) {
      // Reflect velocity weakly, stay in place this step.
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
    // Very soft correction (~4% per tick). Earlier 0.20 still pinned the
    // cell within ~3px of rest even at max pressure -- it was clawing back
    // almost everything pressure pushed out. At 0.04 the cell can take on
    // visible shape change and still drift back to target area over a few
    // seconds.
    const corr = 1 + (scale - 1) * 0.04;
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      n.x = cx + (n.x - cx) * corr;
      n.y = cy + (n.y - cy) * corr;
    }
  }
  sim.cellCx = cx; sim.cellCy = cy;

  // --- 6. Cortex recovery: drift toward baseline 1.0. ------------------
  // Player input pushes cortexK away from 1.0 (lower = extending pseudopod,
  // higher = retracting). Without sustained input, every node relaxes back
  // toward neutral.
  const cortexRate = Math.min(1, sim.cortexRecover * dt);
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    n.cortexK += (1.0 - n.cortexK) * cortexRate;
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
  // strain induced by sim.pressure, or the cycle will drain budget on every
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

  // --- 7c. Food engulfment. --------------------------------------------
  // Winding number of the polyline around each unconsumed food point. Food is
  // "engulfed" when |winding| >= 0.75 (mostly enclosed). Engulfment dumps
  // food.value into the budget and dissolves the local chem field so the
  // gradient stops pointing at empty space.
  if (world.food && world.food.length) {
    for (const f of world.food) {
      if (f.consumed) continue;
      let total = 0;
      for (let i = 0; i < N; i++) {
        const a = nodes[i], b = nodes[(i + 1) % N];
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
        sim.budget = Math.min(sim.budgetMax, sim.budget + f.value);
        sim.engulfedCount++;
        // Dissolve chem source so the cell doesn't keep heading for empty space.
        dissolveChem(world, f.x, f.y, 90);
      }
    }
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
  const segLen = sim.segLen;
  let perim = 0;
  for (let i = 0; i < N; i++) {
    const a = nodes[i], b = nodes[(i + 1) % N];
    segLen[i] = Math.hypot(b.x - a.x, b.y - a.y);
    perim += segLen[i];
  }
  sim.perimeter = perim;

  // --- 10. Per-node map coordinates. ------------------------------------
  // The 2D polyline is the *equator* (skirt) of a virtual sphere. South and
  // north poles are conceptual points: ventral (touching substrate) and dorsal
  // (exposed). So every node lives at mapV = 0.5 and mapU = its azimuth around
  // the cell centroid. Latitude is interpolated in the renderer using the two
  // virtual-pole readings computed below.
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    const dx = n.x - cx, dy = n.y - cy;
    // atan2 returns (-PI, PI]; shift to [0, 1).
    let u = (Math.atan2(dy, dx) + Math.PI) / TWO_PI;
    if (u < 0) u += 1;
    if (u >= 1) u -= 1;
    n.mapU = u;
    n.mapV = 0.5;
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
