#!/usr/bin/env node
// drift.mjs — node shelf/drift.mjs people.json START DAYS PERIODS [--no-leave] [--carry]
// --carry feeds each period the balances from the ones before it (Morphyx); compare with and without.
// Generates PERIODS back-to-back rotas of DAYS days and sums, per person, (shifts − share) and
// (weekend shifts − weekend share). Each period can pass POLICY.md while the same person loses
// a little every time; this shows it. Linear growth = a standing bias; ~sqrt(PERIODS) = noise.
import { makeRota } from '../lib/assign.mjs';
import { shares, tally, balance } from '../lib/policy.mjs';
import { days } from '../lib/calendar.mjs';
import { loadPeople } from '../lib/people.mjs';
const [file, start, n0, k0, ...flags] = process.argv.slice(2);
const flag = flags.includes('--no-leave') ? '--no-leave' : '', useCarry = flags.includes('--carry'), past = [];
const n = Number(n0), k = Number(k0), team = loadPeople(file);
if (flag === '--no-leave') for (const p of team) p.leave = new Set();
const acc = Object.fromEntries(team.map((p) => [p.name, [0, 0]]));
for (let i = 0, s = start; i < k; i++, s = days(s, n + 1).pop()) {
  const r = makeRota(team, s, n, { carry: useCarry ? balance(team, past) : null }); past.push(r);
  const t = tally(r), sh = shares(team, s, n);
  for (const p of team) { acc[p.name][0] += (t[p.name]?.total ?? 0) - sh.get(p.name).total; acc[p.name][1] += (t[p.name]?.weekend ?? 0) - sh.get(p.name).weekend; }
}
console.log(`${k} × ${n}-day periods from ${start}: cumulative shifts − share, weekend shifts − share`);
for (const [x, [a, b]] of Object.entries(acc)) console.log(`${x.padEnd(12)} ${a.toFixed(1).padStart(7)} ${b.toFixed(1).padStart(7)}`);
