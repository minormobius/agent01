// Load data/derived/ into model-ready yearly arrays, indexed by SECTORS order.
//
//   nat[y]  = { emp, out, va, comp, A, imp, pce, fd }   United States, from QCEW + BEA I-O
//   cty[y]  = { emp, va, wages, pi, nonWage }           Milwaukee County, from QCEW + BEA
//   city[y] = { share }                                 city/county job share by sector, from LODES
//
// Everything here is read from committed derived files, so the simulator runs without
// data/raw/. Every approximation is named where it is made, and collected in NOTES.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTORS, N, IDX, ioSector, naicsSector, FINAL } from './sectors.mjs';
import { zeros } from './linalg.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const D = f => join(ROOT, 'data/derived', f);
const json = f => JSON.parse(readFileSync(D(f), 'utf8'));
const split = l => [...l.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)].slice(0, -1).map(m => m[1].replace(/^"|"$/g, '').replace(/""/g, '"'));
const csv = f => { const [h, ...rs] = readFileSync(D(f), 'utf8').trim().split('\n').map(split); return rs.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };

export const NOTES = [];
const note = s => { if (!NOTES.includes(s)) NOTES.push(s); };

// ---- employment by model sector (QCEW, IO convention: private by NAICS + all government) ----
function qcewEmp(rows) {
  const by = {};
  for (const r of rows) {
    if (r.basis !== 'naics') continue;
    const y = +r.year, e = by[y] ||= { emp: new Array(N).fill(0), wages: new Array(N).fill(0), suppressed: [] };
    if (r.level === 'sector' && r.own === '5') {
      const s = naicsSector(r.code); if (s === undefined) continue; // 99 unclassified
      if (r.suppressed === '1') { e.suppressed.push(SECTORS[s].id); continue; }
      e.emp[s] += +r.emp; e.wages[s] += +r.wages;
    }
    if (r.level === 'own' && ['1', '2', '3'].includes(r.own)) { e.emp[IDX.GOV] += +r.emp; e.wages[IDX.GOV] += +r.wages; }
    if (r.level === 'own' && r.own === '5') { e.privTotal = +r.emp; e.privWages = +r.wages; }
  }
  // Suppressed private cells: give them the private remainder, split by national proportions.
  return by;
}

const usRows = csv('qcew-us.csv'), coRows = csv('qcew-county.csv');
const usEmp = qcewEmp(usRows), coEmp = qcewEmp(coRows);
for (const [y, e] of Object.entries(coEmp)) if (e.suppressed.length) {
  const known = e.emp.reduce((s, v, i) => s + (i === IDX.GOV ? 0 : v), 0);
  const rem = Math.max(0, e.privTotal - known);
  const nat = usEmp[y]; const idx = e.suppressed.map(id => IDX[id]);
  const w = idx.map(i => nat.emp[i]); const W = w.reduce((a, b) => a + b, 0) || 1;
  idx.forEach((i, k) => { e.emp[i] = rem * w[k] / W; e.wages[i] = e.emp[i] * (nat.wages[i] / nat.emp[i]); });
  note(`County QCEW private cells suppressed in some years (${[...new Set(Object.values(coEmp).flatMap(v => v.suppressed))].join(', ')}): filled with the private-sector remainder split in national proportions.`);
}

// ---- national input-output, aggregated to model sectors -------------------------------------
const use = json('io-use-summary.json').years, make = json('io-make-summary.json').years;
function natIO(y) {
  const U = use[y], M = make[y];
  const Uz = zeros(N, N), fd = {}, va = new Array(N).fill(0), comp = new Array(N).fill(0), g = new Array(N).fill(0);
  const colSec = U.cols.map(c => ioSector(c.code));
  for (const r of U.rows) {
    const rs = ioSector(r.code);
    r.v.forEach((v, j) => {
      const cs = colSec[j], fcode = U.cols[j].code;
      if (rs !== undefined && cs !== undefined) Uz[rs][cs] += v;
      if (rs !== undefined && FINAL[fcode]) { const k = FINAL[fcode]; (fd[k] ||= new Array(N).fill(0))[rs] += v; }
      if (cs !== undefined && r.code === 'V001') comp[cs] += v;
      if (cs !== undefined && r.name === 'Total Value Added') va[cs] += v;
      if (cs !== undefined && r.name === 'Total Industry Output') g[cs] += v;
    });
  }
  // Make: industry x commodity -> market shares D[i][c] = M[i][c] / q[c]
  const Mz = zeros(N, N), mColSec = M.cols.map(c => ioSector(c.code));
  for (const r of M.rows) { const is = ioSector(r.code); if (is === undefined) continue; r.v.forEach((v, j) => { const cs = mColSec[j]; if (cs !== undefined) Mz[is][cs] += v; }); }
  const q = Mz[0].map((_, c) => Mz.reduce((s, row) => s + row[c], 0));
  const Dm = Mz.map(row => row.map((v, c) => q[c] ? v / q[c] : 0));
  const B = Uz.map(row => row.map((v, j) => g[j] ? v / g[j] : 0));          // commodity per unit industry output
  const A = Dm.map(drow => B[0].map((_, j) => drow.reduce((s, d, c) => s + d * B[c][j], 0))); // industry x industry
  // import share by commodity: imports / (domestic absorption) ; F050 is negative in BEA's table
  const imp = fd.imports.map((m, i) => {
    const absorb = Uz[i].reduce((a, b) => a + b, 0) + Object.entries(fd).filter(([k]) => !['exports', 'imports'].includes(k)).reduce((s, [, v]) => s + v[i], 0);
    return absorb > 0 ? Math.min(0.95, Math.max(0, -m / absorb)) : 0;
  });
  return { A, g, va, comp, imp, fd };
}
note('National I-O: industry-by-industry coefficients A = D·B from the summary Make and Use tables (industry-technology assumption), aggregated to model sectors before the product. Scrap/used goods and noncomparable imports are dropped as leakages.');
note('Domestic coefficients: each row of A scaled by (1 - national import share of that commodity), import share = imports / (intermediate use + domestic final use).');

