// build-worker.js — the engine host, off the main thread. Holds the Rust
// engine (tree → resolved, and Truck for the exact build with named faces),
// Manifold (the preview kernel), and — on demand, because it is 66 MB —
// OCCT, the exact kernel the bake-off chose, for fillets and the booleans
// Truck cannot do. A build request answers twice: the preview mesh in
// milliseconds, then the exact mesh when it lands. Requests carry a `slot`
// (one per part of an assembly); a newer request in the same slot supersedes
// an older one between its two answers.
import { loadEngine } from './lib/engine.js';
import { buildManifold } from './lib/manifold-kernel.js';
import { buildOcct } from './lib/occt-kernel.js';
import { interference } from './lib/interfere.js';
import { weld, invariants, featureEdges, flatStreams, bbox, writeStl } from './lib/mesh.js';
import Module from './vendor/manifold.js';

let engine = null, manifold = null, oc = null, occtLoading = null;
let occtBase = 'https://unpkg.com/opencascade.js@1.1.1/dist/';
const latest = new Map();   // slot → id
const last = new Map();     // slot → {preview, exact, manifold, bbox}
const post = (msg, transfer) => self.postMessage(msg, transfer || []);

async function init(m) {
  if (m.occtBase) occtBase = m.occtBase;
  const t0 = performance.now();
  const [eng, mf] = await Promise.all([
    fetch('./cad.wasm').then((r) => loadEngine(r)),
    Module({ locateFile: (f) => new URL(`./vendor/${f}`, self.location.href).href }).then((m) => { m.setup(); return m; }),
  ]);
  engine = eng; manifold = mf;
  post({ type: 'ready', engine: engine.version, ms: performance.now() - t0 });
}

function loadOcct() {
  if (oc) return Promise.resolve(oc);
  if (occtLoading) return occtLoading;
  const t0 = performance.now();
  post({ type: 'occt-status', state: 'loading', base: occtBase });
  occtLoading = (async () => {
    const mod = await import(/* @vite-ignore */ occtBase + 'opencascade.wasm.js');
    const ctor = mod.default;
    oc = await new ctor({ locateFile: (f) => occtBase + f, print: () => {}, printErr: () => {} });
    post({ type: 'occt-status', state: 'ready', ms: performance.now() - t0 });
    return oc;
  })().catch((e) => { occtLoading = null; post({ type: 'occt-status', state: 'error', msg: String(e?.message ?? e).slice(0, 200) }); throw e; });
  return occtLoading;
}

function pack(mesh, extra) {
  const welded = weld(mesh, 1e-5);
  const inv = invariants(welded);
  const streams = flatStreams(welded);
  const edges = featureEdges(welded, 25);
  const bb = bbox(welded);
  const payload = { ...extra, invariants: inv, bbox: bb, streams, edges, mesh: welded };
  return { payload, transfer: [streams.p3.buffer, streams.n3.buffer, streams.f3.buffer, edges.buffer, welded.pos.buffer, welded.idx.buffer, ...(welded.fid ? [welded.fid.buffer] : [])] };
}

