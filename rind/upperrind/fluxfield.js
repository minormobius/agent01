// fluxfield.js — the FLUX-LINE floor for upperrind. THE METAPHOR: each thread is a SOLENOID and its
// chambers are SHIELDED. A background field runs along the thread's axis (the spine, hub→rim); the
// concourse is the bore it flows through; every chamber is a mu-metal / superconducting inclusion
// that EXPELS the field, so the flux lines bend around it and thread the gaps between. Doors are
// apertures in a shield — the one place flux passes between spaces (drawn as a concentration in the
// app layer). The tiling of the concourse IS the flux.
//
// THE MATH is potential flow around cylinders — magnetostatics with diamagnetic inclusions is the
// same boundary-value problem as incompressible inviscid flow around solids. The flux lines are
// CONTOURS of a stream function ψ:
//
//     ψ(p) = axialCoord(p)  +  Σ_chamber  [ flow-around-cylinder dipole of that chamber ]
//
//   • axialCoord — the background. For a thread it's the signed offset from the spine, so ψ-contours
//     run ALONG the axis (hub→rim). For the hubs (no spine) it's the radius from the core, so the
//     flux rings the plaza where the threads' fields meet.
//   • dipole — for a shield of radius a at the origin of the local (axis, perp)=(u,w) frame, the
//     exterior stream function is w·(1 − a²/(u²+w²)); the −a²w/r² term is the perturbation we add.
//     On the shield boundary r=a it makes ψ≈const ⇒ the boundary is a streamline ⇒ the field is
//     TANGENT to the shield (excluded from the chamber). Superposition works because the background
//     is locally ~uniform next to a small chamber.
//
// We sample ψ on a grid, MARCHING-SQUARES it into contour segments, and keep only the segments over
// the CONCOURSE (nodes whose nearest Voronoi cell is road) — the shield masks the rest, so lines end
// cleanly at chamber walls. Pure, deterministic (no rng, no Date), node-tested by fluxfield.selftest.mjs.

// signed perpendicular offset of (x,y) from the spine centreline — the solenoid's axial coordinate.
// nearest-sample is enough: cells are tiny next to the spine's curvature.
export function bandOffset(spine, x, y) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < spine.length; i++) { const d = (spine[i].x - x) ** 2 + (spine[i].y - y) ** 2; if (d < bd) { bd = d; bi = i; } }
  const s = spine[bi];
  return (x - s.x) * (s.nx ?? 0) + (y - s.y) * (s.ny ?? 0);
}
// the background field DIRECTION (unit tangent, hub→rim) at (x,y) — for orienting a chamber's dipole
export function bandTangent(spine, x, y) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < spine.length; i++) { const d = (spine[i].x - x) ** 2 + (spine[i].y - y) ** 2; if (d < bd) { bd = d; bi = i; } }
  const s = spine[bi];
  return [(s.ny ?? 0), -(s.nx ?? 0)];
}

// interpolate the crossing point where the segment (xa,ya:va)→(xb,yb:vb) hits value L
const cross = (xa, ya, va, xb, yb, vb, L) => { const t = (L - va) / (vb - va || 1e-9); return [xa + (xb - xa) * t, ya + (yb - ya) * t]; };

