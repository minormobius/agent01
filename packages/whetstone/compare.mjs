#!/usr/bin/env node
// compare.mjs — the sharpening loop's diff: did this edit to a soul make it sharper?
//
//   node compare.mjs runs/<before>/scorecard.json runs/<after>/scorecard.json
//
// One row per gated metric, before → after, with the gate. Read the intervals: on this lab's
// small n, a move that stays inside both intervals is not yet a move.

import { readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error('usage: compare.mjs <before/scorecard.json> <after/scorecard.json>'); process.exit(1); }
const A = JSON.parse(readFileSync(a, 'utf8')), B = JSON.parse(readFileSync(b, 'utf8'));
const key = (g) => `${g.scope}\u0000${g.metric}`;
const before = new Map((A.gates || []).map((g) => [key(g), g]));

const fmt = (g) => (g && g.value !== null && g.value !== undefined
  ? `${g.value}${g.lo !== undefined && g.lo !== null ? ` (${g.lo}–${g.hi})` : ''}` : '—');
const mark = (g) => (!g ? '' : g.pass === true ? 'pass' : g.pass === false ? 'FAIL' : '·');

console.log(`before: ${A.run?.label} (${A.run?.at})\nafter:  ${B.run?.label} (${B.run?.at})\n`);
console.log('| scope | metric | before | after | Δ | |');
console.log('|---|---|---|---|---|---|');
for (const g of B.gates || []) {
  const p = before.get(key(g));
  const d = p && typeof p.value === 'number' && typeof g.value === 'number' ? (g.value - p.value).toFixed(2) : '';
  const overlap = p && p.lo !== undefined && g.lo !== undefined && p.lo !== null && g.lo !== null
    && !(g.lo > p.hi || g.hi < p.lo) ? ' (within noise)' : '';
  console.log(`| ${g.scope} | ${g.metric} | ${fmt(p)} ${mark(p)} | ${fmt(g)} ${mark(g)} | ${d}${d ? overlap : ''} | |`);
}
for (const s of Object.keys(B.souls || {})) {
  const h0 = A.souls?.[s]?.hash, h1 = B.souls[s].hash;
  console.log(`\n${s}: soul ${h0 === h1 ? `unchanged (${h1})` : `${h0 || 'new'} → ${h1}`}`);
}
