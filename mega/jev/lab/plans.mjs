// plans.mjs — the trading floor's macros: plans with exits, not stances.
//
// The craft lesson carried over. There, Jev chose among macros System 2 wrote
// (each runs to completion, fails cleanly, and says what it needs), and the
// harness computed every fact an option needed. Here a macro is a PLAN: an
// entry (at market, a resting limit, a stop-entry), a target, a stop (fixed or
// trailing), a time limit, and an expiry for an entry that never fills. Jev
// picks a plan only when none is open; the plan's own exits do the rest. That
// is the fix the stance lab kept circling: the drag was turnover, and a plan is
// one round trip with its risk named before it starts.
//
// The arithmetic that has to be stated before any result. On a driftless
// tape a bracket hits its target first exactly stop/(target+stop) of the time,
// so its gross expectancy is ZERO whatever its shape: a 2:1 bracket wins a
// third of the time and breaks even. Costs then make every bracket lose. So
// brackets cannot create an edge. What a plan menu CAN buy is measurable, and
// every arm of the gate is one of those measurements: fewer round trips, maker
// fills (a resting target or limit pays 1.5bp, not 4.5), plans that only make
// sense in one regime (reverting when stretched), and standing aside.
//
// Bars are {t, o, h, l, c} in numbers. A decision is made at the CLOSE of bar
// i; a market entry fills at the OPEN of bar i+1. Nothing here reads a bar
// after the one being simulated.

export const COSTS = {
  takerBps: 4.5,        // Hyperliquid perp taker, tier 0 (book.mjs)
  makerBps: 1.5,        // a resting limit: the entry of a dip-buy, every target
  halfSpreadBps: 0.1,   // BTC's book is ~0.12bp wide (book.mjs, measured)
  stopSlipBps: 1.0,     // a stop is a market order into a moving book: pessimism, stated
  fundingBpsPerHour: 0.12,   // longs pay (book.mjs: 96% of hours, 21 days)
};
export const BAR_MIN = 1;    // minutes per bar; the plans scale by volatility, so other bar sizes work

const bp = (a, b) => (b / a - 1) * 1e4;
export function logRets(bars, i, n) {
  const out = [];
  for (let k = Math.max(1, i - n + 1); k <= i; k++) out.push(Math.log(bars[k].c / bars[k - 1].c) * 1e4);
  return out;
}
const sd = (v) => { if (v.length < 2) return 0; const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };
// one-bar volatility in bp, from the last n bars
export const sigma1 = (bars, i, n = 60) => Math.max(0.5, sd(logRets(bars, i, n)));
const sma = (bars, i, n) => { let s = 0, k = 0; for (let j = Math.max(0, i - n + 1); j <= i; j++, k++) s += bars[j].c; return s / k; };
const hi = (bars, i, n) => { let m = -Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.max(m, bars[j].h); return m; };
const lo = (bars, i, n) => { let m = Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.min(m, bars[j].l); return m; };