// geo: { cells:[{x,y}], road:bool[], rooms:[{x,y,r}], region:{x0,y0,x1,y1}, spine|null, hub:{x,y} }
// opts: { pitch, lines }
// → { levels: [{ value, alpha, segs:[x1,y1,x2,y2,…] }], range:[lo,hi], grid:{nx,ny,h} }
export function computeFluxLines(geo, opts = {}) {
  const { cells, road, rooms, region, spine, hub } = geo;
  const nLines = opts.lines ?? 11;
  const { x0, y0, x1, y1 } = region;
  const W = Math.max(1, x1 - x0), H = Math.max(1, y1 - y0);
  // pitch, floored so a huge region can't explode the grid (~90k nodes cap)
  let h = opts.pitch ?? 8;
  while ((W / h + 2) * (H / h + 2) > 90000) h *= 1.4;
  const nx = Math.ceil(W / h) + 1, ny = Math.ceil(H / h) + 1;
  const gx = (i) => x0 + i * h, gy = (j) => y0 + j * h;

  // per-chamber: centre, radius, background axis dir (dx,dy) and its perpendicular (ex,ey)
  const ch = rooms.filter((r) => r.r > 0).map((r) => {
    let d;
    if (spine) d = bandTangent(spine, r.x, r.y);
    else { const L = Math.hypot(r.x - hub.x, r.y - hub.y) || 1; d = [(r.x - hub.x) / L, (r.y - hub.y) / L]; }
    return { cx: r.x, cy: r.y, a2: r.r * r.r, ex: -d[1], ey: d[0] };
  });

  // road mask by nearest cell centroid (Voronoi ⇒ nearest-site == cell membership), via a coarse bucket
  const B = Math.max(24, h * 3), bnx = Math.ceil(W / B) + 1, bny = Math.ceil(H / B) + 1;
  const buckets = Array.from({ length: bnx * bny }, () => []);
  for (let i = 0; i < cells.length; i++) { const bx = Math.min(bnx - 1, Math.max(0, ((cells[i].x - x0) / B) | 0)), by = Math.min(bny - 1, Math.max(0, ((cells[i].y - y0) / B) | 0)); buckets[by * bnx + bx].push(i); }
  const isRoad = (x, y) => {
    const bx = Math.min(bnx - 1, Math.max(0, ((x - x0) / B) | 0)), by = Math.min(bny - 1, Math.max(0, ((y - y0) / B) | 0));
    let best = -1, bd = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nbx = bx + dx, nby = by + dy; if (nbx < 0 || nby < 0 || nbx >= bnx || nby >= bny) continue;
      for (const ci of buckets[nby * bnx + nbx]) { const dd = (cells[ci].x - x) ** 2 + (cells[ci].y - y) ** 2; if (dd < bd) { bd = dd; best = ci; } }
    }
    return best >= 0 && road[best];
  };

  // sample ψ + mask on the grid
  const psi = new Float64Array(nx * ny), mask = new Uint8Array(nx * ny);
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const X = gx(i), Y = gy(j);
    let p = spine ? bandOffset(spine, X, Y) : Math.hypot(X - hub.x, Y - hub.y);
    for (const c of ch) { const ux = X - c.cx, uy = Y - c.cy, w = ux * c.ex + uy * c.ey, r2 = ux * ux + uy * uy; p += -c.a2 * w / Math.max(r2, c.a2); }
    const id = j * nx + i; psi[id] = p;
    const m = isRoad(X, Y) ? 1 : 0; mask[id] = m;
    if (m) { if (p < lo) lo = p; if (p > hi) hi = p; }
  }
  if (!(hi > lo)) return { levels: [], range: [0, 0], grid: { nx, ny, h } };
  const span = hi - lo, delta = span / nLines, mid = (lo + hi) / 2;

  // marching squares, per level, masked to the concourse
  const bucketOf = new Map();   // level index → { value, segs:[] }
  const lvl = (k) => { let g = bucketOf.get(k); if (!g) bucketOf.set(k, g = { value: lo + k * delta, segs: [] }); return g; };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const i00 = j * nx + i, i10 = i00 + 1, i01 = i00 + nx, i11 = i01 + 1;
    if (mask[i00] + mask[i10] + mask[i11] + mask[i01] < 2) continue;   // need a concourse majority
    const a = psi[i00], b = psi[i10], c = psi[i11], d = psi[i01];
    const clo = Math.min(a, b, c, d), chi = Math.max(a, b, c, d);
    const Xa = gx(i), Ya = gy(j), Xb = gx(i + 1), Yb = gy(j + 1);
    // corners in CCW ring order: (Xa,Ya:a) → (Xb,Ya:b) → (Xb,Yb:c) → (Xa,Yb:d)
    const CX = [Xa, Xb, Xb, Xa], CY = [Ya, Ya, Yb, Yb], CV = [a, b, c, d];
    const klo = Math.ceil((clo - lo) / delta), khi = Math.floor((chi - lo) / delta);
    for (let k = klo; k <= khi; k++) {
      const L = lo + k * delta, pts = [];
      // boolean "above" (v ≥ L) marching squares — robust when a level coincides with a corner value
      for (let e = 0; e < 4; e++) {
        const n = (e + 1) % 4, va = CV[e], vb = CV[n];
        if ((va >= L) !== (vb >= L)) pts.push(cross(CX[e], CY[e], va, CX[n], CY[n], vb, L));
      }
      const g = lvl(k);
      if (pts.length === 2) g.segs.push(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
      else if (pts.length === 4) {   // saddle — pair by the cell-centre value
        const cen = (a + b + c + d) / 4, o = cen >= L ? [0, 1, 2, 3] : [0, 3, 2, 1];
        g.segs.push(pts[o[0]][0], pts[o[0]][1], pts[o[1]][0], pts[o[1]][1], pts[o[2]][0], pts[o[2]][1], pts[o[3]][0], pts[o[3]][1]);
      }
    }
  }

  // brighter toward the centreline (thread) / core (hub); dimmer at the edges
  const levels = [...bucketOf.values()].filter((g) => g.segs.length).sort((a, b) => a.value - b.value).map((g) => {
    const t = 1 - Math.min(1, Math.abs(g.value - mid) / (span / 2 || 1));
    return { value: g.value, alpha: 0.16 + 0.42 * t, segs: g.segs };
  });
  return { levels, range: [lo, hi], grid: { nx, ny, h } };
}

if (typeof globalThis !== 'undefined') globalThis.RindFluxField = { computeFluxLines, bandOffset, bandTangent };
