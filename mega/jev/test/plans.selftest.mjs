// plans.selftest.mjs — the trading floor's plans: fills, exits, costs, no
// lookahead, and the arithmetic the gate rests on (a bracket on a driftless
// tape earns nothing before costs). Offline, no network.
import { COSTS, MACROS, simulate, resolve, options, state, questions, recentRecord, walk, tally, DECIDERS, sigma1 } from '../lab/plans.mjs';
import { loadTape, toBars } from '../lab/tape.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b} (±${tol})`);
const flat = (n, px = 100) => Array.from({ length: n }, (_, t) => ({ t, o: px, h: px, l: px, c: px }));
const Z = { takerBps: 0, makerBps: 0, halfSpreadBps: 0, stopSlipBps: 0, fundingBpsPerHour: 0 };

// --- fills and exits on hand-built bars -----------------------------------
{
  const b = flat(10); b[2] = { t: 2, o: 100, h: 101.5, l: 99.9, c: 101 };
  const sp = { key: 'x', side: 1, entry: { type: 'market', px: 100 }, tgt: 101, stp: 99, max: 50 };
  const r = simulate(b, 0, sp, Z);
  ok(r.filled && r.entryBar === 1 && r.entryPx === 100, 'market entry fills at the next open');
  ok(r.reason === 'target' && r.exitBar === 2 && r.exitPx === 101, 'target reached on a later bar exits at the target');
  near(r.grossBp, 100, 1e-9, 'gross is the move in bp');
}
{
  const b = flat(10); b[1] = { t: 1, o: 100, h: 101.5, l: 99.9, c: 101 };
  const r = simulate(b, 0, { key: 'x', side: 1, entry: { type: 'market', px: 100 }, tgt: 101, stp: 99, max: 50 }, Z);
  ok(r.exitBar !== 1 || r.reason !== 'target', 'the bar that fills an entry cannot reach its target');
}
{
  const b = flat(10); b[2] = { t: 2, o: 100, h: 101.5, l: 98.5, c: 100 };
  const r = simulate(b, 0, { key: 'x', side: 1, entry: { type: 'market', px: 100 }, tgt: 101, stp: 99, max: 50 }, Z);
  ok(r.reason === 'stopped' && r.ambiguous, 'a bar holding both the stop and the target: the stop came first, flagged');
}
{
  const b = flat(10); b[2] = { t: 2, o: 97, h: 97.5, l: 96.5, c: 97 };
  const r = simulate(b, 0, { key: 'x', side: 1, entry: { type: 'market', px: 100 }, tgt: 101, stp: 99, max: 50 }, Z);
  ok(r.reason === 'stopped' && r.exitPx === 97, 'a gap through the stop exits at the open, not the stop');
}
{
  const b = flat(10); b[2] = { t: 2, o: 102, h: 102.5, l: 101.5, c: 102 };
  const r = simulate(b, 0, { key: 'x', side: 1, entry: { type: 'market', px: 100 }, tgt: 101, stp: 99, max: 50 }, Z);
  ok(r.reason === 'target' && r.exitPx === 102, 'a gap through a resting target fills at the (better) open');
}
{
  const b = flat(10); b[2] = { t: 2, o: 100, h: 100.2, l: 99.4, c: 99.6 }; b[5] = { t: 5, o: 99.6, h: 100.6, l: 99.6, c: 100.5 };
  const r = simulate(b, 0, { key: 'x', side: 1, entry: { type: 'limit', px: 99.5, expire: 5 }, tgt: 100.5, stp: 98.5, max: 50 }, Z);
  ok(r.filled && r.entryBar === 2 && r.entryPx === 99.5, 'a resting limit fills at its price when traded through');
  ok(r.reason === 'target' && r.exitBar === 5, 'and then runs to its target');
  const r2 = simulate(flat(10), 0, { key: 'x', side: 1, entry: { type: 'limit', px: 99.5, expire: 5 }, tgt: 100.5, stp: 98.5, max: 50 }, Z);
  ok(!r2.filled && r2.reason === 'not filled' && r2.exitBar === 5 && r2.netBp === 0, 'an unfilled limit lapses at expiry and costs nothing');
}
{
  const b = flat(10); b[3] = { t: 3, o: 100, h: 100.6, l: 100, c: 100.5 };
  const r = simulate(b, 0, { key: 'x', side: 1, entry: { type: 'stop', px: 100.4, expire: 5 }, tgt: 102, stp: 99.9, max: 50 }, { ...Z, stopSlipBps: 1 });
  ok(r.filled && r.entryBar === 3, 'a stop-entry fills when the level breaks');
  near(r.entryPx, 100.4 * 1.0001, 1e-9, 'with the stop slippage charged on the price');
}
{
  // trailing stop: up 2%, then back down, exits at the ratcheted level
  const b = flat(12);
  for (let k = 2; k <= 5; k++) b[k] = { t: k, o: 100 + (k - 2) * 0.5, h: 100 + (k - 1) * 0.5, l: 100 + (k - 2) * 0.5, c: 100 + (k - 1) * 0.5 };
  for (let k = 6; k < 12; k++) b[k] = { t: k, o: 102, h: 102, l: 101, c: 101 };
  const r = simulate(b, 0, { key: 'x', side: 1, entry: { type: 'market', px: 100 }, tgt: null, stp: 99, trail: 50, max: 240 }, Z);
  ok(r.reason === 'stopped', 'a trailing stop exits on the way back');
  near(r.exitPx, 102 * (1 - 50 / 1e4), 1e-9, 'at the level ratcheted from the high');
  ok(r.grossBp > 0, 'locking in part of the run');
}
{
  const b = flat(100);
  const r = simulate(b, 0, { key: 'x', side: 1, entry: { type: 'market', px: 100 }, tgt: 101, stp: 99, max: 30 }, COSTS);
  ok(r.reason === 'time' && r.exitBar === 31, 'max hold exits on time');
  near(r.costBp, 2 * (COSTS.takerBps + COSTS.halfSpreadBps) + COSTS.fundingBpsPerHour * 31 / 60, 1e-9, 'time exit: two taker crossings plus funding for the hold');
  const s = simulate(b, 0, { key: 'x', side: -1, entry: { type: 'market', px: 100 }, tgt: 99, stp: 101, max: 30 }, COSTS);
  ok(s.costBp < r.costBp, 'a short is paid the funding a long pays');
}
{
  const r = simulate(flat(50), 0, { key: 'wait', side: 0, entry: { type: 'none' }, max: 15 });
  ok(!r.filled && r.netBp === 0 && r.exitBar === 15, 'wait stands aside for its span at no cost');
}

