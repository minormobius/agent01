#!/usr/bin/env node
// build-pdoom.mjs — compile the P(doom) video's dance for each dancer's own body, and check
// it frame by frame through the whole song.
//
//   node studio/tools/build-pdoom.mjs            # write studio/pdoom/dance.json + report.json
//   node studio/tools/build-pdoom.mjs --check    # exit 1 if dance.json is stale (fast: see below)
//   node studio/tools/build-pdoom.mjs --check --full --stamp   # compile, compare, and record dance.inputs
//   node studio/tools/build-pdoom.mjs --fps 12   # the checks' frame rate (default 8)
//
// Compiling clears every arm shape against the dancer's body with a solver (choreo.js),
// seconds per dancer, too slow for a page load, so the page plays what this writes.
// The report is the benchmark: every check, its worst frame, and where in the song.
//
// --check is fast when nothing it depends on has changed: the build writes `dance.inputs`, a hash of
// every file the compile reads (packages/figure/lib, show.js, this script). If the hash matches, the
// dance is current without compiling (the compile is deterministic). If it differs, --check compiles
// and compares, as it always did, so a stale dance can never pass; --check --full always compiles.

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

const inputsHash = async () => {
  const { createHash } = await import('node:crypto');
  const { readdir } = await import('node:fs/promises');
  const lib = join(here, '..', '..', 'packages', 'figure', 'lib');
  const files = [...(await readdir(lib)).filter((f) => f.endsWith('.js')).sort().map((f) => join(lib, f)), join(out, 'show.js'), fileURLToPath(import.meta.url)];
  const h = createHash('sha256');
  for (const f of files) h.update(f.slice(f.lastIndexOf('/') + 1)).update(await readFile(f));
  return h.digest('hex');
};
const compile = () => {
  const dancers = CAST.map((c) => {
    const rig = makeRig(c.spec);
    const script = c.lead ? LEAD : CREW_DANCE;
    const D = compileDance(rig, script, { home: c.home, mirror: !!c.mirror });
    return { name: c.name, home: c.home, facing: 0, keys: packKeys(D.keys) };
  });
  return { dancers, dance: JSON.stringify({ song: { bpm: SONG.bpm, t0: SONG.t0, bars: SONG.bars }, dancers }) };
};

if (argv.includes('--check')) {
  let old = '', had = '';
  try { old = await readFile(join(out, 'dance.json'), 'utf8'); } catch {}
  try { had = (await readFile(join(out, 'dance.inputs'), 'utf8')).trim(); } catch {}
  if (old && !argv.includes('--full') && had === await inputsHash()) { console.log('✓ studio/pdoom/dance.json is current (its inputs are unchanged)'); process.exit(0); }
  if (old !== compile().dance) { console.log('✗ studio/pdoom/dance.json is stale: node studio/tools/build-pdoom.mjs'); process.exit(1); }
  if (argv.includes('--stamp')) await writeFile(join(out, 'dance.inputs'), await inputsHash() + '\n');   // the compare just proved it
  console.log(`✓ studio/pdoom/dance.json is current (compiled and compared${argv.includes('--stamp') ? '; dance.inputs written' : '; --stamp to record its inputs'})`); process.exit(0);
}
const { dancers, dance } = compile();
await writeFile(join(out, 'dance.json'), dance);
await writeFile(join(out, 'dance.inputs'), await inputsHash() + '\n');
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
