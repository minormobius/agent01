// bzip.selftest.mjs — node, over the ABI of the module being shipped.
//
//   node henderhead/bzip/bzip.selftest.mjs
//
// The Rust suite holds the compressor to the reference binary. This holds the
// page to its prose: every claim in the "What it finds" section is measured
// here, on the same pixels the page draws, through the same wasm it loads.
// If a change to the dex or the engine moves a number the prose relies on,
// this fails and the prose has to be re-made — not the threshold.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fromBytes } from './engine.js';
import * as C from './critters.js';

const here = dirname(fileURLToPath(import.meta.url));
const wasm = readFileSync(join(here, 'bzncd.wasm'));
const eng = fromBytes(wasm);

let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  ok' : 'FAIL'}  ${msg}`);
  if (!cond) failed++;
};

// --- the module ----------------------------------------------------------

{
  const imports = WebAssembly.Module.imports(new WebAssembly.Module(wasm));
  ok(imports.length === 0, `no imports (${imports.length})`);
  ok(wasm.length < 64 * 1024, `module is ${(wasm.length / 1024).toFixed(0)} KB`);
}

// --- the dex -------------------------------------------------------------

const dex = C.makeDex(151, 1);
const n = dex.critters.length;
ok(n === 151, `151 critters (${n})`);
ok(dex.lines.length === 24 + 30 + 19, `${dex.lines.length} lines`);
ok(dex.critters.every((c) => c.px.length === 56 * 56 && c.px.every((v) => v <= 3)), 'every sprite is 56×56 in four shades');
ok(dex.critters.every((c) => C.ink(c.px) > 0.02), 'no sprite is blank');
ok(dex.critters.every((c) => [...Array(56).keys()].every((i) => !c.px[i] && !c.px[i * 56] && !c.px[i * 56 + 55])), 'nothing runs off the top or the sides of the frame');
ok(new Set(dex.critters.map((c) => c.name)).size === n, 'names are unique');
{
  const again = C.makeDex(151, 1);
  ok(again.critters.every((c, i) => c.px.every((v, k) => v === dex.critters[i].px[k])), 'the dex is a pure function of its seed');
}
{
  // first forms smaller than last, as drawn; equal when growth is 0
  const grown = dex.lines.filter((l) => l.len > 1).every((l) => C.ink(dex.critters[l.members[0]].px) < C.ink(dex.critters[l.members[l.len - 1]].px));
  ok(grown, 'every first form has less ink than its last form');
  const flat = C.makeDex(151, 0);
  ok(flat.lines.every((l) => l.members.every((m) => flat.critters[m].frame === flat.critters[l.members[l.len - 1]].frame)), 'growth 0 draws every stage at the last form\'s size');
}

// --- the compressor, across the seam ----------------------------------------

{
  const px = dex.critters[0].px;
  const z = eng.bzip2(px);
  ok(z.length === eng.bzLen(px), `bzip2() and bzLen() agree (${z.length} bytes)`);
  ok(String.fromCharCode(...z.slice(0, 4)) === 'BZh9', 'it is a bzip2 -9 stream');
  let ref = null;
  try {
    ref = execFileSync('bzip2', ['-dc'], { input: Buffer.from(z) });
  } catch {
    console.log('  --  no bzip2 binary on PATH; the round trip is the Rust suite\'s job');
  }
  if (ref) ok(Buffer.compare(ref, Buffer.from(px)) === 0, 'the reference bzip2 -d gives back the sprite');
  try {
    const want = execFileSync('bzip2', ['-9c'], { input: Buffer.from(px) });
    ok(Buffer.compare(want, Buffer.from(z)) === 0, 'and bzip2 -9 makes the same bytes from it');
  } catch { /* reported above */ }
}

// --- the matrix ------------------------------------------------------------

function bzipScore(d, rep = 'raw', both = false) {
  eng.build(d.critters.map((c) => C.REPRESENTATIONS[rep].of(c.px)), both);
  let done = 0;
  while (done < eng.totalPairs()) done = eng.step(997);
  const D = eng.ncd(d.critters.length);
  return { D, ...C.score(d, D) };
}