// --- the real tape: menu, facts, no lookahead -----------------------------
const bars = toBars(await loadTape('BTC'));
ok(bars.length > 4000, `the cached BTC tape is there (${bars.length} bars)`);
{
  const i = 2000, opts = options(bars, i);
  ok(opts.some((o) => o.key === 'wait'), 'wait is always on the menu');
  for (const o of opts) {
    if (o.key === 'wait') continue;
    const sp = o.spec;
    ok(sp.side === 1 ? sp.stp < sp.entry.px : sp.stp > sp.entry.px, `${o.key}: the stop is on the losing side`);
    if (sp.tgt != null) ok(sp.side === 1 ? sp.tgt > sp.entry.px : sp.tgt < sp.entry.px, `${o.key}: the target is on the winning side`);
    if (o.facts._rw_bp != null) ok(o.facts._rw_bp < 0, `${o.key}: on a coin-flip tape it expects to lose its costs`);
  }
  const q = questions(opts);
  ok(q.plan.type === 'choice' && Object.keys(q.plan.criteria).length === opts.length, 'the plan question offers exactly the menu');
  ok(!JSON.stringify(q).includes('_recent'), 'private fields stay out of the question');
  ok(q.have.type === 'noul', 'and carries the self-check');
  const st = state(bars, i);
  ok(st.price === +bars[i].c.toFixed(1) && st.range_position.last_hour >= 0 && st.range_position.last_hour <= 1, 'state is computed from bar i');
}
{
  // no lookahead: options and state at bar i are the same whatever comes after it
  const i = 2500, cut = bars.slice(0, i + 1);
  const strip = (os) => JSON.stringify(os.map((o) => [o.key, o.facts]));
  ok(strip(options(bars, i)) === strip(options(cut, i)), 'options at bar i do not depend on any bar after i');
  ok(JSON.stringify(state(bars, i)) === JSON.stringify(state(cut, i)), 'nor does the state');
  ok(JSON.stringify(recentRecord(bars, i, 'bracket_long')) === JSON.stringify(recentRecord(cut, i, 'bracket_long')), 'nor the recent record');
}
{
  const r = await walk(bars, DECIDERS.wait, { record: false });
  ok(r.net_bp === 0 && r.trades === 0, 'the wait arm returns exactly zero');
  const a = await walk(bars, DECIDERS.random(7), { record: false }), b2 = await walk(bars, DECIDERS.random(7), { record: false });
  ok(a.net_bp === b2.net_bp, 'a seeded random arm reproduces');
  let overlap = false;
  for (let k = 1; k < a.plans.length; k++) if (a.plans[k].start < a.plans[k - 1].exitBar) overlap = true;
  ok(!overlap, 'no plan starts before the last one ended');
}

