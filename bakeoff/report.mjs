#!/usr/bin/env node
// report.mjs — collect scored cells into a comparison, and optionally stage it
// for the arena.
//
//   node bakeoff/report.mjs <run-id> [--from <dir>] [--publish]
//
//   --from <dir>   where the per-cell directories live (default bakeoff/.run).
//                  In CI this is the directory the cell artifacts were
//                  downloaded into; each subdirectory holds one cell.json.
//   --publish      ALSO stage the entries + arena page into os/public/arena/,
//                  which is what os.mino.mobi actually serves.
//
// THERE IS NO LEADERBOARD NUMBER for the race brief, and that is deliberate.
// Machine results are reported as a GATE (binary) and RACE PRIMITIVES (n/4).
// Neither is a measure of quality — they are the floor a thing has to clear to
// be worth looking at. The ranking is done by a human, in the arena, with an
// anonymised judge panel as a second opinion shown alongside. Anything that
// added those together would manufacture false precision about taste, which is
// the one thing this brief exists to observe.
//
// WHY PUBLISHING IS A SEPARATE FLAG. Entries are model-written HTML, and
// os.mino.mobi is inside the `.mino.mobi` SSO cookie scope and holds an
// Anthropic key in localStorage. Staging is therefore a deliberate human step,
// never something a CI run does on its own. The confirmed boundary is the play
// page's iframe sandbox (see arena.mjs); the `_headers` CSP meant to cover
// direct navigation has NOT been observed working — os/public/_headers.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, cpSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { landingHtml, playHtml } from './arena.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const args = process.argv.slice(2);
const runId = args.find((a) => !a.startsWith('--')) || 'local';
const fromIdx = args.indexOf('--from');
const FROM = resolve(fromIdx >= 0 ? args[fromIdx + 1] : join(HERE, '.run'));
const PUBLISH = args.includes('--publish');

const cells = JSON.parse(readFileSync(join(HERE, 'cells.json'), 'utf8'));

if (!existsSync(FROM)) {
  console.error(`report: nothing to collect — ${FROM} does not exist`);
  process.exit(1);
}

// ── collect ────────────────────────────────────────────────────────
const entries = [];
let judges = null;
for (const name of readdirSync(FROM).sort()) {
  const dir = join(FROM, name);
  if (!statSync(dir).isDirectory()) continue;
  if (existsSync(join(dir, 'judges.json'))) {
    try { judges = JSON.parse(readFileSync(join(dir, 'judges.json'), 'utf8')); } catch { /* optional */ }
  }
  const meta = join(dir, 'cell.json');
  if (!existsSync(meta)) continue;
  let rec;
  try { rec = JSON.parse(readFileSync(meta, 'utf8')); } catch { continue; }
  rec.dir = dir;
  const notes = join(dir, 'entry', 'NOTES.md');
  rec.notes = existsSync(notes) ? readFileSync(notes, 'utf8') : null;
  const patch = join(dir, 'entry.patch');
  rec.patchBytes = existsSync(patch) ? statSync(patch).size : 0;
  rec.hasEntry = existsSync(join(dir, 'entry', 'index.html'));
  rec.frames = existsSync(join(dir, 'capture'))
    ? readdirSync(join(dir, 'capture')).filter((f) => f.endsWith('.png')).sort()
    : [];
  entries.push(rec);
}
if (existsSync(join(FROM, 'judges.json'))) {
  try { judges = JSON.parse(readFileSync(join(FROM, 'judges.json'), 'utf8')); } catch { /* optional */ }
}

if (!entries.length) {
  console.error(`report: found no cell.json under ${FROM}`);
  process.exit(1);
}

const ran = entries.filter((e) => e.status === 'ran');
const skipped = entries.filter((e) => e.status !== 'ran');

// Order: cleared the gate first, then by race primitives, then by how little it
// took. This is an ORDER TO READ IN, not a ranking of quality — quality is the
// human's call and the page says so.
const ordered = [...ran].sort((a, b) => {
  const ga = a.gate?.passed ? 1 : 0, gb = b.gate?.passed ? 1 : 0;
  if (ga !== gb) return gb - ga;
  const sa = a.skeleton?.passed ?? 0, sb = b.skeleton?.passed ?? 0;
  if (sa !== sb) return sb - sa;
  return (a.patchBytes || 0) - (b.patchBytes || 0);
});

