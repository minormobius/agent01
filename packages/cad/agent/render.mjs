#!/usr/bin/env node
// render.mjs — pictures, the way a human would see them. Serves this package,
// opens the page in headless Chromium, loads the document, waits for the
// builds, and writes one PNG per view plus the report as JSON. Needs
// `bakeoff/node_modules` (playwright-core) and the Playwright Chromium.
//
//   node agent/render.mjs bench/clock.json --out /tmp/shots [--views iso,top,front] [--t 0.5] [--hide dial,case] [--occt]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, arg, has } from './common.mjs';

const require = createRequire(path.join(ROOT, 'bakeoff', 'package.json'));
const { chromium } = require('playwright-core');
const docPath = path.resolve(process.argv[2]);
const out = arg('--out', '/tmp/cad-render'); fs.mkdirSync(out, { recursive: true });
const views = arg('--views', 'iso,top,front').split(',');
const t = Number(arg('--t', '0')); const hide = (arg('--hide', '') || '').split(',').filter(Boolean);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' };
const OCCT = path.join(ROOT, 'bakeoff', 'node_modules', 'opencascade.js', 'dist');
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const p = u.startsWith('/occt/') ? path.join(OCCT, u.slice(6)) : path.join(ROOT, u.replace(/\/$/, '/index.html'));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--proxy-server=direct://', '--disable-background-networking'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, bypassCSP: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}/?part=plate${has('--occt') ? '&occt=/occt/' : ''}`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__cad, null, { timeout: 30000 });
await page.evaluate(() => window.__cad.ready);
const doc = JSON.parse(fs.readFileSync(docPath, 'utf8'));
const report = await page.evaluate(async ({ doc, t, hide }) => {
  const c = window.__cad; await c.loadDocument(doc, doc.name || 'agent'); const s = await c.settled();
  for (const id of hide) c.hide(id, true);
  if (c.state.mode === 'asm') { c.state.angles = c.solveAngles(t); c.updateModels(); }
  c.cam.fit(c.renderer.sceneBbox());
  return { ...s, faces: c.state.mode === 'part' ? c.state.slots.get('main')?.faces : undefined, components: c.state.components.map((x) => ({ id: x.id, part: x.part, partKey: x.partKey })), slots: Object.fromEntries([...c.state.slots].map(([k, v]) => [k, { preview: v.preview?.invariants, exact: v.exact?.invariants, exactKernel: v.exact?.kernel, exactError: v.exactError, previewError: v.previewError }])) };
}, { doc, t, hide });
for (const v of views) {
  await page.evaluate((v) => { const c = window.__cad; c.cam.preset(v); c.cam.ortho = v !== 'iso'; c.cam.fit(c.renderer.sceneBbox()); c.render(); }, v);
  await page.screenshot({ path: path.join(out, `${v}.png`) });
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ doc: docPath, t, views, errors, ...report }, null, 1));
await browser.close(); server.close();
console.log(`${views.map((v) => v + '.png').join(', ')} and report.json in ${out}${errors.length ? `\npage errors: ${errors.join('; ')}` : ''}`);
