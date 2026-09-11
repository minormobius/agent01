// manifold-kernel.js — the preview kernel. Takes a loaded Manifold module and
// the engine's resolved tree (sampled polylines), returns a flat mesh in
// milliseconds. Every op is a CrossSection extrude/revolve or a mesh boolean.
// Manifold's per-triangle `faceID` (coplanar-face ids) rides along as `fid`.

const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dir3 = (f, d) => [0, 1, 2].map((i) => f.u[i] * d[0] + f.v[i] * d[1]);
const to3 = (f, p) => [0, 1, 2].map((i) => f.o[i] + f.u[i] * p[0] + f.v[i] * p[1]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const frameMat = (f) => [f.u[0], f.u[1], f.u[2], 0, f.v[0], f.v[1], f.v[2], 0, f.n[0], f.n[1], f.n[2], 0, f.o[0], f.o[1], f.o[2], 1];

export function buildManifold({ Manifold, CrossSection }, resolved, { segments = 256, keep = false } = {}) {
  const t0 = performance.now();
  const polys = new Map(resolved.polylines.map((p) => [p.id, p]));
  const rings = (ids) => ids.flatMap((id) => polys.get(id).rings.map((r) => r.map(([x, y]) => [x, y])));
  const solids = new Map();
  const live = [];
  let body = null;
  const combine = (b, tool, mode) => {
    if (b === null || mode === 'new') return tool;
    if (mode === 'add') return Manifold.union(b, tool);
    if (mode === 'cut') return Manifold.difference(b, tool);
    if (mode === 'intersect') return Manifold.intersection(b, tool);
    throw new Error(`unknown mode ${mode}`);
  };
  try {
    for (const op of resolved.resolved.ops) {
      let s;
      if (op.op === 'extrude') {
        const cs = new CrossSection(rings(op.sketches), 'EvenOdd');
        let m = cs.extrude(Math.abs(op.depth));
        if (op.depth < 0) m = m.translate(0, 0, op.depth);
        s = m.transform(frameMat(op.frame));
        cs.delete();
      } else if (op.op === 'revolve') {
        if (Math.abs(op.angle_deg - 360) > 1e-9) return { ok: false, error: { op: op.id, msg: 'partial revolve is not wired for manifold', unsupported: true }, ms: performance.now() - t0 };
        const d = op.axis_d, l = Math.hypot(d[0], d[1]); const ad = [d[0] / l, d[1] / l];
        let perp = [-ad[1], ad[0]];
        const ring0 = polys.get(op.sketches[0]).rings[0];
        const side = (p) => (p[0] - op.axis_p[0]) * perp[0] + (p[1] - op.axis_p[1]) * perp[1];
        const far = ring0.reduce((a, b) => (Math.abs(side(b)) > Math.abs(side(a)) ? b : a));
        if (side(far) < 0) perp = [-perp[0], -perp[1]];
        const prof = rings(op.sketches).map((r) => r.map(([x, y]) => { const dx = x - op.axis_p[0], dy = y - op.axis_p[1]; return [Math.max(0, dx * perp[0] + dy * perp[1]), dx * ad[0] + dy * ad[1]]; }));
        const cs = new CrossSection(prof, 'EvenOdd');
        const m = cs.revolve(segments);
        cs.delete();
        const Z = norm3(dir3(op.frame, ad)), X = norm3(dir3(op.frame, perp)), Y = cross(Z, X), O = to3(op.frame, op.axis_p);
        s = m.transform([X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, O[0], O[1], O[2], 1]);
      } else if (op.op === 'boolean') {
        const a = solids.get(op.a), b = solids.get(op.b);
        s = op.kind === 'union' ? Manifold.union(a, b) : op.kind === 'cut' ? Manifold.difference(a, b) : Manifold.intersection(a, b);
        solids.set(op.id, s); live.push(s); body = s; continue;
      } else {
        return { ok: false, error: { op: op.id, msg: `${op.op} is not supported by this kernel`, unsupported: true }, ms: performance.now() - t0 };
      }
      solids.set(op.id, s); live.push(s);
      body = combine(body, s, op.mode);
      live.push(body);
    }
    if (!body) return { ok: false, error: { op: 'tree', msg: 'no solid-producing feature' }, ms: performance.now() - t0 };
    const mg = body.getMesh();
    const np = mg.numProp;
    const nv = mg.vertProperties.length / np;
    const pos = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) { pos[3 * i] = mg.vertProperties[i * np]; pos[3 * i + 1] = mg.vertProperties[i * np + 1]; pos[3 * i + 2] = mg.vertProperties[i * np + 2]; }
    const idx = Uint32Array.from(mg.triVerts);
    const fid = mg.faceID && mg.faceID.length ? Uint32Array.from(mg.faceID) : undefined;
    const kernelVolume = body.volume(), genus = body.genus();
    const bb = body.boundingBox();
    for (const s of new Set(live)) { if (keep && s === body) continue; try { s.delete(); } catch {} }
    return { ok: true, ms: performance.now() - t0, mesh: { pos, idx, fid }, kernelVolume, genus, bbox: [bb.min, bb.max], manifold: keep ? body : null };
  } catch (e) {
    for (const s of new Set(live)) { try { s.delete(); } catch {} }
    return { ok: false, error: { op: '?', msg: String(e?.message ?? e).slice(0, 200) }, ms: performance.now() - t0 };
  }
}
