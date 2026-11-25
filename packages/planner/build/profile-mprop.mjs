#!/usr/bin/env node
// Profile each MPROP year: which spelling each canonical field resolved to, which are
// missing, and the value distributions that decide how a field may be used.
// Writes data/derived/mprop-profile.json. Run before trusting any MPROP series.
import { readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv } from '../lib/csv.mjs';
import { resolve, record } from '../lib/mprop-schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'data/raw/mprop');
const years = readdirSync(DIR).filter(f => /^\d{4}\.csv$/.test(f)).map(f => +f.slice(0, 4)).sort();
const only = process.argv.slice(2).map(Number).filter(Boolean);

const top = (m, n = 15) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]).slice(0, n));
const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);

const out = {};
for (const y of only.length ? only : years) {
  let header, res, n = 0, badWidth = 0;
  const dist = { cls: new Map(), exmType: new Map(), ownerOcc: new Map(), luGroup: new Map(), subacct: new Map(), conveyDate: new Map() };
  const nonNull = {}; const sums = { land: 0, impr: 0, total: 0, exmTotal: 0, units: 0 };
  const keys = new Set(); let dupKeys = 0;
  for await (const row of readCsv(join(DIR, `${y}.csv`))) {
    if (!header) { header = row; res = resolve(header); continue; }
    if (row.length === 1 && row[0] === '') continue;
    if (row.length !== header.length) badWidth++;
    const r = record(row, res.map, y); n++;
    for (const k of Object.keys(dist)) bump(dist[k], k === 'conveyDate' ? (r.conveyDate ? r.conveyDate.replace(/\d/g, '9') : null) : String(row[res.map[k]] ?? '∅').trim());
    for (const [k, v] of Object.entries(r)) if (v != null) nonNull[k] = (nonNull[k] || 0) + 1;
    for (const k of Object.keys(sums)) sums[k] += r[k] || 0;
    const id = r.taxkey + '/' + r.subacct; if (keys.has(id)) dupKeys++; else keys.add(id);
  }
  out[y] = {
    rows: n, badWidth, dupKeys, used: res.used, missing: res.missing,
    fill: Object.fromEntries(Object.entries(nonNull).map(([k, v]) => [k, +(v / n).toFixed(3)])),
    sums_millions: Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, Math.round(v / 1e6)])),
    dist: Object.fromEntries(Object.entries(dist).map(([k, m]) => [k, top(m)])),
  };
  const o = out[y];
  console.log(`${y} rows=${n} badW=${badWidth} dup=${dupKeys} total=$${o.sums_millions.total}M exm=$${o.sums_millions.exmTotal}M units=${sums.units} missing=[${res.missing.join(',')}]`);
}
if (!only.length) writeFileSync(join(ROOT, 'data/derived/mprop-profile.json'), JSON.stringify(out, null, 1) + '\n');
else console.log(JSON.stringify(out, null, 1));
