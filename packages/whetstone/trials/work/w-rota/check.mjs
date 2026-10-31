// The rota check. Many rotas are right, so this does not compare with an answer: it runs the
// souls' CLI on teams and periods they have never seen and holds each rota against POLICY.md
// (policy.mjs). Then it runs their tests.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { violations } from './policy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const node = (cwd, args) => {
  try { return { ok: true, out: execFileSync('node', args, { cwd, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { ok: false, out: String(e.stdout || '') }; }
};
const dayList = (start, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
const isWeekend = (d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());

export default async function check(dir) {
  const cases = JSON.parse(readFileSync(join(HERE, 'hidden', 'cases.json'), 'utf8'));
  const results = cases.map(([file, start, n]) => {
    const path = join(HERE, file);
    const people = JSON.parse(readFileSync(path, 'utf8')).map((p) => ({ ...p, fte: Number(p.fte ?? 1), leave: new Set(p.leave || []) }));
    const r = node(dir, ['cli.mjs', path, start, String(n)]);
    let rota = null;
    try { rota = JSON.parse(r.out); } catch { /* counted below */ }
    const v = rota ? violations(people, dayList(start, n), rota, isWeekend) : ['no rota printed'];
    return { case: file.split('/').pop(), ok: v.length === 0, first: v.slice(0, 3) };
  });
  const tests = node(dir, ['test.mjs']).ok;
  return {
    pass: results.every((x) => x.ok) && tests,
    detail: { rotas_right: `${results.filter((x) => x.ok).length}/${results.length}`, tests_pass: tests, problems: results.filter((x) => !x.ok).map((x) => `${x.case}: ${x.first.join('; ')}`) },
  };
}
