#!/usr/bin/env node
// build-pdoom.mjs — compile the P(doom) video's dance for each dancer's own body, and check
// it frame by frame through the whole song.
//
//   node studio/tools/build-pdoom.mjs            # write studio/pdoom/dance.json + report.json
//   node studio/tools/build-pdoom.mjs --check    # exit 1 if dance.json is stale
//   node studio/tools/build-pdoom.mjs --fps 12   # the checks' frame rate (default 8)
//
// Compiling clears every arm shape against the dancer's body with a solver (choreo.js),
// seconds per dancer, too slow for a page load, so the page plays what this writes.
// The report is the benchmark: every check, its worst frame, and where in the song.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeRig } from '../../packages/figure/lib/rig.js';
import { compileDance, packKeys } from '../../packages/figure/lib/choreo.js';
import { checkDance } from '../../packages/figure/lib/check.js';
import { SONG, CAST, LEAD, CREW_DANCE } from '../pdoom/show.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'pdoom');
const argv = process.argv.slice(2);
const fps = Number(argv[argv.indexOf('--fps') + 1]) || 8;

const dancers = CAST.map((c) => {
  const rig = makeRig(c.spec);
  const script = c.lead ? LEAD : CREW_DANCE;
  const D = compileDance(rig, script, { home: c.home, mirror: !!c.mirror });
  return { name: c.name, home: c.home, facing: 0, keys: packKeys(D.keys) };
});
const dance = JSON.stringify({ song: { bpm: SONG.bpm, t0: SONG.t0, bars: SONG.bars }, dancers });

if (argv.includes('--check')) {
  let old = '';
  try { old = await readFile(join(out, 'dance.json'), 'utf8'); } catch {}
  if (old !== dance) { console.log('✗ studio/pdoom/dance.json is stale: node studio/tools/build-pdoom.mjs'); process.exit(1); }
  console.log('✓ studio/pdoom/dance.json is current'); process.exit(0);
}
await writeFile(join(out, 'dance.json'), dance);
console.log(`dance.json: ${dancers.length} dancers, ${dancers.reduce((s, d) => s + d.keys.length, 0)} keyframes, ${(dance.length / 1024).toFixed(0)} KB`);

// the report card: every check, for every dancer, over the whole song
const report = { fps, generated: new Date().toISOString().slice(0, 10), dancers: [] };
let failed = 0;
for (const [i, c] of CAST.entries()) {
  const t = Date.now();
  // what plays: the dance alive, with the same seed the page gives this dancer
  const res = checkDance(c.spec, c.lead ? LEAD : CREW_DANCE, { bpm: SONG.bpm, fps, home: c.home, mirror: !!c.mirror, seed: i });
  const bad = res.filter((x) => !x.ok);
  failed += bad.length;
  report.dancers.push({ name: c.name, frames: res.frames, checks: res.map(({ name, ok, value, limit, detail }) => ({ name, ok, value, limit, detail })) });
  console.log(`${c.name}: ${res.length - bad.length}/${res.length} over ${res.frames} frames (${((Date.now() - t) / 1000).toFixed(0)} s)`);
  for (const x of bad) console.log(`  ✗ ${x.name}  ${x.value}  (${x.limit})  ${x.detail}`);
}
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(failed ? `${failed} check(s) failing: see report.json` : 'every check holds through the whole song');
