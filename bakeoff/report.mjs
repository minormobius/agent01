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
// WHY PUBLISHING IS A SEPARATE FLAG. Entries are model-written HTML, and
// os.mino.mobi is inside the `.mino.mobi` SSO cookie scope and holds an
// Anthropic key in localStorage. Staging is therefore a deliberate human step,
// never something a CI run does on its own — the same line the repo already
// draws by refusing to let agent branches match a deploy trigger. On top of
// that, os/public/_headers serves everything under /arena/entries/ with
// `Content-Security-Policy: sandbox allow-scripts`, so an entry runs in an
// opaque origin and cannot reach the cookie or the key even if opened directly.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, cpSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const args = process.argv.slice(2);
const runId = args.find((a) => !a.startsWith('--')) || 'local';
const fromIdx = args.indexOf('--from');
const FROM = resolve(fromIdx >= 0 ? args[fromIdx + 1] : join(HERE, '.run'));
const PUBLISH = args.includes('--publish');

const cells = JSON.parse(readFileSync(join(HERE, 'cells.json'), 'utf8'));
const baselinePath = join(HERE, 'briefs', cells.brief, 'baseline.json');
const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;

if (!existsSync(FROM)) {
  console.error(`report: nothing to collect — ${FROM} does not exist`);
  process.exit(1);
}

// ── collect ────────────────────────────────────────────────────────
const entries = [];
for (const name of readdirSync(FROM).sort()) {
  const dir = join(FROM, name);
  if (!statSync(dir).isDirectory()) continue;
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
  entries.push(rec);
}

if (!entries.length) {
  console.error(`report: found no cell.json under ${FROM}`);
  process.exit(1);
}

const ran = entries.filter((e) => e.status === 'ran');
const skipped = entries.filter((e) => e.status !== 'ran');
// Rank by score, then by how little it took to get there — a smaller patch that
// scores the same is the better piece of work.
const ranked = [...ran].sort((a, b) => (b.score - a.score) || (a.patchBytes - b.patchBytes));

const CHECK_ORDER = ['sign', 'direction', 'uniformity', 'floor', 'finite', 'symmetry', 'speed', 'integrity'];

const results = {
  runId,
  brief: cells.brief,
  target: cells.target,
  baselineScore: baseline?.score ?? null,
  maxScore: baseline?.maxScore ?? 100,
  entries: ranked,
  skipped,
};

// ── markdown ───────────────────────────────────────────────────────
const md = [];
md.push(`# Bake-off \`${runId}\` — brief \`${cells.brief}\``);
md.push('');
md.push(`Target: \`${cells.target}\`. Baseline (the shipped code): **${baseline?.score ?? '?'}/${results.maxScore}**.`);
md.push('');
md.push('| # | harness | model | score | vs baseline | agent | patch | time |');
md.push('|---|---|---|---|---|---|---|---|');
ranked.forEach((e, i) => {
  const delta = baseline ? e.score - baseline.score : null;
  md.push(`| ${i + 1} | ${e.harness} | ${e.model} | **${e.score}/${e.maxScore}** | ${delta === null ? '—' : (delta >= 0 ? `+${delta}` : `${delta}`)} | exit ${e.agentExit} | ${e.patchBytes}B | ${e.seconds}s |`);
});
md.push('');

md.push('## Per-check');
md.push('');
md.push(`| harness / model | ${CHECK_ORDER.join(' | ')} |`);
md.push(`|---|${CHECK_ORDER.map(() => '---').join('|')}|`);
for (const e of ranked) {
  const cellsRow = CHECK_ORDER.map((c) => (e.checks?.[c] ? (e.checks[c].passed ? '✓' : '✗') : '–'));
  md.push(`| ${e.harness} / ${e.model} | ${cellsRow.join(' | ')} |`);
}
if (baseline) {
  const b = CHECK_ORDER.map((c) => (baseline.checks?.[c] ? (baseline.checks[c].passed ? '✓' : '✗') : '–'));
  md.push(`| _baseline (shipped)_ | ${b.join(' | ')} |`);
}
md.push('');

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
  md.push('The brief restricts each cell to the target directory. These cells changed files outside it; the changes were **not** collected, but they say something about how the agent worked.');
  md.push('');
  for (const e of strays) md.push(`- \`${e.cell}\` touched ${e.strayFiles.length} file(s): ${e.strayFiles.slice(0, 8).map((f) => `\`${f}\``).join(', ')}${e.strayFiles.length > 8 ? ' …' : ''}`);
  md.push('');
}

md.push('## Notes from each agent');
md.push('');
for (const e of ranked) {
  md.push(`### ${e.harness} / ${e.model} — ${e.score}/${e.maxScore}`);
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