const GATE_ORDER = ['boots', 'draws', 'animated', 'autostart', 'physics'];
const SKEL_ORDER = ['clock', 'laps', 'best', 'intact'];

const results = { runId, brief: cells.brief, target: cells.target, entries: ordered, skipped, judges };

// ── markdown ───────────────────────────────────────────────────────
const md = [];
md.push(`# Bake-off \`${runId}\` — brief \`${cells.brief}\``);
md.push('');
md.push(`Target: \`${cells.target}\`. ${ran.length} run${ran.length === 1 ? '' : 's'} across ${new Set(ran.map((e) => e.cell.replace(/__s\d+$/, ''))).size} cells.`);
md.push('');
md.push('**There is no overall score.** The gate is a floor, the primitives are a checklist. Ranking is a human call — see the arena page.');
md.push('');
md.push('| harness | model | run | gate | primitives | agent | patch | time |');
md.push('|---|---|---|---|---|---|---|---|');
for (const e of ordered) {
  md.push(`| ${e.harness} | ${e.model} | ${e.sample ?? 1} | ${e.gate?.passed ? '**PASS**' : 'fail'} | ${e.skeleton?.passed ?? '–'}/${e.skeleton?.of ?? 4} | exit ${e.agentExit} | ${e.patchBytes}B | ${e.seconds}s |`);
}
md.push('');

md.push('## Gate');
md.push('');
md.push(`| harness / model / run | ${GATE_ORDER.join(' | ')} |`);
md.push(`|---|${GATE_ORDER.map(() => '---').join('|')}|`);
for (const e of ordered) {
  const row = GATE_ORDER.map((c) => (e.gate?.checks?.[c] ? (e.gate.checks[c].passed ? '✓' : '✗') : '–'));
  md.push(`| ${e.harness} / ${e.model} / ${e.sample ?? 1} | ${row.join(' | ')} |`);
}
md.push('');
md.push('## Race primitives');
md.push('');
md.push(`| harness / model / run | ${SKEL_ORDER.join(' | ')} |`);
md.push(`|---|${SKEL_ORDER.map(() => '---').join('|')}|`);
for (const e of ordered) {
  const row = SKEL_ORDER.map((c) => (e.skeleton?.checks?.[c] ? (e.skeleton.checks[c].passed ? '✓' : '✗') : '–'));
  md.push(`| ${e.harness} / ${e.model} / ${e.sample ?? 1} | ${row.join(' | ')} |`);
}
md.push('');

// Variance is the whole reason two samples exist — surface it explicitly rather
// than leaving a reader to diff two rows by eye.
const byCell = new Map();
for (const e of ran) {
  const k = `${e.harness}/${e.model}`;
  if (!byCell.has(k)) byCell.set(k, []);
  byCell.get(k).push(e);
}
const split = [...byCell].filter(([, v]) => v.length > 1 && new Set(v.map((e) => !!e.gate?.passed)).size > 1);
if (split.length) {
  md.push('## Run-to-run variance');
  md.push('');
  md.push('These cells did **not** reproduce across their two runs — the same model and harness cleared the gate once and failed once. Treat any single-run claim about them with suspicion.');
  md.push('');
  for (const [k, v] of split) {
    md.push(`- \`${k}\` — ${v.map((e) => `run ${e.sample}: ${e.gate?.passed ? 'PASS' : 'fail'}`).join(', ')}`);
  }
  md.push('');
}

if (skipped.length) {
  md.push('## Skipped');
  md.push('');
  for (const s of skipped) md.push(`- \`${s.cell}\` — ${s.reason}`);
  md.push('');
}

