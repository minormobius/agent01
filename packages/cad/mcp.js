// mcp.js — the headless library as tools, over JSON-RPC (Model Context
// Protocol). Mounted at cad.mino.mobi/mcp by worker.js; the same module runs
// under node in mcp.selftest.mjs with the kernels injected.
//
// An agent that has never seen the repo can check, build, measure and
// interference-test a tree here and read the numbers back — the same numbers
// the page reports — and gets a link to hand a human. What is NOT here:
// render (needs a browser; the link is the picture), OCCT (66 MB; in the
// page), and any write (a person's parts are written with the person's own
// sign-in, on the site or with `agent/drive.mjs --login`).
//
//   GET  /mcp           → the descriptor: server info and the tool list
//   POST /mcp           → JSON-RPC 2.0: initialize, ping, tools/list, tools/call
//
// `kernels()` resolves to { engine, manifold } (lib/engine.js and the
// Manifold module); `fetchRef(ref)` turns `bench:<name>` or an `at://` URI into
// a tree; `gateway` is the base URL of the /xrpc/ read gateway for file tools.
import { flatten, solveAngles, modelOf, expectedTouch, expectations, periodOf, findFace } from './lib/assembly.js';
import { clearanceAt, sweepClearance, verdictOf, OK_VERDICTS } from './lib/sweep.js';
import { drawing } from './lib/drawing.js';
import { buildManifold } from './lib/manifold-kernel.js';
import { interference } from './lib/interfere.js';
import { weld, invariants } from './lib/mesh.js';
import { describe, measure, faceByName, faceWorld } from './lib/measure.js';
import { Drive, PublicBackend, parseAtUri, PART } from './lib/drive.js';

export const SERVER = { name: 'cad.mino.mobi', version: '1', title: 'Feature-tree CAD' };
const PROTOCOL = '2025-06-18';
const MAX_TREE = 512 * 1024;
const SITE = 'https://cad.mino.mobi';

const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const link = (tree) => `${SITE}/#t=${b64url(JSON.stringify(tree))}`;
const treeSchema = { type: 'object', description: 'A feature tree (see cad.mino.mobi/README.md), or an assembly with `components`. Strings `bench:<name>` and `at://…` are accepted in place of the object.' };
const treeArg = { oneOf: [treeSchema, { type: 'string', description: '`bench:<name>` or an `at://` URI' }] };

