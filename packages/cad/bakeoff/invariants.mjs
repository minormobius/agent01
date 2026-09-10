// The JS mirror of engine/src/invariants.rs, for meshes that come out of the
// foreign kernels. Same numbers, same definitions; cube.selftest asserts it.
export function weld(pos, tris, tol) {
  const q = (x) => Math.round(x / tol);
  const map = new Map();
  const out = [];
  const remap = new Uint32Array(pos.length);
  pos.forEach((p, i) => {
    const key = `${q(p[0])},${q(p[1])},${q(p[2])}`;
    let idx = map.get(key);
    if (idx === undefined) { idx = out.length; out.push(p); map.set(key, idx); }
    remap[i] = idx;
  });
  const t2 = [];
  for (const t of tris) { const a = remap[t[0]], b = remap[t[1]], c = remap[t[2]]; if (a !== b && b !== c && a !== c) t2.push([a, b, c]); }
  return { pos: out, tris: t2 };
}

export function compute(mesh) {
  const { pos, tris } = mesh;
  let volume = 0, area = 0; const cx = [0, 0, 0];
  const bbox = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
  for (const p of pos) for (let i = 0; i < 3; i++) { bbox[0][i] = Math.min(bbox[0][i], p[i]); bbox[1][i] = Math.max(bbox[1][i], p[i]); }
  const dir = new Map(), uses = new Map();
  for (const t of tris) {
    const a = pos[t[0]], b = pos[t[1]], c = pos[t[2]];
    const cr = [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]];
    const v = (a[0] * cr[0] + a[1] * cr[1] + a[2] * cr[2]) / 6;
    volume += v; for (let i = 0; i < 3; i++) cx[i] += v * (a[i] + b[i] + c[i]) / 4;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    area += Math.hypot(n[0], n[1], n[2]) / 2;
    for (let k = 0; k < 3; k++) { const p = t[k], q = t[(k + 1) % 3]; const key = p < q ? p * 4294967296 + q : q * 4294967296 + p; dir.set(key, (dir.get(key) || 0) + (p < q ? 1 : -1)); uses.set(key, (uses.get(key) || 0) + 1); }
  }
  let open_edges = 0, flipped_edges = 0;
  for (const [k, u] of uses) { if (u !== 2) open_edges++; else if (dir.get(k) !== 0) flipped_edges++; }
  const used = new Uint8Array(pos.length); for (const t of tris) for (const i of t) used[i] = 1;
  let verts = 0; for (const u of used) verts += u;
  const euler = verts - uses.size + tris.length;
  if (Math.abs(volume) > 1e-12) for (let i = 0; i < 3; i++) cx[i] /= volume;
  return { volume, area, bbox, centroid: cx, euler, watertight: tris.length > 0 && open_edges === 0 && flipped_edges === 0, tris: tris.length, verts, open_edges, flipped_edges };
}

export function readStl(buf) {
  const n = buf.readUInt32LE(80); const pos = []; const tris = [];
  for (let i = 0; i < n; i++) { const o = 84 + i * 50; const t = []; for (let k = 1; k < 4; k++) { pos.push([buf.readFloatLE(o + k * 12), buf.readFloatLE(o + k * 12 + 4), buf.readFloatLE(o + k * 12 + 8)]); t.push(pos.length - 1); } tris.push(t); }
  return { pos, tris };
}

export function writeStl(mesh) {
  const { pos, tris } = mesh; const buf = Buffer.alloc(84 + tris.length * 50); buf.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => { const o = 84 + i * 50; const a = pos[t[0]], b = pos[t[1]], c = pos[t[2]]; const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]; const l = Math.hypot(...n) || 1; [n[0] / l, n[1] / l, n[2] / l, ...a, ...b, ...c].forEach((x, k) => buf.writeFloatLE(x, o + k * 4)); });
  return buf;
}

if (process.argv[1] && process.argv[1].endsWith('invariants.mjs')) {
  const p = (x, y, z) => [x, y, z];
  const pos = [p(0, 0, 0), p(1, 0, 0), p(1, 1, 0), p(0, 1, 0), p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const tris = []; for (const q of quads) { tris.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]); }
  const inv = compute({ pos, tris });
  const ok = Math.abs(inv.volume - 1) < 1e-12 && Math.abs(inv.area - 6) < 1e-12 && inv.euler === 2 && inv.watertight;
  console.log(ok ? '✓ invariants.mjs cube' : '✗ invariants.mjs cube', inv);
  process.exit(ok ? 0 : 1);
}