// --- the arithmetic: on a driftless tape, brackets earn nothing gross -----
{
  let a = 12345; const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const N = 30000, sub = 20, s = 3 / 1e4 / Math.sqrt(sub), syn = [];
  let p = 50000;
  for (let t = 0; t < N; t++) {
    const o = p; let h = p, l = p;
    for (let k = 0; k < sub; k++) { p *= Math.exp(s * gauss()); h = Math.max(h, p); l = Math.min(l, p); }
    syn.push({ t, o, h, l, c: p });
  }
  for (const key of ['bracket_long', 'reach_short', 'dip_buy', 'breakout_long']) {
    const plans = [];
    // non-overlapping, or neighbouring starts share one breakout and the t is counted many times over
    for (let i = 300; i < N - 300;) { const sp = resolve(syn, i, key); const r = sp.na ? null : simulate(syn, i, sp, Z); if (r) plans.push(r); i = Math.max(i + 1, r && r.exitBar != null ? r.exitBar + 1 : i + 1); }
    const t = tally(plans);
    ok(Math.abs(t.t_gross) < 3, `${key} on a random walk: gross t ${t.t_gross} (|t| < 3), n ${t.trades}`);
    const o = options(syn, 5000, { record: false }).find((x) => x.key === key);
    if (o && o.facts._odds) { const od = o.facts._odds; near(t.hit_rate, od.target / (od.target + od.stop), 0.06, `${key}: hit rate matches the lattice odds`); }
  }
  const all = [];
  for (let i = 300; i < N - 300; i += 7) all.push(simulate(syn, i, resolve(syn, i, 'bracket_long'), COSTS));
  ok(tally(all).mean_net_bp < 0, 'and with costs, every bracket loses');
}

// --- slow bars and market-neutral books -----------------------------------
{
  const { weightsAt, runBook, SCORES, weekly, tWeeks } = await import('../lab/books.mjs');
  const { runStrategy, FAMILIES } = await import('../lab/strategies.mjs');
  // eight synthetic assets, asset k drifting at k-3.5 bp a bar, all bars 4h
  const coins = Array.from({ length: 8 }, (_, k) => 'A' + k), tapes = {}, funds = {}, cb = {};
  for (const [k, c] of coins.entries()) {
    let p = 100; const b = [];
    for (let t = 0; t < 400; t++) { const o = p; p *= 1 + (k - 3.5) / 1e4 + 0.002 * Math.sin(t * 0.7 + k); b.push({ t: t * 144e5, o, h: Math.max(o, p) * 1.001, l: Math.min(o, p) * 0.999, c: p }); }
    b.barMin = 240; tapes[c] = b; funds[c] = new Array(400).fill(k === 7 ? 2 : 0); cb[c] = 5;
  }
  const w = weightsAt(tapes, funds, coins, SCORES.xs_momentum({ L: 42 }), 300);
  const sum = (sg) => Object.values(w).filter((x) => Math.sign(x) === sg).reduce((a, b) => a + b, 0);
  near(sum(1), 1, 1e-9, 'a book\'s long side sums to 1'); near(sum(-1), -1, 1e-9, 'and its short side to -1');
  ok(w.A7 > 0 && w.A0 < 0, 'momentum buys the strongest and sells the weakest');
  const rows = runBook(tapes, funds, coins, { family: 'xs_momentum', L: 42, W: 42 }, { from: 200, to: 400, costBps: cb });
  ok(rows.reduce((a, r) => a + r.funding, 0) < 0, 'holding the funded long pays its funding');
  ok(rows.reduce((a, r) => a + r.cost, 0) < 0 && rows[0].cost < 0, 'the first rebalance pays costs on the whole book');
  ok(rows.reduce((a, r) => a + r.gross, 0) > 0, 'on assets with persistent drift, momentum earns');
  const rv = runBook(tapes, funds, coins, { family: 'xs_reversal', L: 42, W: 42 }, { from: 200, to: 400, costBps: cb });
  ok(rv.reduce((a, r) => a + r.gross, 0) < 0, 'and reversal, the same book flipped, loses');
  const tw = tWeeks(weekly(rows).map((x) => x[1]));
  ok(tw.weeks > 4 && Number.isFinite(tw.t), 'weekly t is computed over calendar weeks');
  // slow-bar funding: a 4h tape charges six times the hours of a 1m tape's bar count
  const long = simulate(Object.assign(flat(10), { barMin: 240 }), 0, { key: 'x', side: 1, entry: { type: 'market', px: 100 }, tgt: 101, stp: 99, max: 3 }, { ...Z, fundingBpsPerHour: 1 });
  near(long.costBp, 4 * 4, 1e-9, 'on 4h bars a 4-bar hold pays 16 hours of funding');
  const plans = runStrategy(tapes.A7, FAMILIES.breakout({ N: 30, k: 1 }), { from: 200, to: 399 });
  let overlap = false; for (let k = 1; k < plans.length; k++) if (plans[k].start < plans[k - 1].exitBar) overlap = true;
  ok(plans.length > 0 && !overlap, 'a fixed strategy runs one plan at a time');
}

console.log(`plans: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
