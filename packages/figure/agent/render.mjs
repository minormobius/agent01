#!/usr/bin/env node
// render.mjs — the model sheet as a PNG. Serves this package, opens sheet.html in
// headless Chromium (software WebGL is enough), renders, screenshots the sheet.
//
//   node agent/render.mjs specs/adult.json --out /tmp/adult.png [--skeleton] [--h 440]
//   node agent/render.mjs '{"heads":3}' --out /tmp/chibi.png          # a spec inline
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes(k);

export function loadPlaywright() {
  const tries = [ROOT, path.join(ROOT, '..', 'cad'), path.join(ROOT, '..', 'cad', 'bakeoff')];
  for (const p of tries) for (const name of ['playwright-core', 'playwright']) { try { return createRequire(path.join(p, 'package.json'))(name); } catch {} }
  try { return createRequire(import.meta.url)(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch {}
  throw new Error('playwright is not installed: `npm install playwright-core` here, or globally');
}
export const CHROME_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--ignore-gpu-blocklist'];

export async function serve() {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const p = path.join(ROOT, u);
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

export async function renderSheetPNG(spec, out, { sheet = null, skeleton = false, panelH = 440, lineup = null } = {}) {
  const { chromium } = loadPlaywright();
  const { server, base } = await serve();
  const exe = [process.env.FIGURE_CHROME, process.env.CAD_CHROME].filter(Boolean).find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, executablePath: exe, args: CHROME_ARGS });
  try {
    const page = await browser.newPage({ viewport: { width: 2400, height: 1600 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/sheet.html?wait`);
    await page.waitForFunction(() => window.__figure?.ready);
    const stats = lineup
      ? (await page.evaluate(({ lineup, panelH }) => { window.__figure.lineup(lineup, { panelH, names: lineup.map((s) => s.name) }); return { panels: [], ms: 0 }; }, { lineup, panelH }))
      : await page.evaluate(({ spec, sheet, skeleton, panelH }) => window.__figure.render(spec, sheet, { skeleton, panelH }), { spec, sheet, skeleton, panelH });
    // straight from the canvas: no viewport, no scrolling, the sheet at its own size
    const url = await page.evaluate(() => document.getElementById('sheet').toDataURL('image/png'));
    fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
    return { stats, errors };
  } finally { await browser.close(); server.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (src) => src.trim().startsWith('{') ? JSON.parse(src) : JSON.parse(fs.readFileSync(src, 'utf8'));
  const out = arg('--out', '/tmp/figure-sheet.png');
  // --lineup a.json b.json …: the figures side by side, one head the same size in all
  const li = argv.indexOf('--lineup');
  const lineup = li >= 0 ? argv.slice(li + 1).filter((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--out' && argv[argv.indexOf(a) - 1] !== '--h').map(read) : null;
  const spec = lineup ? {} : read(argv[0] || '{}');
  const { stats, errors } = await renderSheetPNG(spec, out, { skeleton: has('--skeleton'), panelH: Number(arg('--h', 440)), lineup });
  const bad = stats.panels.filter((p) => p.unreached.length);
  console.log(`${out} · ${stats.panels.length} panels in ${stats.ms} ms`);
  for (const p of bad) console.log(`  ${p.pose}: could not reach — ${p.unreached.map((u) => `${u.limb} short ${u.short.toFixed(3)}`).join(', ')}`);
  if (errors.length) { console.log('page errors:', errors.join('; ')); process.exit(1); }
}