// --------------------------------------------------------------- the menu ---
// Each macro resolves, at bar i, to a concrete spec (prices, not ideas), or
// to null with a reason when it does not apply. Brackets are in units of the
// volatility over the plan's own horizon (sigma1 * sqrt(bars)), so a plan
// means the same thing in a quiet hour and a wild one.
const S = (s1, h) => s1 * Math.sqrt(h);
export const MACROS = {
  bracket_long: { doc: 'buy at market; target +1σ, stop −1σ over an hour', side: 1, spec: (b, i, s1) => mkt(b, i, 1, { t: S(s1, 60), s: S(s1, 60), max: 60 }) },
  bracket_short: { doc: 'sell at market; target −1σ, stop +1σ over an hour', side: -1, spec: (b, i, s1) => mkt(b, i, -1, { t: S(s1, 60), s: S(s1, 60), max: 60 }) },
  reach_long: { doc: 'buy at market; target +2σ, stop −1σ, two hours to get there', side: 1, spec: (b, i, s1) => mkt(b, i, 1, { t: 2 * S(s1, 60), s: S(s1, 60), max: 120 }) },
  reach_short: { doc: 'sell at market; target −2σ, stop +1σ, two hours', side: -1, spec: (b, i, s1) => mkt(b, i, -1, { t: 2 * S(s1, 60), s: S(s1, 60), max: 120 }) },
  dip_buy: { doc: 'a resting buy half a σ below; if it fills, target back up, stop a σ under the fill', side: 1, spec: (b, i, s1) => lim(b, i, 1, s1) },
  rip_sell: { doc: 'a resting sell half a σ above; if it fills, target back down, stop a σ over', side: -1, spec: (b, i, s1) => lim(b, i, -1, s1) },
  breakout_long: { doc: 'a stop-entry just over the hour\'s high; if it breaks, target +1.5σ, stop −0.75σ', side: 1, spec: (b, i, s1) => brk(b, i, 1, s1) },
  breakdown_short: { doc: 'a stop-entry just under the hour\'s low; if it breaks, target −1.5σ, stop +0.75σ', side: -1, spec: (b, i, s1) => brk(b, i, -1, s1) },
  revert: { doc: 'only when price is unusually far (2 sd) from its hour mean: trade back to the mean, stop an hour\'s σ further out', side: 0, spec: (b, i, s1) => rev(b, i, s1) },
  trail_long: { doc: 'buy at market with a trailing stop 1.5σ behind; no target, four hours at most', side: 1, spec: (b, i, s1) => trl(b, i, 1, s1) },
  trail_short: { doc: 'sell at market with a trailing stop 1.5σ behind; four hours at most', side: -1, spec: (b, i, s1) => trl(b, i, -1, s1) },
  wait: { doc: 'stand aside for fifteen minutes, then choose again', side: 0, spec: () => ({ side: 0, entry: { type: 'none' }, max: 15 }) },
};
function mkt(b, i, side, { t, s, max }) {
  const c = b[i].c;
  return { side, entry: { type: 'market', px: c }, tgt: c * (1 + side * t / 1e4), stp: c * (1 - side * s / 1e4), max };
}
function lim(b, i, side, s1) {
  const c = b[i].c, h = S(s1, 30), px = c * (1 - side * 0.5 * h / 1e4);
  return { side, entry: { type: 'limit', px, expire: 30 }, tgt: px * (1 + side * h / 1e4), stp: px * (1 - side * h / 1e4), max: 60 };
}
function brk(b, i, side, s1) {
  const h = S(s1, 60), lvl = side > 0 ? hi(b, i, 60) : lo(b, i, 60), px = lvl * (1 + side * 1 / 1e4);
  return { side, entry: { type: 'stop', px, expire: 60 }, tgt: px * (1 + side * 1.5 * h / 1e4), stp: px * (1 - side * 0.75 * h / 1e4), max: 120 };
}
// How far price sits from its hour mean, in units of how far it USUALLY sits:
// on a random walk the gap to an n-bar mean has sd ≈ σ1·sqrt(n/3), not σ1·sqrt(n),
// so 2 here is a 2-sd stretch (about one bar in twenty), not a 3.5-sd rarity.
export function stretch(b, i, s1) {
  const m = sma(b, i, 60);
  return { mean: m, z: bp(m, b[i].c) / (s1 * Math.sqrt(20)) };
}
function rev(b, i, s1) {
  const { mean, z } = stretch(b, i, s1);
  if (Math.abs(z) < 2) return { na: `price is ${z.toFixed(1)}σ from its hour mean; revert needs 2σ` };
  const side = z > 0 ? -1 : 1, c = b[i].c;
  return { side, entry: { type: 'market', px: c }, tgt: mean, stp: c * (1 - side * S(s1, 60) / 1e4), max: 60 };
}
function trl(b, i, side, s1) {
  const c = b[i].c, tr = 1.5 * S(s1, 60);
  return { side, entry: { type: 'market', px: c }, tgt: null, stp: c * (1 - side * tr / 1e4), trail: tr, max: 240 };
}
export function resolve(bars, i, key, s1 = sigma1(bars, i)) {
  const sp = MACROS[key].spec(bars, i, s1);
  return sp && !sp.na ? { key, ...sp } : { key, na: sp ? sp.na : 'does not apply' };
}