const raw = bzipScore(dex);
{
  let nan = 0, diag = 0, sym = true;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = raw.D[i * n + j];
    if (i === j) { if (Number.isNaN(v)) diag++; continue; }
    if (Number.isNaN(v)) nan++;
    if (v !== raw.D[j * n + i]) sym = false;
  }
  ok(nan === 0 && diag === n, 'every pair computed, diagonal left undefined');
  ok(sym, 'one order is symmetric');
  const q = eng.query(dex.critters[5].px, n);
  ok(Math.abs(q[9] - raw.D[5 * n + 9]) < 1e-6, 'query() of a member gives its own row');
}

// --- the claims on the page --------------------------------------------------

const p = (x) => `${(x * 100).toFixed(1)}%`;
console.log(`\n  default dex: bzip picks a relative ${p(raw.hitRate)}, chance ${p(raw.chance)}, hub picked ${raw.hubCount}×`);

ok(raw.chance > 0.008 && raw.chance < 0.011, `chance is about 1%, as his was (${p(raw.chance)})`);
ok(raw.hitRate > 3 * raw.chance && raw.hitRate < 6 * raw.chance, `"four or five times as often as chance" (${(raw.hitRate / raw.chance).toFixed(1)}×)`);

const agree = C.inkAgreement(dex, raw.nearest);
ok(agree < 0.2, `"around the 14th percentile" by ink (${p(agree)})`);

const flat = bzipScore(C.makeDex(151, 0));
ok(flat.hitRate > 0.18 && flat.hitRate > 4 * raw.hitRate, `growth none: "about 4% to over 20%" (${p(flat.hitRate)})`);

ok(raw.hubCount >= 6, `"seven to nine times over" (${raw.hubCount})`);
ok(C.inkPercentile(dex, raw.hub) < 0.5, `the hub is on the emptier side (fuller than ${p(C.inkPercentile(dex, raw.hub))})`);

const inkOnly = C.score(dex, C.BASELINES.ink.dist(dex));
ok(inkOnly.hitRate <= 0.02, `ink only almost never finds a relative (${p(inkOnly.hitRate)})`);

// across seeds, the two claims made for "every seed we have tried"
const seeds = [151, 7, 42, 1000, 2026, 31337];
let fitShort = 0, flatWins = 0, pixFlatWins = 0, hubsEmpty = 0, beatsChance = 0;
for (const s of seeds) {
  const d = C.makeDex(s, 1);
  const a = bzipScore(d, 'raw'), f = bzipScore(d, 'fitted');
  const z = C.makeDex(s, 0), b = bzipScore(z, 'raw');
  const pz = C.score(z, C.BASELINES.pixels.dist(z));
  if (a.hitRate > 3 * a.chance) beatsChance++;
  if (b.hitRate > 2.5 * a.hitRate) flatWins++;
  if (f.hitRate < 0.5 * b.hitRate) fitShort++;
  if (pz.hitRate >= b.hitRate) pixFlatWins++;
  if (C.inkPercentile(d, a.hub) < 0.5) hubsEmpty++;
  console.log(`  seed ${String(s).padStart(5)}: raw ${p(a.hitRate)}  fitted ${p(f.hitRate)}  no growth ${p(b.hitRate)}  pixels/no growth ${p(pz.hitRate)}  hub ${a.hubCount}× at ${p(C.inkPercentile(d, a.hub))} ink`);
}
ok(beatsChance === seeds.length, `several times chance on every seed (${beatsChance}/${seeds.length})`);
ok(flatWins === seeds.length, `drawing every stage the same size roughly triples it, every seed (${flatWins}/${seeds.length})`);
ok(fitShort === seeds.length, `rescaling to fit gets nowhere near that, every seed (${fitShort}/${seeds.length})`);
ok(pixFlatWins >= seeds.length - 1, `pixel by pixel does better than bzip once sizes are equal (${pixFlatWins}/${seeds.length})`);
ok(hubsEmpty >= seeds.length - 1, `"tends to be on the small and empty side" (${hubsEmpty}/${seeds.length})`);

console.log(failed ? `\n${failed} FAILED` : '\nall good');
process.exit(failed ? 1 : 0);
