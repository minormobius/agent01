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
      intent_push: 0, intent_release: 0,
      wrinkle: 0,
      // ~25% of nodes carry a slower retrograde counter-flow (Grebecki 1986).
      retroFlag: (i * 7) % 4 === 0,
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
    pushStrength: 35.0,
    flowAlpha: 0.012,        // base anterograde mixing per tick
    retroAlpha: 0.006,       // slower retrograde rate
    detachThreshold: 4.0,    // sum-of-adhesion below which cell is "lifted"

    // Per-tick scratch (preallocated).
    segLen: new Float32Array(N),
    distFwd: new Float32Array(N),

    // Cell-level state, updated each tick.
    cellCx: cx, cellCy: cy,
    southIdx: 0,
    northIdx: Math.floor(N / 2),
    southPoint: { x: cx, y: cy - radius },
    maxGeo: perimeter0 / 2,

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
    const stretch = (len - restLen) / restLen;
    // Tension EMA, contribution from both endpoints of this edge.
    a.tension = a.tension * 0.7 + Math.abs(stretch) * 0.3;
    const f = sim.springK * (len - restLen) / len;
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

  // --- 3. Intent push as outward normal force. -------------------------
  for (let i = 0; i < N; i++) {
    const prev = nodes[(i - 1 + N) % N];
    const me = nodes[i];
    const next = nodes[(i + 1) % N];
    // Outward normal: tangent rotated -90° gives outward for a CCW polyline.
    // Our seeding above goes CCW (cos, sin walks CCW for +i because canvas y is down),
    // so rotate tangent +90° in screen space: (tx, ty) -> (ty, -tx) is +90° CCW screen,
    // which is outward-facing for a CCW-on-screen polyline.
    const tx = next.x - prev.x, ty = next.y - prev.y;
    let nx = ty, ny = -tx;
    const nlen = Math.hypot(nx, ny);
    if (nlen > 0.001) {
      const inv = 1 / nlen;
      nx *= inv; ny *= inv;
      const push = me.intent_push * sim.pushStrength;
      me.fx += nx * push;
      me.fy += ny * push;
    }
    me.nx = nx; me.ny = ny;
  }

  // --- 4. Integrate. Adhesion damps velocity; release reduces damping. ---
  const dampBase = Math.pow(0.85, dt * 30);
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    n.vx += n.fx * dt;
    n.vy += n.fy * dt;
    const effAdh = Math.max(0, n.adhesion - n.intent_release);
    const adhDamp = Math.pow(1 - effAdh * 0.95, dt * 30);
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
    // Soft correction (let the cell breathe a little).
    const corr = 1 + (scale - 1) * 0.45;
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      n.x = cx + (n.x - cx) * corr;
      n.y = cy + (n.y - cy) * corr;
    }
  }
  sim.cellCx = cx; sim.cellCy = cy;

  // --- 6. Decay intents (~2s half life from full). ----------------------
  const decay = Math.exp(-dt / 1.4);
  for (let i = 0; i < N; i++) {
    nodes[i].intent_push    *= decay;
    nodes[i].intent_release *= decay;
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

  // Scratch arrays for advection (preallocated would be a micro-optimization).
  const nAdh   = new Float32Array(N);
  const nLight = new Float32Array(N);
  const nChem  = new Float32Array(N);
  const nPush  = new Float32Array(N);
  const nRel   = new Float32Array(N);
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
    // Advect: pull a fraction alpha from the upstream neighbor. Anterograde
    // (flow goes forward) means content at i+1 came from i, so node i pulls
    // its replacement from i-1.
    const src = n.retroFlag ? (i + 1) % N : (i - 1 + N) % N;
    const s = nodes[src];
    // For raw sensory channels, blend the raw sample with the upstream value.
    // This gives "membrane carries readings forward" without losing fresh data.
    nAdh[i]   = n._rawAdh   * (1 - alpha) + s.adhesion * alpha;
    nLight[i] = n._rawLight * (1 - alpha) + s.light    * alpha;
    nChem[i]  = n._rawChem  * (1 - alpha) + s.chem     * alpha;
    // Intents flow more strongly (they're a membrane property, not a sample).
    const aI = Math.min(0.5, alpha * 4);
    nPush[i] = n.intent_push    * (1 - aI) + s.intent_push    * aI;
    nRel[i]  = n.intent_release * (1 - aI) + s.intent_release * aI;
  }
  for (let i = 0; i < N; i++) {
    nodes[i].adhesion       = nAdh[i];
    nodes[i].light          = nLight[i];
    nodes[i].chem           = nChem[i];
    nodes[i].intent_push    = nPush[i];
    nodes[i].intent_release = nRel[i];
    nodes[i].wrinkle        = nWrink[i];
  }

  // Advance the texture flow phase (renderer reads this).
  sim.flowPhase = (sim.flowPhase + dt * 0.05) % 1.0;

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

  // Find polyline node nearest to the adhesion centroid.
  let bestI = 0, bestD = Infinity;
  for (let i = 0; i < N; i++) {
    const dx = nodes[i].x - sx, dy = nodes[i].y - sy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) { bestD = d2; bestI = i; }
  }
  sim.southIdx = bestI;

  // --- 9. Recompute segment lengths, perimeter, geodesic distances. ----
  const segLen = sim.segLen;
  const distFwd = sim.distFwd;
  let perim = 0;
  for (let i = 0; i < N; i++) {
    const a = nodes[i], b = nodes[(i + 1) % N];
    segLen[i] = Math.hypot(b.x - a.x, b.y - a.y);
    perim += segLen[i];
  }
  sim.perimeter = perim;
  // Walk forward from south, accumulating arc length.
  distFwd[bestI] = 0;
  for (let k = 1; k < N; k++) {
    const idx = (bestI + k) % N;
    const prevIdx = (bestI + k - 1) % N;
    distFwd[idx] = distFwd[prevIdx] + segLen[prevIdx];
  }
  let northI = bestI, northG = 0;
  for (let i = 0; i < N; i++) {
    const g = Math.min(distFwd[i], perim - distFwd[i]);
    if (g > northG) { northG = g; northI = i; }
  }
  sim.northIdx = northI;
  sim.maxGeo = northG;

  // --- 10. Per-node map coordinates. -----------------------------------
  // We treat the line from south_node -> north_node in world space as the
  // anterior-posterior axis. Project each node onto this axis for mapV;
  // signed perpendicular distance gives mapU (which side of the AP axis).
  const southNode = nodes[bestI];
  const northNode = nodes[northI];
  let apx = northNode.x - southNode.x;
  let apy = northNode.y - southNode.y;
  const apLen = Math.hypot(apx, apy);
  if (apLen > 0.001) { apx /= apLen; apy /= apLen; }
  const ppx = -apy, ppy = apx;
  let maxPerp = 0.001;
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    const dx = n.x - southNode.x, dy = n.y - southNode.y;
    n._proj = dx * apx + dy * apy;
    n._perp = dx * ppx + dy * ppy;
    const ap = Math.abs(n._perp);
    if (ap > maxPerp) maxPerp = ap;
  }
  const invAp = 1 / Math.max(0.001, apLen);
  const invPp = 1 / maxPerp;
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    // mapV convention: 0 = top of canvas (north), 1 = bottom (south).
    // proj/apLen is 0 at south_node and 1 at north_node, so invert.
    let v = 1 - n._proj * invAp;
    if (v < 0) v = 0; else if (v > 1) v = 1;
    n.mapV = v;
    // Longitude: spread by perpendicular distance, sign decides left vs right.
    let u = 0.5 + 0.5 * (n._perp * invPp);
    if (u < 0) u = 0; else if (u > 0.9999) u = 0.9999;
    n.mapU = u;
  }

  sim.tickCount++;
}
