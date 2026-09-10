// OCCT 7.4 via opencascade.js 1.1.1 — the safe candidate. Consumes the exact
// region (lines, arcs, Béziers), so this is B-rep against B-rep. Fillets via
// BRepFilletAPI on the edges of the named face, found by matching the engine's
// face centroid/normal (the naming bridge for a foreign kernel).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.join(here, '..', 'node_modules', 'opencascade.js', 'dist');

export function make() {
  let oc;
  return {
    id: 'occt',
    exact: true,
    bytes: fs.statSync(path.join(DIST, 'opencascade.wasm.wasm')).size,
    async init() {
      const t0 = performance.now();
      globalThis.require = createRequire(import.meta.url);
      globalThis.__dirname = DIST;
      const { default: opencascade } = await import(path.join(DIST, 'opencascade.wasm.js'));
      oc = await new opencascade({ wasmBinary: fs.readFileSync(path.join(DIST, 'opencascade.wasm.wasm')), locateFile: (f) => path.join(DIST, f), print: () => {}, printErr: () => {} });
      return performance.now() - t0;
    },
    async build(treePath, { resolved, wantStep, refFaces }) {
      const t0 = performance.now();
      const P = (p) => new oc.gp_Pnt_3(p[0], p[1], p[2]);
      const to3 = (f, p) => [0, 1, 2].map((i) => f.o[i] + f.u[i] * p[0] + f.v[i] * p[1]);
      const dir3 = (f, d) => [0, 1, 2].map((i) => f.u[i] * d[0] + f.v[i] * d[1]);
      const wireOf = (frame, loop) => {
        const w = new oc.BRepBuilderAPI_MakeWire_1();
        let cur = loop.start;
        const ends = [loop.start]; for (const s of loop.segs) ends.push(s.to);
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
      // regions: group loops by containment the same way the engine does —
      // the engine already ordered `region.loops` with holes after their
      // outer loop only via oriented(); here we recompute cheaply: a loop is
      // a hole iff its signed area is negative after the engine's orientation
      // pass, which we don't have. So use the polylines' `outer` flags.
      const polys = new Map(resolved.polylines.map((p) => [p.id, p]));
      const faceOf = (op) => {
        // exact loops for the sketches, outer/hole flags from the polylines (same order)
        let face = null; let holes = [];
        let li = 0;
        for (const sid of op.sketches) {
          const sk = resolved.resolved.sketches.find((s) => s.id === sid);
          const pl = polys.get(sid);
          // polylines are in oriented() order which may differ from sk.region.loops order; match by first point
          const orderedLoops = pl.rings.map((ring) => sk.region.loops.find((l) => Math.hypot(l.start[0] - ring[0][0], l.start[1] - ring[0][1]) < 1e-6) || sk.region.loops[0]);
          orderedLoops.forEach((loop, k) => {
            const isOuter = pl.outer[k];
            // ensure orientation: outer ccw, hole cw (engine's oriented() did this on the polylines; the exact loops may be reversed)
            const ring = pl.rings[k]; let area = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; area += p[0] * q[1] - q[0] * p[1]; }
            let L = loop;
            // exact loop signed area (sampled by its own segment ends)
            const ends = [loop.start, ...loop.segs.map((s) => s.to)]; let a2 = 0; for (let i = 0; i < ends.length - 1; i++) { const p = ends[i], q = ends[i + 1]; a2 += p[0] * q[1] - q[0] * p[1]; }
            if ((a2 > 0) !== (area > 0)) L = reverseLoop(loop);
            const w = wireOf(op.frame, L);
            if (isOuter) { if (face) throw new Error('multiple outer loops in one op: not wired for occt'); face = new oc.BRepBuilderAPI_MakeFace_15(w, false).Face(); }
            else holes.push(w);
            li++;
          });
        }
        for (const h of holes) { const mf = new oc.BRepBuilderAPI_MakeFace_22(face, h); if (!mf.IsDone()) throw new Error('hole failed'); face = mf.Face(); }
        return face;
      };
      const reverseLoop = (l) => { const ends = [l.start, ...l.segs.map((s) => s.to)]; const segs = []; for (let i = l.segs.length - 1; i >= 0; i--) { const s = l.segs[i]; const to = ends[i]; segs.push(s.kind === 'line' ? { kind: 'line', to } : s.kind === 'arc' ? { kind: 'arc', to, via: s.via } : { kind: 'bezier', to, ctrl: [...s.ctrl].reverse() }); } return { start: ends[l.segs.length], segs }; };
      const vol = (sh) => { const g = new oc.GProp_GProps_1(); oc.BRepGProp.VolumeProperties_1(sh, g, false, false, false); return g.Mass(); };
      const solids = new Map();
      let body = null;
      const combine = (b, t, mode) => {
        if (b === null || mode === 'new') return t;
        const op = mode === 'add' ? new oc.BRepAlgoAPI_Fuse_3(b, t) : mode === 'cut' ? new oc.BRepAlgoAPI_Cut_3(b, t) : new oc.BRepAlgoAPI_Common_3(b, t);
        return op.Shape();
      };
      try {
        for (const op of resolved.resolved.ops) {
          let s;
          if (op.op === 'extrude') {
            const face = faceOf(op);
            const n = op.frame.n; const d = op.depth;
            s = new oc.BRepPrimAPI_MakePrism_1(face, new oc.gp_Vec_4(n[0] * d, n[1] * d, n[2] * d), false, true).Shape();
          } else if (op.op === 'revolve') {
            const face = faceOf(op);
            const o = to3(op.frame, op.axis_p); const d3 = dir3(op.frame, op.axis_d); const l = Math.hypot(...d3);
            const ax = new oc.gp_Ax1_2(P(o), new oc.gp_Dir_4(d3[0] / l, d3[1] / l, d3[2] / l));
            s = new oc.BRepPrimAPI_MakeRevol_1(face, ax, op.angle_deg * Math.PI / 180, false).Shape();
            if (vol(s) < 0) { /* orientation is handled by OCCT; nothing to do */ }
          } else if (op.op === 'boolean') {
            s = combine(solids.get(op.a), solids.get(op.b), op.kind === 'union' ? 'add' : op.kind === 'cut' ? 'cut' : 'intersect');
            solids.set(op.id, s); body = s; continue;
          } else if (op.op === 'fillet') {
            // edges of the named face(s): match the engine's reference faces by centroid+normal
            const [solidId, faceName] = op.edges.split(/\.(.+)/);
            const refs = (refFaces || []).filter((f) => f.names.includes(op.edges));
            if (!refs.length) return { ok: false, error: { op: op.id, msg: `no reference face for selector ${op.edges} (solid ${solidId}, ${faceName})` }, ms: performance.now() - t0 };
            const mk = new oc.BRepFilletAPI_MakeFillet(body, oc.ChFi3d_FilletShape.ChFi3d_Rational);
            const faces = facesWithStats(body, 0.5);
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
        const kernelVolume = vol(body);
        const { pos, tris, faces } = tessellate(body, 0.01);
        let step = null;
        if (wantStep) {
          const w = new oc.STEPControl_Writer_1();
          w.Transfer(body, oc.STEPControl_StepModelType.STEPControl_AsIs, true);
          w.Write('/out.step');
          step = oc.FS.readFile('/out.step', { encoding: 'utf8' });
        }
        return { ok: true, ms: performance.now() - t0, mesh: { pos, tris }, faces: faces.map((f) => ({ names: [], area: f.area, normal: f.normal, centroid: f.centroid })), step, kernelVolume };
      } catch (e) {
        return { ok: false, error: { op: '?', msg: String(e?.message ?? e).slice(0, 200) }, ms: performance.now() - t0 };
      }

      function tessellate(shape, defl) {
        new oc.BRepMesh_IncrementalMesh_2(shape, defl, false, 0.5, false);
        const pos = [], tris = [], faces = [];
        const ex = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
        for (; ex.More(); ex.Next()) {
          const face = oc.TopoDS.Face_1(ex.Current());
          const loc = new oc.TopLoc_Location_1();
          const h = oc.BRep_Tool.Triangulation(face, loc);
          if (h.IsNull()) continue;
          const t = h.get(); const trsf = loc.Transformation();
          const base = pos.length; const nn = t.NbNodes();
          for (let i = 1; i <= nn; i++) { const p = t.Node(i); p.Transform(trsf); pos.push([p.X(), p.Y(), p.Z()]); }
          const rev = face.Orientation_1() === oc.TopAbs_Orientation.TopAbs_REVERSED;
          const nt = t.NbTriangles(); let area = 0; const nsum = [0, 0, 0], csum = [0, 0, 0];
          for (let i = 1; i <= nt; i++) {
            const tr = t.Triangle(i); let a = tr.Value(1) - 1 + base, b = tr.Value(2) - 1 + base, c = tr.Value(3) - 1 + base;
            if (rev) [b, c] = [c, b];
            tris.push([a, b, c]);
            const A = pos[a], B = pos[b], C = pos[c];
            const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
            const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
            const ta = Math.hypot(...n) / 2; area += ta; for (let k = 0; k < 3; k++) { nsum[k] += n[k]; csum[k] += (A[k] + B[k] + C[k]) / 3 * ta; }
          }
          const nl = Math.hypot(...nsum) || 1;
          faces.push({ face, area, normal: nsum.map((x) => x / nl), centroid: csum.map((x) => x / (area || 1)) });
        }
        return { pos, tris, faces };
      }
      function facesWithStats(shape, defl) { return tessellate(shape, defl).faces; }
    },
  };
}
