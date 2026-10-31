// eval/craft-arena-jev.mjs — Jev in the arena, head to head.
//
//   node mega/jev/eval/craft-arena-jev.mjs --vs baseline,rusher,counter --shapes hex,kagome --seeds 11,12 [--out mega/jev/lab/craft-arena-jev.json]
//   node mega/jev/eval/craft-arena-jev.mjs --stub      # the same loop, no calls: a stand-in answers with the baseline's pick
//
// Every opponent is played once from each side on every world, so a map's
// lean cancels. Jev reads arenaState/arenaOptions (arena-mind.mjs) and picks
// ungated; a failed call falls back to the baseline for that decision and is
// counted. SPENDS REAL BUDGET without --stub: one call per decision, paced
// under the proxy's 30/min (~15–30 decisions a side per match).
import { writeFileSync, appendFileSync } from 'node:fs';
import { playMatchAsync, baselineArena } from '../craft/arena.mjs';
import { jevArena, arenaOptions } from '../craft/arena-mind.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const vs = arg('vs', 'baseline,rusher,counter').split(',');
const shapes = arg('shapes', 'hex,kagome,penrose,truncsq').split(',');
const seeds = arg('seeds', '11').split(',').map(Number);
const maxDecisions = +arg('max-decisions', 150);
const out = arg('out', null), stub = process.argv.includes('--stub') ? {} : null;
const wilson = (k, n, z = 1.96) => { if (!n) return [0, 1]; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [+((c - h) / d).toFixed(3), +((c + h) / d).toFixed(3)]; };
const ENDPOINT = process.env.JEV_ENDPOINT || 'https://mega.mino.mobi/jev/api/ask';

let last = 0, calls = 0, failures = 0;
async function ask(state, questions) {
  if (stub) {
    // the stand-in: whatever the baseline would do, as the option it maps to
    const opts = Object.keys(questions.next.criteria);
    return { source: 'stub', answers: { next: { choice: stub.pick && opts.includes(stub.pick) ? stub.pick : opts[0], confidence: 1 }, have: { noul: 1 } } };
  }
  for (let attempt = 0; ; attempt++) {
    const wait = 2150 - (Date.now() - last);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    calls++;
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, questions }) });
      const body = await res.json().catch(() => ({ error: 'unreadable response' }));
      if (!res.ok) { const e = new Error(body.error || `HTTP ${res.status}`); e.status = res.status; e.retryAfter = body.retry_after_s; throw e; }
      return body;
    } catch (e) {
      if (attempt >= 4 || !(e.status === 429 || e.status >= 500 || !e.status)) { failures++; throw e; }
      await new Promise((r) => setTimeout(r, 1000 * (e.retryAfter || 2 ** attempt * 3)));
    }
  }
}

const games = [], picks = {}, confs = [], haves = [];
let fallbacks = 0;
const jev = jevArena(ask, { onDecision: (rec) => {
  picks[rec.chose] = (picks[rec.chose] || 0) + 1;
  if (rec.conf != null) confs.push(rec.conf);
  if (rec.have != null) haves.push(rec.have);
  if (/fallback/.test(rec.source)) fallbacks++;
} });
// in --stub mode the stand-in needs the baseline's pick mapped to an option key
const jevOrStub = stub ? async (sim, m) => {
  const b = sim.as(m.e, () => baselineArena(sim));
  const opts = sim.as(m.e, () => arenaOptions(sim));
  const hit = b && opts.find((o) => o.name === b.name && JSON.stringify(o.args || {}) === JSON.stringify(b.args || {})) || (b && opts.find((o) => o.name === b.name));
  stub.pick = hit ? hit.key : null;
  return jev(sim, m);
} : jev;
const t0 = Date.now();
for (const shape of shapes) for (const seed of seeds) for (const opp of vs) for (const jevSide of [0, 1]) {
  const policies = jevSide === 0 ? [jevOrStub, opp] : [opp, jevOrStub];
  const mark = { calls, picks: { ...picks }, nconf: confs.length };
  const r = await playMatchAsync({ seed, shape, policies, maxDecisions });
  const w = r.result.winner;
  const g = { shape, seed, opponent: opp, jevSide, result: w == null ? 'draw' : w === jevSide ? 'win' : 'loss', reason: r.result.reason, ticks: r.result.tick, kills: r.result.kills, decisions: r.decisions };
  // this match's own picks and confidence, so a run stopped midway keeps what it measured
  g.picks = Object.fromEntries(Object.entries(picks).map(([k, n]) => [k, n - (mark.picks[k] || 0)]).filter(([, n]) => n));
  g.calls = calls - mark.calls; const cs = confs.slice(mark.nconf); g.mean_conf = cs.length ? +(cs.reduce((a, b) => a + b, 0) / cs.length).toFixed(3) : null;
  games.push(g);
  if (out) appendFileSync(out.replace(/\.json$/, '.jsonl'), JSON.stringify(g) + '\n');
  console.log(`${shape.padEnd(9)} ${seed} jev(side ${jevSide}) v ${opp.padEnd(8)} -> ${g.result} (${g.reason}, ${g.ticks} ticks, decisions ${g.decisions.join('/')}) ${((Date.now() - t0) / 60000).toFixed(1)} min, ${calls} calls`);
}
const byOpp = {};
for (const g of games) {
  const o = byOpp[g.opponent] ||= { n: 0, wins: 0, draws: 0, losses: 0 };
  o.n++; o[g.result === 'win' ? 'wins' : g.result === 'draw' ? 'draws' : 'losses']++;
}
for (const o of Object.values(byOpp)) { o.score = +((o.wins + o.draws / 2) / o.n).toFixed(3); o.ci = wilson(o.wins + o.draws / 2, o.n); }
const mean = (v) => (v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) : null);
const summary = { stub: !!stub, games: games.length, byOpp, calls, failures, fallbacks, mean_confidence: mean(confs), below_gate: confs.filter((c) => c < 0.45).length, mean_have: mean(haves), picks: Object.entries(picks).sort((a, b) => b[1] - a[1]), minutes: +((Date.now() - t0) / 60000).toFixed(1) };
console.log(JSON.stringify(summary, null, 1));
if (out) writeFileSync(out, JSON.stringify({ ran: new Date().toISOString(), shapes, seeds, vs, summary, games }, null, 1));
