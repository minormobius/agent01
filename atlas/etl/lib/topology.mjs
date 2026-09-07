// topology.mjs — build TopoJSON from GeoJSON features. No dependencies.
//
// WHY THIS EXISTS AND WHY IT MATTERS FOR THE PICTURE:
//
// A county map is 3,143 polygons that share every interior border twice. Drawn
// naively you pay for each border twice, you stroke it twice (so it renders
// heavier and blurrier than a coastline), and — the real problem — if you
// simplify each polygon independently, two sides of the same border simplify to
// DIFFERENT lines. The map fills with white slivers and overlaps. Every amateur
// county map has them.
//
// The fix is topology: cut every ring into ARCS at the points where three or
// more polygons meet, store each arc once, and let polygons reference arcs.
// Then simplification happens on the arc — both neighbours move together and
// the map stays watertight at any level of detail. Interior borders can also be
// drawn exactly once, hairline, which is most of what makes a county map look
// like cartography rather than a screenshot.
//
// Algorithm (after Bostock's topojson-server): quantize → count undirected
// edges → a vertex is a JUNCTION iff its degree ≠ 2 → cut rings at junctions →
// deduplicate arcs up to direction.

// ------------------------------------------------------------ quantizing ---

/** Bounding box over an array of GeoJSON features. */
export function bounds(features) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const visit = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0];
      if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1];
    } else for (const k of c) visit(k);
  };
  for (const f of features) if (f.geometry) visit(f.geometry.coordinates);
  return [x0, y0, x1, y1];
}

// ------------------------------------------------------------- the build ---

const key = (x, y) => x * 4294967296 + y;   // two ≤2^21 ints in one double

/**
 * @param {Array<Feature>} features   GeoJSON Polygon/MultiPolygon features
 * @param {object} opts
 * @param {number} opts.quantization   grid steps across the bbox (default 1e5)
 * @param {(f)=>string} opts.id        feature → id
 * @param {(f)=>object} opts.properties
 * @returns TopoJSON topology (arcs delta-encoded, with a `transform`)
 */
