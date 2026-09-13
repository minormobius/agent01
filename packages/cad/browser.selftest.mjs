// browser.selftest.mjs — the page, in a real browser. Serves this directory,
// opens it in headless Chromium (Playwright's bundled build), waits for the
// engine and Manifold to come up inside the module Worker, builds every bench
// part, and checks the report against the same closed forms the ABI selftest
// uses. Screenshots land in /tmp/cad-shots/ for a human to look at.
//
//   node packages/cad/browser.selftest.mjs [--headed] [--shots DIR]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = path.dirname(new URL(import.meta.url).pathname);
const require = createRequire(path.join(here, 'bakeoff', 'package.json'));
// Without Playwright (`npm ci` in packages/cad/bakeoff) or its Chromium this
// says so and exits 0: the preflight sweep runs every changed dir's selftests
// on a bare runner, and a crash there would read as a failing page.
let chromium;
try { ({ chromium } = require('playwright-core')); } catch { console.log('↷ browser selftest skipped — playwright-core is not installed (npm ci in packages/cad/bakeoff)'); process.exit(0); }
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell', process.env.CHROME_PATH].filter(Boolean).find((p) => fs.existsSync(p));
if (!exe) { console.log('↷ browser selftest skipped — no Chromium at /opt/pw-browsers (set CHROME_PATH)'); process.exit(0); }
const args = process.argv.slice(2);
const shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : '/tmp/cad-shots';
fs.mkdirSync(shots, { recursive: true });

