#!/usr/bin/env node
// mcp.selftest — the tool surface under node, kernels injected, a fake repo
// behind the file tools. Exit 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { createMcp, TOOLS } from './mcp.js';
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
check(list.result.tools.map((t) => t.name).join() === 'check,build,measure,interference,drawing,step,list_files,get_file', `tools/list: ${list.result.tools.map((t) => t.name).join(', ')}`);
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
const asm = (await tool('build', { tree: 'bench:train', faces: false })).structuredContent;
check(asm.kind === 'assembly' && asm.components.length === 4 && Object.keys(asm.parts).length === 3 && asm.complete && asm.remaining.length === 0, `build on an assembly: ${asm.components.length} components over ${Object.keys(asm.parts).length} parts, complete`);
{
  const sliced = createMcp({ kernels, fetchRef, capabilities: { maxParts: 2 } });
  const s1 = (await sliced.call('build', { tree: 'bench:train', faces: false }));
  check(Object.keys(s1.parts).length === 2 && s1.remaining.length === 1 && !s1.complete && s1.partKeys.length === 3, `a server with maxParts 2 builds two and names the one remaining (${s1.remaining.join(', ')})`);
  const s2 = await sliced.call('build', { tree: 'bench:train', faces: false, parts: s1.remaining });
  check(Object.keys(s2.parts).length === 1 && s2.remaining.length === 0 && s2.parts[s1.remaining[0]].ok !== undefined, 'the next call builds the remaining part by key');
  const s3 = await sliced.call('build', { tree: 'bench:train', faces: false, parts: ['nope'] });
  check(s3.unknown?.[0] === 'nope' && Object.keys(s3.parts).length === 0, 'an unknown part key is reported, not built');
}
const m1 = (await tool('measure', { tree: 'bench:plate', a: 'plate.pivot[0][0]' })).structuredContent;
check(m1.face.kind === 'cylinder' && Math.abs(m1.face.diameter - 0.32) < 1e-6, `measure one face: pivot ⌀ ${m1.face.diameter}`);
const m2 = (await tool('measure', { tree: 'bench:plate', a: 'plate.start', b: 'plate.end' })).structuredContent;
check(m2.kind === 'plane-plane' && m2.parallel && Math.abs(m2.distance - 1.5) < 1e-9, `measure two faces: plate.start→plate.end ${m2.distance}`);
const nf = await tool('measure', { tree: 'bench:plate', a: 'nothing' });
check(nf.isError && /no face named nothing/.test(nf.content[0].text), 'measure names the faces it does know when one is missing');
const cl = (await tool('interference', { assembly: 'bench:lift', sweep: 6, clearance: 0.5 })).structuredContent;
check(cl.method === 'mesh' && cl.refined && cl.pairs.length >= 9 && cl.pairs.every((p) => ['clear', 'expected', 'fit'].includes(p.verdict)) && cl.pairs.some((p) => p.verdict === 'fit' && [p.a, p.b].includes('nut')) && cl.ok === true, `clearance mode: nearest approach of ${cl.pairs.length} pairs through the cycle, the nut's 0.1 mm to the screw read as its declared fit under a 0.5 demand (ok ${cl.ok})`);
const ms = (await tool('measure', { tree: 'bench:lift', a: 'nut.end', b: 'platform.start', t: 0.5 })).structuredContent;
check(ms.kind === 'plane-plane' && Math.abs(ms.distance) < 1e-9 && ms.t === 0.5, `measure across an assembly: the nut's top and the platform's underside are coplanar at t = 0.5 (${ms.kind}, ${ms.distance})`);
const sw = (await tool('interference', { assembly: 'bench:lift', sweep: 6 })).structuredContent;
check(sw.ok && sw.sweep === 6 && Math.abs(sw.period - 1) < 1e-9 && sw.pairs.every((p) => p.expected), `interference sweeps ${sw.sweep} instants over ${sw.period} s of the lift (references resolved on the host) and finds only expected touches`);
const i = (await tool('interference', { assembly: 'bench:clock', t: 0.5 })).structuredContent;
check(i.ok && i.tested > 20 && i.pairs.every((p) => p.expected), `interference: the clock mid-beat, ${i.tested} pairs tested, ${i.pairs.length} expected touches, none real`);
const dw = await tool('drawing', { tree: 'bench:plate' });
const dws = dw.structuredContent;
check(dws.ok && dws.holes.length === 9 && dws.views.length === 3 && dw.content[1]?.resource?.mimeType === 'image/svg+xml' && dw.content[1].resource.text.startsWith('<svg') && !dw.content[0].text.includes('<svg'), `drawing: the plate's three views as an SVG resource (${(dws.svg.length / 1024).toFixed(0)} kB) with ${dws.holes.length} holes called out; the numbers travel without it`);
const dwa = (await tool('drawing', { tree: 'bench:lift', t: 0.5, views: ['front', 'iso'], hidden: false })).structuredContent;
check(dwa.kind === 'assembly' && dwa.views.map((v) => v.name).join() === 'front,iso' && dwa.views.every((v) => v.hidden === 0) && dwa.svg.includes('t = 0.5 s'), 'drawing an assembly posed at t, chosen views, no hidden lines');
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
  const li = await (await lp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'interference', arguments: { assembly: 'bench:lift', sweep: 4, clearance: 0.5 } } })).json();
  const lc = li.result?.structuredContent;
  check(lc?.method === 'mesh' && lc.sweep === 4 && lc.pairs.length >= 9 && lc.pairs.some((p) => p.verdict === 'fit'), `interference on the kernel-less host answers in clearance mode from the exact meshes (${lc?.pairs.length} pairs, ${lc?.ms.toFixed(0)} ms)`);
  const d = await (await lite.handle(new Request('https://cad.mino.mobi/mcp'))).json();
  check(d.capabilities.manifold === false && d.tools.length === TOOLS.length, 'the descriptor states the capability and lists every tool');
}

console.log(fails ? `\n✗ ${fails} failing` : '\n✓ mcp selftest passed');
process.exit(fails ? 1 : 0);