export const TOOLS = [
  { name: 'check', title: 'Resolve a tree', description: 'Evaluate the expressions, sketches and ops of a tree without building geometry. Returns params, sketch and op counts, or the first error with its op id. On an assembly: its params and derived at t = 0, every placement expression, and each distinct part. Cheap; run it after every edit.',
    inputSchema: { type: 'object', properties: { tree: treeArg }, required: ['tree'] } },
  { name: 'build', title: 'Build a part or assembly', description: 'Exact build with the Truck kernel (or the Manifold preview kernel): volume, area, bbox, centroid, Euler characteristic, watertightness, and every named face with its geometry (plane or cylinder). For an assembly: the component list, every distinct part key, and the parts built in this call — a server builds at most a few parts per call (a gear can take 20 s), so pass `parts` (part keys from `partKeys`) to build the rest, and `remaining` tells you which are left. Returns a link that opens the same document in the viewer.',
    inputSchema: { type: 'object', properties: { tree: treeArg, kernel: { type: 'string', enum: ['truck', 'manifold'], default: 'truck' }, faces: { type: 'boolean', default: true, description: 'include the face list' }, parts: { type: 'array', items: { type: 'string' }, description: 'assemblies only: the part keys to build in this call (default: the first few)' } }, required: ['tree'] } },
  { name: 'measure', title: 'Measure named faces', description: 'One face: its geometry (a cylinder\'s diameter and axis, a plane\'s normal). Two faces: plane-to-plane, axis-to-axis (with both diameters and the wall between) or axis-to-plane distance, from exact geometry. Face names come from `build`. On an assembly, name faces as `component.face` and pass `t` to pose it first: the distance between two parts\' faces at an instant, which tests the kinematics directly.',
    inputSchema: { type: 'object', properties: { tree: treeArg, a: { type: 'string', description: 'a face name, e.g. plate.pivot[0][0]' }, b: { type: 'string' }, t: { type: 'number', description: 'seconds through the drive, for an assembly' } }, required: ['tree', 'a'] } },
  { name: 'interference', title: 'Check an assembly for interference and clearance', description: 'Pose every component of an assembly at time t (seconds through its drive) and test every pair. With the preview kernel, pairs with more than eps mm³ in common are returned with their shared volume. Everywhere (this server included), pass `clearance` in mm to get the nearest approach of every pair from the exact meshes instead — crossing, contained, touching, or the distance — and a verdict per pair: collision (depth or containment), close (under the clearance), loose (wider than a designed fit), expected (a mated touch), fit (a designed clearance, from the document\'s `fits`), contact (touching, no depth, no clearance demanded), clear. With sweep N, N instants over one period of the drive (or `period` seconds) are checked and each pair\'s worst kept; in clearance mode the minimum is then chased between samples for the pairs near the clearance, so a graze between instants is found. Reference components are left out. A big assembly does not fit in one request here: the call has a CPU budget, part meshes are cached between calls, and a sweep that runs out answers with `done: false` and `next` — call again with `from: next` until `done`, then take the smallest distance per pair across the windows. Big gears take ~30 s each to build; sweeping a large assembly locally with agent/check.mjs is still faster.',
    inputSchema: { type: 'object', properties: { assembly: treeArg, t: { type: 'number', default: 0 }, eps: { type: 'number', default: 0.01 }, clearance: { type: 'number', description: 'mm: report every pair\'s nearest approach and flag those closer than this (0 flags only contact); this mode needs no kernel' }, sweep: { type: 'integer', description: 'check this many instants over one period instead of one time t' }, period: { type: 'number', description: 'seconds per cycle for a sweep; default one turn of the driven component' }, from: { type: 'integer', default: 0, description: 'clearance sweeps only: the first instant of this window. A server stops on its CPU budget and answers with `next`; pass that back as `from` to continue, and take the smallest distance per pair across the windows.' }, budgetMs: { type: 'integer', description: 'stop after about this many ms and report where to resume (the server caps it)' } }, required: ['assembly'] } },
  { name: 'drawing', title: 'Draw a part or assembly', description: 'An engineering drawing as SVG from the exact mesh: third-angle views (front, top, right by default; any of front, back, top, bottom, left, right, iso), hidden lines dashed, the overall width, height and depth dimensioned, and every cylindrical hole called out with its count, diameter and depth when blind. On an assembly, pass `t` to pose it; reference components are left out. Returns the SVG as an embedded resource plus the numbers on it (overall size, dimensions, holes, lines per view). Deterministic, so two drawings of the same tree diff cleanly.',
    inputSchema: { type: 'object', properties: { tree: treeArg, views: { type: 'array', items: { type: 'string', enum: ['front', 'back', 'top', 'bottom', 'left', 'right', 'iso'] }, default: ['front', 'top', 'right'] }, hidden: { type: 'boolean', default: true, description: 'draw hidden lines (dashed)' }, t: { type: 'number', default: 0, description: 'seconds through the drive, for an assembly' }, width: { type: 'integer', default: 900, description: 'sheet width in px; the scale is fitted to it' } }, required: ['tree'] } },
  { name: 'step', title: 'Export STEP', description: 'The exact B-rep as STEP text (Truck kernel). For other CAD systems.',
    inputSchema: { type: 'object', properties: { tree: treeArg }, required: ['tree'] } },
  { name: 'list_files', title: 'List a repo\'s CAD files', description: 'The file tree in anyone\'s public repo: path, kind, AT URI, updated. `minomobi.com` holds the published bench (parts/<name>, train, clock).',
    inputSchema: { type: 'object', properties: { repo: { type: 'string', description: 'a handle or DID' }, prefix: { type: 'string' } }, required: ['repo'] } },
  { name: 'get_file', title: 'Read a CAD file', description: 'A file by AT URI, or by repo and path: its head entry, the current revision\'s tree, and the mainline history (message, date, repo). Pass the tree straight back into build.',
    inputSchema: { type: 'object', properties: { uri: { type: 'string', description: 'at://did/com.minomobi.cad.part/rkey' }, repo: { type: 'string' }, path: { type: 'string' } } } },
];

/** The tool list for a host. `manifold: false` (the live worker — Manifold's Emscripten glue
 *  generates its invokers with `new Function`, which Workers forbid) drops the tools that need
 *  the preview kernel: interference, and build's manifold option. Those run locally. */