export function buildTopology(features, { quantization = 1e5, id = (f) => f.id, properties = () => ({}), name = 'units' } = {}) {
  const [x0, y0, x1, y1] = bounds(features);
  const kx = (x1 - x0) ? (quantization - 1) / (x1 - x0) : 1;
  const ky = (y1 - y0) ? (quantization - 1) / (y1 - y0) : 1;

  // 1. quantize every ring, dropping points that collapse onto their predecessor
  const rings = [];                 // flat list of quantized rings
  const geoms = [];                 // per-feature: array of polygons, each array of ring indices
  for (const f of features) {
    const g = f.geometry;
    const polys = !g ? []
      : g.type === 'Polygon' ? [g.coordinates]
      : g.type === 'MultiPolygon' ? g.coordinates
      : [];
    const out = [];
    for (const poly of polys) {
      const ringIdx = [];
      for (const ring of poly) {
        const q = [];
        for (const [lx, ly] of ring) {
          const px = Math.round((lx - x0) * kx), py = Math.round((ly - y0) * ky);
          if (q.length === 0 || q[q.length - 1][0] !== px || q[q.length - 1][1] !== py) q.push([px, py]);
        }
        // re-close, and drop rings that quantization degenerated to a sliver
        if (q.length > 1 && (q[0][0] !== q[q.length - 1][0] || q[0][1] !== q[q.length - 1][1])) q.push([q[0][0], q[0][1]]);
        if (q.length < 4) continue;
        ringIdx.push(rings.length);
        rings.push(q);
      }
      if (ringIdx.length) out.push(ringIdx);
    }
    geoms.push(out);
  }

  // 2. undirected adjacency: for each vertex, the set of distinct neighbours.
  //    A vertex with exactly two distinct neighbours sits in the middle of a
  //    border that every incident polygon follows identically — nothing can be
  //    cut there. Anything else (a triple point, a spur, a dead end) is a
  //    junction.
  const nbr = new Map();
  const link = (a, b) => {
    let s = nbr.get(a);
    if (!s) nbr.set(a, s = new Set());
    s.add(b);
  };
  for (const ring of rings) {
    for (let i = 0, n = ring.length - 1; i < n; i++) {
      const a = key(ring[i][0], ring[i][1]), b = key(ring[i + 1][0], ring[i + 1][1]);
      link(a, b); link(b, a);
    }
  }
  const isJunction = (p) => (nbr.get(key(p[0], p[1]))?.size ?? 0) !== 2;

  // 3. cut each ring at its junctions; deduplicate arcs up to direction
  const arcs = [];
  const arcIndex = new Map();       // canonical string → arc id
  const arcKey = (pts) => pts.map((p) => p[0] + ',' + p[1]).join(' ');

  const pushArc = (pts) => {
    const fwd = arcKey(pts);
    if (arcIndex.has(fwd)) return arcIndex.get(fwd);
    const rev = arcKey(pts.slice().reverse());
    if (arcIndex.has(rev)) return ~arcIndex.get(rev);
    const i = arcs.length;
    arcs.push(pts);
    arcIndex.set(fwd, i);
    return i;
  };

  const ringArcs = rings.map((ring) => {
    // find the first junction; rotate the closed ring to start there
    let start = -1;
    for (let i = 0; i < ring.length - 1; i++) if (isJunction(ring[i])) { start = i; break; }
    if (start < 0) return [pushArc(ring)];        // no junction: one closed arc
    const n = ring.length - 1;
    // Rotating a closed ring: i runs 0..n inclusive, so the last point IS the
    // first again and the ring is already closed. Pushing rot[0] a second time
    // (as this did) left a duplicate vertex at the end of every ring's LAST
    // arc, which is invisible on screen and quietly fatal: it stopped that arc
    // from matching its neighbour's copy of the same border, so the border was
    // stored twice and could simplify two different ways. That is precisely the
    // sliver the topology exists to prevent.
    const rot = [];
    for (let i = 0; i <= n; i++) rot.push(ring[(start + i) % n]);
    // walk, cutting at each junction
    const out = [];
    let cur = [rot[0]];
    for (let i = 1; i < rot.length; i++) {
      cur.push(rot[i]);
      if (i < rot.length - 1 && isJunction(rot[i])) { out.push(pushArc(cur)); cur = [rot[i]]; }
    }
    if (cur.length > 1) out.push(pushArc(cur));
    return out;
  });

  // 4. assemble geometries
  const objects = features.map((f, i) => {
    const polys = geoms[i];
    if (!polys.length) return null;
    const coords = polys.map((ringIdxs) => ringIdxs.map((r) => ringArcs[r]));
    return {
      type: polys.length === 1 ? 'Polygon' : 'MultiPolygon',
      arcs: polys.length === 1 ? coords[0] : coords,
      id: id(f),
      properties: properties(f),
    };
  }).filter(Boolean);

  return {
    type: 'Topology',
    transform: { scale: [1 / kx, 1 / ky], translate: [x0, y0] },
    bbox: [x0, y0, x1, y1],
    objects: { [name]: { type: 'GeometryCollection', geometries: objects } },
    arcs,                                          // absolute; delta-encoded on write
  };
}

// ---------------------------------------------------------- simplification --

/**
 * Visvalingam–Whyatt weights, computed per arc and applied to the SHARED arc —
 * which is the entire point: both polygons on a border lose the same points, so
 * the map cannot develop slivers.
 *
 * Returns a new topology whose arcs keep only points whose effective area is at
 * least `minArea` (in quantized-unit², so it is resolution-independent).
 */
