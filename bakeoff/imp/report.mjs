#!/usr/bin/env node
// Collect Imp cells into one report.
//
//   node bakeoff/imp/report.mjs <run-id> --from <dir-of-cell-dirs> [--note "…"]
//
// Each cell directory holds cell.json (+ traces.md, route.program.json) as
// written by ImpBench.main/0. Writes bakeoff/results/<run-id>/{report.md,
// results.json} and copies every cell's traces and compiled program beside
// them, so the results branch carries the evidence, not just the numbers.
import fs from 'node:fs';
import path from 'node:path';

const [runId, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
const from = opt('--from');
const note = opt('--note') || '';
if (!runId || !from) {
  console.error('usage: report.mjs <run-id> --from <dir> [--note "…"]');
  process.exit(2);
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'results', runId);
fs.mkdirSync(outDir, { recursive: true });

// Find every cell.json one or two levels down (download-artifact nests by name).
const cells = [];
const walk = (dir, depth) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 3) walk(p, depth + 1);
    else if (e.name === 'cell.json') cells.push({ dir, cell: JSON.parse(fs.readFileSync(p, 'utf8')) });
  }
};
walk(path.resolve(from), 0);
cells.sort((a, b) => a.cell.model.localeCompare(b.cell.model));

const pct = (x) => (x == null ? 'n/a' : `${Math.round(x * 1000) / 10}%`);
const lines = [`# Imp bench \`${runId}\``, ''];
if (note) lines.push(note, '');
lines.push(
  'Every number is a share of held-out questions answered right. `route`: 20 tickets, four teams,',
  'zero-shot vs. 8 labelled examples (Imp `LabeledFewShot`). `desk`: 16 questions a ReAct agent can only',
  'answer through six Elixir tools; the answer key is computed from the same data the tools read.',
  '',
  '`desk_hard`: 18 held-out questions on a harder desk (policy versions by order date, windows from delivery,',
  'restocking fees, undelivered orders, scans across customers, five currencies). `+GEPA`: the same agent after',
  'GEPA rewrote its instructions from 9 train / 9 validation questions.',
  '',
  '| model | route zero-shot | route few-shot (k=8) | desk | desk_hard | desk_hard +GEPA | wall |',
  '|---|---|---|---|---|---|---|',
);

for (const { cell } of cells) {
  if (cell.status !== 'ran') {
    lines.push(`| ${cell.model} | skipped: ${cell.reason} | | | | | |`);
    continue;
  }
  const r = cell.tasks.route, d = cell.tasks.desk, h = cell.tasks.desk_hard;
  const cellPct = (t, arm) => (t?.arms?.[arm] ? pct(t.arms[arm].score) : '—');
  lines.push(`| ${cell.model} (\`${cell.model_id}\`) | ${cellPct(r, 'zero_shot')} | ${cellPct(r, 'few_shot_k8')} | ${cellPct(d, 'react')} | ${cellPct(h, 'react')} | ${cellPct(h, 'react_gepa')} | ${cell.seconds}s |`);
}

for (const { dir, cell } of cells) {
  if (cell.status !== 'ran') continue;
  const slug = cell.model;
  lines.push('', `## ${cell.model}`, '');
  const d = cell.tasks.desk;
  if (d) {
    lines.push(
      `**desk:** ${pct(d.arms.react.score)} · ${d.tool_calls} tool calls · ` +
        Object.entries(d.tool_calls_by_name || {}).map(([k, v]) => `\`${k}\`×${v}`).join(' ') +
        ` · ended by ${Object.entries(d.terminations || {}).map(([k, v]) => `${k}×${v}`).join(', ')}`,
      '',
      '| q | expected | got | |',
      '|---|---|---|---|',
      ...d.rows.map((x) => `| ${x.id} | \`${x.expected}\` | \`${String(x.got ?? '').replace(/\|/g, '/').slice(0, 60)}\` | ${x.score === 1 ? '✓' : '✗'}${x.error ? ' ' + x.error.slice(0, 60) : ''} |`),
      '',
      `Full tool traces: [\`${slug}.traces.md\`](${slug}.traces.md)`,
    );
    const t = path.join(dir, 'traces.md');
    if (fs.existsSync(t)) fs.copyFileSync(t, path.join(outDir, `${slug}.traces.md`));
  }
  if (cell.probe) lines.push(`probe: \`${String(cell.probe).slice(0, 300).replace(/`/g, "'")}\``, '');
  const h = cell.tasks.desk_hard;
  if (h) {
    const tok = (u) => (u ? (u.total_tokens ?? (u.input_tokens || 0) + (u.output_tokens || 0)) : 0);
    lines.push('', `**desk_hard:** ${Object.entries(h.arms).map(([k, a]) => `${k} ${pct(a.score)} (${a.tool_calls} tool calls, ${tok(a.usage)} tokens, ${a.seconds}s${a.optimize_seconds != null ? `; optimizing took ${a.optimize_seconds}s` : ''})`).join(' · ')}`, '');
    const g = new Map((h.rows_gepa || []).map((x) => [x.id, x]));
    lines.push(`| q | expected | react | ${g.size ? '+GEPA |' : ''}`, `|---|---|---|${g.size ? '---|' : ''}`);
    for (const x of h.rows) {
      const y = g.get(x.id);
      const show = (z) => `\`${String(z.got ?? '').replace(/\|/g, '/').slice(0, 40)}\` ${z.score === 1 ? '✓' : '✗'}`;
      lines.push(`| ${x.id} | \`${x.expected}\` | ${show(x)} | ${y ? show(y) + ' |' : ''}`);
    }
    for (const [f, label] of [['hard.traces.md', 'baseline'], ['hard.gepa.traces.md', 'after GEPA']]) {
      const src = path.join(dir, f);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(outDir, `${slug}.${f}`));
        lines.push('', `Traces (${label}): [\`${slug}.${f}\`](${slug}.${f})`);
      }
    }
    if (h.gepa) {
      const changed = Object.entries(h.gepa.changed || {});
      lines.push('', `**GEPA** (reflection model \`${h.gepa.reflection}\`, max_metric_calls ${h.gepa.max_metric_calls}): ` +
        (changed.length ? `rewrote ${changed.length} parameter(s).` : 'kept the original program (no candidate beat it).'));
      for (const [id, c] of changed) {
        lines.push('', `<details><summary>${id}</summary>`, '', '**before**', '', '```', c.before, '```', '', '**after**', '', '```', c.after, '```', '', '</details>');
      }
      const p = path.join(dir, 'hard.gepa.program.json');
      if (fs.existsSync(p)) fs.copyFileSync(p, path.join(outDir, `${slug}.hard.gepa.program.json`));
    }
  }
  const r = cell.tasks.route;
  if (r) {
    const m = Object.entries(r.misses || {});
    lines.push('', `**route:** zero-shot ${pct(r.arms.zero_shot.score)} → few-shot ${pct(r.arms.few_shot_k8.score)}. Zero-shot misses:`, '');
    for (const [ticket, got] of m) lines.push(`- "${ticket}" → \`${got}\``);
    const p = path.join(dir, 'route.program.json');
    if (fs.existsSync(p)) {
      fs.copyFileSync(p, path.join(outDir, `${slug}.route.program.json`));
      lines.push('', `Compiled router: [\`${slug}.route.program.json\`](${slug}.route.program.json)`);
    }
  }
}

fs.writeFileSync(path.join(outDir, 'report.md'), lines.join('\n') + '\n');
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ runId, note, cells: cells.map((c) => c.cell) }, null, 2));
console.log(lines.join('\n'));
