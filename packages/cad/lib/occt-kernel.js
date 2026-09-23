// occt-kernel.js — the exact kernel, as a pure function of a loaded
// opencascade.js 1.1.1 module and the engine's resolved tree. Consumes the
// exact loops (lines, arcs, cubic Béziers), so this is B-rep against B-rep.
// Fillets go on the edges of the named face, found by matching the engine's
// reference face centroid/normal: the naming bridge for a foreign kernel.
// The loader (node shim or browser fetch) lives with the caller.

export function buildOcct(oc, resolved, { wantStep = false, refFaces = null, defl = 0.01 } = {}) {
  const t0 = performance.now();
  const P = (p) => new oc.gp_Pnt_3(p[0], p[1], p[2]);
  const to3 = (f, p) => [0, 1, 2].map((i) => f.o[i] + f.u[i] * p[0] + f.v[i] * p[1]);
  const dir3 = (f, d) => [0, 1, 2].map((i) => f.u[i] * d[0] + f.v[i] * d[1]);
  const reverseLoop = (l) => { const ends = [l.start, ...l.segs.map((s) => s.to)]; const segs = []; for (let i = l.segs.length - 1; i >= 0; i--) { const s = l.segs[i]; const to = ends[i]; segs.push(s.kind === 'line' ? { kind: 'line', to } : s.kind === 'arc' ? { kind: 'arc', to, via: s.via } : { kind: 'bezier', to, ctrl: [...s.ctrl].reverse() }); } return { start: ends[l.segs.length], segs }; };
  const wireOf = (frame, loop) => {
    const w = new oc.BRepBuilderAPI_MakeWire_1();
    let cur = loop.start;
    for (let i = 0; i < loop.segs.length; i++) {
      const s = loop.segs[i];
      const a = P(to3(frame, cur)), b = P(to3(frame, i + 1 === loop.segs.length ? loop.start : s.to));
      let e;
      if (s.kind === 'line') e = new oc.BRepBuilderAPI_MakeEdge_3(a, b);
      else if (s.kind === 'arc') e = new oc.BRepBuilderAPI_MakeEdge_26(new oc.Handle_Geom_Curve_2(new oc.GC_MakeArcOfCircle_4(a, P(to3(frame, s.via)), b).Value().get()), a, b);
      else {
        const arr = new oc.TColgp_Array1OfPnt_2(1, s.ctrl.length + 2);
        arr.SetValue(1, a); s.ctrl.forEach((c, k) => arr.SetValue(k + 2, P(to3(frame, c)))); arr.SetValue(s.ctrl.length + 2, b);
        e = new oc.BRepBuilderAPI_MakeEdge_26(new oc.Handle_Geom_Curve_2(new oc.Geom_BezierCurve_1(arr)), a, b);
      }
      if (!e.IsDone()) throw new Error(`edge ${i} of loop failed`);
      w.Add_1(e.Edge());
      cur = s.to;
    }
    if (!w.IsDone()) throw new Error('wire not closed');
    return w.Wire();
  };
  const oprings = new Map((resolved.oprings || []).map((o) => [o.id, o]));
  // One face per outer loop (with its holes), from the op-level rings — the
  // engine decided outer vs hole across the op's whole profile. Exact loops
  // come from the op's region; orientation is made to match the ring's.
  const facesOf = (op) => {
    const or = oprings.get(op.id);
    if (!or) throw new Error(`no op rings for ${op.id} (engine too old?)`);
    const groups = [];
    or.rings.forEach((ring, k) => {
      const loop = op.region.loops[or.loop_index[k]];
      let area = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; area += p[0] * q[1] - q[0] * p[1]; }
      const ends = [loop.start, ...loop.segs.map((s) => s.to)]; let a2 = 0; for (let i = 0; i < ends.length - 1; i++) { const p = ends[i], q = ends[i + 1]; a2 += p[0] * q[1] - q[0] * p[1]; }
      const L = (a2 > 0) !== (area > 0) ? reverseLoop(loop) : loop;
      const w = wireOf(op.frame, L);
      if (or.outer[k]) groups.push({ face: new oc.BRepBuilderAPI_MakeFace_15(w, false).Face(), holes: [] });
      else groups[groups.length - 1].holes.push(w);
    });
    return groups.map((g) => { let face = g.face; for (const h of g.holes) { const mf = new oc.BRepBuilderAPI_MakeFace_22(face, h); if (!mf.IsDone()) throw new Error('hole failed'); face = mf.Face(); } return face; });
  };
  const fuseAll = (shapes) => shapes.reduce((a, b) => (a === null ? b : new oc.BRepAlgoAPI_Fuse_3(a, b).Shape()), null);
  const vol = (sh) => { const g = new oc.GProp_GProps_1(); oc.BRepGProp.VolumeProperties_1(sh, g, false, false, false); return g.Mass(); };
  const combine = (b, t, mode) => {
    if (b === null || mode === 'new') return t;
    const op = mode === 'add' ? new oc.BRepAlgoAPI_Fuse_3(b, t) : mode === 'cut' ? new oc.BRepAlgoAPI_Cut_3(b, t) : new oc.BRepAlgoAPI_Common_3(b, t);
    return op.Shape();
  };
  const tessellate = (shape, d) => {
    new oc.BRepMesh_IncrementalMesh_2(shape, d, false, 0.5, false);
    const pos = [], idx = [], fid = [], faces = [];
    const ex = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    for (; ex.More(); ex.Next()) {
      const face = oc.TopoDS.Face_1(ex.Current());
      const loc = new oc.TopLoc_Location_1();
      const h = oc.BRep_Tool.Triangulation(face, loc);
      if (h.IsNull()) continue;
      const t = h.get(); const trsf = loc.Transformation();
      const base = pos.length / 3; const nn = t.NbNodes();
      for (let i = 1; i <= nn; i++) { const p = t.Node(i); p.Transform(trsf); pos.push(p.X(), p.Y(), p.Z()); }
      const rev = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
      const nt = t.NbTriangles(); let area = 0; const ns = [0, 0, 0], cs = [0, 0, 0];
      const fi = faces.length;
      for (let i = 1; i <= nt; i++) {
        const tr = t.Triangle(i); let a = tr.Value(1) - 1 + base, b = tr.Value(2) - 1 + base, c = tr.Value(3) - 1 + base;
        if (rev) [b, c] = [c, b];
        idx.push(a, b, c); fid.push(fi);
        const A = [pos[3 * a], pos[3 * a + 1], pos[3 * a + 2]], B = [pos[3 * b], pos[3 * b + 1], pos[3 * b + 2]], C = [pos[3 * c], pos[3 * c + 1], pos[3 * c + 2]];
        const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const ta = Math.hypot(n[0], n[1], n[2]) / 2; area += ta; for (let k = 0; k < 3; k++) { ns[k] += n[k]; cs[k] += (A[k] + B[k] + C[k]) / 3 * ta; }
      }
      const nl = Math.hypot(ns[0], ns[1], ns[2]) || 1;
      faces.push({ face, names: [], area, normal: ns.map((x) => x / nl), centroid: cs.map((x) => x / (area || 1)) });
    }
    return { mesh: { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), fid: Uint32Array.from(fid) }, faces };
  };
  const solids = new Map();
  let body = null;
  try {
    for (const op of resolved.resolved.ops) {
      let s;
      if (op.op === 'extrude') {
        const n = op.frame.n; const d = op.depth;
        s = fuseAll(facesOf(op).map((face) => new oc.BRepPrimAPI_MakePrism_1(face, new oc.gp_Vec_4(n[0] * d, n[1] * d, n[2] * d), false, true).Shape()));
      } else if (op.op === 'revolve') {
        const o = to3(op.frame, op.axis_p); const d3 = dir3(op.frame, op.axis_d); const l = Math.hypot(d3[0], d3[1], d3[2]);
        const ax = new oc.gp_Ax1_2(P(o), new oc.gp_Dir_4(d3[0] / l, d3[1] / l, d3[2] / l));
        s = fuseAll(facesOf(op).map((face) => new oc.BRepPrimAPI_MakeRevol_1(face, ax, op.angle_deg * Math.PI / 180, false).Shape()));
      } else if (op.op === 'boolean') {
        s = combine(solids.get(op.a), solids.get(op.b), op.kind === 'union' ? 'add' : op.kind === 'cut' ? 'cut' : 'intersect');
        solids.set(op.id, s); body = s; continue;
      } else if (op.op === 'fillet') {
        const refs = (refFaces || []).filter((f) => f.names.includes(op.edges));
        if (!refs.length) return { ok: false, error: { op: op.id, msg: `no reference face for selector ${op.edges}` }, ms: performance.now() - t0 };
        const mk = new oc.BRepFilletAPI_MakeFillet(body, oc.ChFi3d_FilletShape.ChFi3d_Rational);
        const { faces } = tessellate(body, 0.5);
        let added = 0;
        for (const ref of refs) {
          const best = faces.map((f) => ({ f, d: Math.hypot(f.centroid[0] - ref.centroid[0], f.centroid[1] - ref.centroid[1], f.centroid[2] - ref.centroid[2]), dot: f.normal[0] * ref.normal[0] + f.normal[1] * ref.normal[1] + f.normal[2] * ref.normal[2] })).filter((x) => x.dot > 0.9).sort((a, b) => a.d - b.d)[0];
          if (!best) continue;
          const ex = new oc.TopExp_Explorer_2(best.f.face, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
          for (; ex.More(); ex.Next()) { mk.Add_2(op.r, oc.TopoDS.Edge_1(ex.Current())); added++; }
        }
        if (!added) return { ok: false, error: { op: op.id, msg: 'no edges matched' }, ms: performance.now() - t0 };
        body = mk.Shape();
        continue;
      } else {
        return { ok: false, error: { op: op.id, msg: `${op.op} is not supported by this adapter`, unsupported: true }, ms: performance.now() - t0 };
      }
      solids.set(op.id, s);
      body = combine(body, s, op.mode);
    }
    if (!body) return { ok: false, error: { op: 'tree', msg: 'no solid-producing feature' }, ms: performance.now() - t0 };
    const kernelVolume = vol(body);
    const { mesh, faces } = tessellate(body, defl);
    let step = null;
    if (wantStep) {
      const w = new oc.STEPControl_Writer_1();
      w.Transfer(body, oc.STEPControl_StepModelType.STEPControl_AsIs, true);
      w.Write('/out.step');
      step = oc.FS.readFile('/out.step', { encoding: 'utf8' });
    }
    return { ok: true, ms: performance.now() - t0, mesh, faces: faces.map(({ face, ...f }) => f), step, kernelVolume };
  } catch (e) {
    return { ok: false, error: { op: '?', msg: String(e?.message ?? e).slice(0, 200) }, ms: performance.now() - t0 };
  }
}