// Serve under the production `_headers`, so the policies are part of what
// this test proves (a Worker, wasm, blob: snapshots — all easy to block).
// Cloudflare semantics: every matching rule applies, later rules override.
const rules = [];
for (const block of fs.readFileSync(path.join(here, '_headers'), 'utf8').split(/\n(?=\S)/)) {
  const lines = block.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (!lines.length || lines[0].startsWith(' ')) continue;
  const pattern = lines[0].trim();
  const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  const headers = {};
  for (const l of lines.slice(1)) {
    const t = l.trim();
    if (t.startsWith('!')) { headers[t.slice(1).trim().toLowerCase()] = null; continue; } // detach an inherited header
    const m = t.match(/^([^:]+):\s*(.*)$/); if (m) headers[m[1].toLowerCase()] = m[2];
  }
  rules.push({ re, headers });
}
const headersFor = (urlPath) => { const out = {}; for (const r of rules) if (r.re.test(urlPath)) for (const [k, v] of Object.entries(r.headers)) { if (v === null) delete out[k]; else out[k] = v; } return out; };
const csp = headersFor('/')['content-security-policy'];
// A stranger's public repo, answered by this server at /xrpc/ the way the site
// worker's gateway answers on the live host (gateway.js; drive.selftest covers
// the gateway itself). One file: the cam, filed at lib/cam.
const { Drive, MemoryBackend } = await import('./lib/drive.js');
const stranger = new MemoryBackend('did:plc:stranger');
{ const put = stranger.putRecord.bind(stranger); stranger.putRecord = async (c, r, v) => { const x = await put(c, r, v); x.cid = 'bafyfake' + x.cid.slice(6); stranger.records.get(stranger.key(c, r)).cid = x.cid; return x; }; }
const strangerFile = await new Drive(stranger).put('lib/cam', JSON.parse(fs.readFileSync(path.join(here, 'bench', 'cam.json'), 'utf8')), { message: 'a cam, shared' });
// …and an assembly that references that part by its AT URI, the way agent/publish.mjs writes them
const strangerAsm = await new Drive(stranger).put('lib/two-cams', { name: 'two-cams', parts: { cam: strangerFile.uri }, components: [{ id: 'a', part: 'cam' }, { id: 'b', part: 'cam', at: [30, 0, 0], params: { lift: 6 } }], mates: [], drive: { component: 'a', rpm: 6 } }, { message: 'two cams by at:// ref' });
async function xrpcMock(req, res) {
  const u = new URL(req.url, 'http://x'); const q = Object.fromEntries(u.searchParams); const method = u.pathname.slice(6);
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(body)); };
  if (!['did:plc:stranger', 'stranger.example'].includes(q.repo)) return send(400, { error: 'InvalidRequest', message: 'unknown repo' });
  if (method === 'com.atproto.repo.getRecord') { const r = await stranger.getRecord(q.collection, q.rkey); return r ? send(200, r) : send(404, { error: 'RecordNotFound' }); }
  if (method === 'com.atproto.repo.listRecords') return send(200, await stranger.listRecords(q.collection, Number(q.limit) || 50, q.cursor));
  send(404, { error: 'MethodNotSupported' });
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath.startsWith('/xrpc/')) return xrpcMock(req, res);
  const OCCT = path.join(here, 'bakeoff', 'node_modules', 'opencascade.js', 'dist');
  const p = urlPath.startsWith('/occt/') ? path.join(OCCT, urlPath.slice(6)) : path.join(here, urlPath.replace(/\/$/, '/index.html'));
  if (!(p.startsWith(here)) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  const extra = headersFor(urlPath); delete extra['cache-control'];
  res.writeHead(200, { ...extra, 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// auth.mino.mobi is not reachable from here; answer it as "signed out" so the page takes the local-drive path without a network error in the console
// (the worker answers 401 when nobody is signed in — Chromium logs that as a console error, so it is not counted)
const authNoise = (m) => /^https:\/\/auth\.mino\.mobi\//.test(m.location()?.url || '');
const quietAuth = (p) => p.route('https://auth.mino.mobi/**', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthenticated"}' }));
const browser = await chromium.launch({ headless: !args.includes('--headed'), executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--proxy-server=direct://', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'] });
let fails = 0;
const check = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fails++; };
const near = (a, b, rel) => Math.abs(a - b) <= rel * Math.abs(b);

// Pass 1 — under the production CSP, with no script injection at all
// (Playwright's evaluate uses string evaluation, which the policy forbids):
// load the page and watch the console for the app's own ready and exact lines.
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage(); await quietAuth(p);
  const seen = []; const errs = [];
  p.on('console', (m) => { seen.push(m.text()); if (m.type() === 'error' && !authNoise(m)) errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${base}/?part=plate`, { waitUntil: 'load' });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline && !seen.some((t) => t.startsWith('cad: exact plate'))) await new Promise((r) => setTimeout(r, 250));
  check(seen.some((t) => t.startsWith('cad: ready')), `under the production CSP the worker comes up: ${seen.find((t) => t.startsWith('cad: ready')) || '(no ready line)'}`);
  check(seen.some((t) => t.startsWith('cad: exact plate')), `under the production CSP the exact build lands: ${seen.find((t) => t.startsWith('cad: exact')) || '(no exact line)'}`);
  check(errs.length === 0, errs.length ? `no CSP or page errors — got:\n  ${errs.join('\n  ')}` : 'no CSP or page errors');
  await ctx.close();
}

// Pass 2 — the functional test, with the policy bypassed so evaluate works.
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, bypassCSP: true }); await quietAuth(page);
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !authNoise(m)) errors.push(`console: ${m.text()}`); });

await page.goto(`${base}/?part=plate`, { waitUntil: 'load' });
try { await page.waitForFunction(() => !!window.__cad, null, { timeout: 30000 }); }
catch { console.log(`✗ app did not boot.\n  ${errors.join('\n  ') || '(no page errors captured)'}`); await browser.close(); server.close(); process.exit(1); }
const boot = await Promise.race([
  page.evaluate(async () => { await window.__cad.ready; return await window.__cad.settled(); }),
  new Promise((r) => setTimeout(() => r({ timeout: true }), 90000)),
]);
if (boot.timeout) { console.log(`✗ the worker never reported ready (90 s).\n  ${errors.join('\n  ') || '(no page errors captured)'}`); await browser.close(); server.close(); process.exit(1); }
check(!boot.error && boot.preview && boot.exact, `page boots and builds the plate (preview ${boot.preview?.tris} tris, exact ${boot.exact?.tris} tris, ${boot.faces} faces)`);
const plate = JSON.parse(fs.readFileSync(path.join(here, 'bench', 'plate.json'), 'utf8')).params;
const vol = Math.PI * plate.R ** 2 * plate.t - Math.PI * plate.r_centre ** 2 * plate.t - plate.n_pivots * Math.PI * plate.r_pivot ** 2 * plate.t - plate.n_pillars * Math.PI * plate.r_pillar ** 2 * plate.t;
check(near(boot.exact.volume, vol, 0.002), `exact plate volume ${boot.exact.volume.toFixed(3)} vs closed form ${vol.toFixed(3)}`);
check(near(boot.preview.volume, vol, 0.005), `preview plate volume ${boot.preview.volume.toFixed(3)} within 0.5%`);
check(boot.exact.euler === -16 && boot.exact.watertight, `exact plate χ=${boot.exact.euler}, watertight ${boot.exact.watertight}`);
await page.evaluate(() => window.__cad.render());
await page.screenshot({ path: path.join(shots, 'plate.png') });

// pick a face by pointing at the middle of the canvas (the plate's top face)
const picked = await page.evaluate(() => { const c = document.querySelector('#view'); const r = c.getBoundingClientRect(); const p = window.__cad.renderer.pick(r.width / 2, r.height / 2, window.__cad.cam); return { id: p ? p.fid : -1, names: p ? window.__cad.state.slots.get('main').faces[p.fid]?.names || [] : [] }; });
check(picked.id >= 0 && picked.names.some((n) => /plate\.(end|start|side)/.test(n)), `picking the centre of the view returns a named face: ${picked.names.slice(0, 3).join(', ') || picked.id}`);

// measure: the exact geometry behind picked faces — a bore's diameter, plane to plane, axis to axis
{
  const m = await page.evaluate(() => {
    const faces = window.__cad.state.slots.get('main').faces;
    const byName = (n) => { const i = faces.findIndex((f) => f.names.includes(n)); return { name: 'main', fid: i, key: i }; };
    return { pivot: window.__cad.describe(byName('plate.pivot[0][0]')), rim: window.__cad.describe(byName('plate.rim[0]')), faces: window.__cad.measure(byName('plate.start'), byName('plate.end')), axes: window.__cad.measure(byName('plate.rim[0]'), byName('plate.pivot[0][0]')) };
  });
  check(m.pivot.kind === 'cylinder' && Math.abs(m.pivot.diameter - 0.32) < 1e-9, `a pivot hole reads as a cylinder ⌀ ${m.pivot.diameter}`);
  check(m.rim.kind === 'cylinder' && Math.abs(m.rim.diameter - 40) < 1e-9, `the rim reads ⌀ ${m.rim.diameter}`);
  check(m.faces.kind === 'plane-plane' && m.faces.parallel && Math.abs(m.faces.distance - 1.5) < 1e-9, `plate.start to plate.end is ${m.faces.distance} (plane to plane, parallel)`);
  check(m.axes.kind === 'cylinder-cylinder' && m.axes.parallel && Math.abs(m.axes.distance - 12) < 1e-9, `rim axis to pivot axis is ${m.axes.distance} (the pattern radius)`);
  // the measure panel: the same faces picked from two lists, no hovering needed
  const mp = await page.evaluate(() => {
    const pick = (id, v) => { const s = document.querySelector('#' + id); s.value = v; s.dispatchEvent(new Event('change')); };
    const n = document.querySelectorAll('#ma option').length;
    pick('ma', 'plate.pivot[0][0]'); const one = document.querySelector('#measurebox').textContent;
    pick('mb', 'plate.rim[0]'); const two = document.querySelector('#measurebox .measure')?.textContent || '';
    return { n, one, two, kept: document.querySelector('#ma').value };
  });
  check(mp.n > 10 && /⌀ 0\.32/.test(mp.one) && /12(\.0+)?\b/.test(mp.two) && mp.kept === 'plate.pivot[0][0]', `the measure panel lists ${mp.n - 1} faces; one pick reads its geometry, two read the distance (${mp.two.trim()})`);
}

// the report is on screen
const reportText = await page.textContent('#report');
check(/volume/.test(reportText) && /watertight/.test(reportText), 'report table renders');

// every other bench part builds (preview at least), with the expected honesty on exact
const expect = { gear: { exact: false }, arbor: { exact: true, euler: 2 }, escape: { exact: false, euler: 0 }, case: { exact: true, euler: 2 }, 'case-fillet': { exact: false, approx: true }, cam: { exact: true, euler: 0 } };
for (const [name, ex] of Object.entries(expect)) {
  const r = await page.evaluate(async (n) => { await window.__cad.load(n); return await window.__cad.settled(); }, name);
  if (ex.approx) { check(r.preview && r.preview.watertight && r.exactError && r.exactError.unsupported, `${name}: preview shows the tree without its fillet; exact says it needs OCCT (${r.exactError?.msg})`); continue; }
  check(r.preview && r.preview.watertight, `${name}: preview builds, watertight, χ=${r.preview?.euler}${ex.euler !== undefined ? ` (expected ${ex.euler})` : ''}`);
  if (ex.euler !== undefined) check(r.preview.euler === ex.euler, `${name}: preview χ = ${ex.euler}`);
  if (ex.exact) check(r.exact && r.exact.watertight && r.faces > 0, `${name}: exact lands with ${r.faces} named faces`);
  else check(!r.exact || !r.exact.watertight || r.exactError, `${name}: exact is absent or flagged (Truck cannot do this boolean) — ${r.exactError ? r.exactError.msg : 'not watertight'}`);
  await page.evaluate(() => window.__cad.render());
  await page.screenshot({ path: path.join(shots, `${name}.png`) });
}

// the cam is a closed spline through twelve points: the last part loaded above, so export it as STEP and STL
{
  const step = await page.evaluate(async () => { window.__lastExport = null; window.__cad.exportPart('step'); for (let i = 0; i < 400 && !window.__lastExport; i++) await new Promise((r) => setTimeout(r, 25)); return window.__lastExport; });
  check(step && step.format === 'step' && step.bytes > 10000 && step.kernel === 'truck', `the step button writes the cam as STEP from the kernel that built it (${step ? `${(step.bytes / 1e3).toFixed(0)} kB by ${step.kernel}` : 'no export'})`);
  const stl = await page.evaluate(async () => { window.__lastExport = null; window.__cad.exportPart('stl'); for (let i = 0; i < 400 && !window.__lastExport; i++) await new Promise((r) => setTimeout(r, 25)); return window.__lastExport; });
  check(stl && stl.format === 'stl' && stl.bytes > 84, `the stl button writes the cam mesh (${stl ? `${(stl.bytes / 1e3).toFixed(0)} kB` : 'no export'})`);
}

// a param edit rebuilds: thicken the case wall and the volume grows
await page.evaluate(async () => { await window.__cad.load('case'); await window.__cad.settled(); });
const before = await page.evaluate(() => window.__cad.state.slots.get('main').exact.invariants.volume);
await page.evaluate(() => { const row = [...document.querySelectorAll('#params .param')].find((r) => r.querySelector('span').textContent === 'wall'); const i = row.querySelector('input'); i.value = '3'; i.dispatchEvent(new Event('input')); });
const after = await page.evaluate(async () => { await window.__cad.settled(); return window.__cad.state.slots.get('main').exact.invariants.volume; });
check(after > before, `editing wall 1 → 3 rebuilds and adds volume (${before.toFixed(1)} → ${after.toFixed(1)})`);

// files: the local drive, history, a stranger's repo through the gateway, a fork with lineage
{
  const untilSaved = `for (let i = 0; i < 200; i++) { const t = document.querySelector('#drivestatus').textContent; if (/^saved/.test(t)) break; if (document.querySelector('#drivestatus').className === 'bad') throw new Error(t); await new Promise((r) => setTimeout(r, 25)); }`;
  const saved = await page.evaluate(new Function(`return (async () => { document.querySelector('#path').value = 'clock/case'; document.querySelector('#message').value = 'thicker wall'; document.querySelector('#drivestatus').textContent = ''; document.querySelector('#save').click(); ${untilSaved} const ls = await window.__cad.drives.local.list(); return { at: window.__cad.state.at, paths: ls.map((e) => e.path), search: location.search, kind: ls[0].kind, status: document.querySelector('#drivestatus').textContent }; })()`));
  check(saved.paths.join() === 'clock/case' && saved.at.startsWith('at://did:local/com.minomobi.cad.part/') && saved.search === `?at=${encodeURIComponent(saved.at)}`, `save files the case in the local drive and the URL becomes its AT URI (${saved.at})`);
  const h = await page.evaluate(new Function(`return (async () => { document.querySelector('#message').value = 'again'; document.querySelector('#drivestatus').textContent = ''; document.querySelector('#save').click(); ${untilSaved} const h = await window.__cad.drives.local.history(window.__cad.state.file.entry.uri); return { msgs: h.map((r) => r.message), rows: document.querySelectorAll('#history .r').length, inv: h[0].invariants?.volume, kernel: h[0].kernel?.id, parents: h[0].parents.length }; })()`));
  check(h.msgs.join(' ← ') === 'again ← thicker wall' && h.rows === 2 && h.parents === 1, `a second save adds a revision with the first as parent; the history pane lists both (${h.msgs.join(' ← ')})`);
  check(h.kernel === 'truck' && Math.abs(h.inv - 4225.2) < 1, `the revision records the kernel and the invariants (${h.kernel}, ${h.inv?.toFixed(1)} mm³)`);
  await page.goto(`${base}/?part=plate`, { waitUntil: 'load' });
  const kept = await page.evaluate(async () => { await window.__cad.ready; return (await window.__cad.drives.local.list()).map((e) => e.path); });
  check(kept.join() === 'clock/case', 'the local drive survives a reload (IndexedDB)');
  await page.goto(`${base}/?at=${encodeURIComponent(strangerFile.uri)}`, { waitUntil: 'load' });
  const opened = await page.evaluate(async () => { await window.__cad.ready; const r = await window.__cad.settled(); return { at: window.__cad.state.at, name: window.__cad.state.name, vol: r.exact?.volume, groups: [...document.querySelectorAll('#files h3')].map((h) => h.textContent), on: document.querySelector('#files .f.on')?.textContent, hist: document.querySelectorAll('#history .r').length }; });
  check(opened.at === strangerFile.uri && opened.name === 'cam' && Math.abs(opened.vol - 1984.984) < 0.01, `?at= opens a stranger's file through the gateway and builds it (${opened.name}, ${opened.vol?.toFixed(3)} mm³)`);
  check(opened.groups.some((g) => g.startsWith('at://did:plc:stranger')) && /cam/.test(opened.on || '') && opened.hist === 1, `the files pane shows their repo with the open file lit (${opened.groups.join(', ')})`);
  await page.goto(`${base}/?at=${encodeURIComponent(strangerFile.head.uri)}`, { waitUntil: 'load' });
  const pinned = await page.evaluate(async () => { await window.__cad.ready; const r = await window.__cad.settled(); return { at: window.__cad.state.at, vol: r.exact?.volume, file: !!window.__cad.state.file }; });
  check(pinned.at === strangerFile.head.uri && Math.abs(pinned.vol - 1984.984) < 0.01 && !pinned.file, `?at= with a REVISION uri (what a parts post points at) opens the pinned tree as a document (${pinned.vol?.toFixed(3)} mm³)`);
  await page.goto(`${base}/?at=${encodeURIComponent(strangerFile.uri)}`, { waitUntil: 'load' });
  await page.evaluate(async () => { await window.__cad.ready; await window.__cad.settled(); });
  const fk = await page.evaluate(async (uri) => { const r = await window.__cad.drives.local.fork(uri, 'vendor/cam'); const h = await window.__cad.drives.local.history('vendor/cam'); await window.__cad.renderFiles(); for (const d of document.querySelectorAll('#files .f.dir')) window.__cad.state.folds.add(d.dataset.fold); await window.__cad.renderFiles(); return { path: r.path, dids: h.map((x) => x.did), parent: h[0].parents[0]?.uri, rows: document.querySelectorAll('#files .f[data-drive=local]').length }; }, strangerFile.uri);
  check(fk.path === 'vendor/cam' && fk.dids.join(' ') === 'did:local did:plc:stranger' && fk.parent === strangerFile.head.uri && fk.rows === 2, `forking it to the local drive keeps the lineage across repos (${fk.dids.join(' ← ')})`);
  await page.route('**/xrpc/app.bsky.actor.searchActorsTypeahead*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ actors: [{ did: 'did:plc:stranger', handle: 'stranger.example' }] }) }));
  await page.fill('#repo', 'stra'); await page.waitForFunction(() => document.querySelectorAll('.ta-list:not([hidden]) li').length === 1, null, { timeout: 5000 });
  const below = await page.evaluate(() => { const i = document.querySelector('#repo'), l = i.parentElement.querySelector('.ta-list'); return l.getBoundingClientRect().top >= i.getBoundingClientRect().bottom - 1; });
  await page.fill('#repo', 'did:plc:x'); await new Promise((r) => setTimeout(r, 300));
  const ta = await page.evaluate(() => ({ h: !!document.querySelector('#handle').dataset.typeahead, r: document.querySelectorAll('.ta-list:not([hidden]) li').length }));
  check(ta.h && ta.r === 0 && below, 'both handle fields suggest accounts through the gateway, in a list under the field; a DID in the browse field gets none');
  const browsed = await page.evaluate(async () => { document.querySelector('#repo').value = 'stranger.example'; document.querySelector('#browse').click(); for (let i = 0; i < 200 && ![...document.querySelectorAll('#files h3')].some((h) => h.textContent.startsWith('at://')); i++) await new Promise((r) => setTimeout(r, 25)); for (const d of document.querySelectorAll('#files .f.dir')) window.__cad.state.folds.add(d.dataset.fold); await window.__cad.renderFiles(); return document.querySelectorAll('#files .f[data-drive=browse]').length; });
  check(browsed === 2, `browsing a repo by handle lists it (the gateway resolves the handle; ${browsed} files)`);
  await page.goto(`${base}/?at=${encodeURIComponent(strangerAsm.uri)}`, { waitUntil: 'load' });
  const asm = await page.evaluate(async () => { await window.__cad.ready; const r = await window.__cad.settled(); return { mode: r.mode, components: r.components, slots: r.slots, timeout: r.timeout }; });
  check(!asm.timeout && asm.mode === 'asm' && asm.components === 2 && asm.slots === 2, `an assembly whose parts are at:// refs resolves them through the gateway and builds (${asm.components} components, ${asm.slots} distinct builds)`);
  await page.goto(`${base}/?part=case`, { waitUntil: 'load' });
  await page.evaluate(async () => { await window.__cad.ready; await window.__cad.settled(); });
}

// the report button: one HTML page about an assembly
{
  await page.goto(`${base}/?part=lift`, { waitUntil: 'load' });
  await page.evaluate(async () => { await window.__cad.ready; await window.__cad.settled(); });
  const rp = await page.evaluate(async () => { window.__lastReport = null; document.querySelector('#asm-report').click(); for (let i = 0; i < 300 && !window.__lastReport; i++) await new Promise((r) => setTimeout(r, 25)); return { r: window.__lastReport, status: document.querySelector('#status')?.textContent || '' }; });
  check(rp.r?.items === 4 && rp.r.sheets === 4 && rp.r.steps === 4 && rp.r.components === 7 && rp.r.bytes > 100000 && /report:/.test(rp.status), `the report button writes the lift's page: ${rp.r?.components} components, ${rp.r?.items} items, ${rp.r?.sheets} sheets, ${rp.r?.steps} steps, ${((rp.r?.bytes || 0) / 1024).toFixed(0)} kB`);
}

// three views snapshot strip
await page.click('#views');
const imgs = await page.$$eval('#strip img', (els) => els.map((i) => i.src.length));
check(imgs.length === 3 && imgs.every((l) => l > 1000), `three-view strip renders (${imgs.map((l) => (l / 1e3).toFixed(0) + 'k').join(', ')})`);

// the drawing button: an SVG of what is built, from the exact meshes
{
  await page.goto(`${base}/?part=plate`, { waitUntil: 'load' });
  await page.evaluate(async () => { await window.__cad.ready; await window.__cad.settled(); });
  const dw = await page.evaluate(async () => { window.__lastDrawing = null; document.querySelector('#drawing').click(); for (let i = 0; i < 200 && !window.__lastDrawing; i++) await new Promise((r) => setTimeout(r, 25)); return { d: window.__lastDrawing, status: document.querySelector('#status')?.textContent || '' }; });
  check(dw.d?.views?.length === 3 && dw.d.holes === 9 && dw.d.scale === '2:1' && dw.d.bytes > 20000 && /drawing:/.test(dw.status), `the drawing button writes an SVG of the plate: ${dw.d?.views?.map((v) => v.name).join(', ')} at ${dw.d?.scale}, ${dw.d?.holes} holes, ${((dw.d?.bytes || 0) / 1024).toFixed(0)} kB`);
}
await page.screenshot({ path: path.join(shots, 'ui.png') });

// the assembly: four components from two parts (one with a params override), a sub-assembly, gear + fixed mates, spin
{
  const r = await page.evaluate(async () => { await window.__cad.load('train'); return await window.__cad.settled(); });
  check(r.mode === 'asm' && r.components === 4 && r.slots === 3, `train: 4 components over 3 distinct part builds (${r.components} / ${r.slots})`);
  const angles = await page.evaluate(() => { window.__cad.solveAngles(10); return Object.fromEntries(window.__cad.state.angles); }); // 10 s at 6 rpm = one turn
  check(Math.abs(angles['wheel1'] + 48) < 1e-9 && Math.abs(angles['stage2/arbor'] + 48) < 1e-9 && Math.abs(angles['stage2/wheel'] - 6.4) < 1e-9, `gear mates propagate: arbor1 one turn → wheel1 ${angles['wheel1']}° → stage2/arbor ${angles['stage2/arbor']}° → stage2/wheel ${angles['stage2/wheel']}°`);
  const spun = await page.evaluate(async () => { window.__cad.toggleSpin(); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const a0 = window.__cad.state.angles.get('arbor1'); await new Promise((r) => setTimeout(r, 1200)); const a1 = window.__cad.state.angles.get('arbor1'); const fps = window.__cad.state.fps; window.__cad.toggleSpin(); return { a0, a1, fps }; });
  check(spun.a1 > spun.a0 && spun.fps > 5, `spin advances the train (${spun.a0.toFixed(1)}° → ${spun.a1.toFixed(1)}° in 1.2 s) at ${spun.fps.toFixed(0)} fps under software GL`);
  const pick = await page.evaluate(() => { window.__cad.render(); const c = document.querySelector('#view'); const r = c.getBoundingClientRect(); for (let y = 0.3; y <= 0.7; y += 0.05) for (let x = 0.3; x <= 0.7; x += 0.05) { const p = window.__cad.renderer.pick(r.width * x, r.height * y, window.__cad.cam); if (p) return p; } return null; });
  check(pick && pick.name, `picking an assembly returns a component: ${pick?.name} face ${pick?.fid}`);
  await page.evaluate(() => window.__cad.render());
  await page.screenshot({ path: path.join(shots, 'train.png') });
}

// the crank–slider: placements as expressions of theta and t — the rod follows the pin, the block slides, and spin sweeps the real motion
{
  const r = await page.evaluate(async () => { await window.__cad.load('crank'); return await window.__cad.settled(); });
  check(r.mode === 'asm' && r.components === 3 && r.slots === 3, `crank: 3 components over 3 distinct part builds (${r.components} / ${r.slots})`);
  const pose = await page.evaluate(() => { const c = window.__cad; const at = (t) => { const a = c.solveAngles(t); const b = c.state.components.find((x) => x.id === 'block'); const rod = c.state.components.find((x) => x.id === 'rod'); return { theta: a.theta, block: c.modelOf(b, a)[12], rod: [c.modelOf(rod, a)[12], c.modelOf(rod, a)[13]] }; }; return { t0: at(0), t1: at(1), t05: at(0.5) }; });
  check(Math.abs(pose.t0.block - 40) < 1e-9 && Math.abs(pose.t1.block - 20) < 1e-9 && Math.abs(pose.t05.theta - 90) < 1e-9 && Math.abs(pose.t05.rod[1] - 10) < 1e-9 && Math.abs(pose.t05.block - Math.sqrt(800)) < 1e-9, `the block is at x = ${pose.t0.block} at t = 0, ${pose.t1.block} at t = 1; at theta = 90° the pin is at y = ${pose.t05.rod[1]} and the block at ${pose.t05.block.toFixed(3)}`);
  const spun = await page.evaluate(async () => { const c = window.__cad; c.toggleSpin(); await new Promise((r) => setTimeout(r, 600)); const b = c.state.components.find((x) => x.id === 'block'); const x = c.modelOf(b, c.state.angles)[12]; const t = c.state.tAcc; c.toggleSpin(); return { x, t, status: document.querySelector('#status').textContent }; });
  const want = 10 * Math.cos(Math.PI * spun.t) + Math.sqrt(900 - 100 * Math.sin(Math.PI * spun.t) ** 2);
  check(Math.abs(spun.x - want) < 1e-6 && !/stopped/.test(spun.status), `spin moved the block to x = ${spun.x.toFixed(3)} at t = ${spun.t.toFixed(3)} s, the closed form's ${want.toFixed(3)}`);
  const chk = await page.evaluate(async () => { window.__cad.runCheck(); const c = await window.__cad.checked(); return { tested: c.tested, real: c.pairs.map((p) => `${p.a}×${p.b}`) }; });
  check(chk.real.length === 0, `no interference in the crank at that pose (${chk.tested} pairs tested)${chk.real.length ? ' — ' + chk.real.join(', ') : ''}`);
  await page.evaluate(() => window.__cad.render());
  await page.screenshot({ path: path.join(shots, 'crank.png') });
}

// the lift: a screw mate, travel through a fixed mate, four bolts by repeat placed on the platform's holes by reference — faces from the worker
{
  const r = await page.evaluate(async () => { await window.__cad.load('lift'); return await window.__cad.settled(); });
  check(r.mode === 'asm' && r.components === 7 && r.slots === 4, `lift: 7 components over 4 distinct part builds (${r.components} / ${r.slots})`);
  // the platform was built early, for the bolts' references, before the components existed — it must still have its mesh on screen
  const drawn = await page.evaluate(() => window.__cad.state.components.map((c) => [c.id, window.__cad.renderer.bodies.get(c.id)?.count || 0]));
  check(drawn.every(([, n]) => n > 0), `every component has a mesh on screen, the early-built platform included (${drawn.map(([id, n]) => `${id}:${n}`).join(' ')})`);
  const pose = await page.evaluate(() => { const c = window.__cad; const z = (id, t) => { const a = c.solveAngles(t); return c.modelOf(c.state.components.find((x) => x.id === id), a)[14]; }; const x = (id, t) => { const a = c.solveAngles(t); return c.modelOf(c.state.components.find((x) => x.id === id), a)[12]; }; return { nut0: z('nut', 0), nut1: z('nut', 0.5), plat1: z('platform', 0.5), bolt1: z('bolt[3]', 0.5), boltx: x('bolt[0]', 0), bolts: c.state.components.filter((x) => x.id.startsWith('bolt[')).length }; });
  check(Math.abs(pose.nut1 - 11) < 1e-9 && Math.abs(pose.plat1 - 15) < 1e-9 && Math.abs(pose.bolt1 - 13) < 1e-9 && Math.abs(pose.boltx - 9) < 1e-9 && pose.bolts === 4, `half a turn lifts the nut to z = ${pose.nut1}, the platform to ${pose.plat1}, and the bolts on its holes to ${pose.bolt1}`);
  const chk = await page.evaluate(async () => { window.__cad.state.angles = window.__cad.solveAngles(0.3); window.__cad.updateModels(); window.__cad.runCheck(); const c = await window.__cad.checked(); const expected = new Set(window.__cad.state.mates.filter((m) => m.kind === 'fixed' || m.kind === 'screw').map((m) => [m.a, m.b].sort().join('|'))); return { tested: c.tested, real: c.pairs.filter((p) => !expected.has([p.a, p.b].sort().join('|'))).map((p) => `${p.a}×${p.b} ${p.volume.toFixed(3)}`) }; });
  check(chk.real.length === 0, `no interference in the lift mid-travel (${chk.tested} pairs tested)${chk.real.length ? ' — ' + chk.real.join(', ') : ''}`);
  await page.evaluate(() => window.__cad.render());
  await page.screenshot({ path: path.join(shots, 'lift.png') });
}

// the clock: 18 components, an escapement drive, hands at the right ratios, highlight follows the hover
{
  const r = await Promise.race([page.evaluate(async () => { await window.__cad.load('clock'); return await window.__cad.settled(); }), new Promise((res) => setTimeout(() => res({ timeout: true }), 240000))]);
  check(!r.timeout && r.mode === 'asm' && r.components === 18, `clock: ${r.components} components over ${r.slots} distinct part builds${r.timeout ? ' (TIMEOUT waiting for exact builds)' : ''}`);
  const a = await page.evaluate(() => { window.__cad.solveAngles(60); const g = (k) => window.__cad.state.angles.get(k); return { escape: g('escape'), minute: g('minute-hand'), hour: g('hour-hand'), fork: g('fork'), balance: g('balance'), centre: g('centre') }; });
  check(Math.abs(a.escape - 720) < 1e-6, `after 60 beats the escape wheel has turned two revolutions (${a.escape.toFixed(3)}°)`);
  check(Math.abs(a.minute + 6) < 1e-6, `…and the minute hand one minute, clockwise (${a.minute.toFixed(4)}°)`);
  check(Math.abs(a.hour + 0.5) < 1e-6, `…and the hour hand a twelfth of that (${a.hour.toFixed(4)}°)`);
  const mid = await page.evaluate(() => { window.__cad.solveAngles(0.5); const g = (k) => window.__cad.state.angles.get(k); return { escape: g('escape'), fork: g('fork'), balance: g('balance') }; });
  check(Math.abs(mid.escape - 12) < 1e-6 && Math.abs(mid.fork - 8) < 1e-6 && Math.abs(mid.balance) < 1e-6, `mid-beat: the wheel has stepped a half tooth (${mid.escape}°), the fork is at +lift (${mid.fork}°), the balance passes centre (${mid.balance.toFixed(3)}°)`);
  const phases = await page.evaluate(() => Object.fromEntries(window.__cad.state.components.filter((c) => /wheel|third|fourth|escape-arbor|cannon|pinion/.test(c.id)).map((c) => [c.id, +c.phase.toFixed(3)])));
  check(Object.values(phases).some((p) => p !== 0), `gear phases were set automatically: ${Object.entries(phases).slice(0, 4).map(([k, v]) => `${k} ${v}°`).join(', ')}`);
  const hl = await page.evaluate(() => { const s = window.__cad.state; s.hover = { name: 'balance', fid: 0, key: 0 }; window.__cad.renderer.hover = 0; const rows = [...document.querySelectorAll('[data-comp]')]; const before = rows.filter((r) => r.classList.contains('hl')).map((r) => r.dataset.comp); document.querySelector('#face'); const ev = new PointerEvent('pointerenter'); rows.find((r) => r.dataset.comp === 'balance').dispatchEvent(ev); const after = [...document.querySelectorAll('[data-comp].hl')].map((r) => r.dataset.comp); s.hover = null; return { after }; });
  check(hl.after.length >= 2 && hl.after.every((c) => c === 'balance'), `hovering the balance highlights its rows in the list and the report (${hl.after.length} rows)`);
  const chk = await page.evaluate(async () => { window.__cad.state.angles = window.__cad.solveAngles(0.5); window.__cad.updateModels(); window.__cad.runCheck(); const c = await window.__cad.checked(); const fixed = new Set(window.__cad.state.mates.filter((m) => m.kind === 'fixed').map((m) => [m.a, m.b].sort().join('|'))); return { tested: c.tested, ms: c.ms, real: c.pairs.filter((p) => !fixed.has([p.a, p.b].sort().join('|'))).map((p) => `${p.a}×${p.b} ${p.volume.toFixed(3)}`), all: c.pairs.length }; });
  check(chk.tested > 0, `interference check ran over ${chk.tested} overlapping pairs in ${chk.ms.toFixed(0)} ms (${chk.all} touching pairs, ${chk.real.length} real)`);
  check(chk.real.length === 0, `the clock has no interfering pairs mid-beat${chk.real.length ? ' — ' + chk.real.join(', ') : ''}`);
  await page.evaluate(() => { window.__cad.cam.preset('iso'); window.__cad.cam.fit(window.__cad.renderer.sceneBbox()); window.__cad.solveAngles(0.5); window.__cad.render(); });
  await page.screenshot({ path: path.join(shots, 'clock.png') });
  const vis = await page.evaluate(() => { window.__cad.hide('dial'); window.__cad.hide('case'); window.__cad.render(); const c = document.querySelector('#view'); const r = c.getBoundingClientRect(); const seen = new Set(); for (let y = 0.2; y <= 0.8; y += 0.04) for (let x = 0.2; x <= 0.8; x += 0.04) { const p = window.__cad.renderer.pick(r.width * x, r.height * y, window.__cad.cam); if (p) seen.add(p.name); } return [...seen]; });
  check(!vis.includes('dial') && !vis.includes('case') && vis.some((n) => /wheel|escape|balance|fork/.test(n)), `hiding the dial and case exposes the movement to the picker: ${vis.slice(0, 6).join(', ')}`);
  await page.screenshot({ path: path.join(shots, 'clock-movement.png') });
  await page.evaluate(() => { window.__cad.hide('dial', false); window.__cad.hide('case', false); });
  await page.evaluate(() => { window.__cad.cam.preset('top'); window.__cad.cam.ortho = true; window.__cad.render(); });
  await page.screenshot({ path: path.join(shots, 'clock-top.png') });
  await page.evaluate(() => { window.__cad.cam.ortho = false; window.__cad.cam.preset('iso'); });
}

// touch: two-finger pinch dollies, two-finger drag pans, one finger orbits
{
  const before = await page.evaluate(() => ({ d: window.__cad.cam.distance, yaw: window.__cad.cam.yaw, t: [...window.__cad.cam.target] }));
  await page.evaluate(() => {
    const c = document.querySelector('#view'); const r = c.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (type, id, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, button: 0 }));
    ev('pointerdown', 1, cx - 50, cy); ev('pointerdown', 2, cx + 50, cy);
    ev('pointermove', 1, cx - 100, cy); ev('pointermove', 2, cx + 100, cy);   // pinch out
    ev('pointermove', 1, cx - 100, cy + 60); ev('pointermove', 2, cx + 100, cy + 60); // drag down
    ev('pointerup', 1, cx - 100, cy + 60); ev('pointerup', 2, cx + 100, cy + 60);
    ev('pointerdown', 1, cx, cy); ev('pointermove', 1, cx + 80, cy); ev('pointerup', 1, cx + 80, cy); // one finger
  });
  const after = await page.evaluate(() => ({ d: window.__cad.cam.distance, yaw: window.__cad.cam.yaw, t: [...window.__cad.cam.target] }));
  check(after.d < before.d, `pinch out zooms in (distance ${before.d.toFixed(1)} → ${after.d.toFixed(1)})`);
  check(Math.hypot(...after.t.map((v, i) => v - before.t[i])) > 0.01, `two-finger drag pans (target moved ${Math.hypot(...after.t.map((v, i) => v - before.t[i])).toFixed(2)})`);
  check(after.yaw !== before.yaw, `one finger orbits (yaw ${before.yaw.toFixed(3)} → ${after.yaw.toFixed(3)})`);
}

// the phone layout: part on top, tabs, one panel below
{
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, bypassCSP: true }); await quietAuth(phone);
  await phone.goto(`${base}/?part=case`, { waitUntil: 'load' });
  await phone.waitForFunction(() => !!window.__cad, null, { timeout: 30000 });
  await phone.evaluate(async () => { await window.__cad.ready; await window.__cad.settled(); window.__cad.render(); });
  const lay = await phone.evaluate(() => { const g = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)]; }; const v = document.querySelector('#view').getBoundingClientRect(); const t = document.querySelector('#tabs').getBoundingClientRect(); const l = document.querySelector('#left').getBoundingClientRect(); return { view: v.height / innerHeight, tabsVisible: t.height > 0, panelBelow: l.top >= v.bottom - 1, docScrollX: document.documentElement.scrollWidth <= innerWidth + 1, rects: { header: g('header'), main: g('main'), view: g('#view'), tabs: g('#tabs'), left: g('#left'), inner: innerHeight } }; });
  check(lay.view > 0.5 && lay.tabsVisible && lay.panelBelow && lay.docScrollX, `phone: part takes ${(lay.view * 100).toFixed(0)}% of the height, tabs visible, panel below, no sideways scroll ${JSON.stringify(lay.rects)}`);
  await phone.click('[data-tab=report]');
  const rep = await phone.evaluate(() => getComputedStyle(document.querySelector('#right')).display !== 'none' && getComputedStyle(document.querySelector('#left')).display === 'none');
  check(rep, 'phone: the report tab swaps the panel');
  await phone.screenshot({ path: path.join(shots, 'phone.png') });
  await phone.close();
}