// ── arena page ─────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function arenaHtml() {
  const rows = ranked.map((e, i) => {
    const delta = baseline ? e.score - baseline.score : null;
    const checks = CHECK_ORDER.map((c) => {
      const k = e.checks?.[c];
      const cls = !k ? 'na' : k.passed ? 'ok' : 'no';
      return `<span class="chk ${cls}" title="${esc(c)}: ${esc(k?.detail ?? 'not evaluated')}">${esc(c)}</span>`;
    }).join('');
    return `
    <article class="cell">
      <header>
        <span class="rank">#${i + 1}</span>
        <h2>${esc(e.harness)} <span class="sep">×</span> ${esc(e.model)}</h2>
        <span class="score">${e.score}<small>/${e.maxScore}</small></span>
        ${delta === null ? '' : `<span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${delta} vs baseline</span>`}
      </header>
      <div class="checks">${checks}</div>
      <dl class="meta">
        <div><dt>model id</dt><dd>${esc(e.modelId)}</dd></div>
        <div><dt>agent exit</dt><dd>${e.agentExit}</dd></div>
        <div><dt>patch</dt><dd>${e.patchBytes} B</dd></div>
        <div><dt>wall time</dt><dd>${e.seconds}s</dd></div>
      </dl>
      ${e.hasEntry ? `<iframe src="./entries/${esc(e.cell)}/index.html" sandbox="allow-scripts" loading="lazy" title="${esc(e.cell)} entry"></iframe>` : '<p class="noentry">no entry produced</p>'}
      ${e.notes ? `<details><summary>NOTES.md</summary><pre>${esc(e.notes)}</pre></details>` : ''}
    </article>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>arena · ${esc(runId)} · ${esc(cells.brief)}</title>
<style>
  :root { --bg:#0b0b10; --ink:#e6e6f0; --soft:#8a8aa0; --line:#23232e; --accent:#7aa2ff; --ok:#4ec9a0; --no:#ff6b6b; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .wrap { max-width:1100px; margin:0 auto; padding:48px 20px 80px; }
  .crumb { font-size:13px; letter-spacing:.04em; text-transform:uppercase; color:var(--soft); }
  .crumb a { color:var(--soft); text-decoration:none; }
  h1 { font-size:30px; margin:8px 0 4px; }
  p.lede { color:var(--soft); margin:0 0 32px; max-width:62ch; }
  .cell { border:1px solid var(--line); border-radius:10px; padding:18px; margin:0 0 22px; background:#0e0e15; }
  .cell header { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
  .rank { color:var(--soft); font-variant-numeric:tabular-nums; }
  .cell h2 { font-size:19px; margin:0; font-weight:650; }
  .sep { color:var(--soft); font-weight:400; }
  .score { margin-left:auto; font-size:24px; font-weight:700; font-variant-numeric:tabular-nums; }
  .score small { font-size:13px; color:var(--soft); font-weight:400; }
  .delta { font-size:13px; padding:2px 8px; border-radius:99px; border:1px solid var(--line); }
  .delta.up { color:var(--ok); } .delta.down { color:var(--no); }
  .checks { display:flex; flex-wrap:wrap; gap:6px; margin:14px 0; }
  .chk { font-size:12px; padding:3px 9px; border-radius:99px; border:1px solid var(--line); cursor:help; }
  .chk.ok { color:var(--ok); border-color:#1e4d3f; }
  .chk.no { color:var(--no); border-color:#5a2626; }
  .chk.na { color:var(--soft); }
  .meta { display:flex; flex-wrap:wrap; gap:20px; margin:0 0 14px; font-size:13px; }
  .meta div { display:flex; gap:6px; }
  .meta dt { color:var(--soft); margin:0; } .meta dd { margin:0; font-variant-numeric:tabular-nums; }
  iframe { width:100%; height:420px; border:1px solid var(--line); border-radius:8px; background:#000; display:block; }
  .noentry { color:var(--no); font-size:14px; }
  details { margin-top:12px; } summary { cursor:pointer; color:var(--soft); font-size:14px; }
  pre { white-space:pre-wrap; font-size:13px; line-height:1.5; background:#08080c; border:1px solid var(--line); border-radius:8px; padding:12px; overflow-x:auto; }
  table { border-collapse:collapse; width:100%; font-size:14px; margin:0 0 32px; }
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); }
  th { color:var(--soft); font-weight:500; }
  .note { color:var(--soft); font-size:13px; border-left:2px solid var(--line); padding-left:12px; margin:32px 0 0; }
  @media (max-width:640px) { iframe { height:300px; } .score { margin-left:0; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="crumb"><a href="https://os.mino.mobi/">os.mino.mobi</a> / arena / ${esc(runId)}</div>
  <h1>${esc(cells.brief)}</h1>
  <p class="lede">One brief, ${ranked.length} agent${ranked.length === 1 ? '' : 's'}, one rubric. Each cell is a
  (harness × model) pair given the same task in the same clean checkout, scored by
  <code>bakeoff/briefs/${esc(cells.brief)}/score.mjs</code>. The shipped code scores
  <strong>${baseline?.score ?? '?'}/${results.maxScore}</strong> — that is the line to beat.</p>

  <table>
    <thead><tr><th>#</th><th>harness</th><th>model</th><th>score</th><th>patch</th><th>time</th></tr></thead>
    <tbody>
      ${ranked.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.harness)}</td><td>${esc(e.model)}</td><td>${e.score}/${e.maxScore}</td><td>${e.patchBytes} B</td><td>${e.seconds}s</td></tr>`).join('\n      ')}
      <tr><td>—</td><td colspan="2"><em>baseline (shipped)</em></td><td>${baseline?.score ?? '?'}/${results.maxScore}</td><td>—</td><td>—</td></tr>
    </tbody>
  </table>

