// craft/tiling.mjs — the floor plan of a craft world: one 2D tiling, as a graph.
//
// A craft world is a stack of prism voxels. Each COLUMN is one tile of a plane
// tiling; `y` stacks layers on it. Everything lateral in the game — walking,
// mining reach, leaf blobs, ore veins, mob pathing — runs on the adjacency
// graph this module builds (two columns are neighbours when their polygons
// share an edge), so a Penrose world is not a skin over a square grid: the
// rules themselves are Penrose.
//
// THE TILINGS ARE FOAM'S. The generators below are a port of the ten
// TILE_SHAPES in foam/dungeon.mjs (owned by another branch; do not edit it
// from here) with the same constants, offsets and tile-centre conventions,
// so seed-for-seed the plan under a craft world is the plan under a foam
// dungeon floor. The port exists because mega's assets cannot import across
// surfaces; test/craft.selftest.mjs imports foam's discretizeRoom directly and
// asserts the two produce the SAME tile centres for every shape — if foam
// changes a tiling, that test is where it breaks.
//
// Pure, dependency-free ESM: runs identically in node and the browser.

export const SHAPES = ['grid', 'hex', 'penrose', 'ammann', 'seven', 'rhombille',
  'snub', 'kagome', 'rhombitri', 'truncsq'];

// ------------------------------------------------ foam's generators, ported --
// Each pushes { x, z, poly } for every tile whose centre `inside(x, z)` accepts.
// Centre conventions match foam exactly: rhombs use the midpoint of the
// v0–v2 diagonal, periodic prototiles the vertex mean, lattices the cell centre.

function multigridRhombs(dirs, G, pre, minX, maxX, minZ, maxZ, u, inside, out) {
  const N = dirs.length;
  const x0 = (minX / u) * pre - 2, x1 = (maxX / u) * pre + 2;
  const z0 = (minZ / u) * pre - 2, z1 = (maxZ / u) * pre + 2;
  const rangeOf = (k) => {
    let lo = Infinity, hi = -Infinity;
    for (const [bx, bz] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]]) {
      const d = bx * dirs[k][0] + bz * dirs[k][1] + G[k];
      lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
    return [Math.floor(lo) - 1, Math.ceil(hi) + 1];
  };
  for (let k = 0; k < N; k++) {
    for (let l = k + 1; l < N; l++) {
      const det = dirs[k][0] * dirs[l][1] - dirs[k][1] * dirs[l][0];
      if (Math.abs(det) < 1e-9) continue;
      const [rk0, rk1] = rangeOf(k), [rl0, rl1] = rangeOf(l);
      for (let r = rk0; r <= rk1; r++) {
        for (let s2 = rl0; s2 <= rl1; s2++) {
          const a = r - G[k], b = s2 - G[l];
          const px = (a * dirs[l][1] - b * dirs[k][1]) / det;
          const pz = (b * dirs[k][0] - a * dirs[l][0]) / det;
          if (px < x0 || px > x1 || pz < z0 || pz > z1) continue;
          const K = [];
          for (let m = 0; m < N; m++) K[m] = Math.ceil(px * dirs[m][0] + pz * dirs[m][1] + G[m] - 1e-9);
          const verts = [];
          for (const [dk, dl] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
            K[k] = r + dk; K[l] = s2 + dl;
            let vx = 0, vz = 0;
            for (let m = 0; m < N; m++) { vx += K[m] * dirs[m][0]; vz += K[m] * dirs[m][1]; }
            verts.push([vx * u, vz * u]);
          }
          const area2 = (verts[1][0] - verts[0][0]) * (verts[2][1] - verts[0][1]) -
                        (verts[1][1] - verts[0][1]) * (verts[2][0] - verts[0][0]);
          if (area2 < 0) verts.reverse();
          const cx = (verts[0][0] + verts[2][0]) / 2, cz = (verts[0][1] + verts[2][1]) / 2;
          if (inside(cx, cz)) out.push({ x: cx, z: cz, poly: verts });
        }
      }
    }
  }
}

