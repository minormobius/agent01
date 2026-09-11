#!/usr/bin/env node
// drive.selftest — the file tree over records, headless. Two in-memory repos
// stand in for a local drive and a PDS; a fake XRPC fetch stands in for a
// stranger's public repo. Exit 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { Drive, MemoryBackend, PublicBackend, parseAtUri, normalizePath, canonical, REVISION, PART, SCOPE } from './lib/drive.js';

const here = path.dirname(new URL(import.meta.url).pathname);
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };
const bench = (n) => JSON.parse(fs.readFileSync(path.join(here, 'bench', n + '.json'), 'utf8'));

// addresses
check(JSON.stringify(parseAtUri('at://did:plc:abc/com.minomobi.cad.part/3k2j')) === JSON.stringify({ did: 'did:plc:abc', collection: 'com.minomobi.cad.part', rkey: '3k2j' }), 'parses an AT URI');
check(normalizePath(' /clock//train/escape ') === 'clock/train/escape', 'normalises a path');
check((() => { try { normalizePath('a/../b'); return false; } catch { return true; } })(), 'rejects ..');
check(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }) === '{"a":[2,{"c":2,"d":1}],"b":1}', 'canonical JSON sorts keys');
check(SCOPE === 'atproto repo:com.minomobi.cad.part repo:com.minomobi.cad.revision', `the narrow scope a site asks for: ${SCOPE}`);

// a local drive, persisted through a hook
let persisted = null;
const local = new Drive(new MemoryBackend('did:local', { persist: async (r) => { persisted = r; } }));
const gear = bench('gear');
const f1 = await local.put('clock/train/gear', gear, { message: 'first cut' });
check(f1.path === 'clock/train/gear' && f1.name === 'gear' && f1.kind === 'part' && f1.head.uri.includes(`/${REVISION}/`) && f1.uri.includes(`/${PART}/`), `put creates a head and a revision: ${f1.uri}`);
check(f1.revision.parents.length === 0 && f1.revision.message === 'first cut', 'the first revision has no parents');
check(persisted && Object.keys(persisted).length === 2, 'writes persist through the hook (2 records)');
const edited = structuredClone(gear); edited.params.z = 72;
const f2 = await local.put('clock/train/gear', edited, { message: 'z 60 → 72' });
check(f2.uri === f1.uri && f2.head.uri !== f1.head.uri && f2.revision.parents[0].uri === f1.head.uri && f2.revision.parents[0].cid === f1.head.cid, 'a second put keeps the URI, moves the head, and links the parent by strongRef');
await local.put('clock/train/arbor', bench('arbor'));
await local.put('clock/clock', bench('clock'));
const ls = await local.list();
check(ls.map((e) => e.path).join(' ') === 'clock/clock clock/train/arbor clock/train/gear', `list sorts by path: ${ls.map((e) => e.path).join(' ')}`);
check(ls.find((e) => e.path === 'clock/clock').kind === 'assembly', 'an assembly tree is filed as kind assembly');
const t = await local.tree();
check(Object.keys(t.dirs).join() === 'clock' && t.dirs.clock.files.length === 1 && t.dirs.clock.dirs.train.files.length === 2, 'tree() nests directories from the paths');
check((await local.list('clock/train')).length === 2, 'list(prefix) narrows to a directory');
const got = await local.get('clock/train/gear');
check(got.revision.tree.params.z === 72 && got.revision.uri === f2.head.uri, 'get returns the head revision with the tree inline');
const byUri = await local.get(f1.uri);
check(byUri && byUri.path === 'clock/train/gear', 'get accepts the AT URI too');
const h = await local.history('clock/train/gear');
check(h.length === 2 && h[0].message === 'z 60 → 72' && h[1].message === 'first cut' && h[1].tree.params.z === 60, `history walks the parents newest-first (${h.map((r) => r.message).join(' ← ')})`);
const rn = await local.rename('clock/train/gear', 'clock/train/centre-wheel');
check(rn.uri === f1.uri && rn.path === 'clock/train/centre-wheel' && !(await local.find('clock/train/gear')), 'rename keeps the URI and frees the old path');
const fk = await local.fork('clock/train/centre-wheel', 'scratch/wheel-copy');
check(fk.uri !== f1.uri && fk.revision.parents[0].uri === f2.head.uri && fk.revision.forkedFrom === f1.uri, 'fork makes a new file whose first revision has the source revision as parent');
check((await local.history('scratch/wheel-copy')).length === 3, 'history of a fork continues into the source');

