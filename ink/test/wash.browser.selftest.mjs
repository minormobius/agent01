// wash.browser.selftest.mjs — the paper pass (js/wash.js), in a real browser.
// A shader cannot be checked from node, so this serves ink/, opens a blank page
// in headless Chromium, drives Wash on small synthetic pigment layers and reads
// the composited pixels back. Four claims, each one a way the pass could look
// fine on a real sheet and still be wrong:
//
//   1. orientation  — y is flipped exactly once: ink drawn at the top of the
//                     pigment layer comes out at the top of the sheet
//   2. neutral      — at grain 0 and bleed 0 the pass is paper × pigment, and
//                     nothing else (the mottling aside, which is ±3.5%)
//   3. granulation  — grain adds texture to a wash without changing its weight
//   4. pooled edge  — bleed darkens a wash's rim relative to its middle, and
//                     leaves an isolated hairline's weight alone
//
//   node ink/test/wash.browser.selftest.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const require = createRequire(import.meta.url);
// Without Playwright or its Chromium this says so and exits 0: preflight runs
// every changed dir's selftests on a bare runner, and a crash there would read
// as a broken page.
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  try { ({ chromium } = require('playwright-core')); } catch {
    console.log('↷ wash browser selftest skipped — playwright is not installed');
    process.exit(0);
  }
}

const TYPES = { '.js': 'text/javascript', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body></body>'); return; }
  const f = path.join(root, u);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
} catch (e) {
  console.log('↷ wash browser selftest skipped — Chromium did not launch: ' + e.message.split('\n')[0]);
  server.close();
  process.exit(0);
}

let fails = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; };

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => { console.log('pageerror: ' + e.message); fails++; });
  await page.goto(base + '/');

  // Every case: a fresh N×N canvas, a pigment layer painted by `paint`, one
  // present(), and the result read back y-down as [r,g,b] rows of luminance.
  const r = await page.evaluate(async () => {
    const { Wash } = await import('/js/wash.js');
    const N = 96;
    const run = (look, paint) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = N;
      const w = Wash.on(cv);
      if (!w) return null;
      const ctx = w.begin({ paper: [240, 232, 220], dpr: 1, seed: 7, grain: 0, bleed: 0, ...look });
      paint(ctx);
      w.present();
      const rb = document.createElement('canvas');
      rb.width = rb.height = N;
      const rc = rb.getContext('2d');
      rc.drawImage(cv, 0, 0);
      const out = rc.getImageData(0, 0, N, N).data;
      const pig = ctx.getImageData(0, 0, N, N).data;
      return { out: Array.from(out), pig: Array.from(pig) };
    };
    const lum = (d, i) => (d[i] + d[i + 1] + d[i + 2]) / 3;
    const mean = (d, x0, y0, x1, y1) => {
      let s = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += lum(d, (y * N + x) * 4); n++; }
      return s / n;
    };
    const sd = (d, x0, y0, x1, y1) => {
      const m = mean(d, x0, y0, x1, y1);
      let s = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += (lum(d, (y * N + x) * 4) - m) ** 2; n++; }
      return Math.sqrt(s / n);
    };

    const res = {};
    // 1. ink across the top quarter only
    const o = run({}, (c) => { c.fillStyle = '#000'; c.fillRect(0, 0, N, N / 4); });
    if (!o) return { webgl2: false };
    res.webgl2 = true;
    res.top = mean(o.out, 0, 2, N, N / 4 - 2);
    res.bottom = mean(o.out, 0, N - N / 4 + 2, N, N - 2);

    // 2. a smooth coloured ramp at grain 0 / bleed 0: out / (paper × T)
    const paper = [240, 232, 220];
    const n2 = run({}, (c) => {
      const g = c.createLinearGradient(0, 0, N, N);
      g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#3a6ea5'); g.addColorStop(1, '#a5523a');
      c.fillStyle = g; c.fillRect(0, 0, N, N);
    });
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < N * N * 4; i += 4) for (let k = 0; k < 3; k++) {
      const t = n2.pig[i + k] / 255;
      if (t < 0.15) continue;
      const q = n2.out[i + k] / (paper[k] * t);
      lo = Math.min(lo, q); hi = Math.max(hi, q);
    }
    res.ratioLo = lo; res.ratioHi = hi;

    // 3. a flat 50% wash, grain 0 against grain 1, measured inside the wash
    const wash = (c) => { c.fillStyle = '#808080'; c.fillRect(8, 8, N - 16, N - 16); };
    const g0 = run({ grain: 0 }, wash), g1 = run({ grain: 1 }, wash);
    res.g0 = mean(g0.out, 24, 24, N - 24, N - 24); res.g1 = mean(g1.out, 24, 24, N - 24, N - 24);
    res.s0 = sd(g0.out, 24, 24, N - 24, N - 24); res.s1 = sd(g1.out, 24, 24, N - 24, N - 24);

    // 4. a 40px wash and a hairline, bleed 0 against bleed 1
    const sq = (c) => { c.fillStyle = '#808080'; c.fillRect(28, 28, 40, 40); c.fillRect(8, 84, 80, 1); };
    const b0 = run({ bleed: 0 }, sq), b1 = run({ bleed: 1 }, sq);
    // rim band: the 2px just inside the left edge; middle: the centre 12px
    res.rim0 = mean(b0.out, 28, 40, 30, 56); res.mid0 = mean(b0.out, 42, 42, 54, 54);
    res.rim1 = mean(b1.out, 28, 40, 30, 56); res.mid1 = mean(b1.out, 42, 42, 54, 54);
    res.line0 = mean(b0.out, 16, 84, 80, 85); res.line1 = mean(b1.out, 16, 84, 80, 85);
    return res;
  });

  if (!r.webgl2) {
    console.log('↷ wash browser selftest skipped — this Chromium has no WebGL2 (the page falls back to the 2D renderer)');
  } else {
    const f = (v) => v.toFixed(1);
    ok(r.top < 40 && r.bottom > 200, `orientation: ink drawn at the top lands at the top (top ${f(r.top)}, bottom ${f(r.bottom)})`);
    ok(r.ratioLo > 0.95 && r.ratioHi < 1.05, `neutral: grain 0 + bleed 0 is paper × pigment within the ±3.5% mottle (ratio ${r.ratioLo.toFixed(3)}–${r.ratioHi.toFixed(3)})`);
    ok(Math.abs(r.g1 - r.g0) / r.g0 < 0.06, `granulation keeps a wash's weight (mean ${f(r.g0)} → ${f(r.g1)})`);
    ok(r.s1 > 2 * r.s0 + 1, `granulation adds texture to a wash (sd ${f(r.s0)} → ${f(r.s1)})`);
    ok(Math.abs(r.rim0 - r.mid0) < 4, `no bleed, no rim (rim ${f(r.rim0)}, middle ${f(r.mid0)})`);
    ok(r.mid1 - r.rim1 > 6, `bleed pools pigment at the rim (rim ${f(r.rim1)}, middle ${f(r.mid1)})`);
    ok(Math.abs(r.line1 - r.line0) < 4, `bleed leaves a hairline's weight alone (${f(r.line0)} → ${f(r.line1)})`);
  }
} finally {
  await browser.close();
  server.close();
}

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