export function simplifyTopology(topo, minArea) {
  const area = (a, b, c) => Math.abs((a[0] - c[0]) * (b[1] - a[1]) - (a[0] - b[0]) * (c[1] - a[1])) / 2;

  const simplifyArc = (pts) => {
    if (pts.length <= 3) return pts;
    const closed = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    const n = pts.length;
    const prev = new Int32Array(n), next = new Int32Array(n), dead = new Uint8Array(n);
    const eff = new Float64Array(n);
    for (let i = 0; i < n; i++) { prev[i] = i - 1; next[i] = i + 1; }

    const calc = (i) => (prev[i] < 0 || next[i] >= n ? Infinity : area(pts[prev[i]], pts[i], pts[next[i]]));

    // A lazily-deleted binary min-heap: Alaska's coastline arcs run to tens of
    // thousands of points, where a rescan-per-removal would be quadratic.
    const heap = [];
    const push = (i, a) => {
      heap.push([a, i]);
      let c = heap.length - 1;
      while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = 2 * c + 1, r = l + 1; let m = c;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === c) break;
          [heap[m], heap[c]] = [heap[c], heap[m]]; c = m;
        }
      }
      return top;
    };

    for (let i = 1; i < n - 1; i++) { eff[i] = calc(i); push(i, eff[i]); }

    let remaining = n;
    const floor = closed ? 5 : 3;
    while (heap.length && remaining > floor) {
      const [a, i] = pop();
      if (dead[i] || a !== eff[i]) continue;          // stale entry
      if (a >= minArea) break;
      dead[i] = 1; remaining--;
      const P = prev[i], N = next[i];
      next[P] = N; prev[N] = P;
      // Monotonicity: a surviving point can never be cheaper to remove than
      // one already removed, or simplification would reorder itself.
      for (const j of [P, N]) {
        if (j <= 0 || j >= n - 1 || dead[j]) continue;
        eff[j] = Math.max(a, calc(j));
        push(j, eff[j]);
      }
    }

    const out = [];
    for (let i = 0; i < n; i++) if (!dead[i]) out.push(pts[i]);
    return out.length >= (closed ? 4 : 2) ? out : pts;
  };

  return { ...topo, arcs: topo.arcs.map(simplifyArc) };
}

// -------------------------------------------------------------- encoding ---

/** Delta-encode arcs in place and return a JSON-ready topology. */
export function encodeTopology(topo) {
  const arcs = topo.arcs.map((pts) => {
    const out = [[pts[0][0], pts[0][1]]];
    for (let i = 1; i < pts.length; i++) out.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
    return out;
  });
  return { type: 'Topology', bbox: topo.bbox, transform: topo.transform, objects: topo.objects, arcs };
}

/** Count points, for reporting. */
export const pointCount = (topo) => topo.arcs.reduce((n, a) => n + a.length, 0);

/**
 * Re-quantize an already-built topology onto a coarser grid.
 *
 * WHY THIS AND NOT "just build the topology coarser": quantizing BEFORE
 * junction detection merges distinct vertices, which invents degree-3 vertices,
 * which shatters long shared borders into hundreds of tiny arcs. The coarse
 * tier then costs MORE than the fine one — all of it arc headers. Building the
 * topology once at full resolution and moving the arcs afterwards keeps the arc
 * structure intact, and because a shared arc is stored once it also stays
 * watertight: both neighbours move to exactly the same grid.
 */
export function requantize(topo, quantization) {
  const [x0, y0, x1, y1] = topo.bbox;
  const oldKx = 1 / topo.transform.scale[0], oldKy = 1 / topo.transform.scale[1];
  const kx = (x1 - x0) ? (quantization - 1) / (x1 - x0) : 1;
  const ky = (y1 - y0) ? (quantization - 1) / (y1 - y0) : 1;
  const fx = kx / oldKx, fy = ky / oldKy;

  const arcs = topo.arcs.map((pts) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const x = Math.round(pts[i][0] * fx), y = Math.round(pts[i][1] * fy);
      // keep both endpoints exactly — they are the junctions the neighbouring
      // arcs meet at, and dropping one opens a gap in somebody else's ring
      const last = out[out.length - 1];
      if (i === 0 || i === pts.length - 1 || !last || last[0] !== x || last[1] !== y) out.push([x, y]);
    }
    if (out.length < 2) out.push(out[0].slice());
    return out;
  });

  return { ...topo, transform: { scale: [1 / kx, 1 / ky], translate: [x0, y0] }, arcs };
}
