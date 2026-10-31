// bursts.mjs — what the household's hour of polls says about GONE_S. (Morphyx, tape day 2)
//
//   node shelf/bursts.mjs polls.txt            one poll per line: "<t seconds> <uid or ->" (tab, space or comma)
//   node shelf/bursts.mjs polls.json           or [{ t, read }] with read null | { uid } | { crowd: true }
//   [--budget N]  false gones per 1000 h the household accepts (default 1)
//   node shelf/bursts.mjs --fake P BURST [H]   a made-up Gilbert reader: P of polls missed, mean miss run BURST polls, H hours
//
// It only looks at stretches where ONE card sat still: from a good read of it to the next good
// read of the same card. The gaps between those reads are what a debounce has to sit above.
// It prints the miss rate, the run-length table, the longest gap, and for each GONE_S from
// 0.50 to 1.25 s: false "gone"s seen in the hour, and the number a geometric tail fitted to the
// runs predicts per 1,000 hours (about two years of evenings). The box's rule is the same as
// tape1.mjs: a read at exactly lastGood + GONE_S is too late.
//
// The point: the miss RATE doesn't decide this. The RUN LENGTH does. If no GONE_S ≤ 1.25 s
// passes, no code fixes it. The plate, the antenna or the card's resting place has to change.
import { readFileSync } from 'node:fs';

function load(path) {
  const text = readFileSync(path, 'utf8');
  if (/^\s*\[/.test(text)) return JSON.parse(text).map(({ t, read }) => ({ t: +t, id: read && read.uid ? String(read.uid).toLowerCase() : read && read.crowd ? '*crowd*' : null }));
  return text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
    const [t, u, how] = l.trim().split(/[\t ,]+/);
    return { t: +t, id: !u || u === '-' || u === 'null' ? null : u.toLowerCase(), torn: how === 'torn' };
  });
}

function fake(p, burst, hours, seed = 1) {
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  // two-state chain: leave a miss run with prob 1/burst; enter one so that the stationary share is p
  const out = 1 / burst, into = (p * out) / (1 - p);
  const polls = []; let miss = false;
  for (let i = 0; i < hours * 3600 * 20; i++) { miss = miss ? rnd() >= out : rnd() < into; polls.push({ t: i / 20, id: miss ? null : 'card' }); }
  return polls;
}

const argv = process.argv.slice(2);
const bi = argv.indexOf('--budget');
// false gones per 1000 h the household will accept. 1 ≈ one stray pause in two years. Their call, not ours.
const budget = bi >= 0 ? +argv[bi + 1] : 1;
const args = bi >= 0 ? argv.filter((_, i) => i !== bi && i !== bi + 1) : argv;
const polls = args[0] === '--fake' ? fake(+args[1], +args[2], +(args[3] || 1)) : load(args[0]);
if (!polls.length) { console.log('no polls'); process.exit(1); }

const dt = (() => { const d = []; for (let i = 1; i < polls.length; i++) d.push(polls[i].t - polls[i - 1].t); d.sort((a, b) => a - b); return d[d.length >> 1] || 0.05; })();
const gaps = [];            // seconds between consecutive good reads of the same card
const runs = new Map();     // miss-run length (polls) → count
let last = null, run = 0, misses = 0, inStill = 0;
for (const p of polls) {
  if (p.id === null) { if (last) { run++; misses++; inStill++; } continue; }
  if (last && p.id === last.id) { gaps.push(p.t - last.t); inStill++; if (run) runs.set(run, (runs.get(run) || 0) + 1); }
  run = 0; last = p.id === '*crowd*' ? null : p;
}
const hours = (polls[polls.length - 1].t - polls[0].t) / 3600;
const nRuns = [...runs.values()].reduce((a, b) => a + b, 0);
const meanRun = nRuns ? [...runs].reduce((a, [k, c]) => a + k * c, 0) / nRuns : 0;
const q = meanRun > 1 ? 1 - 1 / meanRun : 0;      // geometric: P(run continues)
const longest = gaps.reduce((m, x) => (x > m ? x : m), 0); // not Math.max(...gaps): that overflows the stack past ~1e5 reads (Modulo, day 3)

console.log(`polls ${polls.length}  poll interval ≈ ${dt.toFixed(3)} s  hours ${hours.toFixed(2)}`);
console.log(`while a card sat still: ${inStill} polls, ${(100 * misses / Math.max(1, inStill)).toFixed(1)}% missed, ${nRuns} miss runs, mean run ${meanRun.toFixed(2)} polls`);
console.log(`longest gap between good reads: ${longest.toFixed(3)} s`);
// Third field `torn` (Modulo, day 3): uid read but the tape record didn't. Mid-sitting the box treats
// it as a miss (D-tornread); counted here as a read. On a *placing* read it would make a phantom card.
const tornN = polls.filter((p) => p.torn).length, readN = polls.filter((p) => p.id).length;
if (tornN) console.log(`torn reads (uid without record): ${tornN} of ${readN} reads = ${(tornN / readN).toExponential(2)} — the chance a card set down binds as a phantom`);
console.log('run length (polls) : count');
for (const [k, c] of [...runs].sort((a, b) => a[0] - b[0])) console.log(`  ${String(k).padStart(4)} : ${c}`);
console.log('\nGONE_S  seen-in-data  predicted/1000h');
let pick = null;
for (let g = 0.5; g <= 1.25 + 1e-9; g += 0.05) {
  const seen = gaps.filter((x) => x >= g - 1e-9).length;
  const k = Math.ceil(g / dt - 1e-9) - 1;          // misses in a row that make the gap reach g
  const perRun = q ? q ** Math.max(0, k - 1) : (k <= 1 ? 1 : 0);
  const pred = hours > 0 ? (nRuns / hours) * perRun * 1000 : NaN;
  if (pick === null && seen === 0 && pred < budget) pick = g;
  console.log(`  ${g.toFixed(2)}   ${String(seen).padStart(6)}        ${pred < 1e-3 ? pred.toExponential(1) : pred.toFixed(3)}`);
}
console.log(pick === null
  ? '\nVERDICT: no GONE_S up to 1.25 s holds a still card. That is the plate or antenna, not the code: fix the hardware before printing.'
  : `\nVERDICT: smallest GONE_S with no false gone in the data and < ${budget} predicted per 1000 h: ${pick.toFixed(2)} s (box uses 1.00).`);
process.exit(pick === null ? 2 : 0);
