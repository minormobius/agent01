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
import { flatten, solveAngles, modelOf, expectedTouch, expectations, periodOf, findFace, touchLimit, gridStates, restValues } from './lib/assembly.js';
import { clearanceAt, sweepClearance, gridClearance, verdictOf, OK_VERDICTS, pairWork } from './lib/sweep.js';
import { axesOf, axisNamed, rates, ratioOf, pointRate, spanRate, spanAt, effortFor, sweepRates } from './lib/mechanism.js';
import { drawing } from './lib/drawing.js';
import { assemblyReport } from './lib/report.js';
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
  { name: 'build', title: 'Build a part or assembly', description: 'Exact build with the Truck kernel (or the Manifold preview kernel): volume, area, bbox, centroid, Euler characteristic, watertightness, and every named face with its geometry (plane or cylinder). For an assembly: the component list, every distinct part key, and the parts built in this call — a server builds at most a few parts per call (a gear can take 20 s), so pass `parts` (part keys from `partKeys`) to build the rest, and `remaining` tells you which are left. Returns a link that opens the same document in the viewer. `ok` means what `agent/build.mjs`\'s exit code means: built AND watertight — a leaky solid comes back `ok: false` with `built: true` and the open-edge count, because its volume cannot be trusted and it will not print or export cleanly.',
    inputSchema: { type: 'object', properties: { tree: treeArg, kernel: { type: 'string', enum: ['truck', 'manifold'], default: 'truck' }, faces: { type: 'boolean', default: true, description: 'include the face list' }, parts: { type: 'array', items: { type: 'string' }, description: 'assemblies only: the part keys to build in this call (default: the first few)' } }, required: ['tree'] } },
  { name: 'measure', title: 'Measure named faces', description: 'One face: its geometry (a cylinder\'s diameter and axis, a plane\'s normal). Two faces: plane-to-plane, axis-to-axis (with both diameters and the wall between) or axis-to-plane distance, from exact geometry. Face names come from `build`. On an assembly, name faces as `component.face` and pass `t` to pose it first: the distance between two parts\' faces at an instant, which tests the kinematics directly.',
    inputSchema: { type: 'object', properties: { tree: treeArg, a: { type: 'string', description: 'a face name, e.g. plate.pivot[0][0]' }, b: { type: 'string' }, t: { type: 'number', description: 'seconds through the drive, for an assembly' } }, required: ['tree', 'a'] } },
  { name: 'mechanism', title: 'What a mechanism does: ratios, advantage, effort, dead points', description: 'What the mechanism DOES, by virtual work — the question `interference` cannot answer. The poser is differenced against each input, so every velocity ratio in the assembly falls out, and the MECHANICAL ADVANTAGE is the reciprocal of a ratio: a jaw moving 0.36 mm per mm of nut travel multiplies the thrust by 2.8. Per input it returns what moves and how fast, the advantage, the travel and turn end to end (read from the two end poses, so an impulsive motion like an escapement is not under-resolved by sampling), what stays still, and DEAD POINTS — a rate passing through zero, where the mechanism self-locks and the advantage is infinite. `loads` gives the EFFORT at the input that holds them: `{component, force: [fx,fy,fz]}` in newtons or `{component, torque}` in N·m about the part\'s own turn, answered in newtons for an input in mm, newton-metres for one in degrees, watts for a drive. It is LOSSLESS — friction is not modelled — so it is a floor, not the answer; and it is the whole effort, not the useful part of it (taking F·lead/2π off a screw as "useful work" under-sizes a brake by a quarter). `span: [a, b]` is the distance between two components and its rate, at the state asked about AND at its worst over the whole input \u2014 `invariant: true` means the rate is zero EVERYWHERE on it, and a rate reading zero at one state may only be a dead point: an invariant of the mechanism is that rate reading zero ("the link is a link", "rolling does not change the grip"), which is otherwise a hundred lines of hand-written oracle. `point` differentiates one point in a part\'s own coordinates, so a hand pinned at its boss reads zero at the origin and r·ω at its tip. `of` returns the advantage curve of one component through the whole input. It builds NO geometry and runs no kernel — two poses per rate — so it is cheap here and has no budget, unless the document places a component by a `@comp.face` reference, which needs that part built once. A document with neither `inputs` nor a `drive` has no degree of freedom and is refused.',
    inputSchema: { type: 'object', properties: { assembly: treeArg, input: { type: 'string', description: 'one declared input, or `t` for the drive; default every axis the document has' }, at: { type: 'object', additionalProperties: { type: 'number' }, description: 'the values of the OTHER inputs while this one is differentiated; defaults to each input\'s `default`' }, t: { type: 'number', default: 0, description: 'seconds through the drive, when differentiating against an input rather than time' }, steps: { type: 'integer', description: 'states across the input (default its own `steps`)' }, of: { type: 'string', description: 'a component id: return its advantage curve through the whole input' }, span: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2, description: 'two component ids: their distance and its rate — zero is an invariant' }, point: { type: 'object', properties: { component: { type: 'string' }, local: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 } }, required: ['component'], description: 'a point in a part\'s own coordinates, differentiated' }, loads: { type: 'array', items: { type: 'object', properties: { component: { type: 'string' }, force: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'newtons, in world axes' }, torque: { type: 'number', description: 'N·m about the part\'s own turn' } }, required: ['component'] }, description: 'the effort at the input that holds these' } }, required: ['assembly'] } },
  { name: 'interference', title: 'Check an assembly for interference and clearance', description: 'Pose every component of an assembly at time t (seconds through its drive) and test every pair. With the preview kernel, pairs with more than eps mm³ in common are returned with their shared volume. Everywhere (this server included), pass `clearance` in mm to get the nearest approach of every pair from the exact meshes instead — crossing, contained, touching, or the distance — and a verdict per pair: collision (depth or containment, including a mated touch past its budget), close (under the clearance), loose (wider than a designed fit), expected (a mated touch), fit (a designed clearance, from the document\'s `fits`), contact (touching, no depth, no clearance demanded), clear. A fixed or screw mate means bolted, not "may be the same solid": an expected touch may share up to 1 mm³ (or a thousandth of the smaller part) and go 0.1 mm deep, and a real press fit raises its own budget with `fits: [{a, b, contact: true, interfere: {max, depth}}]`. `ok` says nothing bad was found IN WHAT WAS SAMPLED; `done` says the sweep finished — they are separate, so a windowed run with nothing wrong in it says ok: true, done: false. Every answer carries `cost`: what one instant of this assembly costs in triangle-pairs, this server\'s budget, how many instants that buys, and an estimate at the other resolutions, so `res` can be chosen without probing for the cliff. With sweep N, N instants over one period of the drive (or `period` seconds) are checked and each pair\'s worst kept; with `grid: true` (or a number of steps), every combination of the document\'s `inputs` is checked instead — which is the instrument for a document with more than one input, where there is no period, and where a path through the inputs would say nothing about the corners it misses; in clearance mode the minimum is then chased between samples for the pairs near the clearance, so a graze between instants is found. Reference components are left out. A big assembly does not fit in one request here. New part meshes are built a few per call and cached, so repeating the call gets further (`incomplete: "parts"` says what is left); a sweep that does not fit answers `done: false` with `next` — call again with `from: next` until `done`, then take the smallest distance per pair across the windows; and an assembly whose single instant is past the server\'s budget is refused with its numbers (`incomplete: "too-big"`) rather than killed — try `res` 128 or 64, or run it locally. Big gears take ~30 s each to build; sweeping a large assembly locally with agent/check.mjs is still faster.',
    inputSchema: { type: 'object', properties: { assembly: treeArg, t: { type: 'number', default: 0 }, eps: { type: 'number', default: 0.01 }, clearance: { type: 'number', description: 'mm: report every pair\'s nearest approach and flag those closer than this (0 flags only contact); this mode needs no kernel' }, sweep: { type: 'integer', description: 'check this many instants over one period instead of one time t' }, grid: { description: 'check every combination of the document\'s `inputs` instead of a period: true for each input\'s own `steps`, or a number to use that many points per input. Windows against the budget like a sweep (`from`, `next`).' }, period: { type: 'number', description: 'seconds per cycle for a sweep; default one turn of the driven component' }, from: { type: 'integer', default: 0, description: 'clearance sweeps only: the first instant of this window. A server stops on its CPU budget and answers with `next`; pass that back as `from` to continue, and take the smallest distance per pair across the windows.' }, res: { type: 'integer', enum: [64, 128, 256], default: 256, description: 'clearance mode: mesh resolution. 256 is the default (chord error 0.0025 mm); 64 or 128 is coarser and much cheaper, for an assembly this server refuses at 256' }, budgetMs: { type: 'integer', description: 'local hosts only: stop after about this many ms (a Worker\'s clock does not run during synchronous work, so the server budgets by work instead)' } }, required: ['assembly'] } },
  { name: 'drawing', title: 'Draw a part or assembly', description: 'An engineering drawing as SVG from the exact mesh: third-angle views (front, top, right by default; any of front, back, top, bottom, left, right, iso), hidden lines dashed, the overall width, height and depth dimensioned, and every cylindrical hole called out with its count, diameter and depth when blind. On an assembly, pass `t` to pose it; reference components are left out. Returns the SVG as an embedded resource plus the numbers on it (overall size, dimensions, holes, lines per view). Deterministic, so two drawings of the same tree diff cleanly.',
    inputSchema: { type: 'object', properties: { tree: treeArg, views: { type: 'array', items: { type: 'string', enum: ['front', 'back', 'top', 'bottom', 'left', 'right', 'iso'] }, default: ['front', 'top', 'right'] }, hidden: { type: 'boolean', default: true, description: 'draw hidden lines (dashed)' }, t: { type: 'number', default: 0, description: 'seconds through the drive, for an assembly' }, width: { type: 'integer', default: 900, description: 'sheet width in px; the scale is fitted to it' }, title: { type: 'string', description: 'the name in the title block; defaults to the document\'s name or the ref it came from' } }, required: ['tree'] } },
  { name: 'report', title: 'Report on an assembly', description: 'One self-contained HTML page about an assembly: the whole thing drawn in three views, an exploded isometric with a numbered balloon on every item, a parts list with quantities, volumes and sizes, a drawing of each distinct part with its holes called out, and the assembly steps. Every row links back into the viewer, so the page is a handover document, not a picture. The steps are read off the document — placements, `@comp.face` references, mates and their numbers, declared `fits` — never inferred; the order is the document\'s own, which is a build order because a reference must name a component declared before it. It also carries a MOTION section: per input (or the drive), what moves and how fast, the mechanical advantage, the travel and turn end to end, a rate curve with the dead points marked, and what stays still \u2014 all by virtual work from the poser, so it costs nothing and does not depend on a part building. Returns the HTML as an embedded resource plus the parts list, the steps and the motion as data. A server builds a few new parts per call and caches them, so a big assembly may take two or three calls (`incomplete: "parts"` says what is left).',
    inputSchema: { type: 'object', properties: { assembly: treeArg, t: { type: 'number', default: 0, description: 'seconds through the drive: the pose the assembly is drawn in' }, explode: { type: 'number', default: 0.6, description: 'how far the exploded view pushes the parts apart, as a fraction of the assembly size' }, hidden: { type: 'boolean', default: true, description: 'hidden lines on the drawings' }, maxParts: { type: 'integer', default: 20, description: 'how many part sheets to draw' }, title: { type: 'string' } }, required: ['assembly'] } },
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