// ---- county value added (BEA CAGDP2) -> county output via national output/VA ratios ----------
const bea = json('bea-county.json').tables;
const GDPLINE = { AG: '3', MIN: '6', UTIL: '10', CON: '11', MFG: '12', WHOL: '34', RET: '35', TRAN: '36', INFO: '45', FIN: '51', RE: '56', PROF: '60', MGMT: '64', ADMIN: '65', EDU: '69', HEALTH: '70', ARTS: '76', ACCFD: '79', OTH: '82', GOV: '83' };
note('County output = BEA county GDP by industry x national (output / value added) for that sector. BEA folds owner-occupied housing into county real estate GDP; it is split off in national HS:(ORE+532RL) value-added proportions.');
note('BEA county GDP cells suppressed "(D)" are filled with county jobs x national value added per job.');

export const YEARS = [];
export const nat = {}, cty = {}, city = {};
const lodes = csv('lodes.csv');
for (let y = 2002; y <= 2023; y++) {
  if (!use[y] || !usEmp[y] || !coEmp[y]) continue;
  const io = natIO(String(y));
  const nE = usEmp[y].emp, cE = coEmp[y].emp;
  nat[y] = { emp: nE, out: io.g, va: io.va, comp: io.comp, A: io.A, imp: io.imp, fd: io.fd, wages: usEmp[y].wages };
  const va = new Array(N).fill(0), suppressed = [];
  for (const [id, line] of Object.entries(GDPLINE)) {
    const v = bea.CAGDP2[line]?.values[y];
    if (typeof v === 'number') va[IDX[id]] = v / 1000; // thousands -> millions, the I-O unit
    else { va[IDX[id]] = cE[IDX[id]] * io.va[IDX[id]] / nE[IDX[id]]; suppressed.push(id); }
  }
  const hsShare = io.va[IDX.HOUSING] / (io.va[IDX.HOUSING] + io.va[IDX.RE]);
  va[IDX.HOUSING] = va[IDX.RE] * hsShare; va[IDX.RE] -= va[IDX.HOUSING];
  const out = va.map((v, i) => io.va[i] ? v * io.g[i] / io.va[i] : 0);
  const pi = out.map((x, i) => SECTORS[i].noJobs || !cE[i] ? 0 : x / cE[i]); // output (millions) per job
  const pi30 = bea.CAINC30;
  const personal = pi30['10'].values[y] / 1000, wagesBEA = pi30['190'].values[y] / 1000, earnRes = pi30['45'].values[y] / 1000;
  cty[y] = { emp: cE, wages: coEmp[y].wages.map(w => w / 1e6), va, out, pi, suppressedGDP: suppressed,
    personalIncome: personal, nonWage: personal - earnRes, earningsResidence: earnRes, wagesPlaceOfWork: wagesBEA };
  // city share of county jobs, by sector, from LODES workplace counts
  const lc = lodes.find(r => +r.year === y && r.kind === 'wac' && r.geo === 'city');
  const lk = lodes.find(r => +r.year === y && r.kind === 'wac' && r.geo === 'county');
  city[y] = { share: SECTORS.map(s => { const a = s.cns.reduce((t, c) => t + +lc[c], 0), b = s.cns.reduce((t, c) => t + +lk[c], 0); return b ? a / b : 0; }),
    jobsTotal: +lc.C000, residentsEmployed: +lodes.find(r => +r.year === y && r.kind === 'rac' && r.geo === 'city').C000 };
  YEARS.push(y);
}
note('City share of each sector = LODES city workplace jobs / county workplace jobs in that NAICS sector. LODES has no public/private split, so the GOV share is the public-administration (CNS20) share — an approximation for public schools and hospitals.');