// ----------------------------------------------------------- the engine ---
// Run one plan from the close of bar i. Conservative wherever a bar is
// ambiguous: if a bar's range holds both the stop and the target, the stop
// came first; a bar that fills an entry can stop it out but cannot reach its
// target; a gap through a stop exits at the open, not the stop.
export function simulate(bars, i, spec, costs = COSTS) {
  const c = { ...COSTS, ...costs }, side = spec.side;
  const out = { key: spec.key, side, start: i, filled: false, reason: null, entryBar: null, exitBar: null, entryPx: null, exitPx: null, grossBp: 0, costBp: 0, netBp: 0, R: 0, ambiguous: false };
  if (spec.entry.type === 'none') { out.reason = 'stood aside'; out.exitBar = Math.min(bars.length - 1, i + spec.max); return out; }
  let j = i + 1, entryFee = c.takerBps + c.halfSpreadBps;
  // the entry
  if (spec.entry.type === 'market') {
    if (j >= bars.length) { out.reason = 'no data'; return out; }
    out.entryPx = bars[j].o; out.entryBar = j;
  } else {
    const px = spec.entry.px, last = Math.min(bars.length - 1, i + spec.entry.expire);
    for (; j <= last; j++) {
      const B = bars[j];
      if (spec.entry.type === 'limit') {
        // a resting order: filled if the market trades to it (at the open if it gapped past)
        if ((side > 0 && B.l <= px) || (side < 0 && B.h >= px)) { out.entryPx = side > 0 ? Math.min(px, B.o) : Math.max(px, B.o); entryFee = c.makerBps; break; }
      } else if ((side > 0 && B.h >= px) || (side < 0 && B.l <= px)) {
        // a stop-entry: a market order when the level breaks, with the stop's slippage
        out.entryPx = (side > 0 ? Math.max(px, B.o) : Math.min(px, B.o)) * (1 + side * c.stopSlipBps / 1e4); entryFee = c.takerBps + c.halfSpreadBps; break;
      }
    }
    if (out.entryPx == null) { out.reason = 'not filled'; out.exitBar = last; return out; }
    out.entryBar = j;
  }
  out.filled = true;
  // stops and targets move with the actual fill (a limit can fill better than asked)
  const shift = out.entryPx / spec.entry.px;
  let stp = spec.stp * shift; const tgt = spec.tgt != null ? spec.tgt * (spec.key === 'revert' || spec.revertTarget ? 1 : shift) : null;
  const riskBp = Math.abs(bp(out.entryPx, stp));
  let exitFee = 0, k = out.entryBar;
  for (; k < bars.length; k++) {
    const B = bars[k], first = k === out.entryBar;
    const held = k - out.entryBar;
    // the stop (a gap through it exits at the open)
    const stopHit = side > 0 ? B.l <= stp : B.h >= stp;
    const tgtHit = tgt != null && !first && (side > 0 ? B.h >= tgt : B.l <= tgt);
    if (stopHit) {
      const gap = side > 0 ? B.o <= stp : B.o >= stp;
      out.exitPx = (gap && !first ? B.o : stp) * (1 - side * c.stopSlipBps / 1e4);
      out.reason = 'stopped'; exitFee = c.takerBps + c.halfSpreadBps;
      if (tgtHit) out.ambiguous = true;
      break;
    }
    // a resting target: filled at its price, or at the open if the bar gapped through it
    if (tgtHit) { out.exitPx = side > 0 ? Math.max(tgt, B.o) : Math.min(tgt, B.o); out.reason = 'target'; exitFee = c.makerBps; break; }
    // the trail ratchets on this bar's extreme, for the NEXT bar
    if (spec.trail) stp = side > 0 ? Math.max(stp, B.h * (1 - spec.trail / 1e4)) : Math.min(stp, B.l * (1 + spec.trail / 1e4));
    if (held >= spec.max) { out.exitPx = B.c; out.reason = 'time'; exitFee = c.takerBps + c.halfSpreadBps; break; }
  }
  if (out.exitPx == null) { k = bars.length - 1; out.exitPx = bars[k].c; out.reason = 'end of data'; exitFee = c.takerBps + c.halfSpreadBps; }
  out.exitBar = k;
  out.grossBp = side * bp(out.entryPx, out.exitPx);
  const hours = (out.exitBar - out.entryBar + 1) * (bars.barMin || BAR_MIN) / 60;   // a tape of other bars says so: bars.barMin
  out.costBp = entryFee + exitFee + side * c.fundingBpsPerHour * hours;
  out.netBp = out.grossBp - out.costBp;
  out.R = riskBp ? out.netBp / riskBp : 0;
  return out;
}

