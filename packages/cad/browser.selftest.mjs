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
const { chromium } = require('playwright-core');
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
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const OCCT = path.join(here, 'bakeoff', 'node_modules', 'opencascade.js', 'dist');
  const p = urlPath.startsWith('/occt/') ? path.join(OCCT, urlPath.slice(6)) : path.join(here, urlPath.replace(/\/$/, '/index.html'));
  if (!(p.startsWith(here)) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  const extra = headersFor(urlPath); delete extra['cache-control'];
  res.writeHead(200, { ...extra, 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ headless: !args.includes('--headed'), executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--proxy-server=direct://', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run'] });
let fails = 0;
const check = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fails++; };
const near = (a, b, rel) => Math.abs(a - b) <= rel * Math.abs(b);

// Pass 1 — under the production CSP, with no script injection at all
// (Playwright's evaluate uses string evaluation, which the policy forbids):
// load the page and watch the console for the app's own ready and exact lines.
{
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  const seen = []; const errs = [];
  p.on('console', (m) => { seen.push(m.text()); if (m.type() === 'error') errs.push(m.text()); });
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, bypassCSP: true });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

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

// the report is on screen
const reportText = await page.textContent('#report');
check(/volume/.test(reportText) && /watertight/.test(reportText), 'report table renders');

// every other bench part builds (preview at least), with the expected honesty on exact
const expect = { gear: { exact: false }, arbor: { exact: true, euler: 2 }, escape: { exact: false, euler: 0 }, case: { exact: true, euler: 2 }, 'case-fillet': { exact: false, approx: true } };
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

// a param edit rebuilds: thicken the case wall and the volume grows
await page.evaluate(async () => { await window.__cad.load('case'); await window.__cad.settled(); });
const before = await page.evaluate(() => window.__cad.state.slots.get('main').exact.invariants.volume);
await page.evaluate(() => { const row = [...document.querySelectorAll('#params .param')].find((r) => r.querySelector('span').textContent === 'wall'); const i = row.querySelector('input'); i.value = '3'; i.dispatchEvent(new Event('input')); });
const after = await page.evaluate(async () => { await window.__cad.settled(); return window.__cad.state.slots.get('main').exact.invariants.volume; });
check(after > before, `editing wall 1 → 3 rebuilds and adds volume (${before.toFixed(1)} → ${after.toFixed(1)})`);

// three views snapshot strip
await page.click('#views');
const imgs = await page.$$eval('#strip img', (els) => els.map((i) => i.src.length));
check(imgs.length === 3 && imgs.every((l) => l > 1000), `three-view strip renders (${imgs.map((l) => (l / 1e3).toFixed(0) + 'k').join(', ')})`);
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
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, bypassCSP: true });
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
  const occ = await browser.newPage({ viewport: { width: 1400, height: 900 }, bypassCSP: true });
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