export function toolsFor({ manifold = true } = {}) {
  return TOOLS.map((t) => {
    if (manifold || t.name !== 'build') return t;
    const p = { ...t.inputSchema.properties }; delete p.kernel;
    return { ...t, description: t.description.replace(' (or the Manifold preview kernel)', '') + (t.name === 'interference' ? ' The preview kernel is not on this server, so shared volumes are not: pass `clearance` (0 for contact only) and the check runs on the exact meshes.' : ' The preview kernel is not available on this server.'), inputSchema: { ...t.inputSchema, properties: p } };
  });
}

// Exact meshes for the clearance check, kept between calls in one isolate.
// A part at res 256 costs seconds (a 60-tooth gear ~30 s), and a windowed
// sweep is several calls over the same assembly, so the second call must not
// pay the build again. Keyed by the tree text and the resolution; bounded,
// oldest evicted first. Meshes are read-only here — `clearances` poses copies.
const MESH_CACHE = new Map();
const MESH_CACHE_MAX = 48;
function cachedMesh(engine, treeText, res) {
  const key = `${res}|${treeText}`;
  const hit = MESH_CACHE.get(key);
  if (hit) { MESH_CACHE.delete(key); MESH_CACHE.set(key, hit); return { ...hit, cached: true }; }
  const r = engine.build(treeText, { kernel: 'truck', res });
  const v = r.ok ? { mesh: r.mesh } : { error: r.report.error };
  MESH_CACHE.set(key, v); if (MESH_CACHE.size > MESH_CACHE_MAX) MESH_CACHE.delete(MESH_CACHE.keys().next().value);
  return { ...v, cached: false };
}