const NEEDS_OCCT = new Set(['fillet', 'chamfer', 'shell']);

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') return init(m);
  if (m.type === 'load-occt') { loadOcct().catch(() => {}); return; }
  if (m.type === 'build') {
    const slot = m.slot || 'main';
    const id = m.id; latest.set(slot, id);
    const stale = () => latest.get(slot) !== id;
    const tree = typeof m.tree === 'string' ? m.tree : JSON.stringify(m.tree);
    let resolved;
    try { resolved = engine.resolve(tree, m.tol || 0.01); } catch (err) { return post({ type: 'error', id, slot, stage: 'resolve', error: { op: err.op || 'resolve', msg: err.message } }); }
    const ops = resolved.resolved.ops;
    const needsOcct = ops.some((o) => NEEDS_OCCT.has(o.op));
    post({ type: 'resolved', id, slot, ops: ops.map((o) => ({ op: o.op, id: o.id, mode: o.mode })), sketches: resolved.resolved.sketches.map((s) => s.id), params: resolved.resolved.params, gears: resolved.resolved.gears, needsOcct });
    const entry = last.get(slot) || {}; last.set(slot, entry);
    // preview (Manifold has no fillet: preview the tree without those ops, flagged)
    if (m.want.preview !== false) {
      let r = buildManifold(manifold, resolved, { keep: true });
      let approx = false;
      if (!r.ok && r.error?.unsupported && needsOcct) {
        const stripped = JSON.parse(tree); stripped.features = stripped.features.filter((f) => !NEEDS_OCCT.has(f.op));
        try { r = buildManifold(manifold, engine.resolve(JSON.stringify(stripped), m.tol || 0.01), { keep: true }); approx = true; } catch {}
      }
      if (r.ok) {
        if (entry.manifold) { try { entry.manifold.delete(); } catch {} }
        entry.manifold = r.manifold; entry.bbox = r.bbox;
        const { payload, transfer } = pack(r.mesh, { type: 'preview', id, slot, ms: r.ms, kernelVolume: r.kernelVolume, genus: r.genus, kernel: 'manifold', approx }); entry.preview = payload.mesh; post(payload, transfer);
      }
      else post({ type: 'error', id, slot, stage: 'preview', error: r.error });
    }
    if (stale()) return;
    if (m.want.exact === false) return;
    await new Promise((r) => setTimeout(r, 0));
    if (stale()) return;
    // exact: Truck unless the tree needs OCCT; fall back to OCCT when Truck fails and OCCT is allowed
    let truckFailed = null;
    if (!needsOcct) {
      const r = engine.build(tree, { kernel: 'truck', step: !!m.want.step });
      if (stale()) return;
      if (r.ok) {
        const { payload, transfer } = pack(r.mesh, { type: 'exact', id, slot, ms: r.report.timings.build_ms, report: r.report, kernel: 'truck', step: r.step });
        entry.exact = payload.mesh; post(payload, transfer);
        return;
      }
      truckFailed = r.report.error;
      if (!m.want.occt) return post({ type: 'error', id, slot, stage: 'exact', error: truckFailed, report: r.report, occtWouldHelp: !truckFailed?.unsupported || true });
    } else if (!m.want.occt) {
      return post({ type: 'error', id, slot, stage: 'exact', error: { op: ops.find((o) => NEEDS_OCCT.has(o.op)).id, msg: `${ops.find((o) => NEEDS_OCCT.has(o.op)).op} needs the OCCT kernel`, unsupported: true }, occtWouldHelp: true });
    }
    // OCCT
    let kernel;
    try { kernel = await loadOcct(); } catch (err) { return post({ type: 'error', id, slot, stage: 'exact', error: { op: 'occt', msg: `OCCT failed to load: ${err.message}` } }); }
    if (stale()) return;
    let refFaces = null;
    if (needsOcct) {
      const stripped = JSON.parse(tree); stripped.features = stripped.features.filter((f) => !NEEDS_OCCT.has(f.op));
      const r0 = engine.build(JSON.stringify(stripped), { kernel: 'truck' });
      if (r0.ok) refFaces = r0.report.faces;
    }
    const r = buildOcct(kernel, resolved, { wantStep: !!m.want.step, refFaces });
    if (stale()) return;
    if (!r.ok) return post({ type: 'error', id, slot, stage: 'exact', error: r.error, truckError: truckFailed });
    const report = { ok: true, kernel: 'occt', timings: { build_ms: r.ms }, faces: r.faces.map((f) => ({ names: [], area: f.area, normal: f.normal, centroid: f.centroid })), kernelVolume: r.kernelVolume, truckError: truckFailed };
    const { payload, transfer } = pack(r.mesh, { type: 'exact', id, slot, ms: r.ms, report, kernel: 'occt', step: r.step });
    entry.exact = payload.mesh; post(payload, transfer);
    return;
  }
  if (m.type === 'check') {
    // interference at a pose: bodies = [{id, slot, model}]
    const bodies = m.bodies.filter((b) => last.get(b.slot)?.manifold).map((b) => ({ id: b.id, manifold: last.get(b.slot).manifold, bbox: last.get(b.slot).bbox, model: b.model }));
    const missing = m.bodies.length - bodies.length;
    try { const r = interference({ Manifold: manifold.Manifold }, bodies, { eps: m.eps ?? 0.01 }); post({ type: 'check', id: m.id, ...r, missing }); }
    catch (e) { post({ type: 'error', id: m.id, stage: 'check', error: { op: 'check', msg: String(e?.message ?? e) } }); }
    return;
  }
  if (m.type === 'export') {
    const entry = last.get(m.slot || 'main') || {};
    const mesh = m.which === 'preview' ? entry.preview : entry.exact || entry.preview;
    if (!mesh) return post({ type: 'error', id: m.id, stage: 'export', error: { op: 'export', msg: 'nothing built yet' } });
    const stl = writeStl(mesh);
    post({ type: 'export', id: m.id, format: 'stl', bytes: stl, name: m.name }, [stl.buffer]);
  }
};
