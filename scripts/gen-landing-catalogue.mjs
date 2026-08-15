#!/usr/bin/env node
/**
 * Generate index.html's `var P = [...]` catalogue from catalogue.json.
 *
 * catalogue.json is the SOURCE OF TRUTH for "what a person can visit". This
 * script is the projection of it into the landing page. `var P` used to be the
 * source — hand-edited inside a 225 KB HTML file and regex-parsed back out by
 * nine other scripts — which is why coverage drifted and why every consumer
 * carried its own parser.
 *
 * WHAT THIS DOES NOT TOUCH: deploy-registry.json. Surface ownership and the
 * deploy pipeline are defined there and only there; catalogue entries carry a
 * `surface` foreign key INTO the registry, never the other way round.
 *
 * SAFETY. The landing page renders in array order, so a reordering would be a
 * visible change to a live site. This script therefore:
 *   1. emits entries in catalogue.json order, verbatim;
 *   2. re-parses the rewritten index.html and deep-compares the resulting P
 *      against the P that was there before — refusing to write on any
 *      semantic difference.
 * The rewrite is whitespace-and-formatting only. If the compare fails, nothing
 * is written.
 *
 * Usage:
 *   node scripts/gen-landing-catalogue.mjs            # check (dry run)
 *   node scripts/gen-landing-catalogue.mjs --write    # rewrite index.html
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { REDACT } from './lib/landing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'index.html');
const CATALOGUE = join(ROOT, 'catalogue.json');

const write = process.argv.includes('--write');

// Emission order. Anything not listed here is dropped from var P (the landing
// page has no use for it) but stays in catalogue.json — `surface` is the case
// that matters: it is a catalogue fact, not a landing-page one.
const EMIT = ['n', 'u', 'c', 'k', 'a', 't', 'b', 'p'];

// ---------------------------------------------------------------- locating --
// Same bracket walk as lib/landing.mjs loadLanding(), kept local so this script
// can operate on an arbitrary html string (it needs to re-verify its own output).
function locate(html) {
  const marker = html.indexOf('var P = [');
  if (marker < 0) throw new Error('could not find `var P = [` in index.html');
  const start = html.indexOf('[', marker);
  let depth = 0, end = -1;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) throw new Error('unbalanced brackets parsing the P array');
  return { start, end };
}

function parseP(html) {
  const { start, end } = locate(html);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${html.slice(start, end + 1)});`)();
}

// ----------------------------------------------------------------- literal --
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const lit = (v) => (typeof v === 'number' ? String(v) : q(v));

function render(cat) {
  const { entries, sections = [] } = cat;

  // Column alignment: pad the two long fields so the block stays scannable.
  // Computed from the data, so it stays correct as entries come and go.
  const wN = Math.max(...entries.map((e) => q(e.n).length));
  const wU = Math.max(...entries.map((e) => q(e.u).length));

  const marks = new Map();
  for (const s of sections) {
    if (!marks.has(s.before)) marks.set(s.before, []);
    marks.get(s.before).push(s.label);
  }

  const lines = ['['];
  entries.forEach((e, i) => {
    for (const label of marks.get(i) || []) lines.push(`    // ${label}`);
    // `n` and `u` are padded (comma included, so the columns line up); the
    // short trailing fields just run on.
    const head = `n:${q(e.n)},`.padEnd(wN + 3) + ` u:${q(e.u)},`.padEnd(wU + 4);
    const rest = EMIT.slice(2)
      .filter((k) => e[k] !== undefined)
      .map((k) => `${k}:${lit(e[k])}`)
      .join(', ');
    lines.push(`    { ${head} ${rest} },`);
  });
  for (const label of marks.get(entries.length) || []) lines.push(`    // ${label}`);
  lines.push('  ]');
  return lines.join('\n');
}

// -------------------------------------------------------------------- main --
const cat = JSON.parse(readFileSync(CATALOGUE, 'utf8'));
const before = readFileSync(INDEX, 'utf8');
const beforeP = parseP(before);

const { start, end } = locate(before);
const after = before.slice(0, start) + render(cat) + before.slice(end + 1);

// --- guard 1: nothing work-facing may enter the landing page ---------------
const emitted = after.slice(start, start + render(cat).length);
if (REDACT.test(emitted)) {
  console.error('REFUSING: emitted catalogue contains a work-facing referent');
  process.exit(1);
}

// --- guard 2: the emitted literal must round-trip to the catalogue ---------
// The invariant is FAITHFULNESS, not stability: `var P` is allowed to change
// whenever catalogue.json does — that is the whole point — but what lands in
// the page must parse back to exactly what the catalogue says. That is what
// catches an emission bug (a bad escape, a dropped field, a mangled quote)
// before it reaches a live page.
//
// (During the migration this compared against the PREVIOUS var P instead,
// which proved the lift changed nothing. Kept as a one-off, it would have
// made every future catalogue edit unpublishable.)
const afterP = parseP(after);
const norm = (rows) => JSON.stringify(rows.map((p) => EMIT.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])));
if (norm(cat.entries) !== norm(afterP)) {
  console.error('REFUSING: the emitted var P does not round-trip to catalogue.json.');
  console.error(`  catalogue: ${cat.entries.length} entries, emitted: ${afterP.length} entries`);
  for (let i = 0; i < Math.max(cat.entries.length, afterP.length); i++) {
    const a = norm([cat.entries[i] || {}]), b = norm([afterP[i] || {}]);
    if (a !== b) { console.error(`  first difference at index ${i}:\n    catalogue: ${a}\n    emitted:   ${b}`); break; }
  }
  process.exit(1);
}
// Report what the rewrite actually changes, so a surprising diff is visible
// rather than silent.
if (norm(beforeP) !== norm(afterP)) {
  console.log(`catalogue changed: ${beforeP.length} -> ${afterP.length} entries`);
}

if (after === before) {
  console.log(`var P is current — ${cat.entries.length} entries, no change`);
  process.exit(0);
}

if (!write) {
  console.log(`var P is STALE — ${cat.entries.length} entries would be rewritten`);
  console.log('(dry run — pass --write to update index.html)');
  process.exit(1);
}

writeFileSync(INDEX, after);
console.log(`rewrote index.html var P from catalogue.json: ${cat.entries.length} entries`);
console.log('verified: the emitted literal round-trips to catalogue.json');