export function createMcp({ kernels, fetchRef, gateway = SITE, fetch: f, capabilities = {} } = {}) {
  const caps = { manifold: true, maxParts: Infinity, budgetMs: Infinity, ...capabilities };
  const toolList = toolsFor(caps);
  const publicDrive = (did) => new Drive(new PublicBackend(did, gateway, { fetch: f }), { pdsOf: async () => gateway, fetch: f });
  const asTree = async (v) => {
    if (typeof v === 'string') { if (v.startsWith('bench:') || v.startsWith('at://')) return fetchRef(v); throw new Error('tree must be an object, `bench:<name>` or an at:// URI'); }
    if (!v || typeof v !== 'object') throw new Error('tree must be an object');
    if (JSON.stringify(v).length > MAX_TREE) throw new Error(`tree over ${MAX_TREE / 1024} kB`);
    return v;
  };
  const resolveRef = async (ref) => (typeof ref === 'string' ? fetchRef(ref) : structuredClone(ref));
  const faceOut = (fc) => ({ names: fc.names, ...describe(fc), centroid: fc.centroid, normal: fc.normal });

  // named faces for place-by-feature references, from the exact kernel, once per distinct tree
  const faceCache = new Map();
  const facesOf = async (partKey, treeJson) => {
    if (faceCache.has(treeJson)) return faceCache.get(treeJson);
    const { engine } = await kernels();
    const r = engine.build(treeJson, { kernel: 'truck' });
    if (!r.ok) throw new Error(`${partKey}: the exact build failed (${r.report.error?.op}: ${r.report.error?.msg}), so its faces cannot be referenced`);
    faceCache.set(treeJson, r.report.faces); return r.report.faces;
  };
  const tools = {
    async check({ tree }) {
      const { engine } = await kernels();
      const resolveOne = (t) => { const r = engine.resolve(t).resolved; return { ok: true, units: r.units, params: r.params, sketches: (r.sketches || []).map((s) => s.id), ops: (r.ops || []).map((o) => ({ op: o.op, id: o.id, mode: o.mode })) }; };
      const doc = await asTree(tree);
      if (!Array.isArray(doc.components)) return resolveOne(doc);
      // an assembly: its params and derived at t = 0 and every placement expression are evaluated by flatten; then each distinct part
      const { components, partTrees, params, drive } = await flatten(doc, resolveRef, { facesOf });
      const parts = {};
      for (const [key, t] of partTrees) { try { parts[key] = resolveOne(t); } catch (e) { parts[key] = { ok: false, error: { op: e.op, msg: e.message } }; } }
      const bad = Object.values(parts).filter((p) => !p.ok).length;
      return { ok: bad === 0, kind: 'assembly', params, drive, components: components.map((c) => ({ id: c.id, part: c.part, partKey: c.partKey, dynamic: c.dynamic })), parts };
    },
    async build({ tree, kernel = 'truck', faces = true, parts: only }) {
      const { engine, manifold } = await kernels();
      if (kernel === 'manifold' && !(caps.manifold && manifold)) throw new Error('the preview kernel is not available on this server; use kernel "truck", or run agent/build.mjs --kernel manifold locally');
      const doc = await asTree(tree);
      const one = (t) => {
        if (kernel === 'manifold') { const t0 = performance.now(); const r = buildManifold(manifold, engine.resolve(t)); if (!r.ok) return { ok: false, kernel, error: r.error }; const m = weld(r.mesh, 1e-5); return { ok: true, kernel, ms: performance.now() - t0, invariants: invariants(m), faces: [] }; }
        const r = engine.build(JSON.stringify(t), { kernel: 'truck' });
        if (!r.ok) return { ok: false, kernel: 'truck', error: r.report.error };
        return { ok: true, kernel: 'truck', ms: r.ms, timings: r.report.timings, invariants: r.report.invariants, faces: faces ? r.report.faces.map(faceOut) : undefined, faceCount: r.report.faces.length };
      };
      if (Array.isArray(doc.components)) {
        const { components, partTrees } = await flatten(doc, resolveRef, { facesOf });
        const partKeys = [...partTrees.keys()];
        const wanted = Array.isArray(only) && only.length ? only.filter((k) => partTrees.has(k)) : partKeys;
        const unknown = Array.isArray(only) ? only.filter((k) => !partTrees.has(k)) : [];
        const chosen = wanted.slice(0, caps.maxParts);
        const parts = {}; let volume = 0, ok = true;
        for (const key of chosen) { const r = one(JSON.parse(partTrees.get(key))); parts[key] = { ...r, faces: undefined }; if (r.ok) volume += r.invariants.volume; else ok = false; if (r.ok && !r.invariants.watertight) ok = false; }
        const remaining = wanted.slice(caps.maxParts);
        return { ok, kind: 'assembly', components: components.map((c) => ({ id: c.id, part: c.part, partKey: c.partKey })), partKeys, parts, remaining, ...(unknown.length ? { unknown } : {}), volume, complete: remaining.length === 0 && wanted.length === partKeys.length, link: link(doc) };
      }
      const r = one(doc);
      return { ...r, kind: 'part', link: link(doc) };
    },
    async measure({ tree, a, b, t = 0 }) {
      const { engine } = await kernels();
      const doc = await asTree(tree);
      if (Array.isArray(doc.components)) {
        // across an assembly: `component.face` names, posed at t — the kinematics measured directly
        const { components, mates, drive, partTrees } = await flatten(doc, resolveRef, { facesOf });
        const angles = solveAngles(components, mates, drive, t);
        const posed = async (ref) => {
          const s = String(ref).replace(/^@/, ''); const dotAt = s.indexOf('.'); if (dotAt <= 0) throw new Error(`${ref}: on an assembly, name a face as component.face`);
          const id = s.slice(0, dotAt), name = s.slice(dotAt + 1);
          const c = components.find((x) => x.id === id); if (!c) throw new Error(`no component ${id}; components: ${components.map((x) => x.id).join(', ')}`);
          const faces = await facesOf(c.partKey, partTrees.get(c.partKey));
          const f = findFace(faces, name); if (!f) throw new Error(`${id} has no face named ${name}; it has ${faces.slice(0, 40).map((x) => x.names[0]).join(', ')}${faces.length > 40 ? ', …' : ''}`);
          return faceWorld(f, modelOf(c, angles));
        };
        const A = await posed(a);
        if (!b) return { t, face: faceOut(A) };
        const B = await posed(b);
        return { t, a: faceOut(A), b: faceOut(B), ...measure(A, B) };
      }
      const r = engine.build(JSON.stringify(doc), { kernel: 'truck' });
      if (!r.ok) throw new Error(`exact build failed: ${r.report.error?.op}: ${r.report.error?.msg} — measurements need the exact kernel`);
      const A = faceByName(r.report.faces, a); if (!A) throw new Error(`no face named ${a}; names: ${r.report.faces.slice(0, 40).map((x) => x.names[0]).join(', ')}${r.report.faces.length > 40 ? ', …' : ''}`);
      if (!b) return { face: faceOut(A) };
      const B = faceByName(r.report.faces, b); if (!B) throw new Error(`no face named ${b}`);
      return { a: faceOut(A), b: faceOut(B), ...measure(A, B) };
    },
    async interference({ assembly, t = 0, eps = 0.01, sweep = 0, period, clearance, from = 0, budgetMs }) {
      const { engine, manifold } = await kernels();
      const doc = await asTree(assembly);
      if (!Array.isArray(doc.components)) throw new Error('not an assembly (no components)');
      const { components: all, mates, drive, partTrees, fits } = await flatten(doc, resolveRef, { facesOf });
      const components = all.filter((c) => !c.reference);
      const expected = expectedTouch(mates);
      const expect = expectations(mates, fits);
      if (clearance !== undefined || !(caps.manifold && manifold)) {
        // nearest approach from the exact meshes: no kernel needed, so this is what the server runs
        if (clearance === undefined) clearance = 0;
        // One budget over the whole call: the builds first (cached between
        // calls), then the sweep, which stops on the same clock and says
        // where to resume. A 45-component assembly does not fit in one
        // server request; it fits in several.
        const budget = Math.max(1000, Math.min(caps.budgetMs, budgetMs ?? caps.budgetMs));
        const t0 = performance.now(); const left = () => budget - (performance.now() - t0);
        const meshes = new Map(); const failed = []; const pending = []; let cachedCount = 0, builtCount = 0;
        for (const [key, tree] of partTrees) {
          const fresh = !MESH_CACHE.has(`256|${tree}`);
          if (fresh && builtCount && left() <= 0) { pending.push(key); continue; }
          const r = cachedMesh(engine, tree, 256);
          if (r.cached) cachedCount++; else builtCount++;
          if (r.mesh) meshes.set(key, r.mesh); else failed.push({ key, error: r.error });
        }
        if (pending.length) return { ok: false, method: 'mesh', incomplete: 'parts', clearance, built: [...meshes.keys()], pending, failed, ms: performance.now() - t0, link: link(doc), note: `the CPU budget (${(budget / 1000).toFixed(0)} s) went on building ${builtCount} part${builtCount === 1 ? '' : 's'} at res 256; ${pending.length} still to build. Call again with the same arguments — the meshes built here are cached, so each call gets further.` };
        const bodies = components.filter((c) => meshes.has(c.partKey)).map((c) => ({ id: c.id, mesh: meshes.get(c.partKey), comp: c }));
        const kin = { components: all, mates, drive };
        const annotate = (p) => ({ a: p.a, b: p.b, verdict: verdictOf(p, expect, clearance), distance: p.distance, intersecting: p.intersecting, contained: p.contained, touching: p.touching, penetration: p.penetration, closest: p.closest, ...(p.t !== undefined ? { t: p.t } : {}) });
        const meshNote = `nearest approach from the exact meshes (res 256, chord error under 0.002 mm); verdicts: collision, close, loose fail; clear, contact, expected, fit pass; shared volumes need the preview kernel (agent/check.mjs locally)`;
        const built = { parts: meshes.size, built: builtCount, cached: cachedCount };
        let r;
        if (!sweep) { const c = clearanceAt(bodies, kin, t); r = { t, pairs: c.pairs.map(annotate), tested: c.tested, ms: c.ms, done: true }; }
        else {
          const n = Math.max(2, Math.min(360, Math.round(sweep))), per = period ?? periodOf(drive);
          // refine a pair only if a graze between samples could reach the clearance: four times it, and at least a millimetre
          const c = sweepClearance(bodies, kin, { instants: n, period: per, from, budgetMs: Math.max(1000, left()), refineWithin: clearance * 4 + 1 });
          r = { sweep: n, period: per, refined: true, refinedPairs: c.refinedPairs, window: { from: c.from, sampled: c.sampled, of: n }, done: c.done, next: c.next, pairs: c.pairs.map(annotate), tested: c.tested, ms: c.ms };
        }
        const note = r.done === false ? `${meshNote}. The CPU budget stopped this sweep after ${r.window.sampled} of ${r.window.of} instants: these are the worst approaches over instants ${r.window.from}–${r.window.from + r.window.sampled - 1}. Call again with from: ${r.next} for the rest (the meshes are cached) and take the smallest distance per pair across the windows.` : meshNote;
        return { ok: r.pairs.every((p) => OK_VERDICTS.has(p.verdict)) && r.done !== false, method: 'mesh', clearance, ...built, ...r, failed, link: link(doc), note };
      }
      const built = new Map(); const failed = [];
      for (const [key, tree] of partTrees) { const r = buildManifold(manifold, engine.resolve(tree), { keep: true }); if (r.ok) built.set(key, r); else failed.push({ key, error: r.error }); }
      const poseAt = (at) => {
        const angles = solveAngles(components, mates, drive, at);
        const bodies = components.filter((c) => built.has(c.partKey)).map((c) => ({ id: c.id, manifold: built.get(c.partKey).manifold, bbox: built.get(c.partKey).bbox, model: modelOf(c, angles) }));
        const r = interference({ Manifold: manifold.Manifold }, bodies, { eps });
        return { t: at, pairs: r.pairs.map((p) => ({ ...p, expected: expected(p.a, p.b) })), tested: r.tested, ms: r.ms };
      };
      try {
        if (!sweep) { const r = poseAt(t); return { ok: r.pairs.every((p) => p.expected), t, pairs: r.pairs, tested: r.tested, ms: r.ms, failed, link: link(doc) }; }
        // a sweep: N instants over one period of the drive, each pair's worst overlap and when
        const n = Math.max(2, Math.min(360, Math.round(sweep))), per = period ?? periodOf(drive);
        const worst = new Map(); let ms = 0, tested = 0;
        for (let k = 0; k < n; k++) { const r = poseAt((k * per) / n); ms += r.ms; tested = Math.max(tested, r.tested); for (const p of r.pairs) { const key = `${p.a}|${p.b}`; const w = worst.get(key); if (!w || p.volume > w.volume) worst.set(key, { ...p, t: r.t }); } }
        const pairs = [...worst.values()].sort((a, b) => b.volume - a.volume);
        return { ok: pairs.every((p) => p.expected), sweep: n, period: per, pairs, tested, ms, failed, link: link(doc) };
      } finally { for (const b of built.values()) b.manifold.delete?.(); }
    },
    async drawing({ tree, views, hidden = true, t = 0, width = 900 }) {
      const { engine } = await kernels();
      const doc = await asTree(tree);
      let bodies, note;
      if (Array.isArray(doc.components)) {
        const { components, mates, drive, partTrees } = await flatten(doc, resolveRef, { facesOf });
        const angles = solveAngles(components, mates, drive, t);
        const built = new Map(); const failed = [];
        for (const [key, tr] of partTrees) { const r = engine.build(tr, { kernel: 'truck' }); if (r.ok) built.set(key, r); else failed.push({ key, error: r.report.error }); }
        if (failed.length) throw new Error(`exact build failed: ${failed.map((f) => `${f.key}: ${f.error?.op}: ${f.error?.msg}`).join('; ')}`);
        bodies = components.filter((c) => !c.reference).map((c) => ({ id: c.id, mesh: built.get(c.partKey).mesh, model: modelOf(c, angles), faces: built.get(c.partKey).report.faces }));
        note = `t = ${t} s`;
      } else {
        const r = engine.build(JSON.stringify(doc), { kernel: 'truck' });
        if (!r.ok) throw new Error(`exact build failed: ${r.report.error?.op}: ${r.report.error?.msg}`);
        bodies = [{ id: doc.name || 'part', mesh: r.mesh, faces: r.report.faces }];
      }
      const d = drawing(bodies, { views: Array.isArray(views) && views.length ? views : undefined, hidden, width: Math.max(300, Math.min(4000, width | 0)), title: doc.name || (Array.isArray(doc.components) ? 'assembly' : 'part'), note });
      return { ok: true, kind: Array.isArray(doc.components) ? 'assembly' : 'part', ...d, link: link(doc) };
    },
    async step({ tree }) {
      const { engine } = await kernels();
      const r = engine.build(JSON.stringify(await asTree(tree)), { kernel: 'truck', step: true });
      if (!r.ok) throw new Error(`exact build failed: ${r.report.error?.op}: ${r.report.error?.msg}`);
      return { ok: true, kernel: 'truck', bytes: r.step.length, step: r.step };
    },
    async list_files({ repo, prefix }) {
      const d = publicDrive(repo);
      const files = await d.list(prefix);
      return { repo, files: files.map((e) => ({ path: e.path, kind: e.kind, uri: e.uri, updatedAt: e.updatedAt, open: `${SITE}/?at=${encodeURIComponent(e.uri)}` })) };
    },
    async get_file({ uri, repo, path }) {
      let d, f;
      if (uri) { d = publicDrive(parseAtUri(uri).did); f = await d.get(uri); }
      else if (repo && path) { d = publicDrive(repo); f = await d.get(path); }
      else throw new Error('give uri, or repo and path');
      if (!f) throw new Error(`no file at ${uri || `${repo}:${path}`}`);
      const history = (await d.history(f.uri, { limit: 20 })).map((r) => ({ uri: r.uri, createdAt: r.createdAt, message: r.message, repo: r.did, forkedFrom: r.forkedFrom }));
      return { path: f.path, kind: f.kind, uri: f.uri, head: f.head, tree: f.revision.tree, invariants: f.revision.invariants, history, open: `${SITE}/?at=${encodeURIComponent(f.uri)}` };
    },
  };

  const listed = new Set(toolList.map((t) => t.name));
  async function call(name, args) {
    const fn = listed.has(name) ? tools[name] : null; if (!fn) throw new Error(`unknown tool ${name}`);
    return fn(args || {});
  }

  /** One JSON-RPC message → a response object (or null for a notification). */
  async function rpc(msg) {
    const id = msg?.id ?? null;
    const reply = (result) => ({ jsonrpc: '2.0', id, result });
    const fail = (code, message, data) => ({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'invalid request');
    switch (msg.method) {
      case 'initialize': return reply({ protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: `Feature-tree CAD. Read ${SITE}/SKILL.md first. Tools take a tree object, \`bench:<name>\` or an at:// URI. build gives the numbers to judge by and a link to hand a human; there is no render tool — the link is the picture — and no write tool: parts are saved with the person's own sign-in.${caps.manifold ? '' : ' The preview kernel is not on this server, so interference here gives nearest approach per pair (pass clearance in mm), not shared volumes; agent/check.mjs does volumes locally.'} What changed and when: ${SITE}/CHANGELOG.md.` });
      case 'notifications/initialized': case 'notifications/cancelled': return null;
      case 'ping': return reply({});
      case 'tools/list': return reply({ tools: toolList });
      case 'tools/call': {
        const { name, arguments: args } = msg.params || {};
        try {
          const result = await call(name, args);
          // a drawing's SVG travels once, as an embedded resource, beside the numbers
          if (typeof result?.svg === 'string') return reply({ content: [{ type: 'text', text: JSON.stringify({ ...result, svg: undefined }) }, { type: 'resource', resource: { uri: 'cad://drawing.svg', mimeType: 'image/svg+xml', text: result.svg } }], structuredContent: result, isError: false });
          return reply({ content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: false });
        } catch (e) {
          if (!listed.has(name)) return fail(-32602, e.message);
          return reply({ content: [{ type: 'text', text: String(e?.message ?? e) }], isError: true });
        }
      }
      default: return fail(-32601, `method not found: ${msg.method}`);
    }
  }

  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id', 'access-control-max-age': '86400' };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });

  /** The HTTP face: GET → descriptor, POST → JSON-RPC (single or batch), OPTIONS → CORS. */
  async function handle(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET') return json({ ...SERVER, protocolVersion: PROTOCOL, transport: 'streamable-http (JSON responses)', endpoint: `${SITE}/mcp`, skill: `${SITE}/SKILL.md`, index: `${SITE}/llms.txt`, changelog: `${SITE}/CHANGELOG.md`, capabilities: caps, tools: toolList });
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    let body; try { body = await request.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, 400); }
    if (Array.isArray(body)) { const out = (await Promise.all(body.map(rpc))).filter(Boolean); return out.length ? json(out) : new Response(null, { status: 202, headers: cors }); }
    const res = await rpc(body);
    return res ? json(res) : new Response(null, { status: 202, headers: cors });
  }

  return { tools: toolList, call, rpc, handle };
}
