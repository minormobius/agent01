// eval/plans-jev.mjs — Jev choosing plans on the trading floor.
//
//   node mega/jev/eval/plans-jev.mjs --coins BTC [--from 300] [--max-decisions 400] [--out mega/jev/lab/plans-jev.json]
//   node mega/jev/eval/plans-jev.mjs --stub     # the same loop, no calls: a stand-in answers with the baseline's pick
//
// Walks the cached 1-minute tapes (lab/tape.mjs) with lab/plans.mjs: Jev is
// asked only when no plan is open, picks one plan from the menu (each option's
// facts computed: its levels, costs, its odds and expectation on a coin-flip
// tape, and how the same plan did over the last day), and the plan's own exits
// run. A failed call stands aside for that decision (wait) and is counted.
// SPENDS REAL BUDGET without --stub: one call per decision, paced under the
// proxy's 30/min (~150-300 decisions per 3-day tape).
import { writeFileSync, appendFileSync } from 'node:fs';
import { walk, questions, DECIDERS } from '../lab/plans.mjs';
import { loadTape, toBars } from '../lab/tape.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const coins = arg('coins', 'BTC').split(',');
const from = +arg('from', 300), maxDecisions = +arg('max-decisions', 400);
const out = arg('out', null), stub = process.argv.includes('--stub');
const ENDPOINT = process.env.JEV_ENDPOINT || 'https://mega.mino.mobi/jev/api/ask';
const jsonl = out ? out.replace(/\.json$/, '.jsonl') : null;

let last = 0, calls = 0, failures = 0;
async function ask(state, qs) {
  for (let attempt = 0; ; attempt++) {
    const wait = 2150 - (Date.now() - last);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now(); calls++;
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, questions: qs }) });
      const body = await res.json().catch(() => ({ error: 'unreadable response' }));
      if (!res.ok) { const e = new Error(body.error || `HTTP ${res.status}`); e.status = res.status; e.retryAfter = body.retry_after_s; throw e; }
      return body;
    } catch (e) {
      if (attempt >= 4 || !(e.status === 429 || e.status >= 500 || !e.status)) { failures++; throw e; }
      await new Promise((r) => setTimeout(r, 1000 * (e.retryAfter || 2 ** attempt * 3)));
    }
  }
}

const baseline = DECIDERS.baseline();
function jevDecider(coin, log) {
  let n = 0;
  return async (opts, st, { i, bars }) => {
    const rec = { coin, i, t: new Date(bars[i].t).toISOString(), price: st.price, offered: opts.map((o) => o.key) };
    const base = baseline(opts, st);
    if (n++ >= maxDecisions) { rec.source = 'cap'; rec.chose = 'wait'; log(rec); return 'wait'; }
    const qs = questions(opts);
    if (stub) { rec.source = 'stub'; rec.chose = base; log(rec); return base; }
    try {
      const r = await ask({ market: `${coin} perpetual, 1-minute bars, paper`, ...st }, qs);
      const a = r.answers && r.answers.plan;
      if (!a || !opts.some((o) => o.key === a.choice)) throw new Error('no usable choice');
      rec.source = r.source || 'typesafe'; rec.chose = a.choice; rec.conf = a.confidence;
      rec.top = Object.entries(a.probabilities || {}).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, p]) => [k, +p.toFixed(3)]);
      rec.have = r.answers.have ? r.answers.have.noul : null;
      rec.baseline_would = base;
      log(rec); return a.choice;
    } catch (e) {
      rec.source = 'failed: stood aside'; rec.chose = 'wait'; rec.error = String(e.message || e).slice(0, 120);
      log(rec); return 'wait';
    }
  };
}

const t0 = Date.now(), runs = {};
for (const coin of coins) {
  const bars = toBars(await loadTape(coin));
  const recs = [];
  const log = (rec) => { recs.push(rec); if (jsonl) appendFileSync(jsonl, JSON.stringify(rec) + '\n'); };
  let k = 0;
  const r = await walk(bars, jevDecider(coin, log), {
    from, record: true,
    onPlan: (p) => { const rec = recs.at(-1); if (rec) Object.assign(rec, { result: p.reason, net_bp: +p.netBp.toFixed(2) }); if (++k % 20 === 0) console.log(`  ${coin} ${k} decisions, ${calls} calls, net ${recs.reduce((a, x) => a + (x.net_bp || 0), 0).toFixed(0)}bp, ${((Date.now() - t0) / 60000).toFixed(1)} min`); },
  });
  const { plans, ...tally } = r;
  const confs = recs.filter((x) => x.conf != null).map((x) => x.conf), haves = recs.filter((x) => x.have != null).map((x) => x.have);
  const picks = {}; for (const x of recs) picks[x.chose] = (picks[x.chose] || 0) + 1;
  const mean = (v) => (v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) : null);
  runs[coin] = { ...tally, picks: Object.entries(picks).sort((a, b) => b[1] - a[1]), mean_confidence: mean(confs), below_gate: confs.filter((c) => c < 0.45).length, mean_have: mean(haves),
    agreed_with_baseline: recs.filter((x) => x.baseline_would && x.baseline_would === x.chose).length, failed: recs.filter((x) => /failed/.test(x.source)).length, capped: recs.filter((x) => x.source === 'cap').length };
  console.log(`${coin}: net ${tally.net_bp}bp (gross ${tally.gross_bp}, costs ${tally.cost_bp}) over ${tally.trades} trades, hit ${tally.hit_rate} vs coin-flip ${tally.coin_flip_hit_rate}; coin-flip expectation for these plans ${tally.coin_flip_net_bp}bp`);
}
const summary = { stub, coins, calls, failures, minutes: +((Date.now() - t0) / 60000).toFixed(1), runs };
console.log(JSON.stringify(summary, (k, v) => (k === 'by_plan' ? undefined : v), 1));
if (out) writeFileSync(out, JSON.stringify({ ran: new Date().toISOString(), ...summary }, null, 1));
