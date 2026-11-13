// Mozzie, council 2. node proposals/mozzie-log.mjs [days=1]
// Question: Bath+Keyholder log every reading (1 s) so replay can reproduce decisions.
// How big is a day of that log, and how long does replaying it from t=0 take?
// Plant: Modulo's assumed bath; bang-bang +/-0.3 K; one log line per reading and per decision.
import { Sim } from '../tools/des/des.mjs';
const days = +(process.argv[2] || 1), END = days * 86400;
const C = 5 * 4186, P = 1000, UA = 8, AMB = 20, SET = 60, H = 0.3;
function record() {                     // the "live" run: plant injects, controller decides, all logged
  const sim = new Sim({ seed: 1 }), log = []; let T = 20, heat = 0;
  sim.process(function* plant() { for (;;) { T += (P * heat - UA * (T - AMB)) / C;
    const r = Math.round((T + 0.17 * (sim.random() - 0.5)) * 16) / 16; log.push({ t: sim.now, k: 'temp', v: r });
    sim.inject('temp', r); yield sim.timeout(1); } });
  sim.process(function* ctl() { for (;;) { const r = yield sim.signal('temp'); const w = r < SET - H ? 1 : r > SET + H ? 0 : heat;
    if (w !== heat) { heat = w; log.push({ t: sim.now, k: 'dec', v: w }); } } });
  sim.run({ until: END }); return log;
}
function replay(log) {                  // feed logged readings back, compare decisions one for one
  const sim = new Sim({ seed: 1 }), out = []; let heat = 0;
  const temps = log.filter(e => e.k === 'temp');
  sim.process(function* feed() { for (const e of temps) { if (e.t > sim.now) yield sim.timeout(e.t - sim.now); sim.inject('temp', e.v); yield sim.timeout(0); } });
  sim.process(function* ctl() { for (;;) { const r = yield sim.signal('temp'); const w = r < SET - H ? 1 : r > SET + H ? 0 : heat;
    if (w !== heat) { heat = w; out.push({ t: sim.now, k: 'dec', v: w }); } } });
  sim.run({ until: END + 1 }); return out;
}
let t0 = performance.now(); const log = record(); const tRec = performance.now() - t0;
const bytes = log.reduce((s, e) => s + JSON.stringify(e).length + 1, 0);
const decs = log.filter(e => e.k === 'dec');
t0 = performance.now(); const rep = replay(log); const tRep = performance.now() - t0;
const same = rep.length === decs.length && rep.every((e, i) => e.t === decs[i].t && e.v === decs[i].v);
console.log(JSON.stringify({ days, entries: log.length, decisions: decs.length, MB: +(bytes / 1e6).toFixed(2),
  MB_per_year: +(bytes / 1e6 / days * 365).toFixed(0), record_ms: Math.round(tRec), replay_ms: Math.round(tRep),
  replay_s_per_year_est: +(tRep / days * 365 / 1000).toFixed(0), replay_identical: same }));