// a stranger's public repo, read over (fake) XRPC — no sign-in
const stranger = new MemoryBackend('did:plc:stranger');
// a real PDS mints IPLD cids; the memory backend mints local: ones, so a stand-in PDS relabels them
const ipld = (b) => { const put = b.putRecord.bind(b); b.putRecord = async (c, r, v) => { const x = await put(c, r, v); x.cid = 'bafyfake' + x.cid.slice(6); b.records.get(b.key(c, r)).cid = x.cid; return x; }; return b; };
ipld(stranger);
await new Drive(stranger).put('lib/m5-bolt', bench('arbor'), { message: 'a bolt' });
let calls = 0;
const fakeFetch = async (u) => {
  calls++; u = new URL(u); const q = Object.fromEntries(u.searchParams);
  const method = u.pathname.split('/xrpc/')[1];
  if (u.origin !== 'https://pds.example') return new Response('nope', { status: 404 });
  if (method === 'com.atproto.repo.getRecord') { const r = await stranger.getRecord(q.collection, q.rkey); return r ? Response.json(r) : new Response('', { status: 404 }); }
  if (method === 'com.atproto.repo.listRecords') return Response.json(await stranger.listRecords(q.collection, Number(q.limit) || 50, q.cursor));
  return new Response('', { status: 404 });
};
const pub = new Drive(new PublicBackend('did:plc:stranger', 'https://pds.example', { fetch: fakeFetch }));
const theirs = await pub.list();
check(theirs.length === 1 && theirs[0].path === 'lib/m5-bolt' && calls > 0, `a public repo lists over XRPC (${calls} calls)`);
check((await pub.get('lib/m5-bolt')).revision.message === 'a bolt', 'and reads a file with its revision');
check(await pub.put('x', {}).then(() => false, (e) => /read-only/.test(e.message)), 'a public repo refuses writes');

// fork across repos: the local drive resolves the stranger's did to the fake PDS
const local2 = new Drive(new MemoryBackend('did:local'), { pdsOf: async (did) => (did === 'did:plc:stranger' ? 'https://pds.example' : null), fetch: fakeFetch });
const bolt = await local2.fork(theirs[0].uri, 'vendor/m5-bolt');
check(bolt.revision.parents[0].uri === theirs[0].head.uri, 'fork by AT URI pulls a file from another repo and keeps the lineage');
const bh = await local2.history('vendor/m5-bolt');
check(bh.length === 2 && bh[1].did === 'did:plc:stranger', 'history crosses the repo boundary');

// push local → "pds": local cids are rewritten to the target's, lineage preserved, foreign parents referenced
const pdsBackend = ipld(new MemoryBackend('did:plc:me')); pdsBackend.kind = 'pds';
const mine = new Drive(pdsBackend, { pdsOf: async () => 'https://pds.example', fetch: fakeFetch });
await local2.put('vendor/m5-bolt', { ...bolt.revision.tree, name: 'bolt-longer' }, { message: 'lengthen' });
const pushed = await local2.push('vendor/m5-bolt', mine);
check(pushed.revisions === 2 && pushed.uri.startsWith('at://did:plc:me/'), `push recreated ${pushed.revisions} revisions on the target`);
const ph = await mine.history('vendor/m5-bolt');
check(ph.length === 3 && ph[0].did === 'did:plc:me' && ph[1].did === 'did:plc:me' && ph[2].did === 'did:plc:stranger', 'the pushed history is two of mine on top of the stranger\'s original');
check(ph.slice(0, 2).every((r) => r.parents.every((p) => !p.cid.startsWith('local:'))), 'no local: cid survives a push');
const again = await local2.push('vendor/m5-bolt', mine);
check(again.uri === pushed.uri, 'pushing again updates the same head');