function archimedeanCell(shape) {
  const s3 = Math.sqrt(3);
  let protos, T1, T2;
  if (shape === 'snub') {
    const e = (s3 - 1) / 4, f = (s3 + 1) / 4, a = 2 * f;
    protos = [
      [[-e, -f], [f, -e], [e, f], [-f, e]],
      [[f, -e], [a + e, -f], [a + f, e], [a - e, f]],
      [[a - e, f], [e, f], [f, -e]],
      [[f, -e], [f, -e - 1], [a + e, -f]],
      [[2 * a - e, -f], [a + f, e], [a + e, -f]],
      [[a + f, e + 1], [a - e, f], [a + f, e]],
    ];
    T1 = [a, a]; T2 = [a, -a];
  } else if (shape === 'kagome') {
    const hex = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3)]);
    protos = [hex, [[1, 0], [1.5, s3 / 2], [0.5, s3 / 2]], [[0.5, -s3 / 2], [1.5, -s3 / 2], [1, 0]]];
    T1 = [2, 0]; T2 = [1, s3];
  } else if (shape === 'rhombitri') {
    const a = 1 + s3;
    const hex = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3)]);
    protos = [hex];
    for (const ed of [0, 1, 2]) {
      const p1 = hex[ed], p2 = hex[ed + 1];
      const n = [Math.cos((ed + 0.5) * Math.PI / 3), Math.sin((ed + 0.5) * Math.PI / 3)];
      protos.push([p1, [p1[0] + n[0], p1[1] + n[1]], [p2[0] + n[0], p2[1] + n[1]], p2]);
    }
    for (const vi of [0, 1]) {
      const v = hex[vi];
      const nA = [Math.cos((vi - 0.5) * Math.PI / 3), Math.sin((vi - 0.5) * Math.PI / 3)];
      const nB = [Math.cos((vi + 0.5) * Math.PI / 3), Math.sin((vi + 0.5) * Math.PI / 3)];
      protos.push([v, [v[0] + nA[0], v[1] + nA[1]], [v[0] + nB[0], v[1] + nB[1]]]);
    }
    T1 = [a * s3 / 2, a / 2]; T2 = [0, a];
  } else {
    const a = 1 + Math.SQRT2;
    const R = 1 / (2 * Math.sin(Math.PI / 8));
    const oct = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [R * Math.cos((k + 0.5) * Math.PI / 4), R * Math.sin((k + 0.5) * Math.PI / 4)]);
    const h = Math.SQRT1_2;
    protos = [oct, [[a / 2 + h, a / 2], [a / 2, a / 2 + h], [a / 2 - h, a / 2], [a / 2, a / 2 - h]]];
    T1 = [a, 0]; T2 = [0, a];
  }
  for (const P of protos) {
    let s = 0;
    for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += p[0] * q[1] - q[0] * p[1]; }
    if (s < 0) P.reverse();
  }
  return { protos, T1, T2 };
}

function periodicTiling(shape, minX, maxX, minZ, maxZ, u, inside, out) {
  const { protos, T1, T2 } = archimedeanCell(shape);
  const det = T1[0] * T2[1] - T1[1] * T2[0];
  const su = u * Math.sqrt(protos.length / Math.abs(det));
  let m0 = Infinity, m1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (const [bx, bz] of [[minX, minZ], [minX, maxZ], [maxX, minZ], [maxX, maxZ]]) {
    const x = bx / su, z = bz / su;
    const m = (x * T2[1] - z * T2[0]) / det, n = (T1[0] * z - T1[1] * x) / det;
    m0 = Math.min(m0, m); m1 = Math.max(m1, m);
    n0 = Math.min(n0, n); n1 = Math.max(n1, n);
  }
  m0 = Math.floor(m0) - 2; m1 = Math.ceil(m1) + 2;
  n0 = Math.floor(n0) - 2; n1 = Math.ceil(n1) + 2;
  for (let m = m0; m <= m1; m++) {
    for (let n = n0; n <= n1; n++) {
      const ox = m * T1[0] + n * T2[0], oz = m * T1[1] + n * T2[1];
      for (let p = 0; p < protos.length; p++) {
        const verts = protos[p].map(([x, z]) => [(x + ox) * su, (z + oz) * su]);
        let cx = 0, cz = 0;
        for (const [vx, vz] of verts) { cx += vx; cz += vz; }
        cx /= verts.length; cz /= verts.length;
        if (inside(cx, cz)) out.push({ x: cx, z: cz, poly: verts });
      }
    }
  }
}

