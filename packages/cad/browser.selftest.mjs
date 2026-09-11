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

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  const p = path.join(here, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!p.startsWith(here) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ headless: !args.includes('--headed'), executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

let fails = 0;
const check = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fails++; };
const near = (a, b, rel) => Math.abs(a - b) <= rel * Math.abs(b);

await page.goto(`${base}/?part=plate`, { waitUntil: 'load' });
try { await page.waitForFunction(() => !!window.__cad, null, { timeout: 30000 }); }
catch { console.log(`✗ app did not boot.\n  ${errors.join('\n  ') || '(no page errors captured)'}`); await browser.close(); server.close(); process.exit(1); }
const boot = await page.evaluate(async () => { await window.__cad.ready; return await window.__cad.settled(); });
check(!boot.error && boot.preview && boot.exact, `page boots and builds the plate (preview ${boot.preview?.tris} tris, exact ${boot.exact?.tris} tris, ${boot.faces} faces)`);
const plate = JSON.parse(fs.readFileSync(path.join(here, 'bench', 'plate.json'), 'utf8')).params;
const vol = Math.PI * plate.R ** 2 * plate.t - Math.PI * plate.r_centre ** 2 * plate.t - plate.n_pivots * Math.PI * plate.r_pivot ** 2 * plate.t - plate.n_pillars * Math.PI * plate.r_pillar ** 2 * plate.t;
check(near(boot.exact.volume, vol, 0.002), `exact plate volume ${boot.exact.volume.toFixed(3)} vs closed form ${vol.toFixed(3)}`);
check(near(boot.preview.volume, vol, 0.005), `preview plate volume ${boot.preview.volume.toFixed(3)} within 0.5%`);
check(boot.exact.euler === -16 && boot.exact.watertight, `exact plate χ=${boot.exact.euler}, watertight ${boot.exact.watertight}`);
await page.evaluate(() => window.__cad.render());
await page.screenshot({ path: path.join(shots, 'plate.png') });

// pick a face by pointing at the middle of the canvas (the plate's top face)
const picked = await page.evaluate(() => { const c = document.querySelector('#view'); const r = c.getBoundingClientRect(); const id = window.__cad.renderer.pick(r.width / 2, r.height / 2, window.__cad.cam); return { id, names: window.__cad.state.faces[id]?.names || [] }; });
check(picked.id >= 0 && picked.names.some((n) => /plate\.(end|start|side)/.test(n)), `picking the centre of the view returns a named face: ${picked.names.slice(0, 3).join(', ') || picked.id}`);

// the report is on screen
const reportText = await page.textContent('#report');
check(/volume/.test(reportText) && /watertight/.test(reportText), 'report table renders');

// every other bench part builds (preview at least), with the expected honesty on exact
const expect = { gear: { exact: false }, arbor: { exact: true, euler: 2 }, escape: { exact: false, euler: 0 }, case: { exact: true, euler: 2 }, 'case-fillet': { exact: false, previewFails: true } };
for (const [name, ex] of Object.entries(expect)) {
  const r = await page.evaluate(async (n) => { await window.__cad.load(n); return await window.__cad.settled(); }, name);
  if (ex.previewFails) { check(r.previewError && r.previewError.unsupported, `${name}: preview reports unsupported (${r.previewError?.msg})`); continue; }
  check(r.preview && r.preview.watertight, `${name}: preview builds, watertight, χ=${r.preview?.euler}${ex.euler !== undefined ? ` (expected ${ex.euler})` : ''}`);
  if (ex.euler !== undefined) check(r.preview.euler === ex.euler, `${name}: preview χ = ${ex.euler}`);
  if (ex.exact) check(r.exact && r.exact.watertight && r.faces > 0, `${name}: exact lands with ${r.faces} named faces`);
  else check(!r.exact || !r.exact.watertight || r.exactError, `${name}: exact is absent or flagged (Truck cannot do this boolean) — ${r.exactError ? r.exactError.msg : 'not watertight'}`);
  await page.evaluate(() => window.__cad.render());
  await page.screenshot({ path: path.join(shots, `${name}.png`) });
}

// a param edit rebuilds: thicken the case wall and the volume grows
await page.evaluate(async () => { await window.__cad.load('case'); await window.__cad.settled(); });
const before = await page.evaluate(() => window.__cad.state.exact.invariants.volume);
await page.evaluate(() => { const row = [...document.querySelectorAll('#params .param')].find((r) => r.querySelector('span').textContent === 'wall'); const i = row.querySelector('input'); i.value = '3'; i.dispatchEvent(new Event('input')); });
const after = await page.evaluate(async () => { await window.__cad.settled(); return window.__cad.state.exact.invariants.volume; });
check(after > before, `editing wall 1 → 3 rebuilds and adds volume (${before.toFixed(1)} → ${after.toFixed(1)})`);

// three views snapshot strip
await page.click('#views');
const imgs = await page.$$eval('#strip img', (els) => els.map((i) => i.src.length));
check(imgs.length === 3 && imgs.every((l) => l > 1000), `three-view strip renders (${imgs.map((l) => (l / 1e3).toFixed(0) + 'k').join(', ')})`);
await page.screenshot({ path: path.join(shots, 'ui.png') });

check(errors.length === 0, errors.length ? `no page errors — got:\n  ${errors.join('\n  ')}` : 'no page errors');
await browser.close(); server.close();
console.log(fails ? `\n✗ ${fails} failing (screenshots in ${shots})` : `\n✓ browser.selftest passed (screenshots in ${shots})`);
process.exit(fails ? 1 : 0);