// OCCT, lazily, from a base URL the test serves itself: the fillet the other kernels cannot do
{
  const occ = await browser.newPage({ viewport: { width: 1400, height: 900 }, bypassCSP: true }); await quietAuth(occ);
  const occErrors = [];
  occ.on('pageerror', (e) => occErrors.push(e.message));
  await occ.goto(`${base}/?part=case-fillet&occt=/occt/`, { waitUntil: 'load' });
  await occ.waitForFunction(() => !!window.__cad, null, { timeout: 30000 });
  const r = await Promise.race([occ.evaluate(async () => { await window.__cad.ready; return await window.__cad.settled(); }), new Promise((res) => setTimeout(() => res({ timeout: true }), 180000))]);
  check(!r.timeout && r.exact && r.exactKernel === 'occt', `case-fillet: exact lands from OCCT${r.exact ? ` (volume ${r.exact.volume.toFixed(3)}, χ=${r.exact.euler}, watertight ${r.exact.watertight})` : r.timeout ? ' — timed out' : ` — ${r.exactError?.msg}`}`);
  if (r.exact) check(near(r.exact.volume, 2455.522, 0.002) && r.exact.euler === 2, `case-fillet volume matches the bake-off's OCCT number (2455.522)`);
  check(r.preview && r.preview.watertight, `case-fillet: preview shows the unfilleted case meanwhile (${r.preview?.volume?.toFixed(1)})`);
  const esc = await Promise.race([occ.evaluate(async () => { await window.__cad.load('escape'); return await window.__cad.settled(); }), new Promise((res) => setTimeout(() => res({ timeout: true }), 120000))]);
  check(!esc.timeout && esc.exact && esc.exactKernel === 'occt' && esc.exact.euler === 0, `escape: Truck's failed union falls through to OCCT (${esc.exact ? `χ=${esc.exact.euler}, ${esc.exact.volume.toFixed(2)}` : esc.exactError?.msg})`);
  await occ.evaluate(() => window.__cad.render());
  await occ.screenshot({ path: path.join(shots, 'case-fillet-occt.png') });
  check(occErrors.length === 0, occErrors.length ? `OCCT page errors:\n  ${occErrors.join('\n  ')}` : 'no page errors on the OCCT path');
  await occ.close();
}

check(errors.length === 0, errors.length ? `no page errors — got:\n  ${errors.join('\n  ')}` : 'no page errors');
await browser.close(); server.close();
console.log(fails ? `\n✗ ${fails} failing (screenshots in ${shots})` : `\n✓ browser.selftest passed (screenshots in ${shots})`);
process.exit(fails ? 1 : 0);
