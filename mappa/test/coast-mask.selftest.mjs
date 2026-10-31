// coast-mask.selftest.mjs — a One Coast world as a land mask for generateWorld.
//
//   1. With a mask, mappa's land and sea follow it: most cells agree with the
//      mask's vote, and the land fraction matches.
//   2. Deterministic: same token + seed → same world.
//   3. Without a mask nothing changes (climate.selftest.mjs's checksums are
//      the proof; this file only checks the mask path).
//
// Run: node mappa/test/coast-mask.selftest.mjs   (from the repo root)
import { generateWorld } from '../engine.js';
import { coastMask } from '../lib/coast-mask.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const C = globalThis.COAST;

for (const name of ['c80', 'c240']) {
  const s = C.sphere(name), world = C.generate(s, { seed: 'mappa-' + name });
  const mask = coastMask(C.encode(s, world));
  const w = generateWorld(4242, { N: 5000, landmask: mask });
  let agree = 0, landCells = 0, area = 0, landArea = 0;
  for (let i = 0; i < w.N; i++) {
    const land = w.water[i] === 0, vote = mask.field(w.V[i]) > 0;
    if (land === vote) agree++;
    area += w.area[i]; if (w.elev[i] > 0) landArea += w.area[i];
    if (land) landCells++;
  }
  const frac = agree / w.N;
  ok(frac > 0.85, `${name}: mappa land/sea agrees with the One Coast mask on ${(100 * frac).toFixed(1)}% of ${w.N} cells`);
  ok(Math.abs(landArea / area - mask.land) < 0.05, `${name}: land fraction ${(landArea / area).toFixed(3)} vs mask ${mask.land.toFixed(3)}`);
  const w2 = generateWorld(4242, { N: 5000, landmask: coastMask(C.encode(s, world)) });
  let same = w2.N === w.N; for (let i = 0; same && i < w.N; i++) if (w2.elev[i] !== w.elev[i]) same = false;
  ok(same, `${name}: same token and seed give the same world`);
}
console.log(fail ? `\n✗ ${fail} failed` : `\n✓ all green — ${pass} passed, 0 failed`);
if (fail) process.exit(1);