// ------------------------------------------------------------ the facts ---
// What every option carries. All arithmetic; the model never does any.
//
// The odds a plan would have on a driftless tape: target first, stop first, or
// neither before its time limit. Barriers in units of one bar's σ, horizon in
// bars, solved on a symmetric lattice walk (step dx, dx² of a bar per step).
// A finite horizon matters: a far target is reached less often than
// stop/(target+stop) suggests, because time runs out first.
const ODDS = new Map();
export function rwOdds(a, b, n) {
  const key = `${a.toFixed(1)}|${b.toFixed(1)}|${n}`;
  if (ODDS.has(key)) return ODDS.get(key);
  const dx = Math.max(0.05, (a + b) / 80), M = Math.round((a + b) / dx), i0 = Math.round(b / dx), steps = Math.round(n / (dx * dx));
  let p = new Float64Array(M + 1), up = 0, down = 0;
  p[i0] = 1;
  for (let s = 0; s < steps; s++) {
    const q = new Float64Array(M + 1);
    for (let k = 1; k < M; k++) if (p[k]) { q[k - 1] += p[k] / 2; q[k + 1] += p[k] / 2; }
    up += q[M]; down += q[0]; q[M] = 0; q[0] = 0; p = q;
  }
  const r = { target: up, stop: down, time: Math.max(0, 1 - up - down) };
  ODDS.set(key, r);
  return r;
}
export function costsOf(spec, c = COSTS) {
  const entry = spec.entry.type === 'limit' ? c.makerBps : c.takerBps + c.halfSpreadBps + (spec.entry.type === 'stop' ? c.stopSlipBps : 0);
  return { win: entry + c.makerBps, loss: entry + c.takerBps + c.halfSpreadBps + c.stopSlipBps };
}
// How this exact macro did from every start in the trailing window whose
// plan had FINISHED before bar i (so the fact cannot see the future).
// A plan's result is cached on the whole tape, which is safe: only results
// whose exit came before bar i are used, and those read no bar after their exit.
// The grid is anchored to bar 0 (s % every), so one start is reused by every i.
const CACHE = new WeakMap();
function cachedRun(bars, s, key) {
  let m = CACHE.get(bars); if (!m) CACHE.set(bars, (m = new Map()));
  const id = key + '@' + s;
  if (!m.has(id)) { const sp = resolve(bars, s, key); m.set(id, sp.na ? null : simulate(bars, s, sp)); }
  return m.get(id);
}
export function recentRecord(bars, i, key, { window = 1440, every = 5 } = {}) {
  const res = [];
  let s0 = Math.max(61, i - window); s0 += (every - (s0 % every)) % every;
  for (let s = s0; s < i; s += every) {
    const r = cachedRun(bars, s, key);
    if (!r || !r.filled || r.exitBar >= i) continue;
    res.push(r);
  }
  if (!res.length) return null;
  const n = res.length, wins = res.filter((r) => r.reason === 'target').length;
  return { n, target_first: wins / n, mean_net_bp: res.reduce((a, r) => a + r.netBp, 0) / n };
}
export function options(bars, i, { record = true } = {}) {
  const s1 = sigma1(bars, i), c = bars[i].c, out = [];
  for (const key of Object.keys(MACROS)) {
    const sp = resolve(bars, i, key, s1);
    if (sp.na) continue;
    const f = { does: MACROS[key].doc };
    if (key === 'wait') { f.costs = 'nothing'; out.push({ key, spec: sp, facts: f }); continue; }
    const ref = sp.entry.px, T = sp.tgt != null ? Math.abs(bp(ref, sp.tgt)) : null, Sb = Math.abs(bp(ref, sp.stp)), co = costsOf(sp);
    f.entry = sp.entry.type === 'market' ? `market, about ${c.toFixed(0)}` : `${sp.entry.type === 'limit' ? 'resting buy/sell' : 'stop-entry'} at ${ref.toFixed(0)} (${bp(c, ref) >= 0 ? '+' : ''}${bp(c, ref).toFixed(1)}bp), lapses after ${sp.entry.expire} min unfilled`;
    f.target = T != null ? `${sp.side > 0 ? '+' : '−'}${T.toFixed(1)}bp (${sp.tgt.toFixed(0)})` : 'none: a trailing stop decides the exit';
    f.stop = `${sp.side > 0 ? '−' : '+'}${Sb.toFixed(1)}bp${sp.trail ? ', trailing' : ''}`;
    f.max_hold = `${sp.max * BAR_MIN} min`;
    f.costs_bp = `${co.win.toFixed(1)} if it hits the target, ${co.loss.toFixed(1)} if stopped`;
    if (T != null) {
      f.reward_to_risk = +(T / Sb).toFixed(2);
      // if price were a coin flip: how often each exit comes first, and what that expects after costs
      const od = rwOdds(T / s1, Sb / s1, sp.max);
      const exp = -(od.target * co.win + od.stop * co.loss + od.time * (co.loss - COSTS.stopSlipBps)) - sp.side * COSTS.fundingBpsPerHour * sp.max * BAR_MIN / 120;
      f.if_price_were_a_coin_flip = `target first ${(od.target * 100).toFixed(0)}%, stop first ${(od.stop * 100).toFixed(0)}%, time runs out ${(od.time * 100).toFixed(0)}%; expects ${exp.toFixed(1)}bp after costs`;
      f._odds = od; f._rw_bp = exp;
    }
    if (record) {
      const rr = recentRecord(bars, i, key);
      f.last_24h = rr ? `${rr.n} plans: target first ${(rr.target_first * 100).toFixed(0)}%, mean ${rr.mean_net_bp >= 0 ? '+' : ''}${rr.mean_net_bp.toFixed(1)}bp after costs` : 'not enough history';
      f._recent = rr;
    }
    out.push({ key, spec: sp, facts: f });
  }
  return out;
}
export function state(bars, i, journal = []) {
  const s1 = sigma1(bars, i), c = bars[i].c, { mean, z } = stretch(bars, i, s1);
  const h60 = hi(bars, i, 60), l60 = lo(bars, i, 60), h240 = hi(bars, i, 240), l240 = lo(bars, i, 240);
  const r = (n) => bp(bars[Math.max(0, i - n)].c, c);
  const path = (n) => { let p = 0; for (let k = Math.max(1, i - n + 1); k <= i; k++) p += Math.abs(bp(bars[k - 1].c, bars[k].c)); return p; };
  return {
    price: +c.toFixed(1),
    volatility: `${s1.toFixed(2)}bp a minute; ${S(s1, 60).toFixed(1)}bp an hour (1σ)`,
    moves: { last_15m_bp: +r(15).toFixed(1), last_60m_bp: +r(60).toFixed(1), last_240m_bp: +r(240).toFixed(1) },
    trend_efficiency_60m: +(Math.abs(r(60)) / Math.max(1e-9, path(60))).toFixed(2),
    stretch: `${z >= 0 ? '+' : ''}${z.toFixed(2)}σ from the hour mean (${mean.toFixed(0)})`,
    range_position: { last_hour: +((c - l60) / Math.max(1e-9, h60 - l60)).toFixed(2), last_4h: +((c - l240) / Math.max(1e-9, h240 - l240)).toFixed(2) },
    journal: journal.slice(-6),
  };
}
export function questions(opts) {
  return {
    plan: { type: 'choice', instructions: 'Trading a BTC perpetual on paper. Pick the plan that best fits the tape as it is now. Each plan has its exits written in; every figure is already computed. A plan whose recent record and break-even both argue against it is a cost, and standing aside is an option.', criteria: Object.fromEntries(opts.map((o) => [o.key, Object.fromEntries(Object.entries(o.facts).filter(([k]) => !k.startsWith('_')))])) },
    have: { type: 'noul', instructions: 'Does the state contain the information needed to choose a plan well here?', criteria: { true: 'yes, the facts that decide it are in the state', false: 'no, something that decides it is missing' } },
  };
}

