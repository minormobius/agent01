// build-worker.js — the engine host, off the main thread. Holds the Rust
// engine (tree → resolved, and Truck for the exact build with named faces)
// and Manifold (the preview kernel). A build request answers twice: the
// preview mesh in milliseconds, then the exact mesh with names when it lands.
// A newer request supersedes an older one between the two.
import { loadEngine } from './lib/engine.js';
import { buildManifold } from './lib/manifold-kernel.js';
import { weld, invariants, featureEdges, flatStreams, bbox, writeStl } from './lib/mesh.js';
import Module from './vendor/manifold.js';

let engine = null, manifold = null, latest = 0;
let last = { preview: null, exact: null };

const post = (msg, transfer) => self.postMessage(msg, transfer || []);

async function init() {
  const t0 = performance.now();
  const [eng, mf] = await Promise.all([
    fetch('./cad.wasm').then((r) => loadEngine(r)),
    Module({ locateFile: (f) => new URL(`./vendor/${f}`, self.location.href).href }).then((m) => { m.setup(); return m; }),
  ]);
  engine = eng; manifold = mf;
  post({ type: 'ready', engine: engine.version, ms: performance.now() - t0 });
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

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') return init();
  if (m.type === 'build') {
    const id = (latest = m.id);
    const tree = typeof m.tree === 'string' ? m.tree : JSON.stringify(m.tree);
    let resolved;
    try { resolved = engine.resolve(tree, m.tol || 0.01); } catch (err) { return post({ type: 'error', id, stage: 'resolve', error: { op: err.op || 'resolve', msg: err.message } }); }
    post({ type: 'resolved', id, ops: resolved.resolved.ops.map((o) => ({ op: o.op, id: o.id, mode: o.mode })), sketches: resolved.resolved.sketches.map((s) => s.id), params: resolved.resolved.params, gears: resolved.resolved.gears });
    // preview
    if (m.want.preview !== false) {
      const r = buildManifold(manifold, resolved);
      if (r.ok) { const { payload, transfer } = pack(r.mesh, { type: 'preview', id, ms: r.ms, kernelVolume: r.kernelVolume, genus: r.genus, kernel: 'manifold' }); last.preview = payload.mesh; post(payload, transfer); }
      else post({ type: 'error', id, stage: 'preview', error: r.error });
    }
    if (latest !== id) return;
    // exact
    if (m.want.exact !== false) {
      await new Promise((r) => setTimeout(r, 0));
      if (latest !== id) return;
      const r = engine.build(tree, { kernel: 'truck', step: !!m.want.step });
      if (latest !== id) return;
      if (r.ok) {
        const { payload, transfer } = pack(r.mesh, { type: 'exact', id, ms: r.report.timings.build_ms, report: r.report, kernel: 'truck', step: r.step });
        last.exact = payload.mesh; post(payload, transfer);
      } else post({ type: 'error', id, stage: 'exact', error: r.report.error, report: r.report });
    }
    return;
  }
  if (m.type === 'export') {
    const mesh = m.which === 'preview' ? last.preview : last.exact || last.preview;
    if (!mesh) return post({ type: 'error', id: m.id, stage: 'export', error: { op: 'export', msg: 'nothing built yet' } });
    const stl = writeStl(mesh);
    post({ type: 'export', id: m.id, format: 'stl', bytes: stl }, [stl.buffer]);
  }
};