// ── the mesh cache ────────────────────────────────────────────────────────
// A part at res 256 costs seconds (a 60-tooth gear ~30 s), and one answer is
// several calls over the same assembly — a windowed sweep, a report built a
// few parts at a time. So a mesh is kept, keyed by its tree text and the
// resolution, in TWO places:
//
//   · a Map in this isolate — free, and gone when the isolate is;
//   · the runtime's Cache API, where there is one. This is the part that
//     matters on a Worker: consecutive requests land in DIFFERENT isolates,
//     so without it the staging never converges — measured on the live host,
//     2026-09-13: three parts built, one pending, on every call for ever.
//
// The cached body is one buffer: a padded JSON header (the named faces and
// the invariants) then the mesh's three typed arrays. It is best-effort in
// both directions — a miss, an eviction or no Cache API at all costs a
// rebuild and nothing else.
const MESH_CACHE = new Map();
const MESH_CACHE_MAX = 48;
const enc = new TextEncoder(), dec = new TextDecoder();
export function packMesh(v) { // exported for the selftest: the edge path only runs in production
  const meta = enc.encode(JSON.stringify({ faces: v.faces, invariants: v.invariants, n: v.mesh.pos.length, m: v.mesh.idx.length, f: v.mesh.fid ? v.mesh.fid.length : 0 }));
  const pad = (4 - (meta.length % 4)) % 4; // the typed arrays that follow must stay 4-aligned
  const head = 4 + meta.length + pad;
  const buf = new ArrayBuffer(head + v.mesh.pos.byteLength + v.mesh.idx.byteLength + (v.mesh.fid?.byteLength || 0));
  new DataView(buf).setUint32(0, meta.length + pad);
  new Uint8Array(buf, 4, meta.length).set(meta);
  let off = head;
  new Float32Array(buf, off, v.mesh.pos.length).set(v.mesh.pos); off += v.mesh.pos.byteLength;
  new Uint32Array(buf, off, v.mesh.idx.length).set(v.mesh.idx); off += v.mesh.idx.byteLength;
  if (v.mesh.fid) new Uint32Array(buf, off, v.mesh.fid.length).set(v.mesh.fid);
  return buf;
}
export function unpackMesh(buf) {
  const metaLen = new DataView(buf).getUint32(0);
  const meta = JSON.parse(dec.decode(new Uint8Array(buf, 4, metaLen)).replace(/\0+$/, ''));
  let off = 4 + metaLen;
  const pos = new Float32Array(buf.slice(off, off + meta.n * 4)); off += meta.n * 4;
  const idx = new Uint32Array(buf.slice(off, off + meta.m * 4)); off += meta.m * 4;
  const fid = meta.f ? new Uint32Array(buf.slice(off, off + meta.f * 4)) : undefined;
  return { mesh: { pos, idx, fid }, faces: meta.faces, invariants: meta.invariants };
}
const CACHE_ORIGIN = 'https://cad.mino.mobi/__mesh/';
async function meshKey(treeText, res) {
  const h = await crypto.subtle.digest('SHA-256', enc.encode(`${res}|${treeText}`));
  return CACHE_ORIGIN + res + '/' + [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function cachedMesh(engine, treeText, res) {
  const key = `${res}|${treeText}`;
  const hit = MESH_CACHE.get(key);
  if (hit) { MESH_CACHE.delete(key); MESH_CACHE.set(key, hit); return { ...hit, cached: 'isolate' }; }
  const store = globalThis.caches?.default;
  let url = null, edge = store ? 'miss' : 'unavailable';
  if (store) {
    try {
      url = await meshKey(treeText, res);
      const res0 = await store.match(url);
      if (res0) { const v = unpackMesh(await res0.arrayBuffer()); remember(key, v); return { ...v, cached: 'edge', edge: 'hit' }; }
    } catch (e) { edge = `read failed: ${e.message}`; }
  }
  const r = engine.build(treeText, { kernel: 'truck', res });
  const v = r.ok ? { mesh: r.mesh, faces: r.report.faces, invariants: r.report.invariants } : { error: r.report.error };
  remember(key, v);
  if (store && url && v.mesh) { try { await store.put(url, new Response(packMesh(v), { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'public, max-age=86400' } })); edge = 'stored'; } catch (e) { edge = `write failed: ${e.message}`; } }
  return { ...v, cached: false, edge };
}
function remember(key, v) { MESH_CACHE.set(key, v); if (MESH_CACHE.size > MESH_CACHE_MAX) MESH_CACHE.delete(MESH_CACHE.keys().next().value); }
/// Is this mesh already to hand, here or at the edge? Asked before spending a
/// build out of the per-call budget.
async function meshReady(treeText, res) {
  if (MESH_CACHE.has(`${res}|${treeText}`)) return true;
  const store = globalThis.caches?.default;
  if (!store) return false;
  try { return !!(await store.match(await meshKey(treeText, res))); } catch { return false; }
}

export function createMcp({ kernels, fetchRef, gateway = SITE, fetch: f, capabilities = {} } = {}) {
  const caps = { manifold: true, maxParts: Infinity, budgetMs: Infinity, workBudget: Infinity, ...capabilities };
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
      const { components, partTrees, params, drive, warnings } = await flatten(doc, resolveRef, { facesOf });
      const parts = {};
      for (const [key, t] of partTrees) { try { parts[key] = resolveOne(t); } catch (e) { parts[key] = { ok: false, error: { op: e.op, msg: e.message } }; } }
      const bad = Object.values(parts).filter((p) => !p.ok).length;
      // a component both placed over the drive and mated is driven twice — the
      // check refuses it here, where it is cheap to see, rather than leaving it
      // to be found as a link that stretched 6 mm
      return { ok: bad === 0 && warnings.length === 0, kind: 'assembly', params, drive, components: components.map((c) => ({ id: c.id, part: c.part, partKey: c.partKey, dynamic: c.dynamic, timed: c.timed })), parts, ...(warnings.length ? { warnings: warnings.map((w) => w.msg) } : {}) };
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
      // `ok` means what `agent/build.mjs`'s exit code means. A leaky solid used
      // to come back `"ok": true` beside `"watertight": false` in the same
      // payload, which is how one reached a published revision.
      const tight = !r.ok || r.invariants?.watertight !== false;
      return { ...r, ok: r.ok && tight, built: r.ok, kind: 'part', link: link(doc), ...(tight ? {} : { note: `the kernel built this, but the result is NOT watertight (${r.invariants.open_edges} open edges, ${r.invariants.flipped_edges} flipped): its volume is not to be trusted and it will not print or export cleanly. \`agent/build.mjs\` exits 1 on this too. Truck's gear meshing is not deterministic (see the package's CLAUDE.md); for a cut, \`through: true\` sizes the tool from the body instead of an overhang you tune by hand.` }) };
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
    async mechanism({ assembly, input, at = {}, t = 0, steps, of, span, point, loads = [] }) {
      const doc = await asTree(assembly);
      if (!Array.isArray(doc.components)) throw new Error('a mechanism is what parts DO to each other: pass an assembly, not a part');
      const kin = await flatten(doc, resolveRef, { facesOf });
      const axes = axesOf(kin);
      if (!axes.length) throw new Error('this document has no degree of freedom to differentiate against: it declares neither `inputs` nor a `drive`');
      const chosen = input ? [axisNamed(kin, input)].filter(Boolean) : axes;
      if (!chosen.length) throw new Error(`no input named \`${input}\`; this document has ${axes.map((a) => a.name).join(', ')}`);
      const per = [];
      for (const axis of chosen) {
        const r = rates(kin, axis, { values: at, t });
        const sw = sweepRates(kin, axis, { steps: steps || null, values: at, t });
        const sec = {
          axis: axis.name, unit: axis.unit, min: axis.min, max: axis.max, time: !!axis.time, states: sw.samples.length,
          at: axis.time ? t : (at[axis.name] ?? axis.default ?? 0),
          moving: sw.moving.map((p) => ({ id: p.id, rate: p.max, slowest: p.min, turnRate: p.turn, travel: p.travel, turned: p.turned, net: p.net, netTurn: p.netTurn, advantage: p.max > 1e-12 ? 1 / p.max : null, deadAt: p.deadAt })),
          still: sw.per.filter((p) => !p.moves).map((p) => p.id),
        };
        // an invariant holds over the WHOLE input, not at the one state asked
        // about: a span rate reading zero at a dead point says nothing
        if (span) {
          const each = sw.samples.map((x) => ({ at: x.at, distance: spanAt(x, span[0], span[1]), rate: spanRate(x, span[0], span[1]) }));
          const worst = each.reduce((a, b) => (Math.abs(b.rate) > Math.abs(a.rate) ? b : a));
          sec.span = { between: span, distance: spanAt(r, span[0], span[1]), rate: spanRate(r, span[0], span[1]), worst: worst.rate, worstAt: worst.at, min: Math.min(...each.map((x) => x.distance)), max: Math.max(...each.map((x) => x.distance)), invariant: Math.abs(worst.rate) < 1e-9 };
        }
        if (point) { const pr = pointRate(r, point.component, point.local || [0, 0, 0]); sec.point = { component: point.component, local: point.local || [0, 0, 0], at: pr.at, d: pr.d, speed: pr.speed }; }
        if (loads.length) sec.effort = effortFor(r, loads);
        if (of) sec.curve = sw.samples.map((x) => { const q = ratioOf(x, of); return { at: x.at, rate: q.rate, advantage: Number.isFinite(q.advantage) ? q.advantage : null, turnRate: q.dturn }; });
        per.push(sec);
      }
      return { ok: kin.warnings.length === 0, kind: 'assembly', axes: axes.map((a) => ({ name: a.name, unit: a.unit, min: a.min, max: a.max, time: !!a.time, description: a.description })), per, lossless: true, note: 'rates are mm (or degrees) per unit of the input; advantage is the reciprocal of a rate; travel and turn are end to end over the whole input. Efforts are lossless floors.', ...(kin.warnings.length ? { warnings: kin.warnings.map((w) => w.msg) } : {}), link: link(doc) };
    },
    async interference({ assembly, t = 0, eps = 0.01, sweep = 0, grid, period, clearance, from = 0, budgetMs, res = 256 }) {
      const { engine, manifold } = await kernels();
      const doc = await asTree(assembly);
      if (!Array.isArray(doc.components)) throw new Error('not an assembly (no components)');
      const { components: all, mates, drive, inputs, partTrees, fits, warnings } = await flatten(doc, resolveRef, { facesOf });
      // A document with inputs has no single period to sweep: its question is
      // every combination of them. `grid` enumerates that; without it, one
      // pose at the inputs' rest values is all that is checked, and the answer
      // says so rather than letting it pass for a proof.
      const rest = restValues(inputs);
      const useGrid = grid !== undefined && grid !== false && inputs.length > 0;
      const states = useGrid ? gridStates(inputs, { steps: Number(grid) > 1 ? Math.round(Number(grid)) : null }) : null;
      if (grid !== undefined && grid !== false && !inputs.length) throw new Error('grid needs the document to declare `inputs`; it declares none. A document with one drive has a period — pass `sweep` instead.');
      const inputNote = inputs.length && !useGrid ? ` This document declares ${inputs.length} input${inputs.length === 1 ? '' : 's'} (${inputs.map((i) => `${i.name} ${i.min}…${i.max}${i.unit ? ' ' + i.unit : ''}`).join(', ')}) and everything here is at their rest values only — pass \`grid: true\` for every combination of them, which is the proof over two independent axes.` : '';
      const components = all.filter((c) => !c.reference);
      const expected = expectedTouch(mates);
      const expect = expectations(mates, fits);
      // a document that drives a component twice is wrong before anything is
      // measured, and no amount of clearance checking will show it
      const flaws = warnings.length ? { warnings: warnings.map((w) => w.msg) } : {};
      if (clearance !== undefined || !(caps.manifold && manifold)) {
        // nearest approach from the exact meshes: no kernel needed, so this is what the server runs
        if (clearance === undefined) clearance = 0;
        res = [64, 128, 256].includes(res) ? res : 256;
        // Two budgets, both counted rather than timed: a Cloudflare Worker
        // freezes its clock during synchronous work, so a wall-clock budget
        // never trips and the request dies on CPU instead (measured: the
        // clock assembly, code 1102, 2026-09-12). Parts are built at most
        // `maxParts` per call and cached; the sweep is budgeted in pairWork
        // units — triangles on both sides of every pair — which is what an
        // instant actually costs. `budgetMs` still applies where the clock
        // runs (node).
        const t0 = performance.now();
        const meshes = new Map(); const failed = []; const pending = []; let cachedCount = 0, builtCount = 0, edgeCount = 0, edge = null;
        for (const [key, tree] of partTrees) {
          if (!(await meshReady(tree, res)) && builtCount >= caps.maxParts) { pending.push(key); continue; }
          const r = await cachedMesh(engine, tree, res);
          if (r.cached === 'edge') edgeCount++; if (r.cached) cachedCount++; else builtCount++;
          if (r.edge) edge = r.edge;
          if (r.mesh) meshes.set(key, r.mesh); else failed.push({ key, error: r.error });
        }
        // `ok` is about what was actually sampled; `done` says whether the sweep
        // finished. They used to be the same field, so a windowed run with 666
        // clear pairs and nothing wrong came back `ok: false`.
        if (pending.length) return { ok: true, done: false, method: 'mesh', incomplete: 'parts', ...flaws, clearance, res, built: builtCount, cached: cachedCount, fromEdge: edgeCount, edge, ready: [...meshes.keys()], pending, failed, ms: performance.now() - t0, link: link(doc), note: `this server builds at most ${caps.maxParts} new part${caps.maxParts === 1 ? '' : 's'} per call at res ${res} (a big gear is ~30 s of CPU); ${pending.length} still to build. Call again with the same arguments — what is built is cached, so each call gets further, and the sweep runs once every part is in.` };
        const bodies = components.filter((c) => meshes.has(c.partKey)).map((c) => ({ id: c.id, mesh: meshes.get(c.partKey), comp: c }));
        const kin = { components: all, mates, drive };
        const annotate = (p) => ({ a: p.a, b: p.b, verdict: verdictOf(p, expect, clearance), distance: p.distance, intersecting: p.intersecting, contained: p.contained, touching: p.touching, penetration: p.penetration, closest: p.closest, ...(p.t !== undefined ? { t: p.t } : {}) });
        const CHORD = { 256: '0.0025 mm', 128: '0.005 mm', 64: '0.01 mm' };
        const meshNote = `nearest approach from the exact meshes (res ${res}, chord error under ${CHORD[res]}); verdicts: collision, close, loose fail; clear, contact, expected, fit pass; shared volumes need the preview kernel (agent/check.mjs locally)`;
        const built = { parts: meshes.size, built: builtCount, cached: cachedCount, fromEdge: edgeCount, edge, res };
        // one instant's cost, and what this server can spend on it
        const work = pairWork(bodies); const budget = caps.workBudget;
        const tris = bodies.reduce((a, b) => a + b.mesh.idx.length / 3, 0);
        // What an instant costs here, so the next call can be sized without
        // probing for the cliff: the work at this res, the budget, how many
        // instants that buys, and what the other resolutions would cost
        // (measured on the clock: res 128 ≈ 0.4× the work of res 256, res 64 ≈ 0.3×).
        const SCALE = { 256: 1, 128: 0.37, 64: 0.28 };
        const cost = { perInstant: work, ...(Number.isFinite(budget) ? { budget, instantsPerCall: Math.max(0, Math.floor((budget * 0.6) / work)) } : {}), res, triangles: tris, components: bodies.length,
          estimate: Object.fromEntries([64, 128, 256].map((r2) => [r2, Math.round((work * SCALE[r2]) / SCALE[res])])) };
        if (work > budget) return { ok: false, done: false, method: 'mesh', incomplete: 'too-big', clearance, ...built, ...flaws, components: bodies.length, triangles: tris, work, budget, cost, ms: performance.now() - t0, link: link(doc), note: `one instant of this assembly is ${(work / 1e6).toFixed(1)}M triangle-pairs of work, past what this server may spend in a request (${(budget / 1e6).toFixed(1)}M) — it would be killed mid-call, so it is refused instead. At res 128 an instant is about ${(cost.estimate[128] / 1e6).toFixed(1)}M and at res 64 about ${(cost.estimate[64] / 1e6).toFixed(1)}M (chord error ${CHORD[128]} / ${CHORD[64]}); check fewer components; or run \`node agent/check.mjs asm.json --clearance ${clearance} --sweep N\` locally, where there is no budget.` };
        let r;
        if (useGrid) {
          const maxStates = Math.max(1, Math.floor(budget / work));
          const c = gridClearance(bodies, kin, { states, from, maxStates, budgetMs: budgetMs ?? caps.budgetMs });
          r = { grid: { inputs: inputs.map((i) => ({ name: i.name, min: i.min, max: i.max, unit: i.unit, steps: Number(grid) > 1 ? Math.round(Number(grid)) : i.steps })), states: c.states }, window: { from: c.from, sampled: c.sampled, of: c.states }, done: c.done, next: c.next, pairs: c.pairs.map((p) => ({ ...annotate(p), state: p.state, values: p.values })), tested: c.tested, work: c.work, ms: c.ms };
        }
        else if (!sweep) { const c = clearanceAt(bodies, kin, t, { values: rest }); r = { t, values: rest, pairs: c.pairs.map(annotate), tested: c.tested, work: c.work ?? work, ms: c.ms, done: true }; }
        else {
          const n = Math.max(2, Math.min(360, Math.round(sweep))), per = period ?? periodOf(drive);
          // six tenths of the budget on instants, the rest on refining the closest pairs
          const maxInstants = Math.max(1, Math.floor((budget * 0.6) / work));
          const c = sweepClearance(bodies, kin, { instants: n, period: per, from, maxInstants, refineBudget: budget * 0.4, budgetMs: budgetMs ?? caps.budgetMs, refineWithin: clearance * 4 + 1 });
          r = { sweep: n, period: per, refined: true, refinedPairs: c.refinedPairs, window: { from: c.from, sampled: c.sampled, of: n }, done: c.done, next: c.next, pairs: c.pairs.map(annotate), tested: c.tested, work: c.work, ms: c.ms };
        }
        const gridNote = r.grid ? ` Every combination of the inputs, ${r.grid.states} states over ${r.grid.inputs.map((i) => `${i.name} (${i.steps})`).join(' × ')}: a grid, not a path, because a path through two independent inputs says nothing about the corners it misses. Each pair reports the state where it came closest; there is no refinement between nodes — ask for more steps.` : inputNote;
        const note = r.done === false ? `${meshNote}.${gridNote} \`ok\` is about the ${r.grid ? 'states' : 'instants'} sampled, \`done\` says the sweep finished: this server's budget covered ${r.window.sampled} of ${r.window.of} instants, so these are the worst approaches over instants ${r.window.from}–${r.window.from + r.window.sampled - 1}. Call again with from: ${r.next} for the rest (the meshes are cached) and take the smallest distance per pair across the windows. One instant costs ${(work / 1e6).toFixed(2)}M of this server's ${(budget / 1e6).toFixed(1)}M.` : meshNote;
        return { ok: r.pairs.every((p) => OK_VERDICTS.has(p.verdict)) && !warnings.length, method: 'mesh', clearance, ...built, ...flaws, ...r, cost, failed, link: link(doc), note: r.done === false ? note : `${meshNote}.${gridNote}` };
      }
      const built = new Map(); const failed = [];
      for (const [key, tree] of partTrees) { const r = buildManifold(manifold, engine.resolve(tree), { keep: true }); if (r.ok) built.set(key, r); else failed.push({ key, error: r.error }); }
      const poseAt = (at, values = rest) => {
        const angles = solveAngles(components, mates, drive, at, values);
        const bodies = components.filter((c) => built.has(c.partKey)).map((c) => ({ id: c.id, manifold: built.get(c.partKey).manifold, bbox: built.get(c.partKey).bbox, model: modelOf(c, angles) }));
        const r = interference({ Manifold: manifold.Manifold }, bodies, { eps });
        const volOf = (id) => { const c = components.find((x) => x.id === id); return built.get(c?.partKey)?.kernelVolume || 0; };
        return { t: at, pairs: r.pairs.map((p) => {
          // an expected touch has a budget in mm³: bolted, not the same solid
          const limit = touchLimit(expect(p.a, p.b), [volOf(p.a), volOf(p.b)]).max;
          const ex = expected(p.a, p.b);
          return { ...p, expected: ex, limit, overBudget: ex && p.volume > limit };
        }), tested: r.tested, ms: r.ms };
      };
      try {
        if (useGrid) {
          const worst = new Map(); let ms = 0, tested = 0;
          for (const st of states) { const r = poseAt(st.t || 0, st.values); ms += r.ms; tested = Math.max(tested, r.tested); for (const p of r.pairs) { const key = `${p.a}|${p.b}`; const w = worst.get(key); if (!w || p.volume > w.volume) worst.set(key, { ...p, state: st.label, values: st.values }); } }
          const pairs = [...worst.values()].sort((a, b) => b.volume - a.volume);
          return { ok: pairs.every((p) => p.expected && !p.overBudget) && !warnings.length, done: true, grid: { states: states.length, inputs: inputs.map((i) => i.name) }, pairs, tested, ms, ...flaws, failed, link: link(doc) };
        }
        if (!sweep) { const r = poseAt(t, rest); return { ok: r.pairs.every((p) => p.expected && !p.overBudget) && !warnings.length, done: true, t, values: rest, pairs: r.pairs, tested: r.tested, ms: r.ms, ...flaws, failed, link: link(doc), ...(inputNote ? { note: inputNote.trim() } : {}) }; }
        // a sweep: N instants over one period of the drive, each pair's worst overlap and when
        const n = Math.max(2, Math.min(360, Math.round(sweep))), per = period ?? periodOf(drive);
        const worst = new Map(); let ms = 0, tested = 0;
        for (let k = 0; k < n; k++) { const r = poseAt((k * per) / n); ms += r.ms; tested = Math.max(tested, r.tested); for (const p of r.pairs) { const key = `${p.a}|${p.b}`; const w = worst.get(key); if (!w || p.volume > w.volume) worst.set(key, { ...p, t: r.t }); } }
        const pairs = [...worst.values()].sort((a, b) => b.volume - a.volume);
        return { ok: pairs.every((p) => p.expected && !p.overBudget) && !warnings.length, done: true, sweep: n, period: per, pairs, tested, ms, ...flaws, failed, link: link(doc) };
      } finally { for (const b of built.values()) b.manifold.delete?.(); }
    },
    async drawing({ tree, views, hidden = true, t = 0, width = 900, title }) {
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
      // the sheet's name: what the caller asked for, else the document's, else the ref it came from
      const fromRef = typeof tree === 'string' ? tree.replace(/^bench:/, '').split('/').pop() : null;
      const sheet = title || doc.name || fromRef || (Array.isArray(doc.components) ? 'assembly' : 'part');
      const d = drawing(bodies, { views: Array.isArray(views) && views.length ? views : undefined, hidden, width: Math.max(300, Math.min(4000, width | 0)), title: String(sheet).slice(0, 60), note });
      return { ok: true, kind: Array.isArray(doc.components) ? 'assembly' : 'part', ...d, link: link(doc) };
    },
    async report({ assembly, t = 0, explode = 0.6, hidden = true, maxParts = 20, title }) {
      const { engine } = await kernels();
      const doc = await asTree(assembly);
      if (!Array.isArray(doc.components)) throw new Error('not an assembly (no components) — a report is about how parts go together; for one part use `drawing`');
      const { components, mates, drive, inputs, partTrees, fits } = await flatten(doc, resolveRef, { facesOf });
      const angles = solveAngles(components, mates, drive, t);
      // the same staged, cached build the clearance check uses: a big assembly takes a few calls
      const builds = new Map(); const pending = []; const failed = []; let builtCount = 0, cachedCount = 0, edgeCount = 0, edge = null;
      for (const [key, tree] of partTrees) {
        if (!(await meshReady(tree, 64)) && builtCount >= caps.maxParts) { pending.push(key); continue; }
        const r = await cachedMesh(engine, tree, 64);
        if (r.cached === 'edge') edgeCount++; if (r.cached) cachedCount++; else builtCount++;
        if (r.edge) edge = r.edge;
        if (r.mesh) builds.set(key, { mesh: r.mesh, faces: r.faces, invariants: r.invariants }); else failed.push({ key, error: r.error });
      }
      if (pending.length) return { ok: false, incomplete: 'parts', built: builtCount, cached: cachedCount, fromEdge: edgeCount, edge, ready: [...builds.keys()], pending, failed, link: link(doc), note: `this server builds at most ${caps.maxParts} new part${caps.maxParts === 1 ? '' : 's'} per call; ${pending.length} still to build. Call again with the same arguments — what is built is cached, so the report comes back once every part is in.` };
      if (!builds.size) throw new Error(`no part of this assembly builds with the exact kernel: ${failed.map((f) => `${f.key}: ${f.error?.op}: ${f.error?.msg}`).join('; ')}`);
      const unbuilt = failed.map((f) => ({ partKey: f.key, part: f.key.split('|')[0], error: `${f.error?.op}: ${f.error?.msg}`, tree: partTrees.get(f.key) }));
      const fromRef = typeof assembly === 'string' ? assembly.replace(/^bench:/, '').split('/').pop() : null;
      const mkReport = (opts) => assemblyReport({ doc, components, mates, drive, fits, inputs, partTrees, builds, angles, modelOf, t, site: gateway === SITE ? SITE : gateway, ...opts });
      const rep0 = mkReport({ title: String(title || doc.name || fromRef || 'assembly').slice(0, 60), explode, hidden, maxParts: Math.max(0, Math.min(60, maxParts | 0)), at: typeof assembly === 'string' && assembly.startsWith('at://') ? assembly : null, unbuilt });
      // a page a client cannot hold is no use: over the cap, redraw without
      // hidden lines and with fewer part sheets, and say what was dropped
      const CAP = 3.5e6;
      let rep = rep0, reduced = null;
      if (rep.bytes > CAP) { const keep = Math.max(1, Math.floor(maxParts / 3)); rep = mkReport({ title: String(title || doc.name || fromRef || 'assembly').slice(0, 60), explode, hidden: false, maxParts: keep, at: typeof assembly === 'string' && assembly.startsWith('at://') ? assembly : null, unbuilt }); reduced = { was: rep0.bytes, hidden: false, maxParts: keep }; }
      return { ok: unbuilt.length === 0, html: rep.html, ...(reduced ? { reduced, note: `the full page was ${(reduced.was / 1e6).toFixed(1)} MB, past what this server returns — this one drops the hidden lines and draws ${reduced.maxParts} part sheets. Run \`node agent/report.mjs\` locally for the whole thing.` } : {}), bytes: rep.bytes, missing: rep.missing.map((m) => ({ part: m.part, qty: m.qty, error: m.error })), components: rep.components, built: builtCount, cached: cachedCount, fromEdge: edgeCount, edge, overall: rep.overall, volume: rep.volume, bom: rep.bom.map((r) => ({ item: r.item, part: r.part, qty: r.qty, ids: r.ids, volume: r.volume, faces: r.faces })), steps: rep.steps.map((s) => ({ n: s.n, id: s.id, qty: s.qty, part: s.part, lines: s.lines })), motion: rep.motion ? rep.motion.map((m) => ({ ...m, curves: undefined })) : null, sheets: rep.sheets, truncated: rep.truncated, built: builtCount, cached: cachedCount, ms: rep.ms, link: link(doc) };
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
          // a report's page travels once, as an embedded resource, beside its parts list and steps
          if (typeof result?.html === 'string') return reply({ content: [{ type: 'text', text: JSON.stringify({ ...result, html: undefined }) }, { type: 'resource', resource: { uri: 'cad://report.html', mimeType: 'text/html', text: result.html } }], structuredContent: result, isError: false });
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
