// mesh.js — one mesh representation for the harness, the worker and the
// viewer: flat typed arrays. `pos` is xyz×n (Float32Array), `idx` is
// tri×3 (Uint32Array), `fid` is one face id per triangle (Uint32Array,
// optional). Everything the viewer draws and every number the harness scores
// is derived here, from the same code the engine's invariants.rs mirrors.

export function weld(mesh, tol = 1e-5) {
  const { pos, idx } = mesh;
  const n = pos.length / 3;
  const map = new Map();
  const remap = new Uint32Array(n);
  const out = [];
  const q = (x) => Math.round(x / tol);
  for (let i = 0; i < n; i++) {
    const key = `${q(pos[3 * i])},${q(pos[3 * i + 1])},${q(pos[3 * i + 2])}`;
    let j = map.get(key);
    if (j === undefined) { j = out.length / 3; out.push(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); map.set(key, j); }
    remap[i] = j;
  }
  const tris = [], fids = [];
  const m = idx.length / 3;
  for (let t = 0; t < m; t++) {
    const a = remap[idx[3 * t]], b = remap[idx[3 * t + 1]], c = remap[idx[3 * t + 2]];
    if (a !== b && b !== c && a !== c) { tris.push(a, b, c); if (mesh.fid) fids.push(mesh.fid[t]); }
  }
  return { pos: Float32Array.from(out), idx: Uint32Array.from(tris), fid: mesh.fid ? Uint32Array.from(fids) : undefined };
}

export function invariants(mesh) {
  const { pos, idx } = mesh;
  const n = pos.length / 3, m = idx.length / 3;
  let volume = 0, area = 0;
  const cx = [0, 0, 0];
  const bbox = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = pos[3 * i + k]; if (v < bbox[0][k]) bbox[0][k] = v; if (v > bbox[1][k]) bbox[1][k] = v; }
  const dir = new Map(), uses = new Map();
  const used = new Uint8Array(n);
  for (let t = 0; t < m; t++) {
    const ia = idx[3 * t], ib = idx[3 * t + 1], ic = idx[3 * t + 2];
    used[ia] = used[ib] = used[ic] = 1;
    const ax = pos[3 * ia], ay = pos[3 * ia + 1], az = pos[3 * ia + 2];
    const bx = pos[3 * ib], by = pos[3 * ib + 1], bz = pos[3 * ib + 2];
    const cx_ = pos[3 * ic], cy = pos[3 * ic + 1], cz = pos[3 * ic + 2];
    const crx = by * cz - bz * cy, cry = bz * cx_ - bx * cz, crz = bx * cy - by * cx_;
    const v = (ax * crx + ay * cry + az * crz) / 6;
    volume += v; cx[0] += v * (ax + bx + cx_) / 4; cx[1] += v * (ay + by + cy) / 4; cx[2] += v * (az + bz + cz) / 4;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx_ - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    area += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
    const tri = [ia, ib, ic];
    for (let k = 0; k < 3; k++) {
      const p = tri[k], q = tri[(k + 1) % 3];
      const key = p < q ? p * 4294967296 + q : q * 4294967296 + p;
      dir.set(key, (dir.get(key) || 0) + (p < q ? 1 : -1));
      uses.set(key, (uses.get(key) || 0) + 1);
    }
  }
  let open_edges = 0, flipped_edges = 0;
  for (const [k, u] of uses) { if (u !== 2) open_edges++; else if (dir.get(k) !== 0) flipped_edges++; }
  let verts = 0; for (let i = 0; i < n; i++) verts += used[i];
  const euler = verts - uses.size + m;
  if (Math.abs(volume) > 1e-12) for (let k = 0; k < 3; k++) cx[k] /= volume;
  return { volume, area, bbox, centroid: cx, euler, watertight: m > 0 && open_edges === 0 && flipped_edges === 0, tris: m, verts, open_edges, flipped_edges };
}