// Raw tiles over a bbox — the exact foam enumeration, with polygons for the
// lattice shapes too (foam's grid/hex carry none; craft needs every prism).
export function rawTiles(shape, minX, maxX, minZ, maxZ, tileSize, inside) {
  const out = [];
  if (shape === 'hex') {
    const R = tileSize / Math.sqrt(3);
    const r0 = Math.floor(minZ / (1.5 * R)) - 2, r1 = Math.ceil(maxZ / (1.5 * R)) + 2;
    for (let r = r0; r <= r1; r++) {
      const q0 = Math.floor(minX / (Math.sqrt(3) * R) - r / 2) - 2;
      const q1 = Math.ceil(maxX / (Math.sqrt(3) * R) - r / 2) + 2;
      for (let q = q0; q <= q1; q++) {
        const x = Math.sqrt(3) * R * (q + r / 2), z = 1.5 * R * r;
        if (x < minX - R || x > maxX + R || z < minZ - R || z > maxZ + R) continue;
        if (!inside(x, z)) continue;
        const poly = [0, 1, 2, 3, 4, 5].map((k) => {
          const th = Math.PI / 6 + k * Math.PI / 3;
          return [x + R * Math.cos(th), z + R * Math.sin(th)];
        });
        out.push({ x, z, poly });
      }
    }
  } else if (shape === 'penrose') {
    const G = [0.1375, 0.2632, -0.1141, 0.0523, -0.3389];
    const dirs = [0, 1, 2, 3, 4].map((k) => [Math.cos(2 * Math.PI * k / 5), Math.sin(2 * Math.PI * k / 5)]);
    multigridRhombs(dirs, G, 0.4, minX, maxX, minZ, maxZ, tileSize, inside, out);
  } else if (shape === 'ammann') {
    const G = [0.171, -0.077, 0.313, -0.407];
    const dirs = [0, 1, 2, 3].map((k) => [Math.cos(Math.PI * k / 4), Math.sin(Math.PI * k / 4)]);
    multigridRhombs(dirs, G, 0.5, minX, maxX, minZ, maxZ, tileSize, inside, out);
  } else if (shape === 'seven') {
    const G = [0.123, -0.201, 0.077, 0.291, -0.154, 0.033, -0.169];
    const dirs = [0, 1, 2, 3, 4, 5, 6].map((k) => [Math.cos(2 * Math.PI * k / 7), Math.sin(2 * Math.PI * k / 7)]);
    multigridRhombs(dirs, G, 2 / 7, minX, maxX, minZ, maxZ, tileSize, inside, out);
  } else if (shape === 'snub' || shape === 'kagome' || shape === 'rhombitri' || shape === 'truncsq') {
    periodicTiling(shape, minX, maxX, minZ, maxZ, tileSize, inside, out);
  } else if (shape === 'rhombille') {
    const t = tileSize;
    const P = (i, j) => [(i + j / 2) * t, j * (Math.sqrt(3) / 2) * t];
    const i0 = Math.floor((minX - maxZ) / t) - 2, i1 = Math.ceil(maxX / t) + 2;
    const j0 = Math.floor(minZ / (t * Math.sqrt(3) / 2)) - 2, j1 = Math.ceil(maxZ / (t * Math.sqrt(3) / 2)) + 2;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const c = ((i - j) % 3 + 3) % 3;
        const A = P(i, j), B = P(i + 1, j), C = P(i, j + 1);
        let verts;
        if (c === 0)      verts = [A, B, P(i + 1, j + 1), C];
        else if (c === 1) verts = [P(i + 1, j - 1), B, C, A];
        else              verts = [B, C, P(i - 1, j + 1), A];
        const area2 = (verts[1][0] - verts[0][0]) * (verts[2][1] - verts[0][1]) -
                      (verts[1][1] - verts[0][1]) * (verts[2][0] - verts[0][0]);
        if (area2 < 0) verts.reverse();
        const cx = (verts[0][0] + verts[2][0]) / 2, cz = (verts[0][1] + verts[2][1]) / 2;
        if (inside(cx, cz)) out.push({ x: cx, z: cz, poly: verts });
      }
    }
  } else if (shape === 'grid') {
    const t = tileSize;
    const i0 = Math.floor(minX / t), i1 = Math.ceil(maxX / t);
    const j0 = Math.floor(minZ / t), j1 = Math.ceil(maxZ / t);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = (i + 0.5) * t, z = (j + 0.5) * t;
        if (inside(x, z)) out.push({ x, z, poly: [[i * t, j * t], [(i + 1) * t, j * t], [(i + 1) * t, (j + 1) * t], [i * t, (j + 1) * t]] });
      }
    }
  } else {
    throw new Error(`unknown tiling shape '${shape}' — one of ${SHAPES.join(', ')}`);
  }
  return out;
}

