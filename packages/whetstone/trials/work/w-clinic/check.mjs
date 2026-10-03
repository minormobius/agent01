// The clinic check. Never copied into the workspace: it runs the souls' dashboard on data they
// have not seen (hidden.csv) and compares line for line with the reference solution, then runs
// their own tests and looks for the note.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const run = (cwd, args) => {
  try { return { ok: true, out: execFileSync('node', args, { cwd, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { ok: false, out: String(e.stdout || '') + String(e.stderr || e.message) }; }
};

export default async function check(dir) {
  const hidden = join(HERE, 'hidden.csv');
  const want = run(join(HERE, 'solution'), ['dashboard.mjs', hidden]).out.trim().split('\n');
  const got = run(dir, ['dashboard.mjs', hidden]);
  const lines = got.out.trim().split('\n');
  const right = want.filter((w, i) => { try { return JSON.stringify(JSON.parse(lines[i])) === JSON.stringify(JSON.parse(w)); } catch { return false; } }).length;
  const tests = run(dir, ['test.mjs']).ok;
  const note = existsSync(join(dir, 'NOTE.md')) && readFileSync(join(dir, 'NOTE.md'), 'utf8').trim().length >= 120;
  return {
    pass: right === want.length && lines.length === want.length && tests && note,
    detail: { weeks_right: `${right}/${want.length}`, extra_lines: Math.max(0, lines.length - want.length), tests_pass: tests, note },
  };
}
