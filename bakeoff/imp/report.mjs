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
  '| model | route zero-shot | route few-shot (k=8) | desk (ReAct + tools) | tool calls | desk tokens | wall |',
  '|---|---|---|---|---|---|---|',
);

for (const { cell } of cells) {
  if (cell.status !== 'ran') {
    lines.push(`| ${cell.model} | skipped: ${cell.reason} | | | | | |`);
    continue;
  }
  const r = cell.tasks.route, d = cell.tasks.desk;
  const tok = d?.usage ? (d.usage.total_tokens ?? ((d.usage.prompt_tokens || 0) + (d.usage.completion_tokens || 0))) : null;
  lines.push(`| ${cell.model} (\`${cell.model_id}\`) | ${pct(r?.arms.zero_shot.score)} | ${pct(r?.arms.few_shot_k8.score)} | ${pct(d?.arms.react.score)} | ${d?.tool_calls ?? ''} | ${tok ?? ''} | ${cell.seconds}s |`);
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