const strays = ran.filter((e) => e.strayFiles?.length);
if (strays.length) {
  md.push('## Out-of-scope edits');
  md.push('');
  md.push('The brief restricts each cell to the target directory. These changed files outside it; the changes were **not** collected, but they say something about how the agent worked.');
  md.push('');
  for (const e of strays) md.push(`- \`${e.cell}\` touched ${e.strayFiles.length} file(s): ${e.strayFiles.slice(0, 8).map((f) => `\`${f}\``).join(', ')}${e.strayFiles.length > 8 ? ' …' : ''}`);
  md.push('');
}

if (judges?.reviews?.length) {
  md.push('## Judge panel (anonymised, second opinion only)');
  md.push('');
  md.push('Entries were relabelled and every mention of harness and model stripped before review; no model judged its own entry. Judges read NOTES.md and the diff — **they cannot see the game**, so this is about ambition, craft and use of the topology, not looks.');
  md.push('');
  for (const [label, cell] of Object.entries(judges.labels || {})) {
    const rs = judges.reviews.filter((r) => r.label === label && r.ok);
    if (!rs.length) continue;
    const hints = rs.map((r) => r.ok.rank_hint).filter((n) => typeof n === 'number');
    md.push(`### Entry ${label} — \`${cell}\`${hints.length ? ` · would-play ${hints.join(', ')}` : ''}`);
    md.push('');
    for (const r of rs) {
      md.push(`- **${r.lensTitle}** (judged by ${r.judge}): ${r.ok.verdict}`);
      if (r.ok.strongest) md.push(`  - strongest: ${r.ok.strongest}`);
      if (r.ok.weakest) md.push(`  - weakest: ${r.ok.weakest}`);
    }
    md.push('');
  }
}

md.push('## Notes from each agent');
md.push('');
for (const e of ordered) {
  md.push(`### ${e.harness} / ${e.model} / run ${e.sample ?? 1} — gate ${e.gate?.passed ? 'PASS' : 'FAIL'}`);
  md.push('');
  if (e.error) md.push(`> scorer: ${e.error}`);
  md.push(e.notes ? e.notes.trim() : '_no NOTES.md written_');
  md.push('');
}

const outDir = join(HERE, 'results', runId);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'report.md'), md.join('\n'));
writeFileSync(join(outDir, 'results.json'), JSON.stringify(results, null, 2) + '\n');
console.log(`wrote ${join(outDir, 'report.md')}`);
console.log(`wrote ${join(outDir, 'results.json')}`);

// ── arena pages ────────────────────────────────────────────────────
// Built by bakeoff/arena.mjs: a LANDING page plus one full-viewport play page
// per entry. Eleven WebGPU games in eleven small iframes on one page proves
// they exist; it does not let anyone play one. See that file for why the play
// wrapper is also the security boundary.

function buildArena(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), landingHtml({ runId, brief: cells.brief, entries: ordered, judges }));
  const playRoot = join(dir, 'play');
  ordered.forEach((entry, i) => {
    const d = join(playRoot, entry.cell);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'index.html'), playHtml({
      runId, brief: cells.brief, entry,
      prev: i > 0 ? ordered[i - 1] : null,
      next: i < ordered.length - 1 ? ordered[i + 1] : null,
      index: i, total: ordered.length,
    }));
  });
}

buildArena(join(outDir, 'arena'));
console.log(`wrote ${join(outDir, 'arena')}/ (landing + ${ordered.length} play pages)`);

if (PUBLISH) {
  const pub = join(REPO, 'os/public/arena', runId);
  mkdirSync(join(pub, 'entries'), { recursive: true });
  let staged = 0;
  for (const e of ordered) {
    if (!e.hasEntry) continue;
    cpSync(join(e.dir, 'entry'), join(pub, 'entries', e.cell), { recursive: true });
    if (existsSync(join(e.dir, 'capture'))) {
      cpSync(join(e.dir, 'capture'), join(pub, 'entries', e.cell, 'capture'), { recursive: true });
    }
    staged++;
  }
  // Pages last: they are generated from what actually made it onto disk.
  buildArena(pub);
  console.log(`staged ${staged} entr${staged === 1 ? 'y' : 'ies'} + landing + play pages into os/public/arena/${runId}/`);
  console.log(`review them, then push the os branch to publish at os.mino.mobi/arena/${runId}/`);
}

console.log('');
for (const e of ordered) {
  console.log(`  ${e.harness.padEnd(9)} ${e.model.padEnd(10)} run ${e.sample ?? 1}  gate ${e.gate?.passed ? 'PASS' : 'fail'}  primitives ${e.skeleton?.passed ?? '-'}/${e.skeleton?.of ?? 4}`);
}