/// Feature edges: every mesh edge whose two triangles meet at more than
/// `angleDeg`, plus every boundary edge. Returns xyz pairs, ready for GL_LINES.
export function featureEdges(mesh, angleDeg = 25) {
  const { pos, idx } = mesh;
  const m = idx.length / 3;
  const nrm = new Float32Array(m * 3);
  for (let t = 0; t < m; t++) {
    const ia = idx[3 * t], ib = idx[3 * t + 1], ic = idx[3 * t + 2];
    const ux = pos[3 * ib] - pos[3 * ia], uy = pos[3 * ib + 1] - pos[3 * ia + 1], uz = pos[3 * ib + 2] - pos[3 * ia + 2];
    const vx = pos[3 * ic] - pos[3 * ia], vy = pos[3 * ic + 1] - pos[3 * ia + 1], vz = pos[3 * ic + 2] - pos[3 * ia + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nrm[3 * t] = nx / l; nrm[3 * t + 1] = ny / l; nrm[3 * t + 2] = nz / l;
  }
  const first = new Map();
  const out = [];
  const cosT = Math.cos((angleDeg * Math.PI) / 180);
  const seen = new Map();
  for (let t = 0; t < m; t++) {
    for (let k = 0; k < 3; k++) {
      const p = idx[3 * t + k], q = idx[3 * t + ((k + 1) % 3)];
      const key = p < q ? p * 4294967296 + q : q * 4294967296 + p;
      const o = first.get(key);
      if (o === undefined) { first.set(key, t); continue; }
      seen.set(key, 2);
      const d = nrm[3 * o] * nrm[3 * t] + nrm[3 * o + 1] * nrm[3 * t + 1] + nrm[3 * o + 2] * nrm[3 * t + 2];
      if (d < cosT) out.push(pos[3 * p], pos[3 * p + 1], pos[3 * p + 2], pos[3 * q], pos[3 * q + 1], pos[3 * q + 2]);
    }
  }
  for (const [key] of first) if (!seen.has(key)) { const p = Math.floor(key / 4294967296), q = key % 4294967296; out.push(pos[3 * p], pos[3 * p + 1], pos[3 * p + 2], pos[3 * q], pos[3 * q + 1], pos[3 * q + 2]); }
  return Float32Array.from(out);
}

/// De-indexed, flat-shaded vertex streams for the renderer: position, normal
/// and face id per vertex (three vertices per triangle).
export function flatStreams(mesh) {
  const { pos, idx, fid } = mesh;
  const m = idx.length / 3;
  const p3 = new Float32Array(m * 9), n3 = new Float32Array(m * 9), f3 = new Float32Array(m * 3);
  for (let t = 0; t < m; t++) {
    const ia = idx[3 * t], ib = idx[3 * t + 1], ic = idx[3 * t + 2];
    const ax = pos[3 * ia], ay = pos[3 * ia + 1], az = pos[3 * ia + 2];
    const bx = pos[3 * ib], by = pos[3 * ib + 1], bz = pos[3 * ib + 2];
    const cx = pos[3 * ic], cy = pos[3 * ic + 1], cz = pos[3 * ic + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const o = t * 9;
    p3.set([ax, ay, az, bx, by, bz, cx, cy, cz], o);
    n3.set([nx, ny, nz, nx, ny, nz, nx, ny, nz], o);
    const f = fid ? fid[t] : 0;
    f3[3 * t] = f; f3[3 * t + 1] = f; f3[3 * t + 2] = f;
  }
  return { p3, n3, f3, count: m * 3 };
}

export function bbox(mesh) {
  const { pos } = mesh; const b = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { if (pos[i + k] < b[0][k]) b[0][k] = pos[i + k]; if (pos[i + k] > b[1][k]) b[1][k] = pos[i + k]; }
  return b;
}

export function writeStl(mesh) {
  const { pos, idx } = mesh; const m = idx.length / 3;
  const buf = new ArrayBuffer(84 + m * 50); const dv = new DataView(buf);
  dv.setUint32(80, m, true);
  for (let t = 0; t < m; t++) {
    const o = 84 + t * 50;
    const ia = idx[3 * t], ib = idx[3 * t + 1], ic = idx[3 * t + 2];
    const a = [pos[3 * ia], pos[3 * ia + 1], pos[3 * ia + 2]], b = [pos[3 * ib], pos[3 * ib + 1], pos[3 * ib + 2]], c = [pos[3 * ic], pos[3 * ic + 1], pos[3 * ic + 2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...n) || 1;
    [n[0] / l, n[1] / l, n[2] / l, ...a, ...b, ...c].forEach((x, k) => dv.setFloat32(o + k * 4, x, true));
  }
  return new Uint8Array(buf);
}

export function readStl(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const m = dv.getUint32(80, true);
  const pos = new Float32Array(m * 9), idx = new Uint32Array(m * 3);
  for (let t = 0; t < m; t++) { const o = 84 + t * 50; for (let k = 0; k < 9; k++) pos[9 * t + k] = dv.getFloat32(o + 12 + k * 4, true); idx[3 * t] = 3 * t; idx[3 * t + 1] = 3 * t + 1; idx[3 * t + 2] = 3 * t + 2; }
  return { pos, idx };
}

export function cubeSelftest() {
  const P = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const tris = []; for (const q of quads) tris.push(q[0], q[1], q[2], q[0], q[2], q[3]);
  const mesh = { pos: Float32Array.from(P), idx: Uint32Array.from(tris) };
  const inv = invariants(mesh);
  const edges = featureEdges(mesh);
  return { ok: Math.abs(inv.volume - 1) < 1e-9 && Math.abs(inv.area - 6) < 1e-9 && inv.euler === 2 && inv.watertight && edges.length === 12 * 6, inv, edges: edges.length / 6 };
}