${rows}

  <p class="note">Entries are model-written code. They are framed <code>sandbox="allow-scripts"</code>
  and served with <code>Content-Security-Policy: sandbox allow-scripts</code>, so each runs in an
  opaque origin with no access to this site's cookies or storage — including when opened directly.</p>
</div>
</body>
</html>
`;
}

writeFileSync(join(outDir, 'arena.html'), arenaHtml());
console.log(`wrote ${join(outDir, 'arena.html')}`);

// ── publish (explicit) ─────────────────────────────────────────────
if (PUBLISH) {
  const pub = join(REPO, 'os/public/arena', runId);
  mkdirSync(join(pub, 'entries'), { recursive: true });
  writeFileSync(join(pub, 'index.html'), arenaHtml());
  let staged = 0;
  for (const e of ranked) {
    if (!e.hasEntry) continue;
    cpSync(join(e.dir, 'entry'), join(pub, 'entries', e.cell), { recursive: true });
    staged++;
  }
  console.log(`staged ${staged} entr${staged === 1 ? 'y' : 'ies'} into os/public/arena/${runId}/`);
  console.log('review them, then push the os branch to publish at os.mino.mobi/arena/' + runId + '/');
}

// Ranking summary for the CI log.
console.log('');
for (const [i, e] of ranked.entries()) {
  console.log(`  ${String(i + 1).padStart(2)}. ${e.harness.padEnd(9)} ${e.model.padEnd(10)} ${String(e.score).padStart(3)}/${e.maxScore}`);
}
if (baseline) console.log(`   —  ${'baseline'.padEnd(20)} ${String(baseline.score).padStart(3)}/${baseline.maxScore}`);
