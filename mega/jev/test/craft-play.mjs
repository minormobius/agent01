#!/usr/bin/env node
// craft-play.mjs — play a craft world headlessly and write its stream.
//
//   node mega/jev/test/craft-play.mjs                       # penrose, seed 3, baseline policy
//   node mega/jev/test/craft-play.mjs --shape truncsq --seed 9 --days 2
//   node mega/jev/test/craft-play.mjs --out run.jsonl       # the stream, for the viewer's "load stream"
//   node mega/jev/test/craft-play.mjs --ascii 400           # a top-down text frame every 400 ticks
//
// Prints one line per macro (what the policy chose, how it went), the
// milestones with their tick, and a closing text frame. Offline; no key.
import { writeFileSync } from 'node:fs';
import { Sim, DAY } from '../craft/sim.mjs';
import { play } from '../craft/runner.mjs';
import { renderAscii, LEGEND } from '../craft/ascii.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const shape = arg('shape', 'penrose'), seed = +arg('seed', 3), days = +arg('days', 3);
const out = arg('out', null), every = +arg('ascii', 0);

const sim = new Sim({ shape, seed });
const lines = [];
let nextFrame = every;
const t0 = performance.now();
const r = play(sim, undefined, {
  maxTicks: DAY * days,
  onMacro: (m) => {
    lines.push(...sim.drain());
    const p = sim.player;
    console.log(`${String(m.tick).padStart(6)}  ${m.name.padEnd(16)} ${(m.args ? JSON.stringify(m.args) : '').padEnd(28)} ${m.ok ? 'ok' : 'FAIL  ' + m.why}  (y ${p.y}, hp ${p.hp}, food ${p.food})`);
    if (every && sim.tick >= nextFrame) { console.log(renderAscii(sim, { w: 72, h: 22 })); nextFrame = sim.tick + every; }
  },
});
lines.push(...sim.drain());
const ms = performance.now() - t0;
console.log('\n' + renderAscii(sim, { w: 72, h: 24 }) + '\n' + LEGEND + '\n');
console.log('milestones:', Object.entries(r.milestones).map(([k, t]) => `${k}@${t}`).join('  ') || 'none');
console.log(`ticks ${r.tick} (${(r.tick / DAY).toFixed(2)} days) · deaths ${r.stats.deaths} · kills ${JSON.stringify(r.stats.kills)} · ${lines.length} stream lines · ${ms.toFixed(0)} ms`);
console.log('inventory:', JSON.stringify(sim.inv));
if (out) { writeFileSync(out, lines.join('\n') + '\n'); console.log('stream written to', out); }
