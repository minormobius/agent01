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
import { flatten, solveAngles, modelOf } from './lib/assembly.js';
import { buildManifold } from './lib/manifold-kernel.js';
import { interference } from './lib/interfere.js';
import { weld, invariants } from './lib/mesh.js';
import { describe, measure, faceByName } from './lib/measure.js';
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
  { name: 'measure', title: 'Measure named faces', description: 'One face: its geometry (a cylinder\'s diameter and axis, a plane\'s normal). Two faces: plane-to-plane, axis-to-axis (with both diameters and the wall between) or axis-to-plane distance, from exact geometry. Face names come from `build`.',
    inputSchema: { type: 'object', properties: { tree: treeArg, a: { type: 'string', description: 'a face name, e.g. plate.pivot[0][0]' }, b: { type: 'string' } }, required: ['tree', 'a'] } },
  { name: 'interference', title: 'Check an assembly for interference', description: 'Pose every component of an assembly at time t (seconds through its drive) and intersect each overlapping pair. Pairs with more than eps mm³ in common are returned, largest first; fixed-mated bores on their arbors are expected touches.',
    inputSchema: { type: 'object', properties: { assembly: treeArg, t: { type: 'number', default: 0 }, eps: { type: 'number', default: 0.01 } }, required: ['assembly'] } },
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
  return TOOLS.filter((t) => manifold || t.name !== 'interference').map((t) => {
    if (manifold || t.name !== 'build') return t;
    const p = { ...t.inputSchema.properties }; delete p.kernel;
    return { ...t, description: t.description.replace(' (or the Manifold preview kernel)', '') + ' The preview kernel is not available on this server; for interference checks run agent/check.mjs locally (see SKILL.md).', inputSchema: { ...t.inputSchema, properties: p } };
  });
}

export function createMcp({ kernels, fetchRef, gateway = SITE, fetch: f, capabilities = {} } = {}) {
  const caps = { manifold: true, maxParts: Infinity, ...capabilities };
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

  const tools = {
    async check({ tree }) {
      const { engine } = await kernels();
      const resolveOne = (t) => { const r = engine.resolve(t).resolved; return { ok: true, units: r.units, params: r.params, sketches: (r.sketches || []).map((s) => s.id), ops: (r.ops || []).map((o) => ({ op: o.op, id: o.id, mode: o.mode })) }; };
      const doc = await asTree(tree);
      if (!Array.isArray(doc.components)) return resolveOne(doc);
      // an assembly: its params and derived at t = 0 and every placement expression are evaluated by flatten; then each distinct part
      const { components, partTrees, params, drive } = await flatten(doc, resolveRef);
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
        const { components, partTrees } = await flatten(doc, resolveRef);
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
    async measure({ tree, a, b }) {
      const { engine } = await kernels();
      const r = engine.build(JSON.stringify(await asTree(tree)), { kernel: 'truck' });
      if (!r.ok) throw new Error(`exact build failed: ${r.report.error?.op}: ${r.report.error?.msg} — measurements need the exact kernel`);
      const A = faceByName(r.report.faces, a); if (!A) throw new Error(`no face named ${a}; names: ${r.report.faces.slice(0, 40).map((x) => x.names[0]).join(', ')}${r.report.faces.length > 40 ? ', …' : ''}`);
      if (!b) return { face: faceOut(A) };
      const B = faceByName(r.report.faces, b); if (!B) throw new Error(`no face named ${b}`);
      return { a: faceOut(A), b: faceOut(B), ...measure(A, B) };
    },
    async interference({ assembly, t = 0, eps = 0.01 }) {
      const { engine, manifold } = await kernels();
      if (!(caps.manifold && manifold)) throw new Error('interference needs the preview kernel, which is not available on this server; run agent/check.mjs locally (see SKILL.md)');
      const doc = await asTree(assembly);
      if (!Array.isArray(doc.components)) throw new Error('not an assembly (no components)');
      const { components, mates, drive, partTrees } = await flatten(doc, resolveRef);
      const built = new Map(); const failed = [];
      for (const [key, tree] of partTrees) { const r = buildManifold(manifold, engine.resolve(tree), { keep: true }); if (r.ok) built.set(key, r); else failed.push({ key, error: r.error }); }
      const angles = solveAngles(components, mates, drive, t);
      const fixed = new Set(mates.filter((m) => m.kind === 'fixed').map((m) => [m.a, m.b].sort().join('×')));
      const bodies = components.filter((c) => built.has(c.partKey)).map((c) => ({ id: c.id, manifold: built.get(c.partKey).manifold, bbox: built.get(c.partKey).bbox, model: modelOf(c, angles) }));
      try {
        const r = interference({ Manifold: manifold.Manifold }, bodies, { eps });
        const pairs = r.pairs.map((p) => ({ ...p, expected: fixed.has([p.a, p.b].sort().join('×')) }));
        return { ok: pairs.every((p) => p.expected), t, pairs, tested: r.tested, ms: r.ms, failed, link: link(doc) };
      } finally { for (const b of built.values()) b.manifold.delete?.(); }
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
      case 'initialize': return reply({ protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: `Feature-tree CAD. Read ${SITE}/SKILL.md first. Tools take a tree object, \`bench:<name>\` or an at:// URI. build gives the numbers to judge by and a link to hand a human; there is no render tool — the link is the picture — and no write tool: parts are saved with the person's own sign-in.${caps.manifold ? '' : ' The preview kernel (and so the interference tool) is not on this server; run agent/check.mjs locally for that.'}` });
      case 'notifications/initialized': case 'notifications/cancelled': return null;
      case 'ping': return reply({});
      case 'tools/list': return reply({ tools: toolList });
      case 'tools/call': {
        const { name, arguments: args } = msg.params || {};
        try {
          const result = await call(name, args);
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
    if (request.method === 'GET') return json({ ...SERVER, protocolVersion: PROTOCOL, transport: 'streamable-http (JSON responses)', endpoint: `${SITE}/mcp`, skill: `${SITE}/SKILL.md`, index: `${SITE}/llms.txt`, capabilities: caps, tools: toolList });
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    let body; try { body = await request.json(); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }, 400); }
    if (Array.isArray(body)) { const out = (await Promise.all(body.map(rpc))).filter(Boolean); return out.length ? json(out) : new Response(null, { status: 202, headers: cors }); }
    const res = await rpc(body);
    return res ? json(res) : new Response(null, { status: 202, headers: cors });
  }

  return { tools: toolList, call, rpc, handle };
}
