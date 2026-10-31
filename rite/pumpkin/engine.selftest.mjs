// node rite/pumpkin/engine.selftest.mjs — gates the pumpkin carver. No network.
//
// The promise on the page is that every face is a stencil you could carve. So
// this carves thousands of pumpkins, in every mood, and checks every rule on
// every one: cuts a wall apart, on the carvable front, teeth a knife can leave,
// no outline crossing itself. Then the boring guarantees: same seed, same
// pumpkin; the SVG is well-formed; ids don't collide between pumpkins.

import { carve, render, describe, check, gap, selfCrosses, area, MOODS, MOOD_KEYS, WALL, TOOTH } from './engine.js';

let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) passed++; else { failed++; if (failed < 25) console.error('  ✗ ' + msg); } };

const N = +(process.env.N || 1500);
const t0 = Date.now();
const seen = { mood: {}, eyes: {}, mouth: {}, nose: {}, variety: {} };
let retries = 0;
for (let i = 0; i < N; i++) {
  const seed = 'st' + i;
  const p = carve(seed, { mood: i % 3 ? undefined : MOOD_KEYS[i % MOOD_KEYS.length] });
  ok(p.ok, `${seed}: ${p.problems.join('; ')}`);
  // Re-check independently of the carver's own verdict.
  const { body, cuts } = p;
  for (const c of cuts) {
    ok(!selfCrosses(c.pts), `${seed}: ${c.part} crosses itself`);
    ok(area(c.pts) >= 20, `${seed}: ${c.part} too small`);
    ok(c.pts.every(([x, y]) => ((x - body.cx) / (body.rx * 0.86)) ** 2 + ((y - body.cy) / (body.ry * 0.86)) ** 2 <= 1.0001), `${seed}: ${c.part} off the front`);
    for (const t of c.teeth || []) ok(t.w >= TOOTH, `${seed}: tooth ${t.w.toFixed(1)}px`);
  }
  for (let a = 0; a < cuts.length; a++) for (let b = a + 1; b < cuts.length; b++)
    ok(gap(cuts[a].pts, cuts[b].pts) >= WALL - 1e-9, `${seed}: ${cuts[a].part}/${cuts[b].part} closer than a wall`);
  ok(cuts.some((c) => c.part === 'eye') && cuts.some((c) => c.part === 'mouth'), `${seed}: a face needs eyes and a mouth`);
  if (p.genes.attempt) retries++;
  seen.mood[p.mood] = 1; seen.eyes[p.genes.eyes] = 1; seen.mouth[p.genes.mouth] = 1; seen.nose[p.genes.nose] = 1; seen.variety[p.variety] = 1;
}
const per = (Date.now() - t0) / N;

// The design space is actually reached.
ok(Object.keys(seen.mood).length === MOOD_KEYS.length, `moods reached: ${Object.keys(seen.mood)}`);
ok(Object.keys(seen.mouth).length >= 10, `mouths reached: ${Object.keys(seen.mouth)}`);
ok(Object.keys(seen.eyes).length >= 10, `eyes reached: ${Object.keys(seen.eyes)}`);
ok(Object.keys(seen.variety).length === 6, `varieties reached: ${Object.keys(seen.variety)}`);
ok(retries / N < 0.05, `too many faces need re-carving: ${(100 * retries / N).toFixed(1)}%`);
ok(per < 20, `too slow: ${per.toFixed(1)}ms a pumpkin`);

// Moods mean something: a mood's pumpkin only uses that mood's mouths.
for (const m of MOOD_KEYS) for (let i = 0; i < 30; i++) {
  const p = carve(`m${i}`, { mood: m });
  ok(p.mood === m && MOODS[m].mouth[p.genes.mouth], `${m}: got a ${p.genes.mouth} mouth`);
}

// Determinism and the renderer.
const a = carve('moth', { mood: 'sinister' }), b = carve('moth', { mood: 'sinister' });
ok(JSON.stringify(a) === JSON.stringify(b), 'same seed, same pumpkin');
ok(JSON.stringify(carve('moth')) !== JSON.stringify(carve('moths')), 'different seeds, different pumpkins');
for (const o of [{}, { lit: false }, { stencil: true }, { flicker: false, bg: false }]) {
  const svg = render(a, o);
  ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), `render ${JSON.stringify(o)} is an svg`);
  ok(!/NaN|undefined/.test(svg), `render ${JSON.stringify(o)} has no NaN`);
  const opens = (svg.match(/<(?!\/)[a-zA-Z]+[^>]*[^/]>/g) || []).length, closes = (svg.match(/<\/[a-zA-Z]+>/g) || []).length;
  ok(opens === closes, `render ${JSON.stringify(o)} tags balance (${opens}/${closes})`);
}
const ids1 = new Set([...render(a, { id: 'x1' }).matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const ids2 = [...render(carve('other'), { id: 'x2' }).matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
ok(ids2.every((i) => !ids1.has(i)), 'two pumpkins on one page share no ids');
ok(typeof describe(a) === 'string' && describe(a).includes('eyes'), 'describe says something');
ok(check(a.cuts, a.body).ok, 'check agrees with carve');

console.log(`${failed ? '✗' : '✓'} pumpkin engine: ${passed} passed, ${failed} failed (${N} pumpkins, ${per.toFixed(1)}ms each, ${(100 * retries / N).toFixed(1)}% re-carved)`);
process.exit(failed ? 1 : 0);