// ATProto records have no floats: a stored revision carries them as strings and the drive hands back numbers
{
  const cam = bench('cam'); // m: 0.5 in the gear bench; the cam has r 10 — use a float on purpose
  cam.params.r = 10.25;
  const f = await local.put('scratch/cam', cam, { message: 'float', invariants: { volume: 1984.984, euler: 0, watertight: true } });
  const raw = await local.fetchRecord(f.head.uri);
  const walk = (v) => typeof v === 'number' ? (Number.isInteger(v) ? [] : [v]) : Array.isArray(v) ? v.flatMap(walk) : v && typeof v === 'object' ? Object.values(v).flatMap(walk) : [];
  check(walk(raw.value).length === 0 && raw.value.tree.params.r === '10.25' && raw.value.invariants.volume === '1984.984', 'a stored revision holds no float: non-integers are written as strings');
  const back = await local.get('scratch/cam');
  check(back.revision.tree.params.r === 10.25 && back.revision.invariants.volume === 1984.984 && (await local.history('scratch/cam'))[0].tree.params.r === 10.25, 'get and history hand the numbers back');
  check((await local.treeAt(f.head.uri)).params.r === 10.25, 'treeAt(revision uri) decodes too');
  check(canonical(back.revision.tree) === canonical(cam), 'the round trip is exact (canonical JSON equal)');
}

const rm = await local.remove('scratch/wheel-copy');
check(rm.path === 'scratch/wheel-copy' && !(await local.find('scratch/wheel-copy')) && (await local.fetchRecord(rm.head.uri)), 'remove drops the head and keeps the revision');

// the site worker's /xrpc/ gateway: handle → did → PDS, forwarded, CAD collections only
{
  const { xrpc } = await import('./worker.js');
  const wf = async (u, init) => {
    u = new URL(u);
    if (u.host === 'public.api.bsky.app') return Response.json({ did: 'did:plc:stranger' });
    if (u.host === 'plc.directory') return Response.json({ service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example' }] });
    return fakeFetch(u, init);
  };
  const g = (qs) => xrpc(new URL(`https://cad.mino.mobi/xrpc/${qs}`), wf);
  const ls = await (await g('com.atproto.repo.listRecords?repo=stranger.example&collection=com.minomobi.cad.part')).json();
  check(ls.records?.length === 1 && ls.records[0].uri === theirs[0].uri, 'the gateway resolves a handle and lists a repo from its PDS');
  const one = await g(`com.atproto.repo.getRecord?repo=did:plc:stranger&collection=com.minomobi.cad.part&rkey=${theirs[0].rkey}`);
  check(one.status === 200 && one.headers.get('access-control-allow-origin') === '*' && (await one.json()).value.path === 'lib/m5-bolt', 'and fetches one record by DID, CORS open');
  check((await g('com.atproto.repo.getRecord?repo=did:plc:stranger&collection=app.bsky.feed.post&rkey=x')).status === 400, 'it refuses collections outside com.minomobi.cad.*');
  check((await g('com.atproto.repo.createRecord?repo=did:plc:stranger&collection=com.minomobi.cad.part')).status === 404, 'and any method but the two public reads');
  // the browser drive points its public backend at the gateway
  const viaGateway = new Drive(new PublicBackend('did:plc:stranger', 'https://cad.mino.mobi', { fetch: (u) => g(String(u).split('/xrpc/')[1]) }));
  check((await viaGateway.get('lib/m5-bolt'))?.revision.message === 'a bolt', 'a PublicBackend aimed at the gateway reads the same file');
}

console.log(fails ? `\n✗ ${fails} failing` : '\n✓ drive selftest passed');
process.exit(fails ? 1 : 0);
