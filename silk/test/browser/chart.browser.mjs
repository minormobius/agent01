// chart.browser.mjs — the three things about the chart that a node selftest
// cannot see, because they are all about pixels.
//
//   node silk/test/browser/chart.browser.mjs
//
// Not run by CI (no Chromium there); see test/browser/typeahead.browser.mjs for
// why these live in the repo anyway. This one runs against the committed
// data.json, so it needs no network at all.
//
// 1. THE EXPORT IS THE WHOLE WEB. It once was not: drawMarks culled against the
//    on-screen canvas while rendering into a 2000px one, so the PNG came out as
//    a quarter of a web with the other three quadrants empty. That is a silent
//    failure — the button still said "downloaded ✓" — so it is checked by
//    reading the actual downloaded file back and counting ink per quadrant.
// 2. TYPE SIZE BUYS LABELS. The size slider is also the density control; if the
//    two ever stop being coupled the control is lying.
// 3. `min uses` REWEAVES. The survivors must re-rank and refill the disc, not
//    sit in a moth-eaten copy of the unfiltered layout.

import { readFileSync } from 'node:fs';
import { serveSilk, getChromium, noPlaywright, checker } from './harness.mjs';

const srv = await serveSilk(8909);
const chromium = await getChromium();
if (!chromium) { srv.close(); noPlaywright(); }

const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1.5, acceptDownloads: true,
});
const p = await ctx.newPage();
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(String(e)));
await p.goto(`${srv.url}/word/index.html`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);

const ok = checker('chart browser test');

const setRange = (id, v) => p.$eval(`#${id}`, (el, val) => {
  el.value = String(val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, v);

// ── 1. the export ───────────────────────────────────────────────────────────
ok.group('the export is the whole web');
const dl = p.waitForEvent('download', { timeout: 30000 });
await p.click('#copy');
const bytes = readFileSync(await (await dl).path());

const shot = await p.evaluate((u) => new Promise((res) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = Math.min(img.width, img.height);      // the web is the top square
    const px = g.getImageData(0, 0, d, d).data;
    const q = [0, 0, 0, 0];
    for (let y = 0; y < d; y++) {
      for (let x = 0; x < d; x++) {
        const i = (y * d + x) * 4;
        if (px[i] + px[i + 1] + px[i + 2] > 90) q[(y < d / 2 ? 0 : 2) + (x < d / 2 ? 0 : 1)]++;
      }
    }
    res({ w: img.width, h: img.height, q });
  };
  img.src = u;
}), 'data:image/png;base64,' + bytes.toString('base64'));

const ink = shot.q.reduce((a, x) => a + x, 0);
const balance = Math.min(...shot.q) / Math.max(...shot.q);
console.log(`    ${shot.w}×${shot.h}, ${ink.toLocaleString()} lit px, quadrants ${shot.q.join(' / ')}`);
ok('it is 2000px wide with a caption band below', shot.w === 2000 && shot.h > 2000);
ok('every quadrant has ink', shot.q.every((n) => n > 10000));
ok(`the four quadrants are within 30% of each other (${balance.toFixed(2)})`, balance > 0.7);
ok('the whole disc is drawn, not a corner of it', ink > 150000);

// ── 2. type size drives how many labels fit ─────────────────────────────────
ok.group('type size buys labels');
const placed = async (v) => {
  await setRange('tsize', v);
  await p.waitForTimeout(180);
  return +(await p.textContent('#tsizev')).split('·')[1].trim().replace(/,/g, '');
};
const big = await placed(26);
const mid = await placed(13);
const small = await placed(7);
console.log(`    26px → ${big} labels · 13px → ${mid} · 7px → ${small}`);
ok('smaller type places strictly more labels', small > mid && mid > big);
ok('the spread is worth having (≥5× across the slider)', small >= big * 5);
ok('the readout is the placed count, not the slider position',
  (await p.textContent('#tsizev')).startsWith('7px · ') && small > 7);
await setRange('tsize', 13);

// ── 3. min uses reweaves ────────────────────────────────────────────────────
ok.group('min uses reweaves the web');
const look = () => p.evaluate(() => {
  const { L, state } = window.silk;
  let n = 0, rmax = 0, rsum = 0;
  for (let i = 0; i < L.N; i++) {
    if (L.CNT[i] < state.minc || L.SZ[i] <= 0 || L.isHub[i]) continue;
    const r = Math.hypot(L.X[i] - 600, L.Y[i] - 600);
    rmax = Math.max(rmax, r); rsum += r; n++;
  }
  return {
    n, rmax, rmean: rsum / (n || 1),
    spans: L.ring.map((k) => L.wedge.get(k).span),
    shellP: Array.from(L.shellP),
  };
});
const at = async (v) => { await setRange('minc', v); await p.waitForTimeout(750); return look(); };

const a1 = await at(1);
const a20 = await at(20);
console.log(`    1× → ${a1.n.toLocaleString()} words, rmax ${a1.rmax.toFixed(0)}`);
console.log(`   20× → ${a20.n.toLocaleString()} words, rmax ${a20.rmax.toFixed(0)}, `
  + `rmean ${a20.rmean.toFixed(0)} (was ${a1.rmean.toFixed(0)} for the whole lexicon)`);
ok('filtering removes most of the vocabulary', a20.n < a1.n * 0.2 && a20.n > 100);
ok('what is left still reaches the rim', a20.rmax > a1.rmax * 0.95);
ok('and still fills the disc, rather than huddling at the centre',
  Math.abs(a20.rmean - a1.rmean) / a1.rmean < 0.15);
ok('the wedges resize to their new type counts',
  a20.spans.some((s, i) => Math.abs(s - a1.spans[i]) > 0.02));
ok('the contour rings are recomputed, so `21×` still means 21 uses',
  a20.shellP.some((s, i) => Math.abs(s - a1.shellP[i]) > 0.05));

// it must animate, not cut
await setRange('minc', 1);
await p.waitForTimeout(750);
await setRange('minc', 30);
const frames = [];
for (let i = 0; i < 4; i++) { frames.push((await look()).rmean); await p.waitForTimeout(85); }
await p.waitForTimeout(800);
const settled = await look();
frames.push(settled.rmean);
console.log(`    rmean over the weave: ${frames.map((f) => f.toFixed(0)).join(' → ')}`);
ok('it flies rather than cutting', new Set(frames.map((f) => f.toFixed(0))).size >= 4);
ok('and it arrives', !(await p.evaluate(() => window.silk.weaving)));

// and comes all the way back
const back = await at(1);
ok('sliding back to 1× restores the full web',
  back.n === a1.n && Math.abs(back.rmax - a1.rmax) < 0.5);

ok('no uncaught page errors anywhere above', pageErrors.length === 0);
if (pageErrors.length) console.log(pageErrors);

await b.close();
srv.close();
ok.done();