// ------------------------------------------------------------ deciders ----
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const DECIDERS = {
  wait: () => 'wait',
  random: (seed = 1) => { const rng = mulberry(seed); return (opts) => opts[Math.floor(rng() * opts.length)].key; },
  fixed: (key) => (opts) => (opts.some((o) => o.key === key) ? key : 'wait'),
  // chase what worked: the best trailing record, if it made money
  bestRecent: () => (opts) => {
    const r = opts.filter((o) => o.facts._recent && o.facts._recent.n >= 20).sort((a, b) => b.facts._recent.mean_net_bp - a.facts._recent.mean_net_bp)[0];
    return r && r.facts._recent.mean_net_bp > 0 ? r.key : 'wait';
  },
  // a hand-written regime script: revert when stretched, ride a clean trend,
  // otherwise rest a dip-buy or a rip-sell toward the middle of the range
  baseline: () => (opts, st) => {
    const has = (k) => opts.some((o) => o.key === k);
    if (has('revert')) return 'revert';
    if (st.trend_efficiency_60m > 0.5) return st.moves.last_60m_bp > 0 ? 'trail_long' : 'trail_short';
    if (st.range_position.last_hour < 0.35) return 'dip_buy';
    if (st.range_position.last_hour > 0.65) return 'rip_sell';
    return 'wait';
  },
};

