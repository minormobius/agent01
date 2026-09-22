// swarm-density.mjs — where fluoddity comes alive, and where the token budget
// puts us on that axis.
//
//   node mega/jev/eval/swarm-density.mjs --organism wurms01 --steps 400
//
// This is the measurement the page needed for three revisions and kept
// arguing from theory instead. One typed question per particle caps the model
// arm at 256 particles; fluoddity's own lowest quality preset is 80,000 and
// its playground default is 200,000. The question is not whether 256 is fewer
// — it is whether 256 is on the same part of the curve at all.
//
// Everything here is the deterministic rule. No model calls.
import { readFileSync, writeFileSync } from 'node:fs';
import { makeSwarm, senseAll, step, probe, orderOf, ruleDecider } from '../swarm/swarm.mjs';
import { DEFAULT_CFG } from '../swarm/rule.mjs';
import { verdict, fitness2 } from '../swarm/probe.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const STEPS = Number(arg('steps', 400));
const DIM = Number(arg('dim', 360));
const NAME = arg('organism', 'wurms01');
const OUT = arg('out', null);
const COUNTS = (arg('counts', '256,512,1024,2048,4096,8192,16384,40000')).split(',').map(Number);
const SUB = arg('substrate', 'match');           // 'match' | '1'

const gal = JSON.parse(readFileSync(new URL('../lab/fluoddity-gallery.json', import.meta.url)));
const org = gal.organisms.find((o) => (o.name || '').toLowerCase() === NAME.toLowerCase())
  || gal.organisms.find((o) => o.rkey === NAME);
if (!org) { console.error(`no organism "${NAME}"`); process.exit(1); }
const cfg = { ...DEFAULT_CFG, ...org.config };

console.log(`"${org.name}" (${org.rkey}), seed ${cfg.rule_seed}, ${STEPS} steps, dim ${DIM}, substrate ${SUB}\n`);
console.log('particles   verdict      fill   struct   fitness2   dispersal   |v| mean   wall');
const rows = [];
for (const n of COUNTS) {
  const t0 = Date.now();
  const sw = makeSwarm({ n, dim: DIM, cfg, substrate: SUB === '1' ? 1 : null });
  let prev = null, v = null;
  for (let t = 1; t <= STEPS; t++) {
    const s = senseAll(sw);
    step(sw, s, ruleDecider(sw, s));
    if (t === STEPS - 1) prev = probe(sw);
  }
  v = probe(sw);
  const o = orderOf(sw);
  const c = sw.field.canvas;
  let sum = 0; for (let i = 0; i < DIM * DIM; i++) sum += Math.hypot(c[i * 2], c[i * 2 + 1]);
  const row = { n, verdict: verdict(v, false), fill: v.fill, struct: v.struct,
    fitness2: fitness2(prev, v), dispersal: o.dispersal, vmean: sum / (DIM * DIM),
    seconds: (Date.now() - t0) / 1000 };
  rows.push(row);
  console.log(`${String(n).padStart(9)}   ${row.verdict.padEnd(10)} ${row.fill.toFixed(3)}   ${row.struct.toFixed(2)}` +
    `     ${row.fitness2.toFixed(4)}      ${row.dispersal.toFixed(4)}   ${row.vmean.toExponential(2)}   ${row.seconds.toFixed(0)}s`);
}
const alive = rows.find((r) => r.verdict === 'alive' || r.verdict === 'boiling');
console.log(alive ? `\nfirst non-dead/sparse/frozen reading at n = ${alive.n}.`
  : '\nnothing in this range read alive.');
console.log('For scale: fluoddity\'s playground defaults to 200,000 and its LOWEST quality preset is 80,000.');
if (OUT) { writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), organism: org, steps: STEPS, dim: DIM, substrate: SUB, rows }, null, 1));
  console.log(`wrote ${OUT}`); }
