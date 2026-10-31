#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseReports, parseResidents, weekOf, weekly, mutes, rings, appealJudge } from './mod.mjs';
const [rf, sf, start] = process.argv.slice(2);
const reports = parseReports(readFileSync(rf, 'utf8')), residents = parseResidents(readFileSync(sf, 'utf8'));
const w = weekly(reports, start);
const m = mutes(reports, start);
console.log(JSON.stringify({
  weeks: Math.max(0, ...reports.map((r) => weekOf(r.date, start))),
  mutes: m, rings: rings(reports, residents),
  judges: m.map((x) => ({ week: x.week, handle: x.handle, judge: appealJudge({ handle: x.handle, week: x.week, reporters: w[String(x.week)][x.handle].reporters }, residents, start) })),
}));
