/**
 * Which links become a readable paper.
 *
 *   node bsky/lib/paper.selftest.mjs
 *
 * The list of hosts here is MEASURED, not assumed (see the table in paper.js),
 * and the negative cases are the important half: offering a "read the paper"
 * button that cannot work is worse than not offering one, because the reader
 * taps it and gets an error instead of the link they could have followed.
 */
import { paperPdf, paperOf, rectToViewport, pixelRatio } from './paper.js';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

console.log('arXiv — an ABSTRACT link is what people post, and it resolves');
check('/abs/ -> the pdf', paperPdf('https://arxiv.org/abs/2401.00001')?.pdf,
  'https://arxiv.org/pdf/2401.00001');
check('/pdf/ stays', paperPdf('https://arxiv.org/pdf/2401.00001')?.pdf,
  'https://arxiv.org/pdf/2401.00001');
check('a version suffix survives', paperPdf('https://arxiv.org/abs/2401.00001v3')?.pdf,
  'https://arxiv.org/pdf/2401.00001v3');
check('a trailing .pdf is not doubled', paperPdf('https://arxiv.org/pdf/2401.00001v2.pdf')?.pdf,
  'https://arxiv.org/pdf/2401.00001v2');
check('www. is tolerated', paperPdf('https://www.arxiv.org/abs/2401.00001')?.pdf,
  'https://arxiv.org/pdf/2401.00001');
check('an old-style id survives', paperPdf('https://arxiv.org/abs/math/0211159')?.pdf,
  'https://arxiv.org/pdf/math/0211159');
check('the label names the paper', paperPdf('https://arxiv.org/abs/2401.00001')?.label,
  'arXiv:2401.00001');

console.log('\nhosts a browser CANNOT read — measured, so no button is offered');
for (const [name, url] of [
  ['biorxiv',  'https://www.biorxiv.org/content/10.1101/2024.01.01.573817v1.full.pdf'],
  ['medrxiv',  'https://www.medrxiv.org/content/10.1101/2024.01.02.24300001v1.full.pdf'],
  ['osf.io',   'https://osf.io/preprints/psyarxiv/abcde/download'],
  ['PMC',      'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7286300/pdf/main.pdf'],
  ['plos',     'https://journals.plos.org/plosone/article/file?id=10.1371/journal.pone.1&type=printable'],
  ['mdpi',     'https://www.mdpi.com/1660-4601/18/1/1/pdf'],
  ['nature',   'https://www.nature.com/articles/s41586-024-07123-4.pdf'],
]) check(`${name} offers nothing`, paperPdf(url), null);

console.log('\nnot a paper at all');
check('a bare host', paperPdf('https://arxiv.org/'), null);
check('a listing page', paperPdf('https://arxiv.org/list/cs.AI/recent'), null);
check('unparseable', paperPdf('not a url'), null);
check('empty', paperPdf(''), null);

console.log('\npaperOf picks the first readable link in a post');
check('finds arxiv among others', paperOf([
  'https://example.com/blog', 'https://arxiv.org/abs/2401.00001', 'https://nature.com/x',
])?.label, 'arXiv:2401.00001');
check('none readable -> null', paperOf(['https://nature.com/x', 'https://mdpi.com/y']), null);
check('no links -> null', paperOf([]), null);
check('undefined -> null', paperOf(undefined), null);

console.log('\nrectToViewport — the annotation maths, done here because pdf.js moved it twice');
{
  // A US-letter page at scale 1: PDF y points up, the viewport's points down.
  const flip = [1, 0, 0, -1, 0, 792];
  check('a rect flips onto the viewport', rectToViewport([72, 650, 300, 675], flip),
    [72, 117, 300, 142]);
  check('corners come back ordered, never negative-width',
    rectToViewport([300, 675, 72, 650], flip), [72, 117, 300, 142]);

  // Scale 2 doubles both axes; the page height doubles with it.
  check('scale is applied', rectToViewport([72, 650, 300, 675], [2, 0, 0, -2, 0, 1584]),
    [144, 234, 600, 284]);

  // A 90-degree rotation: x' = -y, y' = -x is not it — check a real one.
  check('a rotated page still yields an ordered box',
    rectToViewport([0, 0, 10, 20], [0, 1, -1, 0, 100, 0]), [80, 0, 100, 10]);

  const r = rectToViewport([72, 650, 300, 675], flip);
  check('width is positive', r[2] - r[0] > 0, true);
  check('height is positive', r[3] - r[1] > 0, true);
}

// ─── pixelRatio ──────────────────────────────────────────────────
//
// The failure this guards against is silent in the worst way: past iOS
// Safari's canvas limit the allocation does not throw — it hands back a canvas
// that draws NOTHING, which is indistinguishable from a broken render.
console.log('\npixelRatio — the canvas budget, which fails BLANK rather than loudly');
{
  const LETTER = { width: 612, height: 792 };
  const px = (vp, dpr) => { const r = pixelRatio(vp, dpr); return { r, w: vp.width * r, h: vp.height * r }; };
  const yes = (name, cond) => check(name, cond, true);

  yes('a letter page at 1x is left alone', pixelRatio(LETTER, 1) === 1);
  yes('a letter page at 2x keeps 2x — 3.9M px, inside budget',
    Math.abs(pixelRatio(LETTER, 2) - 2) < 1e-9);

  // 3x on a full page is 10.9M device pixels, ~44 MB for one page.
  const three = px(LETTER, 3);
  yes('3x on a full page is cut back', three.r < 3);
  yes('  …to inside the area budget', three.w * three.h <= 4.2e6 + 1);

  // Zoomed in the page is already huge in CSS pixels; it must not ALSO be
  // multiplied by the display ratio. This is the case that actually bit.
  const z = px({ width: 612 * 4, height: 792 * 4 }, 3);
  yes('a 4x-zoomed page stays inside the area budget', z.w * z.h <= 4.2e6 + 1);
  yes('a 4x-zoomed page stays inside the edge limit', Math.max(z.w, z.h) <= 4096 + 1);

  // A long thin page can sit inside the AREA budget and still blow the edge
  // limit, which is a separate hard cap — so both are applied.
  const t = px({ width: 300, height: 6000 }, 3);
  yes('a very tall page is capped by the EDGE, not the area', Math.max(t.w, t.h) <= 4096 + 1);

  // 1x is a FLOOR, not a guarantee — the hard cap outranks it. A page big
  // enough to blow the budget at 1:1 must go softer, because the alternative
  // is a canvas that draws nothing at all.
  const big = px({ width: 20000, height: 20000 }, 3);
  yes('a page over budget at 1:1 goes BELOW 1x rather than blank', big.r < 1);
  yes('  …and lands inside the area budget', big.w * big.h <= 4.2e6 + 1);
  yes('1x is still the floor when the cap allows it', pixelRatio(LETTER, 0.5) === 1);

  // A NaN canvas dimension is one more silent blank.
  yes('a zero-size viewport yields a finite ratio', Number.isFinite(pixelRatio({ width: 0, height: 0 }, 3)));
  yes('a missing devicePixelRatio yields a finite ratio', Number.isFinite(pixelRatio(LETTER, undefined)));
}

if (failed) { console.error(`\n${failed} failure(s)`); process.exit(1); }
console.log('\npaper selftest passed');
