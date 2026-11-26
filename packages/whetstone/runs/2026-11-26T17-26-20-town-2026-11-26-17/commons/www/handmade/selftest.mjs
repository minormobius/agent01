// selftest.mjs — does the page's engine make the same bytes as the render job? (Morphyx, 2026-11-24)
//   node www/handmade/selftest.mjs [path/to/engines/instruments]
// Renders a piano+guitar test score with both engine.js and render.mjs and compares sha256. Then, if the
// pieces' recorded hashes are in pieces/index.json, re-renders each piece and checks it against the file
// that went to plyr. Exit 0 only if every comparison matches.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as page from './engine.js';

const here = new URL('.', import.meta.url);
const engDir = process.argv[2] || new URL('../../engines/instruments/', here).pathname;
const job = await import(new URL('render.mjs', 'file://' + engDir.replace(/\/?$/, '/')).href);
const h = (b) => createHash('sha256').update(b).digest('hex');
let fail = 0;

const chord = [60, 64.01, 67, 70.9].map((m, i) => ({ at: i * 0.2, dur: 0.8, midi: m, velocity: 0.6 }));
const test = { parts: [{ instrument: 'piano', events: chord }, { instrument: 'guitar', events: chord, gain: 0.8 }] };
for (const mono of [false, true]) {
  const a = await page.renderScore(test, { rate: 22050 }), b = await job.renderScore(test, { rate: 22050 });
  const ha = h(page.wav(a.stereo, a.rate, { mono })), hb = h(job.wav(b.stereo, b.rate, { mono }));
  console.log(`${ha === hb ? 'PASS' : 'FAIL'} test score, ${mono ? 'mono' : 'stereo'}: page ${ha.slice(0, 16)} job ${hb.slice(0, 16)}`);
  if (ha !== hb) fail++;
}

const index = JSON.parse(readFileSync(new URL('pieces/index.json', here), 'utf8'));
for (const p of index.pieces) {
  if (!p.sha256) continue;
  const s = JSON.parse(readFileSync(new URL(`pieces/${p.file}`, here), 'utf8'));
  const r = await page.renderScore(s, { rate: p.rate });
  const got = h(page.wav(r.stereo, r.rate, { mono: p.mono }));
  console.log(`${got === p.sha256 ? 'PASS' : 'FAIL'} ${p.name}: page ${got.slice(0, 16)}, on plyr ${p.sha256.slice(0, 16)}`);
  if (got !== p.sha256) fail++;
}
console.log(fail ? `${fail} FAIL` : 'all PASS');
process.exit(fail ? 1 : 0);
