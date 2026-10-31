// eval/plans-carry.mjs — weekly basis carry on the highest-funding assets
// (lab/plans-carry-prereg.json). Short the perp, long spot, equal notional;
// each week the strategist fits locally to the one thing that persists
// (recent funding), and vigilance drops an asset whose last 24h of funding
// turned negative. No model calls.
//
//   node mega/jev/eval/plans-carry.mjs [--out mega/jev/lab/plans-carry.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadTape, toBars, loadFunding, loadPremium } from '../lab/tape.mjs';
import { costsFor } from '../lab/strategies.mjs';
import { weekly, tWeeks, corr } from '../lab/books.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REG = JSON.parse(readFileSync(join(here, '..', 'lab', 'plans-carry-prereg.json'), 'utf8'));
const V1 = JSON.parse(readFileSync(join(here, '..', 'lab', 'plans-search-prereg.json'), 'utf8'));
const outI = process.argv.indexOf('--out'), out = outI > 0 ? process.argv[outI + 1] : null;
const COINS = [...V1.data.dev_assets, ...V1.data.holdout_assets];
const START = 600, END = 5000, EVERY = 42, TOP = 5, LOOK = 42, VIG = 6;

const tapes = {}, fund = {}, prem = {}, cost = {};
for (const c of COINS) {
  const b = toBars(await loadTape(c, { interval: '4h' }));
  tapes[c] = b.slice(0, END); fund[c] = (await loadFunding(c, b)).slice(0, END); prem[c] = (await loadPremium(c, b)).slice(0, END);
  const k = costsFor(c); cost[c] = k.takerBps + k.halfSpreadBps + (['BTC', 'ETH', 'SOL'].includes(c) ? 5 : 10);
}
const sumF = (c, i, n) => { let s = 0; for (let j = i - n + 1; j <= i; j++) s += fund[c][j]; return s; };

export function carryWalk({ vigil, pick }) {
  const rows = []; let w = {}, drops = 0;
  for (let i = START; i < END; i++) {
    let fl = 0, bl = 0;
    for (const [c, x] of Object.entries(w)) { fl += x * fund[c][i]; bl -= x * (prem[c][i] - prem[c][i - 1]); }
    let nw = { ...w };
    if ((i - START) % EVERY === 0) nw = pick(i);
    else if (vigil) for (const c of Object.keys(nw)) if (sumF(c, i, VIG) < 0) { delete nw[c]; drops++; }
    let k = 0;
    for (const c of new Set([...Object.keys(w), ...Object.keys(nw)])) k += Math.abs((nw[c] || 0) - (w[c] || 0)) * cost[c];
    w = nw;
    rows.push({ t: tapes.BTC[i].t, funding: fl, basis: bl, cost: -k, ret: fl + bl - k, held: Object.keys(w).length });
  }
  return { rows, drops };
}
const topFunding = (i) => { const r = COINS.map((c) => [c, sumF(c, i, LOOK)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, TOP); return Object.fromEntries(r.map(([c]) => [c, 1 / r.length])); };
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const randomPick = (seed) => { const rng = mulberry(seed); return () => { const s = COINS.slice().sort(() => rng() - 0.5).slice(0, TOP); return Object.fromEntries(s.map((c) => [c, 1 / TOP])); }; };

const marketWk = new Map(weekly(Array.from({ length: END - START }, (_, k) => { const i = START + k; return { t: tapes.BTC[i].t, ret: COINS.reduce((a, c) => a + (tapes[c][i].c / tapes[c][i - 1].c - 1) * 1e4, 0) / COINS.length }; })));
const report = { registration: REG.id, ran: new Date().toISOString(), variants: {} };
const mid = tapes.BTC[Math.floor((START + END) / 2)].t;
for (const vigil of [false, true]) {
  const { rows, drops } = carryWalk({ vigil, pick: topFunding });
  const wk = weekly(rows), st = tWeeks(wk.map((x) => x[1]));
  const nulls = []; for (let s = 1; s <= 20; s++) nulls.push(carryWalk({ vigil, pick: randomPick(s) }).rows.reduce((a, r) => a + r.ret, 0));
  const nm = nulls.reduce((a, b) => a + b, 0) / 20, nsd = Math.sqrt(nulls.reduce((a, b) => a + (b - nm) ** 2, 0) / 19), z = (st.total_bp - nm) / nsd;
  const kk = wk.filter(([w]) => marketWk.has(w)), c = corr(kk.map((x) => x[1]), kk.map(([w]) => marketWk.get(w)));
  let eq = 0, peak = 0, dd = 0; for (const r of rows) { eq += r.ret; peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak); }
  const parts = { funding: +rows.reduce((a, r) => a + r.funding, 0).toFixed(0), basis: +rows.reduce((a, r) => a + r.basis, 0).toFixed(0), cost: +rows.reduce((a, r) => a + r.cost, 0).toFixed(0) };
  const halves = [rows.filter((r) => r.t < mid), rows.filter((r) => r.t >= mid)].map((h) => tWeeks(weekly(h).map((x) => x[1])));
  const years = (rows.length * 4) / 8760;
  const works = st.t >= 2.24 && z >= 1.645 && Math.abs(c) < 0.3;
  const name = `vigilance ${vigil ? 'on' : 'off'}`;
  report.variants[name] = { ...st, annual_pct: +(st.total_bp / years / 100).toFixed(2), parts, worst_week_bp: +Math.min(...wk.map((x) => x[1])).toFixed(0), max_drawdown_bp: +dd.toFixed(0), mean_held: +(rows.reduce((a, r) => a + r.held, 0) / rows.length).toFixed(2), vigilance_drops: drops, null: { mean_bp: +nm.toFixed(0), sd: +nsd.toFixed(0), z: +z.toFixed(2) }, market_corr: c, halves, works };
  const v = report.variants[name];
  console.log(`${name}: ${st.weeks} weeks, ${st.mean_bp_week}bp/week (sd ${st.sd_bp_week}), t ${st.t}, ${v.annual_pct}%/yr; funding ${parts.funding} basis ${parts.basis} costs ${parts.cost}; worst week ${v.worst_week_bp}bp, max drawdown ${v.max_drawdown_bp}bp; held ${v.mean_held}; drops ${drops}; null ${v.null.mean_bp} ± ${v.null.sd} (z ${v.null.z}); market corr ${c}; halves t ${halves[0].t} / ${halves[1].t} → ${works ? 'WORKS' : 'does not work'}`);
}
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
