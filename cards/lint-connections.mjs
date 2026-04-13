#!/usr/bin/env node
// Tech tree connection linter — validates prerequisite graph integrity
import { TECH_POOL, TECH_ERAS, TECH_DOMAINS } from './js/pools/tech-pool.js';

const titles = new Set(TECH_POOL.map(t => t[0]));
const byTitle = Object.fromEntries(TECH_POOL.map(t => [t[0], t]));
const childOf = {};
TECH_POOL.forEach(t => t[2].prereqs.forEach(p => (childOf[p] ??= []).push(t[0])));

let errors = 0, warnings = 0;
function err(msg) { console.log(`  x ${msg}`); errors++; }
function warn(msg) { console.log(`  ! ${msg}`); warnings++; }

// 1. Broken prereqs
console.log('\n-- Broken Prerequisites --');
let brokenCount = 0;
for (const t of TECH_POOL) {
  for (const p of t[2].prereqs) {
    if (!titles.has(p)) { err(`${t[0]} -> "${p}" (not found)`); brokenCount++; }
  }
}
if (!brokenCount) console.log('  OK All prereqs resolve');

// 2. Duplicate titles
console.log('\n-- Duplicates --');
const seen = new Set();
let dupCount = 0;
for (const t of TECH_POOL) {
  if (seen.has(t[0])) { err(`Duplicate: "${t[0]}"`); dupCount++; }
  seen.add(t[0]);
}
if (!dupCount) console.log('  OK No duplicates');

// 3. Temporal violations (child predates parent)
console.log('\n-- Temporal Violations --');
let tempCount = 0;
for (const t of TECH_POOL) {
  for (const p of t[2].prereqs) {
    const parent = byTitle[p];
    if (parent && parent[2].year > t[2].year) {
      err(`${t[0]} (${t[2].year}) requires ${p} (${parent[2].year})`);
      tempCount++;
    }
  }
}
if (!tempCount) console.log('  OK All prereqs chronologically valid');

// 4. Dead ends (no children)
console.log('\n-- Dead Ends (no children) --');
const deadEnds = TECH_POOL.filter(t => !childOf[t[0]]);
const deByEra = {};
deadEnds.forEach(t => (deByEra[t[1]] ??= []).push(t[0]));
for (const era of Object.keys(TECH_ERAS)) {
  const techs = deByEra[era] || [];
  if (!techs.length) continue;
  console.log(`  ${era}: ${techs.length} -- ${techs.join(', ')}`);
}
console.log(`  Total: ${deadEnds.length}/${TECH_POOL.length} (${(100*deadEnds.length/TECH_POOL.length).toFixed(0)}%)`);

// 5. Roots (no prereqs)
console.log('\n-- Roots (no prerequisites) --');
const roots = TECH_POOL.filter(t => !t[2].prereqs.length);
console.log(`  ${roots.length} roots: ${roots.map(t => t[0]).join(', ')}`);

// 6. Domain coverage by era
console.log('\n-- Domain Coverage by Era --');
const domKeys = Object.keys(TECH_DOMAINS);
for (const era of Object.keys(TECH_ERAS)) {
  const techs = TECH_POOL.filter(t => t[1] === era);
  const doms = [...new Set(techs.map(t => t[2].domain))];
  const missing = domKeys.filter(d => !doms.includes(d));
  console.log(`  ${era.padEnd(12)} ${String(techs.length).padStart(3)} techs  ${doms.length}/${domKeys.length} domains${missing.length ? '  missing: '+missing.join(', ') : ''}`);
}

// 7. Longest chains
console.log('\n-- Longest Prerequisite Chains (top 10) --');
const _depth = {};
function depth(t) {
  if (_depth[t] != null) return _depth[t];
  const entry = byTitle[t];
  if (!entry || !entry[2].prereqs.length) return (_depth[t] = 0);
  _depth[t] = -1;
  return (_depth[t] = 1 + Math.max(...entry[2].prereqs.map(depth)));
}
TECH_POOL.forEach(t => depth(t[0]));
const sorted = [...TECH_POOL].sort((a, b) => (_depth[b[0]]||0) - (_depth[a[0]]||0));
for (const t of sorted.slice(0, 10)) {
  let chain = [t[0]], cur = t[0];
  while (true) {
    const entry = byTitle[cur];
    if (!entry || !entry[2].prereqs.length) break;
    const deepest = entry[2].prereqs.reduce((best, p) =>
      (_depth[p]||0) > (_depth[best]||0) ? p : best, entry[2].prereqs[0]);
    chain.push(deepest);
    cur = deepest;
  }
  console.log(`  depth ${_depth[t[0]]}: ${chain.join(' <- ')}`);
}

// 8. Long jumps (>2000 year gap)
console.log('\n-- Long Jumps (>2000 year gap) --');
let jumpCount = 0;
const jumps = [];
for (const t of TECH_POOL) {
  for (const p of t[2].prereqs) {
    const parent = byTitle[p];
    if (!parent) continue;
    const gap = t[2].year - parent[2].year;
    if (gap > 2000) jumps.push({ tech: t[0], year: t[2].year, parent: p, pyear: parent[2].year, gap });
  }
}
jumps.sort((a,b) => b.gap - a.gap);
for (const j of jumps.slice(0, 15)) {
  warn(`${j.tech} (${j.year}) <- ${j.parent} (${j.pyear}) = ${j.gap}y`);
  jumpCount++;
}
if (jumps.length > 15) console.log(`  ... and ${jumps.length - 15} more`);
if (!jumpCount) console.log('  OK No extreme gaps');

// 9. Innovation timeline
console.log('\n-- Innovation Timeline --');
const bins = [
  [-3500000,-10000,'Pre-10k'],[- 10000,-3000,'Neolithic'],[-3000,0,'Ancient'],
  [0,500,'0-500'],[500,1000,'500-1000'],[1000,1400,'Medieval'],
  [1400,1600,'1400-1600'],[1600,1700,'1600s'],[1700,1800,'1700s'],
  [1800,1900,'1800s'],[1900,1950,'1900-50'],[1950,2000,'1950-2000'],[2000,2030,'2000+']
];
const maxCx = Math.max(...bins.map(([lo,hi]) =>
  TECH_POOL.filter(t => t[2].year >= lo && t[2].year < hi).reduce((s,t) => s+t[2].complexity,0)));
for (const [lo,hi,lbl] of bins) {
  const techs = TECH_POOL.filter(t => t[2].year >= lo && t[2].year < hi);
  const cx = techs.reduce((s,t) => s + t[2].complexity, 0);
  const bar = '#'.repeat(Math.round((cx/maxCx)*40));
  console.log(`  ${lbl.padEnd(10)} ${String(techs.length).padStart(3)} techs ${String(cx).padStart(4)} cx  ${bar}`);
}

// 10. Summary
console.log('\n-- Summary --');
console.log(`  Technologies: ${TECH_POOL.length}`);
console.log(`  Roots: ${roots.length}`);
console.log(`  Dead ends: ${deadEnds.length} (${(100*deadEnds.length/TECH_POOL.length).toFixed(0)}%)`);
console.log(`  Max depth: ${Math.max(...Object.values(_depth))}`);
console.log(`  Errors: ${errors}  Warnings: ${warnings}`);
console.log('');

process.exit(errors > 0 ? 1 : 0);
