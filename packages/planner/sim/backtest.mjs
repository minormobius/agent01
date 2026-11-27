#!/usr/bin/env node
// Rolling-origin backtest: stand at year B knowing only data through B (plus the national
// economy's actual path — a conditional forecast), project Milwaukee County jobs by sector
// for B+1..B+H, and score against what happened. Every origin B from FIRST to the last
// year that leaves a horizon. Writes data/derived/sim/backtest.json and prints the board.
//
// Contenders (all get the same information):
//   persistence     jobs stay where they were at B
//   shift-share     each sector grows with its national job count
//   shift-trend     shift-share + the sector's own trailing differential vs the nation
//   io              the input-output model, exogenous demand growing with national output
//   io-drift        io + each sector's trailing differential in exogenous demand
// A model earns its complexity only by beating shift-trend, the strongest cheap baseline.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTORS, N, IDX } from './sectors.mjs';
import { YEARS, nat, cty, city, NOTES } from './data.mjs';
import { calibrate, step, sum, DEFAULTS } from './model.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const H = 5, FIRST = 2007, LAST_DATA = Math.max(...YEARS);
const TRAIN_MIN = 4;          // years of history a drift estimate needs
const SHRINK = 0.5;           // trailing drift is noisy: use half of it
const JOBS = [...Array(N).keys()].filter(i => !SECTORS[i].noJobs);

const params = { ...DEFAULTS };
for (const a of process.argv.slice(2)) { const [k, v] = a.replace(/^--/, '').split('='); if (k in params) params[k] = +v; }

// Historical residual demand, one calibration per year with that year's own quotients.
const hist = Object.fromEntries(YEARS.map(y => [y, calibrate(y, params)]));

function trailingDrift(B, series, natSeries) {
  // mean of log(series_t/series_{t-1}) - log(nat_t/nat_{t-1}) over t in (B-k, B], shrunk
  const yrs = YEARS.filter(y => y > YEARS[0] && y <= B).slice(-8);
  return [...Array(N).keys()].map(i => {
    const v = yrs.map(y => { const a = series(y, i), b = series(y - 1, i), na = natSeries(y, i), nb = natSeries(y - 1, i);
      return a > 0 && b > 0 && na > 0 && nb > 0 ? Math.log(a / b) - Math.log(na / nb) : null; }).filter(v => v !== null);
    if (v.length < TRAIN_MIN) return 0;
    const m = v.reduce((s, x) => s + x, 0) / v.length;
    return Math.max(-0.1, Math.min(0.1, m * SHRINK));
  });
}

function forecast(kind, B, h) {
  const E0 = cty[B].emp, out = {};
  if (kind === 'persistence') for (let t = 1; t <= h; t++) out[B + t] = E0.slice();
  if (kind === 'shift-share' || kind === 'shift-trend') {
    const dr = kind === 'shift-trend' ? trailingDrift(B, (y, i) => cty[y].emp[i], (y, i) => nat[y].emp[i]) : new Array(N).fill(0);
    for (let t = 1; t <= h; t++) out[B + t] = E0.map((e, i) => nat[B].emp[i] ? e * nat[B + t].emp[i] / nat[B].emp[i] * Math.exp(dr[i] * t) : e);
  }
  if (kind === 'io' || kind === 'io-drift') {
    const dr = kind === 'io-drift' ? trailingDrift(B, (y, i) => hist[y].d[i], (y, i) => nat[y].out[i]) : new Array(N).fill(0);
    let s = hist[B];
    for (let t = 1; t <= h; t++) { s = step(s, dr); out[B + t] = s.E.slice(); }
  }
  return out;
}

const KINDS = ['persistence', 'shift-share', 'shift-trend', 'io', 'io-drift'];
const err = {}; // kind -> horizon -> list of {total, sectorWAPE, city}
const paths = {};
for (const k of KINDS) { err[k] = {}; paths[k] = {}; }
for (let B = FIRST; B < LAST_DATA; B++) {
  const h = Math.min(H, LAST_DATA - B);
  for (const k of KINDS) {
    const f = forecast(k, B, h); paths[k][B] = {};
    for (let t = 1; t <= h; t++) {
      const y = B + t, act = cty[y].emp, pred = f[y];
      const totA = sum(JOBS.map(i => act[i])), totP = sum(JOBS.map(i => pred[i]));
      const wape = sum(JOBS.map(i => Math.abs(pred[i] - act[i]))) / totA;
      const cityA = sum(JOBS.map(i => act[i] * city[y].share[i])), cityP = sum(JOBS.map(i => pred[i] * city[B].share[i]));
      (err[k][t] ||= []).push({ B, y, total: (totP - totA) / totA, wape, city: (cityP - cityA) / cityA });
      paths[k][B][y] = Math.round(totP);
    }
  }
}

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const board = {};
for (const k of KINDS) board[k] = Object.fromEntries(Object.entries(err[k]).map(([t, v]) => [t, {
  n: v.length, totalMAPE: +mean(v.map(e => Math.abs(e.total))).toFixed(4), totalBias: +mean(v.map(e => e.total)).toFixed(4),
  sectorWAPE: +mean(v.map(e => e.wape)).toFixed(4), cityMAPE: +mean(v.map(e => Math.abs(e.city))).toFixed(4),
}]));

// headline: average over all horizons, weighted equally per forecast
const headline = Object.fromEntries(KINDS.map(k => { const all = Object.values(err[k]).flat(); return [k, {
  forecasts: all.length, totalMAPE: +mean(all.map(e => Math.abs(e.total))).toFixed(4), sectorWAPE: +mean(all.map(e => e.wape)).toFixed(4), cityMAPE: +mean(all.map(e => Math.abs(e.city))).toFixed(4) }]; }));

console.log(`Rolling-origin backtest, origins ${FIRST}-${LAST_DATA - 1}, horizons 1-${H}, Milwaukee County jobs (params ${JSON.stringify(params)})\n`);
console.log('                    total-jobs MAPE by horizon                 all-horizon');
console.log('model          ' + [1, 2, 3, 4, 5].map(t => `   h${t}  `).join('') + '   total  sector  city');
for (const k of KINDS) console.log(k.padEnd(14) + [1, 2, 3, 4, 5].map(t => (100 * board[k][t].totalMAPE).toFixed(2).padStart(6) + '% ').join('') +
  (100 * headline[k].totalMAPE).toFixed(2).padStart(7) + '%' + (100 * headline[k].sectorWAPE).toFixed(2).padStart(7) + '%' + (100 * headline[k].cityMAPE).toFixed(2).padStart(6) + '%');

mkdirSync(join(ROOT, 'data/derived/sim'), { recursive: true });
writeFileSync(join(ROOT, 'data/derived/sim/backtest.json'), JSON.stringify({
  what: 'Rolling-origin conditional forecasts of Milwaukee County jobs. Errors are (predicted - actual)/actual. sectorWAPE = sum of absolute sector errors / total jobs (so it counts mix errors that cancel in the total). city = Milwaukee city jobs via the LODES sector shares frozen at the origin.',
  params, horizon: H, origins: [FIRST, LAST_DATA - 1], shrink: SHRINK, headline, byHorizon: board, paths,
  actual: Object.fromEntries(YEARS.map(y => [y, Math.round(sum(JOBS.map(i => cty[y].emp[i])))])),
  notes: NOTES,
}, null, 1) + '\n');
