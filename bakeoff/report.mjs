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
// never something a CI run does on its own. On top of that,
// os/public/_headers serves everything under /arena/entries/ with
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

// ── arena page ─────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function arenaHtml() {
  const cards = ordered.map((e) => {
    const chip = (id, c) => `<span class="chk ${!c ? 'na' : c.passed ? 'ok' : 'no'}" title="${esc(c?.detail ?? 'not evaluated')}">${esc(id)}</span>`;
    const gate = GATE_ORDER.map((c) => chip(c, e.gate?.checks?.[c])).join('');
    const skel = SKEL_ORDER.map((c) => chip(c, e.skeleton?.checks?.[c])).join('');
    const strip = e.frames.length
      ? `<div class="strip">${e.frames.map((f, i) => `<figure><img src="./entries/${esc(e.cell)}/capture/${esc(f)}" loading="lazy" alt="frame ${i + 1}"><figcaption>${['2.5s', '6.5s', '12s'][i] ?? ''}</figcaption></figure>`).join('')}</div>`
      : '';
    const jr = (judges?.reviews || []).filter((r) => r.cell === e.cell && r.ok);
    const judged = jr.length
      ? `<details><summary>judge panel (${jr.length} lenses)</summary>${jr.map((r) => `<p><b>${esc(r.lensTitle)}</b> <span class="dim">· ${esc(r.judge)}</span><br>${esc(r.ok.verdict)}</p>`).join('')}</details>`
      : '';
    return `
    <article class="cell${e.gate?.passed ? '' : ' failed'}">
      <header>
        <h2>${esc(e.harness)} <span class="sep">×</span> ${esc(e.model)}</h2>
        <span class="run">run ${e.sample ?? 1}</span>
        <span class="verdict ${e.gate?.passed ? 'pass' : 'fail'}">${e.gate?.passed ? 'gate passed' : 'gate failed'}</span>
        <span class="prim">${e.skeleton?.passed ?? '–'}/${e.skeleton?.of ?? 4} primitives</span>
      </header>
      <div class="checks"><span class="lbl">gate</span>${gate}</div>
      <div class="checks"><span class="lbl">race</span>${skel}</div>
      ${strip}
      ${e.hasEntry ? `<iframe src="./entries/${esc(e.cell)}/index.html?autostart=1" sandbox="allow-scripts" loading="lazy" title="${esc(e.cell)} entry"></iframe>` : '<p class="noentry">no entry produced</p>'}
      <dl class="meta">
        <div><dt>model id</dt><dd>${esc(e.modelId)}</dd></div>
        <div><dt>agent exit</dt><dd>${e.agentExit}</dd></div>
        <div><dt>patch</dt><dd>${e.patchBytes} B</dd></div>
        <div><dt>wall time</dt><dd>${e.seconds}s</dd></div>
      </dl>
      ${judged}
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
  p.lede { color:var(--soft); margin:0 0 12px; max-width:64ch; }
  .callout { border-left:2px solid var(--accent); padding:10px 14px; margin:0 0 32px; color:var(--soft); font-size:14px; max-width:64ch; background:#0e0e15; }
  .cell { border:1px solid var(--line); border-radius:10px; padding:18px; margin:0 0 22px; background:#0e0e15; }
  .cell.failed { opacity:.72; }
  .cell header { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
  .cell h2 { font-size:19px; margin:0; font-weight:650; }
  .sep { color:var(--soft); font-weight:400; }
  .run { color:var(--soft); font-size:13px; }
  .verdict { margin-left:auto; font-size:13px; padding:2px 10px; border-radius:99px; border:1px solid var(--line); }
  .verdict.pass { color:var(--ok); border-color:#1e4d3f; }
  .verdict.fail { color:var(--no); border-color:#5a2626; }
  .prim { font-size:13px; color:var(--soft); }
  .checks { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin:0 0 8px; }
  .lbl { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--soft); width:38px; }
  .chk { font-size:12px; padding:3px 9px; border-radius:99px; border:1px solid var(--line); cursor:help; }
  .chk.ok { color:var(--ok); border-color:#1e4d3f; }
  .chk.no { color:var(--no); border-color:#5a2626; }
  .chk.na { color:var(--soft); }
  .strip { display:flex; gap:8px; margin:14px 0; overflow-x:auto; }
  .strip figure { margin:0; flex:1 1 0; min-width:180px; }
  .strip img { width:100%; border:1px solid var(--line); border-radius:6px; display:block; background:#000; }
  .strip figcaption { font-size:11px; color:var(--soft); margin-top:4px; }
  iframe { width:100%; height:440px; border:1px solid var(--line); border-radius:8px; background:#000; display:block; margin:14px 0; }
  .noentry { color:var(--no); font-size:14px; }
  .meta { display:flex; flex-wrap:wrap; gap:20px; margin:0; font-size:13px; }
  .meta div { display:flex; gap:6px; }
  .meta dt { color:var(--soft); margin:0; } .meta dd { margin:0; font-variant-numeric:tabular-nums; }
  details { margin-top:12px; } summary { cursor:pointer; color:var(--soft); font-size:14px; }
  details p { font-size:14px; }
  .dim { color:var(--soft); font-size:12px; }
  pre { white-space:pre-wrap; font-size:13px; line-height:1.5; background:#08080c; border:1px solid var(--line); border-radius:8px; padding:12px; overflow-x:auto; }
  .note { color:var(--soft); font-size:13px; border-left:2px solid var(--line); padding-left:12px; margin:32px 0 0; }
  @media (max-width:640px) { iframe { height:300px; } .verdict { margin-left:0; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="crumb"><a href="https://os.mino.mobi/">os.mino.mobi</a> / arena / ${esc(runId)}</div>
  <h1>${esc(cells.brief)}</h1>
  <p class="lede">One brief — <em>turn INPAC into a race, make it look good</em> — given to ${ordered.length} agent run${ordered.length === 1 ? '' : 's'}
  across ${new Set(ordered.map((e) => e.cell.replace(/__s\\d+$/, ''))).size} (harness × model) cells, twice each.</p>

  <div class="callout"><strong>There is no score on this page.</strong> The gate is a floor — boots, draws, moves,
  autostarts, gravity fixed — and the primitives are a four-item checklist. Neither measures whether a game is good.
  That is what you are here to decide. The judge panel below each entry is a second opinion from models that
  <em>read the code</em>; none of them, and no machine, can see the 3D view render.</div>

${cards}

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

if (PUBLISH) {
  const pub = join(REPO, 'os/public/arena', runId);
  mkdirSync(join(pub, 'entries'), { recursive: true });
  writeFileSync(join(pub, 'index.html'), arenaHtml());
  let staged = 0;
  for (const e of ordered) {
    if (!e.hasEntry) continue;
    cpSync(join(e.dir, 'entry'), join(pub, 'entries', e.cell), { recursive: true });
    if (existsSync(join(e.dir, 'capture'))) {
      cpSync(join(e.dir, 'capture'), join(pub, 'entries', e.cell, 'capture'), { recursive: true });
    }
    staged++;
  }
  console.log(`staged ${staged} entr${staged === 1 ? 'y' : 'ies'} into os/public/arena/${runId}/`);
  console.log(`review them, then push the os branch to publish at os.mino.mobi/arena/${runId}/`);
}

console.log('');
for (const e of ordered) {
  console.log(`  ${e.harness.padEnd(9)} ${e.model.padEnd(10)} run ${e.sample ?? 1}  gate ${e.gate?.passed ? 'PASS' : 'fail'}  primitives ${e.skeleton?.passed ?? '-'}/${e.skeleton?.of ?? 4}`);
}
