// node rite/pumpkin/rig.selftest.mjs — gates the live rig's pure parts. No DOM.
//
// The puppet morphs point by point between faces carved for every mood, so the
// things that must hold are: every mood has every slot, every slot is exactly N
// finite points, a morph halfway is finite, the extremes of talking and
// blinking stay finite and keep eyes and mouths where they were, and the
// mouth's script reads text the way the page promises.

import { buildRig, pose, resample, mixPalette, PALETTES, N } from './rig.js';
import { track, mouthAt, babble } from './voice.js';
import { MOOD_KEYS } from './engine.js';

let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) passed++; else { failed++; if (failed < 25) console.error('  ✗ ' + msg); } };
const finite = (polys) => polys.every((p) => p.length === N && p.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)));
const bbox = (p) => { const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };

// Resampling: N points, the same winding, the outline kept.
const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
const rs = resample(square, 40);
ok(rs.length === 40, 'resample gives n points');
ok(rs.every(([x, y]) => (x === 0 || x === 10 || y === 0 || y === 10)), 'resampled points stay on the outline');
ok(JSON.stringify(resample(square)) === JSON.stringify(resample([...square].reverse())), 'winding does not matter');

const t0 = Date.now();
for (let i = 0; i < 120; i++) {
  const rig = buildRig('rig' + i);
  ok(MOOD_KEYS.every((m) => rig.polys[m] && rig.polys[m].length === rig.keys.length), `rig${i}: a mood is missing a slot`);
  ok(MOOD_KEYS.every((m) => finite(rig.polys[m])), `rig${i}: a slot is not N finite points`);
  ok(rig.parts.filter((p) => p === 'eye').length === 2 && rig.parts.includes('mouth'), `rig${i}: two eyes and a mouth`);
  for (let j = 0; j < 4; j++) {
    const from = MOOD_KEYS[(i + j) % 8], to = MOOD_KEYS[(i + j * 3 + 1) % 8];
    const mid = pose(rig, { from, to, k: 0.5, open: 0, round: 0, blink: 0, brow: 0, look: 0 });
    ok(finite(mid), `rig${i}: ${from}→${to} halfway is not finite`);
    // The extremes: wide open, round, pressed, shut eyes, turned all the way.
    for (const s of [{ open: 1, round: 1 }, { open: -0.6 }, { blink: 1, brow: 8 }, { look: 1 }, { look: -1, open: 0.5 }]) {
      const out = pose(rig, { from, to, k: 1, open: 0, round: 0, blink: 0, brow: 0, look: 0, ...s });
      ok(finite(out), `rig${i}: pose ${JSON.stringify(s)} not finite`);
    }
    // Talking moves only the mouth; blinking only the eyes.
    const rest = pose(rig, { from: to, to, k: 1 });
    const open = pose(rig, { from: to, to, k: 1, open: 1 });
    const shut = pose(rig, { from: to, to, k: 1, blink: 1 });
    rig.parts.forEach((p, s) => {
      if (p !== 'mouth') ok(JSON.stringify(open[s]) === JSON.stringify(rest[s]), `rig${i}: talking moved the ${p}`);
      if (p !== 'eye') ok(JSON.stringify(shut[s]) === JSON.stringify(rest[s]), `rig${i}: blinking moved the ${p}`);
    });
    // An open mouth is taller than a resting one (unless this mood has none).
    const mi = rig.parts.indexOf('mouth');
    const [, a0, , a1] = bbox(rest[mi]), [, b0, , b1] = bbox(open[mi]);
    if (a1 - a0 > 1) ok(b1 - b0 > a1 - a0, `rig${i}: an open mouth is no taller`);
  }
}
const per = (Date.now() - t0) / 120;
ok(per < 120, `building a rig is too slow: ${per.toFixed(0)}ms`);

// The mouth's script.
const tr = track('Boo! Who?');
ok(tr.segs.length === 6, `track counts letters: ${tr.segs.length}`);
ok(tr.events.some((e) => e.kind === 'hop') && tr.events.some((e) => e.kind === 'tilt'), '"!" hops and "?" tilts');
ok(tr.segs[0].open < 0, 'b presses the lips shut');
ok(tr.segs[1].round > 0.8, 'o rounds the mouth');
ok(track('eee').segs.every((s) => s.round < 0.2), 'e spreads it');
const mid = tr.segs[1];
ok(mouthAt(tr, mid.t + mid.dur / 2).open > 0.5, 'mid-vowel the mouth is open');
ok(mouthAt(tr, tr.dur + 1).open === 0, 'after the line the mouth rests');
ok(track('x'.repeat(5000)).segs.length <= 400, 'a long line is capped');
let r = 1;
const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 200; i++) { const b = babble(rand); ok(/^[A-Z][a-z ]+[.!?]+$/.test(b) && track(b).dur > 0.2, `babble: ${b}`); }

// Palettes mix.
ok(mixPalette(PALETTES.classic, PALETTES.sad, 0).join() === PALETTES.classic.join(), 'mix at 0 is the first palette');
ok(mixPalette(PALETTES.classic, PALETTES.sad, 1).join() === PALETTES.sad.join(), 'mix at 1 is the second');

console.log(`${failed ? '✗' : '✓'} pumpkin rig: ${passed} passed, ${failed} failed (${per.toFixed(0)}ms a rig)`);
process.exit(failed ? 1 : 0);