// ------------------------------------------------------------- the walk ---
// Walk a tape: decide when no plan is open, run the plan, repeat. `decide` is
// (opts, state, ctx) → key, sync or async. Returns every plan and the totals.
// `menu` narrows or rewrites the options before the decider sees them (an arm
// that must trade drops wait; an ablation drops a fact).
export async function walk(bars, decide, { from = 300, to = bars.length - 1, record = true, onPlan, menu, costs } = {}) {
  const plans = [], journal = [];
  let i = from;
  while (i < to) {
    let opts = options(bars, i, { record });
    if (menu) opts = menu(opts);
    const st = state(bars, i, journal);
    const pick = await decide(opts, st, { i, bars });
    const o = opts.find((x) => x.key === pick) || opts.find((x) => x.key === 'wait') || opts[0];
    const r = simulate(bars, i, o.spec, costs);
    r.t = bars[i].t; r.spec = o.spec;
    if (o.facts._odds) { r.odds = o.facts._odds; r.rwBp = o.facts._rw_bp; }
    plans.push(r);
    journal.push({ plan: o.key, result: r.reason, net_bp: +r.netBp.toFixed(1) });
    if (onPlan) onPlan(r, o, st);
    i = Math.max(i + 1, r.exitBar ?? i + 1);
  }
  return { plans, ...tally(plans) };
}
export function tally(plans) {
  const traded = plans.filter((p) => p.filled);
  const sum = (f) => traded.reduce((a, p) => a + f(p), 0);
  const nets = traded.map((p) => p.netBp);
  const mean = nets.length ? sum((p) => p.netBp) / nets.length : 0;
  return {
    decisions: plans.length, trades: traded.length,
    targets: traded.filter((p) => p.reason === 'target').length, stops: traded.filter((p) => p.reason === 'stopped').length,
    timeouts: traded.filter((p) => p.reason === 'time').length, unfilled: plans.filter((p) => p.reason === 'not filled').length,
    waits: plans.filter((p) => p.reason === 'stood aside').length, ambiguous: traded.filter((p) => p.ambiguous).length,
    net_bp: +sum((p) => p.netBp).toFixed(1), gross_bp: +sum((p) => p.grossBp).toFixed(1), cost_bp: +sum((p) => p.costBp).toFixed(1),
    mean_net_bp: +mean.toFixed(2), se_bp: nets.length > 1 ? +(sd(nets) / Math.sqrt(nets.length)).toFixed(2) : null,
    // the edge before costs, as a t: |t| < 2 is a gross result indistinguishable from nothing
    t_gross: nets.length > 1 ? +((sum((p) => p.grossBp) / nets.length) / Math.max(1e-9, sd(traded.map((p) => p.grossBp)) / Math.sqrt(nets.length))).toFixed(2) : null,
    // of the plans that reached their target or their stop, the share that reached the target
    // (only plans that HAVE a target: a trailing stop has none, and counting its exits as misses understates every arm that uses it)
    ...(() => { const w = traded.filter((p) => !p.spec || p.spec.tgt != null), t = w.filter((p) => p.reason === 'target').length, s = w.filter((p) => p.reason === 'stopped').length; return { hit_rate: t + s ? +(t / (t + s)).toFixed(3) : null, resolved: t + s }; })(),
    // what the same plans would have done on a coin-flip tape: the hit rate and net to beat
    ...(() => { const w = traded.filter((p) => p.odds); if (!w.length) return {}; const et = w.reduce((a, p) => a + p.odds.target, 0), es = w.reduce((a, p) => a + p.odds.stop, 0); return { coin_flip_hit_rate: +(et / (et + es)).toFixed(3), coin_flip_net_bp: +w.reduce((a, p) => a + p.rwBp, 0).toFixed(1) }; })(),
    by_plan: Object.fromEntries([...new Set(traded.map((p) => p.key))].map((k) => { const ps = traded.filter((p) => p.key === k); return [k, { n: ps.length, net_bp: +ps.reduce((a, p) => a + p.netBp, 0).toFixed(1), target_first: +(ps.filter((p) => p.reason === 'target').length / ps.length).toFixed(2) }]; })),
  };
}