// ------------------------------------------------------------ the graph ------
// buildTiling(shape, radius): every tile whose centre lies in the disc of
// `radius` (tile edge = 1), sorted into a canonical order, with adjacency.
//
//   cols[i] = { x, z, poly: [[x,z]…] CCW, area, nb: [colIndex | -1 per edge] }
//
// nb[e] is the column across poly edge e → e+1, or −1 on the rim. Vertices
// are WELDED with a tolerance before edges are matched: the multigrid rhombs
// share corners bit-identically, but the periodic tilings compute a shared
// corner from two different translations and can disagree in the last bits.
export function buildTiling(shape, radius) {
  const r2 = radius * radius;
  const raw = rawTiles(shape, -radius, radius, -radius, radius, 1, (x, z) => x * x + z * z <= r2);
  // canonical order: row-major on rounded centre, so indices are stable
  raw.sort((a, b) => (Math.round(a.z * 1e6) - Math.round(b.z * 1e6)) || (a.x - b.x));
  const EPS = 1e-6, B = 1e-3;
  const buckets = new Map(), verts = [];
  const weld = (x, z) => {
    const bx = Math.floor(x / B), bz = Math.floor(z / B);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = buckets.get((bx + dx) + ',' + (bz + dz));
      if (!list) continue;
      for (const id of list) {
        const v = verts[id];
        if (Math.abs(v[0] - x) < EPS && Math.abs(v[1] - z) < EPS) return id;
      }
    }
    const id = verts.length;
    verts.push([x, z]);
    const k = bx + ',' + bz;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(id);
    return id;
  };
  const cols = raw.map((t) => {
    let area = 0;
    for (let i = 0; i < t.poly.length; i++) {
      const p = t.poly[i], q = t.poly[(i + 1) % t.poly.length];
      area += p[0] * q[1] - q[0] * p[1];
    }
    return { x: t.x, z: t.z, poly: t.poly, vid: t.poly.map(([x, z]) => weld(x, z)), area: area / 2, nb: [] };
  });
  const edgeOwner = new Map();
  cols.forEach((c, ci) => {
    const n = c.vid.length;
    c.nb = new Array(n).fill(-1);
    for (let e = 0; e < n; e++) {
      const a = c.vid[e], b = c.vid[(e + 1) % n];
      const key = a < b ? a + ':' + b : b + ':' + a;
      const other = edgeOwner.get(key);
      if (other) {
        const [oc, oe] = other;
        c.nb[e] = oc; cols[oc].nb[oe] = ci;
      } else edgeOwner.set(key, [ci, e]);
    }
  });
  for (const c of cols) delete c.vid;
  // neighbour lists without the rim, for graph walks
  for (const c of cols) c.adj = c.nb.filter((j) => j >= 0);
  // longest centre-to-centre hop — the A* heuristic divides by it
  let maxHop = 0;
  cols.forEach((c) => { for (const j of c.adj) maxHop = Math.max(maxHop, Math.hypot(c.x - cols[j].x, c.z - cols[j].z)); });
  return { shape, radius, cols, maxHop };
}

// A uniform bucket grid for point → column lookups (the ASCII renderer and the
// viewer's picking both need "which column is under (x, z)").
export function columnLocator(tiling) {
  const S = 1;
  const grid = new Map();
  tiling.cols.forEach((c, i) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of c.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let bx = Math.floor(x0 / S); bx <= Math.floor(x1 / S); bx++)
      for (let bz = Math.floor(z0 / S); bz <= Math.floor(z1 / S); bz++) {
        const k = bx + ',' + bz;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
  });
  return (x, z) => {
    const list = grid.get(Math.floor(x / S) + ',' + Math.floor(z / S));
    if (!list) return -1;
    for (const i of list) if (inPoly(tiling.cols[i].poly, x, z)) return i;
    return -1;
  };
}

export function inPoly(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
