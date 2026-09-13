#!/usr/bin/env node
// mcp.selftest — the tool surface under node, kernels injected, a fake repo
// behind the file tools. Exit 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { createMcp, TOOLS, packMesh, unpackMesh } from './mcp.js';
import { kernels, benchRef } from './agent/common.mjs';
import { Drive, MemoryBackend } from './lib/drive.js';

const here = path.dirname(new URL(import.meta.url).pathname);
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };
const bench = (n) => JSON.parse(fs.readFileSync(path.join(here, 'bench', n + '.json'), 'utf8'));

// a repo the file tools read, behind a fetch that answers like the gateway
const repo = new MemoryBackend('did:plc:stranger');
{ const put = repo.putRecord.bind(repo); repo.putRecord = async (c, r, v) => { const x = await put(c, r, v); x.cid = 'bafyfake' + x.cid.slice(6); repo.records.get(repo.key(c, r)).cid = x.cid; return x; }; }
const seeded = await new Drive(repo).put('lib/cam', bench('cam'), { message: 'a cam' });
const fakeFetch = async (u) => {
  u = new URL(u); const q = Object.fromEntries(u.searchParams); const method = u.pathname.slice(6);
  if (!['did:plc:stranger', 'stranger.example'].includes(q.repo)) return new Response('{}', { status: 400 });
  if (method === 'com.atproto.repo.getRecord') { const r = await repo.getRecord(q.collection, q.rkey); return r ? Response.json(r) : new Response('{}', { status: 404 }); }
  if (method === 'com.atproto.repo.listRecords') return Response.json(await repo.listRecords(q.collection, Number(q.limit) || 50, q.cursor));
  return new Response('{}', { status: 404 });
};
const fetchRef = async (ref) => (ref.startsWith('at://') ? (await new Drive(repo).get(ref)).revision.tree : benchRef(ref));
const mcp = createMcp({ kernels, fetchRef, gateway: 'https://gateway.test', fetch: fakeFetch });
const post = (body) => mcp.handle(new Request('https://cad.mino.mobi/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const rpc = async (method, params, id = 1) => (await post({ jsonrpc: '2.0', id, method, params })).json();
const tool = async (name, args) => { const r = await rpc('tools/call', { name, arguments: args }); if (r.error) throw new Error(r.error.message); return r.result; };

// transport
const desc = await (await mcp.handle(new Request('https://cad.mino.mobi/mcp'))).json();
check(desc.name === 'cad.mino.mobi' && desc.tools.length === TOOLS.length && desc.skill.endsWith('/SKILL.md') && desc.changelog.endsWith('/CHANGELOG.md'), `GET /mcp is the descriptor with ${desc.tools.length} tools, the skill and the changelog`);
const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
check(init.result?.protocolVersion && init.result.capabilities.tools && /SKILL\.md/.test(init.result.instructions), 'initialize answers with capabilities and instructions');
check((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status === 202, 'a notification gets 202 and no body');
const list = await rpc('tools/list');
check(list.result.tools.map((t) => t.name).join() === 'check,build,measure,interference,drawing,report,step,list_files,get_file', `tools/list: ${list.result.tools.map((t) => t.name).join(', ')}`);
check((await rpc('nope')).error?.code === -32601, 'an unknown method is -32601');
check((await rpc('tools/call', { name: 'nope' })).error?.code === -32602, 'an unknown tool is -32602');
const opts = await mcp.handle(new Request('https://cad.mino.mobi/mcp', { method: 'OPTIONS' }));
check(opts.status === 204 && opts.headers.get('access-control-allow-origin') === '*', 'OPTIONS answers CORS');

// tools
const c = await tool('check', { tree: bench('gear') });
check(c.structuredContent.ok && c.structuredContent.params.z === 60 && c.structuredContent.ops.length === 2 && c.structuredContent.sketches.length === 3, `check resolves the gear (z ${c.structuredContent.params.z}, ${c.structuredContent.sketches.length} sketches, ${c.structuredContent.ops.length} ops)`);
const bad = await tool('check', { tree: { params: { r: 'nope(' }, features: [] } });
check(bad.isError && /param `r`/.test(bad.content[0].text), `check reports a broken expression by name: ${bad.content[0].text.slice(0, 60)}`);
const b = (await tool('build', { tree: bench('plate') })).structuredContent;
check(b.ok && b.kernel === 'truck' && Math.abs(b.invariants.volume - 1877.389) < 0.01 && b.invariants.euler === -16 && b.invariants.watertight, `build: plate volume ${b.invariants.volume.toFixed(3)} χ ${b.invariants.euler} watertight`);
check(b.faces.length === 42 && b.faces.some((f) => f.kind === 'cylinder' && Math.abs(f.diameter - 0.32) < 1e-6) && b.link.startsWith('https://cad.mino.mobi/#t='), `build lists ${b.faces.length} named faces with geometry and returns a viewer link`);
const bm = (await tool('build', { tree: 'bench:gear', kernel: 'manifold' })).structuredContent;
check(bm.ok && bm.kernel === 'manifold' && bm.invariants.watertight && bm.faces.length === 0, `build with the preview kernel takes bench: refs (${bm.invariants.volume.toFixed(1)} mm³)`);
const esc = await tool('build', { tree: 'bench:escape' });
check(!esc.structuredContent.ok && /boolean/.test(esc.structuredContent.error.msg), `build is honest about Truck's boolean failure: ${esc.structuredContent.error.msg}`);
const ck = (await tool('check', { tree: 'bench:crank' })).structuredContent;
check(ck.ok && ck.kind === 'assembly' && ck.params.r === 10 && ck.components.length === 3 && ck.components.find((c) => c.id === 'block').dynamic && Object.values(ck.parts).every((p) => p.ok) && ck.parts[ck.components[1].partKey].params.length === 30, `check on an assembly evaluates its params (r = ${ck.params.r}), marks dynamic components, and resolves every distinct part (rod length ${ck.parts[ck.components[1].partKey].params.length})`);
const asm = (await tool('build', { tree: 'bench:crank', faces: false })).structuredContent;
check(asm.kind === 'assembly' && asm.components.length === 3 && Object.keys(asm.parts).length === 3 && asm.complete && asm.remaining.length === 0, `build on an assembly: ${asm.components.length} components over ${Object.keys(asm.parts).length} parts, complete`);
{
  const sliced = createMcp({ kernels, fetchRef, capabilities: { maxParts: 2 } });
  const s1 = (await sliced.call('build', { tree: 'bench:crank', faces: false }));
  check(Object.keys(s1.parts).length === 2 && s1.remaining.length === 1 && !s1.complete && s1.partKeys.length === 3, `a server with maxParts 2 builds two and names the one remaining (${s1.remaining.join(', ')})`);
  const s2 = await sliced.call('build', { tree: 'bench:crank', faces: false, parts: s1.remaining });
  check(Object.keys(s2.parts).length === 1 && s2.remaining.length === 0 && s2.parts[s1.remaining[0]].ok !== undefined, 'the next call builds the remaining part by key');
  const s3 = await sliced.call('build', { tree: 'bench:crank', faces: false, parts: ['nope'] });
  check(s3.unknown?.[0] === 'nope' && Object.keys(s3.parts).length === 0, 'an unknown part key is reported, not built');
}
const m1 = (await tool('measure', { tree: 'bench:plate', a: 'plate.pivot[0][0]' })).structuredContent;
check(m1.face.kind === 'cylinder' && Math.abs(m1.face.diameter - 0.32) < 1e-6, `measure one face: pivot ⌀ ${m1.face.diameter}`);
const m2 = (await tool('measure', { tree: 'bench:plate', a: 'plate.start', b: 'plate.end' })).structuredContent;
check(m2.kind === 'plane-plane' && m2.parallel && Math.abs(m2.distance - 1.5) < 1e-9, `measure two faces: plate.start→plate.end ${m2.distance}`);
const nf = await tool('measure', { tree: 'bench:plate', a: 'nothing' });
check(nf.isError && /no face named nothing/.test(nf.content[0].text), 'measure names the faces it does know when one is missing');
const cl = (await tool('interference', { assembly: 'bench:lift', sweep: 3, clearance: 0.5 })).structuredContent;
check(cl.method === 'mesh' && cl.refined && cl.pairs.length >= 9 && cl.pairs.every((p) => ['clear', 'expected', 'fit'].includes(p.verdict)) && cl.pairs.some((p) => p.verdict === 'fit' && [p.a, p.b].includes('nut')) && cl.ok === true, `clearance mode: nearest approach of ${cl.pairs.length} pairs through the cycle, the nut's 0.1 mm to the screw read as its declared fit under a 0.5 demand (ok ${cl.ok})`);
const ms = (await tool('measure', { tree: 'bench:lift', a: 'nut.end', b: 'platform.start', t: 0.5 })).structuredContent;
check(ms.kind === 'plane-plane' && Math.abs(ms.distance) < 1e-9 && ms.t === 0.5, `measure across an assembly: the nut's top and the platform's underside are coplanar at t = 0.5 (${ms.kind}, ${ms.distance})`);
// a sweep too big for one server request: windowed, resumable, and the meshes cached between calls
{
  const tight = createMcp({ kernels, fetchRef, capabilities: { manifold: false, budgetMs: 1000 } });
  const SWEEP = { assembly: 'bench:lift', sweep: 12, clearance: 0.5, res: 64 }; // res 64: this is about windowing, not chord error
  const w1 = await tight.call('interference', SWEEP);
  check(w1.method === 'mesh' && w1.done === false && Number.isInteger(w1.next) && w1.next > 0 && w1.window.sampled >= 1 && w1.window.sampled < 12 && w1.window.of === 12 && w1.ok === false && /call again with from/i.test(w1.note), `a sweep over a 1 s budget stops after ${w1.window?.sampled} of 12 instants and says to resume at ${w1.next}`);
  const w2 = await tight.call('interference', { ...SWEEP, from: w1.next });
  check(w2.window.from === w1.next && w2.cached > 0 && w2.built === 0 && w2.pairs.length === w1.pairs.length, `the next window starts at ${w2.window.from} and pays nothing to build: ${w2.cached} part meshes came from the cache`);
  const clearanceBand = 0.5 * 4 + 1;
  let from = 0, calls = 0, closest = new Map();
  for (; calls < 24; calls++) { const r = await tight.call('interference', { ...SWEEP, from }); for (const p of r.pairs) { const k = `${p.a}|${p.b}`; if (!closest.has(k) || p.distance < closest.get(k)) closest.set(k, p.distance); } if (r.done) break; from = r.next; }
  const roomy = createMcp({ kernels, fetchRef, capabilities: { manifold: false, budgetMs: 600000 } });
  const whole = await roomy.call('interference', SWEEP);
  // A window samples the same instants; refinement between samples is the
  // part a 1 s budget cannot afford, so a window is never better than the
  // whole call, and identical for the far pairs, which are not refined.
  const w = (p) => closest.get(`${p.a}|${p.b}`);
  const never = whole.pairs.every((p) => w(p) >= p.distance - 1e-9);
  const far = whole.pairs.filter((p) => p.distance > clearanceBand);
  check(whole.done === true && never && far.length > 0 && far.every((p) => Math.abs(w(p) - p.distance) < 1e-9), `${calls + 1} windows cover the 12-instant sweep: never nearer than the one unbudgeted call, and identical on the ${far.length} pairs too far to refine`);
  check(whole.refinedPairs < whole.pairs.length && whole.refinedPairs > 0, `only the ${whole.refinedPairs} pairs within four times the clearance are refined, not all ${whole.pairs.length}`);
  // A Worker's clock does not advance during synchronous work, so the server
  // budgets by WORK — triangles on both sides of every pair — not by time.
  const counted = createMcp({ kernels, fetchRef, capabilities: { manifold: false, maxParts: 30, workBudget: 1.2e6 } });
  const c1 = await counted.call('interference', { ...SWEEP, sweep: 24 });
  check(c1.done === false && c1.window.sampled >= 1 && c1.window.sampled < 24 && c1.work <= 1.2e6 * 1.05, `a work budget windows the sweep with no clock at all: ${c1.window.sampled} of 24 instants, ${(c1.work / 1e6).toFixed(2)}M of 1.2M triangle-pairs`);
  const tiny = createMcp({ kernels, fetchRef, capabilities: { manifold: false, maxParts: 30, workBudget: 1e5 } });
  const t1 = await tiny.call('interference', { assembly: 'bench:lift', sweep: 4, clearance: 0.5, res: 64 });
  check(t1.incomplete === 'too-big' && t1.work > t1.budget && /refused instead/.test(t1.note) && /res 128 or 64/.test(t1.note), `an assembly whose single instant is past the budget is refused with its numbers, not killed (${(t1.work / 1e6).toFixed(2)}M of ${(t1.budget / 1e6).toFixed(2)}M)`);
  const slow = createMcp({ kernels, fetchRef, capabilities: { manifold: false, maxParts: 1, workBudget: 1e7 } });
  const p1 = await slow.call('interference', { assembly: 'bench:crank', clearance: 0.5, res: 128 });
  check(p1.incomplete === 'parts' && p1.pending.length >= 1 && p1.built === 1 && /each call gets further/.test(p1.note), `a server that builds one part per call says what is left (${p1.pending?.length} pending at res 128)`);
  const coarse = await counted.call('interference', { assembly: 'bench:lift', clearance: 0.5, res: 64 });
  const fine = await counted.call('interference', { assembly: 'bench:lift', clearance: 0.5, res: 256 });
  const nut = (r) => r.pairs.find((p) => [p.a, p.b].includes('nut') && [p.a, p.b].includes('screw')).distance;
  check(coarse.res === 64 && fine.res === 256 && nut(coarse) < nut(fine) && Math.abs(nut(fine) - 0.1) < 0.0025, `res 64 is cheaper and coarser: the nut reads ${nut(coarse).toFixed(4)} against ${nut(fine).toFixed(4)} at res 256 for a designed 0.1`);
}
const sw = (await tool('interference', { assembly: 'bench:lift', sweep: 6 })).structuredContent;
check(sw.ok && sw.sweep === 6 && Math.abs(sw.period - 1) < 1e-9 && sw.pairs.every((p) => p.expected), `interference sweeps ${sw.sweep} instants over ${sw.period} s of the lift (references resolved on the host) and finds only expected touches`);
const i = (await tool('interference', { assembly: 'bench:clock', t: 0.5 })).structuredContent;
check(i.ok && i.tested > 20 && i.pairs.every((p) => p.expected), `interference: the clock mid-beat, ${i.tested} pairs tested, ${i.pairs.length} expected touches, none real`);
const dw = await tool('drawing', { tree: 'bench:plate' });
const dws = dw.structuredContent;
check(dws.ok && dws.holes.length === 9 && dws.views.length === 3 && dw.content[1]?.resource?.mimeType === 'image/svg+xml' && dw.content[1].resource.text.startsWith('<svg') && !dw.content[0].text.includes('<svg'), `drawing: the plate's three views as an SVG resource (${(dws.svg.length / 1024).toFixed(0)} kB) with ${dws.holes.length} holes called out; the numbers travel without it`);
check(dws.svg.includes('>plate</text>'), 'the sheet is titled from the ref it came from when the tree has no name');
const dwa = (await tool('drawing', { tree: 'bench:lift', t: 0.5, views: ['front', 'iso'], hidden: false, title: 'lift — half a turn' })).structuredContent;
check(dwa.svg.includes('lift — half a turn'), 'a caller may name the sheet');
check(dwa.kind === 'assembly' && dwa.views.map((v) => v.name).join() === 'front,iso' && dwa.views.every((v) => v.hidden === 0) && dwa.svg.includes('t = 0.5 s'), 'drawing an assembly posed at t, chosen views, no hidden lines');
// the mesh cache at the edge: node has no Cache API, so the path that makes
// staging converge on a Worker is proved here against a fake one
{
  const one = (await kernels()).engine.build(bench('plate'), { kernel: 'truck' });
  const round = unpackMesh(packMesh({ mesh: one.mesh, faces: one.report.faces, invariants: one.report.invariants }));
  const same = round.mesh.pos.length === one.mesh.pos.length && round.mesh.idx.every((v, i) => v === one.mesh.idx[i]) && round.mesh.pos.every((v, i) => v === one.mesh.pos[i]) && (!one.mesh.fid || round.mesh.fid.every((v, i) => v === one.mesh.fid[i]));
  check(same && round.faces.length === one.report.faces.length && round.invariants.volume === one.report.invariants.volume, `a cached mesh survives the round trip whole: ${round.mesh.idx.length / 3} triangles, ${round.faces.length} named faces, volume ${round.invariants.volume.toFixed(3)}`);
  const store = new Map();
  globalThis.caches = { default: { async match(k) { const b = store.get(k); return b ? new Response(b) : undefined; }, async put(k, r) { store.set(k, await r.arrayBuffer()); } } };
  try {
    const edge = createMcp({ kernels, fetchRef, capabilities: { manifold: false, maxParts: 1, workBudget: 1e7 } });
    const a = await edge.call('interference', { assembly: 'bench:crank', clearance: 0.5, res: 64 });
    const wrote = store.size;
    const b = await edge.call('interference', { assembly: 'bench:crank', clearance: 0.5, res: 64 });
    check(wrote > 0 && [...store.keys()].every((k) => k.startsWith('https://cad.mino.mobi/__mesh/64/')) && b.built <= a.built, `meshes are written to the Cache API (${wrote} entries, keyed by tree and resolution) so the next isolate does not rebuild them`);
    const got = unpackMesh(store.get([...store.keys()][0]));
    check(got.mesh.idx.length > 0 && Array.isArray(got.faces), 'and what was written reads back as a mesh with its faces');
  } finally { delete globalThis.caches; }
}
const rp = await tool('report', { assembly: 'bench:lift', t: 0.5 });
const rps = rp.structuredContent;
check(rps.ok && rps.bom.length === 4 && rps.bom.find((r) => r.part === 'bolt').qty === 4 && rps.sheets === 4 && rp.content[1]?.resource?.mimeType === 'text/html' && rp.content[1].resource.text.startsWith('<!doctype html>') && !rp.content[0].text.includes('<!doctype'), `report: the lift as one page (${(rps.bytes / 1024).toFixed(0)} kB) — ${rps.bom.length} items, ${rps.sheets} part sheets; the page travels as a resource, the numbers without it`);
const stepIds = rps.steps.map((s) => s.id).join(', ');
check(rps.steps.length === 4 && /bolt\[0…3\]/.test(stepIds) && rps.steps[1].lines.some((l) => /rides `screw` as a nut — 2 mm of travel per turn/.test(l)) && rps.steps[3].lines.some((l) => /sits on `platform`/.test(l)), `report steps read off the document: ${stepIds}`);
const html = rp.content[1].resource.text;
check(html.includes('#t=') && html.includes('id="exploded"') && html.includes('class="balloon"') && (html.match(/<svg/g) || []).length === 6, 'the page carries the assembly, the exploded view with balloons, four part sheets, and viewer links');
const rpe = await tool('report', { assembly: 'bench:crank', t: 0, maxParts: 1 });
check(rpe.structuredContent.truncated >= 1 && rpe.structuredContent.sheets === 1, `maxParts limits the part sheets (${rpe.structuredContent.sheets} drawn, ${rpe.structuredContent.truncated} not)`);
const rpp = await tool('report', { tree: 'bench:plate', assembly: 'bench:plate' });
check(rpp.isError && /not an assembly/.test(rpp.content[0].text), 'a part is not an assembly: the report says so and points at drawing');
const st = (await tool('step', { tree: 'bench:cam' })).structuredContent;
check(st.ok && st.bytes > 30000 && st.step.startsWith('ISO-10303-21'), `step: ${(st.bytes / 1e3).toFixed(0)} kB of STEP`);
const lf = (await tool('list_files', { repo: 'stranger.example' })).structuredContent;
check(lf.files.length === 1 && lf.files[0].path === 'lib/cam' && lf.files[0].open.includes('?at='), 'list_files reads a repo through the gateway');
const gf = (await tool('get_file', { uri: seeded.uri })).structuredContent;
check(gf.path === 'lib/cam' && gf.tree.params.r === 10 && gf.history.length === 1, 'get_file returns the tree and history by AT URI');
const gf2 = (await tool('get_file', { repo: 'did:plc:stranger', path: 'lib/cam' })).structuredContent;
check(gf2.uri === seeded.uri, '…and by repo and path');
const viaRef = (await tool('build', { tree: seeded.uri, faces: false })).structuredContent;
check(viaRef.ok && Math.abs(viaRef.invariants.volume - 1984.984) < 0.01, `build takes an at:// ref straight from a repo (${viaRef.invariants.volume.toFixed(3)} mm³)`);
const batch = await (await post([{ jsonrpc: '2.0', id: 'a', method: 'ping' }, { jsonrpc: '2.0', id: 'b', method: 'tools/list' }])).json();
check(Array.isArray(batch) && batch.length === 2 && batch[1].result.tools.length === TOOLS.length, 'a batch answers each request');

// the live worker has no Manifold (its glue needs eval): the surface says so instead of failing
{
  const lite = createMcp({ kernels: async () => ({ engine: (await kernels()).engine, manifold: null }), fetchRef, capabilities: { manifold: false } });
  const lp = (body) => lite.handle(new Request('https://cad.mino.mobi/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const l = await (await lp({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
  check(l.result.tools.some((t) => t.name === 'interference' && /clearance/.test(t.description)) && !l.result.tools.find((t) => t.name === 'build').inputSchema.properties.kernel, `without Manifold the tool list keeps interference (clearance mode, no kernel) and drops the kernel choice (${l.result.tools.map((t) => t.name).join(', ')})`);
  const bl = await (await lp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'build', arguments: { tree: 'bench:plate', faces: false } } })).json();
  check(bl.result.structuredContent.ok && bl.result.structuredContent.kernel === 'truck', 'build still works with the exact kernel alone');
  const li = await (await lp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'interference', arguments: { assembly: 'bench:lift', sweep: 4, clearance: 0.5, res: 64 } } })).json();
  const lc = li.result?.structuredContent;
  check(lc?.method === 'mesh' && lc.sweep === 4 && lc.pairs.length >= 9 && lc.pairs.some((p) => p.verdict === 'fit'), `interference on the kernel-less host answers in clearance mode from the exact meshes (${lc?.pairs.length} pairs, ${lc?.ms.toFixed(0)} ms)`);
  const d = await (await lite.handle(new Request('https://cad.mino.mobi/mcp'))).json();
  check(d.capabilities.manifold === false && d.tools.length === TOOLS.length, 'the descriptor states the capability and lists every tool');
}

console.log(fails ? `\n✗ ${fails} failing` : '\n✓ mcp selftest passed');
process.exit(fails ? 1 : 0);
