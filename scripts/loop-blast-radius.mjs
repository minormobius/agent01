#!/usr/bin/env node
// loop-blast-radius.mjs — the contagion firewall.
//
// docs/CLOSED-LOOP.md §7 states the requirement and does not soften it:
//
//   > Requirement, to be written and tested before the first autonomous commit:
//   > the loop runs on its own branch, writes only under its own paths, and
//   > there is a check asserting its diff cannot match any other workflow's
//   > triggers. Asserted, not assumed — the cost of being wrong here is a
//   > self-sustaining reaction that spends the operator's model budget in a
//   > circle, or posts.
//
// This is that check. A push is what wakes the next workflow, so a loop that
// commits is a chain reaction with 135 potential listeners, several of which
// publish records, post to real Bluesky accounts, or spend model budget. The
// loop is *designed* to wake some of them — that is the mechanism, not a bug —
// so the check is not "wake nothing". It is:
//
//   the set of workflows a loop commit can wake  ⊆  the set it declares
//
// Declaring is the point. A workflow that appears in the computed set and not
// in `mayWake` is either a bug in the loop's write paths or a workflow that
// grew a trigger since the loop was designed, and both are things you want to
// hear about from CI at 3am rather than from a billing page at 9.
//
//   node scripts/loop-blast-radius.mjs            # the table, exit 0/1
//   node scripts/loop-blast-radius.mjs --check    # same, quiet unless broken
//   node scripts/loop-blast-radius.mjs --explain  # why each workflow fires or not
//   node scripts/loop-blast-radius.mjs --json
//   node scripts/loop-blast-radius.mjs --config .github/loop/other.json
//
// The check is deliberately generic — a second loop gets a second config file
// and the same firewall, with nothing added here.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';
import { loadWorkflows, wouldFire } from './lib/workflow-triggers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const check = argv.includes('--check');
const explain = argv.includes('--explain');
const asJson = argv.includes('--json');
const cfgArg = argv.find((a) => a.startsWith('--config='))
  ?? (argv.includes('--config') ? argv[argv.indexOf('--config') + 1] : null);
// isAbsolute, because `join(ROOT, '/abs/path')` silently produces
// ROOT + '/abs/path' and then reports the config as missing — which reads as
// "you typo'd the filename" rather than "this tool cannot take an absolute
// path". Found while pointing the firewall at a scratch config.
const cfgRel = cfgArg?.replace(/^--config=/, '') || join('.github', 'loop', 'config.json');
const CONFIG = isAbsolute(cfgRel) ? cfgRel : join(ROOT, cfgRel);

if (!existsSync(CONFIG)) {
  console.error(`loop-blast-radius: no config at ${CONFIG.replace(ROOT + '/', '')}`);
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));

for (const k of ['branch', 'writes', 'mayWake']) {
  if (!cfg[k]) { console.error(`loop-blast-radius: config is missing "${k}"`); process.exit(1); }
}

/**
 * Concrete probe paths from the loop's declared write globs.
 *
 * The honest version of this question — "do two glob languages intersect?" —
 * is answerable but its answer is a proof, and a proof is not what you want to
 * read at 3am. Probes are: expand each write pattern into representative real
 * paths and test those. It can only ever UNDER-report (a workflow whose filter
 * matches some exotic path no probe covers), so the depths are generous and
 * every probe is printed under --explain, where an under-report is visible as
 * a probe set that plainly does not cover what the loop writes.
 */
function probes(pattern) {
  if (!pattern.includes('*')) return [pattern];
  const out = new Set();
  // `**` stands for zero or more segments — cover zero, one, two and three,
  // because a `paths:` filter like `a/*/c` only matches at one exact depth.
  const depths = ['', 'a', 'a/b', 'a/b/c'];
  for (const d of depths) {
    let p = pattern.replaceAll('**', d);
    p = p.replaceAll('*', 'x');
    p = p.replace(/\/{2,}/g, '/').replace(/\/$/, '');
    if (p) out.add(p);
    // …and a leaf with a plausible extension, since some filters end in one.
    if (p && !/\.[a-z0-9]+$/i.test(p)) {
      for (const ext of ['.json', '.jsonl', '.html', '.js', '.mjs', '.md', '.yml']) out.add(`${p}/f${ext}`);
    }
  }
  return [...out];
}

const files = [...new Set(cfg.writes.flatMap(probes))].sort();
const workflows = loadWorkflows(ROOT);
const declared = new Set(cfg.mayWake);

const rows = workflows.map((wf) => {
  const r = wouldFire(wf, cfg.branch, files);
  return { file: wf.file, ...r, declared: declared.has(wf.file), parsed: wf.parsed };
});

const fires = rows.filter((r) => r.fires);
const undeclared = fires.filter((r) => !r.declared);
const stale = [...declared].filter((d) => !fires.some((f) => f.file === d));
const unparsed = rows.filter((r) => !r.parsed);

if (asJson) {
  console.log(JSON.stringify({
    branch: cfg.branch, writes: cfg.writes, probes: files,
    fires: fires.map((r) => ({ file: r.file, why: r.why, declared: r.declared })),
    undeclared: undeclared.map((r) => r.file),
    declaredButNotReached: stale,
    unparsed: unparsed.map((r) => r.file),
    ok: undeclared.length === 0 && unparsed.length === 0,
  }, null, 2));
  process.exit(undeclared.length || unparsed.length ? 1 : 0);
}

if (explain) {
  console.log(`\nprobe paths (${files.length}) from writes ${JSON.stringify(cfg.writes)}:`);
  for (const f of files) console.log(`  ${f}`);
  console.log(`\nevery workflow, against a push to ${cfg.branch}:`);
  for (const r of rows) {
    console.log(`  ${r.fires ? '🔥' : '  '} ${r.file.padEnd(34)} ${r.why}`);
  }
}

if (!check || undeclared.length || unparsed.length) {
  console.log(`\nblast radius of a loop commit to ${cfg.branch}`);
  console.log(`  writes: ${cfg.writes.join(', ')}`);
  if (!fires.length) console.log('  wakes:  nothing');
  for (const r of fires) {
    console.log(`  ${r.declared ? '✓' : '✗'} wakes ${r.file.padEnd(28)} ${r.why}`);
  }
  for (const d of stale) console.log(`  · declared but unreachable: ${d} (dead entry, or a trigger changed)`);
}

let bad = 0;
if (unparsed.length) {
  console.log(`\n✗ ${unparsed.length} workflow(s) could not be parsed, so their triggers are unknown:`);
  for (const r of unparsed) console.log(`    ${r.file}`);
  console.log('  Treated as firing. Fix the workflow shape or the extractor before running the loop.');
  bad += unparsed.length;
}
if (undeclared.length) {
  console.log(`\n✗ ${undeclared.length} workflow(s) would wake and are NOT declared in mayWake:`);
  for (const r of undeclared) console.log(`    ${r.file} — ${r.why}`);
  console.log('\n  Either narrow the loop\'s writes, or add the workflow to mayWake IF you have');
  console.log('  read it and it is safe to fire on every loop commit. Read it. Some of these');
  console.log('  publish records, post to real accounts, or spend model budget per run.');
  bad += undeclared.length;
}

if (bad) { console.log(''); process.exit(1); }
console.log(`\n✓ blast radius contained — ${fires.length} declared listener(s), ${workflows.length} workflows checked\n`);
