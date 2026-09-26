#!/usr/bin/env node
// craft-gate.mjs — who plays craft better: Jev, the scripted baseline, or chance?
//
//   node mega/jev/eval/craft-gate.mjs --out mega/jev/lab/craft-gate.json
//   node mega/jev/eval/craft-gate.mjs --worlds penrose:3,hex:2 --ticks 4800 --difficulty hard
//   node mega/jev/eval/craft-gate.mjs --no-jev        # the three local arms only, no calls
//
// Every arm plays the same worlds through the same option set (mind.mjs):
//   jev       the real model through the mega proxy, UNGATED — every pick is its own
//   baseline  the scripted if-ladder, answering over the same options
//   offline   the page's stand-in (the baseline with fake spread)
//   random    uniform over the legal options — the control that says choosing matters
// The score is ticks to each rung of the ladder (a rung not reached counts as
// the tick budget), plus deaths. Survival alone does not separate policies at
// normal difficulty (CLAUDE.md § craft), which is why hard is the default.
//
// SPENDS REAL BUDGET: one call per decision, paced under the proxy's 30/min.
import { writeFileSync } from 'node:fs';
import { Sim } from '../craft/sim.mjs';
import { playMind, jevDecider, DECIDERS, GOALS } from '../craft/mind.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const worlds = arg('worlds', 'penrose:3,hex:2,truncsq:2,kagome:4').split(',').map((w) => { const [shape, seed] = w.split(':'); return { shape, seed: +seed }; });
const ticks = +arg('ticks', 4800), difficulty = arg('difficulty', 'hard'), out = arg('out', null);
const noJev = process.argv.includes('--no-jev');
const ENDPOINT = process.env.JEV_ENDPOINT || 'https://mega.mino.mobi/jev/api/ask';

const raw = jevDecider(ENDPOINT);
let last = 0;
async function jev(...a) {
  for (let attempt = 0; ; attempt++) {
    const wait = 2150 - (Date.now() - last);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try { return await raw(...a); }
    catch (e) {
      if (attempt >= 4 || !(e.status === 429 || e.status >= 500)) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (e.retryAfter || 2 ** attempt * 3)));
    }
  }
}

const RUNGS = GOALS.map(([g]) => g);
const arms = { baseline: DECIDERS.baseline, offline: DECIDERS.offline, random: DECIDERS.random, ...(noJev ? {} : { jev }) };
const results = [];
for (const w of worlds) {
  for (const [arm, decide] of Object.entries(arms)) {
    const sim = new Sim({ ...w, difficulty });
    const t0 = Date.now();
    const log = arm === 'jev' && process.env.CRAFT_TRACE;
    const r = await playMind(sim, decide, { maxTicks: ticks, gate: false, maxDecisions: +arg('max-decisions', 400),
      onDecision: log ? (d) => console.log(`  ${String(d.tick).padStart(5)} ${String(d.choice).padEnd(22)} ${d.confidence?.toFixed(2)} ${d.result}${d.error ? ' ERR ' + d.error : ''}`) : undefined });
    const rung = Object.fromEntries(RUNGS.map((g) => [g, r.milestones[`goal:${g}`] ?? null]));
    const conf = r.decisions.map((d) => d.confidence).filter((c) => c != null);
    const row = {
      ...w, arm, rungs: rung, reached: RUNGS.filter((g) => rung[g] != null).length,
      score: RUNGS.reduce((s, g) => s + (rung[g] ?? ticks), 0) / RUNGS.length,
      deaths: r.stats.deaths, decisions: r.decisions.length,
      ...(arm === 'jev' ? {
        mean_confidence: conf.reduce((a, b) => a + b, 0) / (conf.length || 1),
        below_gate: r.decisions.filter((d) => d.below_gate).length,
        errors: r.decisions.filter((d) => d.error).length,
        mean_have: r.decisions.reduce((a, d) => a + (d.have ?? 0), 0) / (r.decisions.length || 1),
        input_tokens: r.decisions.reduce((a, d) => a + (d.tokens || 0), 0),
        choices: r.decisions.reduce((m, d) => { m[d.choice] = (m[d.choice] || 0) + 1; return m; }, {}),
      } : {}),
      wall_s: Math.round((Date.now() - t0) / 1000),
    };
    results.push(row);
    console.log(`${w.shape}/${w.seed} ${arm.padEnd(8)} rungs ${row.reached}/${RUNGS.length}  mean tick-to-rung ${Math.round(row.score)}  deaths ${row.deaths}  decisions ${row.decisions}` +
      (arm === 'jev' ? `  conf ${row.mean_confidence.toFixed(2)}  below-gate ${row.below_gate}  errors ${row.errors}` : '') + `  ${JSON.stringify(rung)}`);
  }
}
const summary = {};
for (const arm of Object.keys(arms)) {
  const rows = results.filter((r) => r.arm === arm);
  summary[arm] = {
    mean_score: Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length),
    rungs_reached: rows.reduce((a, r) => a + r.reached, 0) + '/' + rows.length * RUNGS.length,
    deaths: rows.reduce((a, r) => a + r.deaths, 0),
  };
}
console.log('\nsummary (mean ticks-to-rung, lower is better; an unreached rung counts as the budget):');
for (const [arm, s] of Object.entries(summary)) console.log(`  ${arm.padEnd(8)} ${String(s.mean_score).padStart(6)}  rungs ${s.rungs_reached}  deaths ${s.deaths}`);
if (out) writeFileSync(out, JSON.stringify({ ran: new Date().toISOString(), ticks, difficulty, rungs: RUNGS, worlds, summary, results }, null, 2) + '\n');
