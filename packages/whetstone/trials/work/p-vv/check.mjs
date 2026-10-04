// The vv check. Seven milestones. M1–M6 run hidden data (a small clock-making project with
// deliberate faults) through the souls' vv.mjs and cli.mjs in a child process and compare with the
// reference (solution/), numbers rounded to six decimals. M7 runs their own test.mjs, which must
// write evidence.json, then their own cli over their own requirements: the tool measures itself.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASE = join(HERE, 'hidden', 'case.json');

const HARNESS = String.raw`
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const v = await import(process.cwd() + '/vv.mjs');
const c = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const round = (x) => JSON.parse(JSON.stringify(x, (k, val) => (typeof val === 'number' ? Math.round(val * 1e6) / 1e6 : val)));
const out = {};
const ms = (k, fn) => { try { out[k] = round(fn()); } catch (e) { out[k] = { error: String(e && e.message || e).slice(0, 160) }; } };
// A clean list for M2+: the malformed entries are only for M1.
const clean = c.reqs.filter((r, i) => !['LOOP-A', 'LOOP-B'].includes(r.id) && c.reqs.findIndex((x) => x.id === r.id) === i);
ms('m1', () => { const { problems } = v.load(c.reqs); return { problems, lint: c.reqs.map((r) => [r.id, v.lint(r)]) }; });
ms('m2', () => { const t = v.trace(clean, c.links); return t; });
ms('m3', () => c.asOfs.map((a) => { const s = v.status(clean, c.links, c.evidence, { asOf: a }); return [s, v.coverage(clean, s)]; }));
ms('m4', () => c.asOfs.map((a) => c.measures.map((m) => v.tpm(m, { asOf: a }))));
ms('m5', () => c.asOfs.map((a) => v.earned(clean, c.links, c.evidence, c.plan, c.actuals, { asOf: a })));
ms('m6', () => {
  const d = mkdtempSync(join(tmpdir(), 'vvcase-'));
  const files = { 'requirements.json': clean, 'links.json': c.links, 'evidence.json': c.evidence, 'measures.json': c.measures, 'plan.json': c.plan, 'actuals.json': c.actuals };
  for (const [f, x] of Object.entries(files)) writeFileSync(join(d, f), JSON.stringify(x));
  const run = (extra) => JSON.parse(execFileSync('node', [join(process.cwd(), 'cli.mjs'), d, ...extra], { encoding: 'utf8', timeout: 30000 }));
  const a = run(['--as-of', '2026-11-08']);
  const b = run([]);
  return [a, b.asOf, b.coverage];
});
console.log(JSON.stringify(out));
`;

const node = (cwd, args) => {
  try { return { ok: true, out: execFileSync('node', args, { cwd, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { ok: false, out: String(e.stdout || '') }; }
};
function evaluate(dir) {
  const h = join(mkdtempSync(join(tmpdir(), 'vv-')), 'harness.mjs');
  writeFileSync(h, HARNESS);
  try { return JSON.parse(node(dir, [h, CASE]).out); } catch { return {}; }
}

// M7: their tests write evidence.json, and their own report on their own requirements is clean.
function selfMeasure(dir) {
  const tests = node(dir, ['test.mjs']).ok;
  if (!tests || !existsSync(join(dir, 'evidence.json'))) return { ok: false, tests, why: 'test.mjs failed or wrote no evidence.json' };
  let r;
  try { r = JSON.parse(node(dir, ['cli.mjs', '.']).out); } catch { return { ok: false, tests, why: 'cli.mjs . printed no JSON' }; }
  let reqs = [];
  try { reqs = JSON.parse(readFileSync(join(dir, 'requirements.json'), 'utf8')); } catch { /* none */ }
  const parents = new Set(reqs.map((x) => x.parent).filter(Boolean));
  const leaves = reqs.filter((x) => !parents.has(x.id)).length;
  const readme = existsSync(join(dir, 'README.md')) && readFileSync(join(dir, 'README.md'), 'utf8').length > 600;
  const ok = tests && readme && leaves >= 12 && (r.problems || []).length === 0 && (r.coverage?.ratio ?? 0) >= 0.8;
  return { ok, tests, leaves, problems: (r.problems || []).length, ratio: r.coverage?.ratio ?? null, readme };
}

export default async function check(dir) {
  const ref = mkdtempSync(join(tmpdir(), 'vv-ref-'));
  cpSync(join(HERE, 'files'), ref, { recursive: true });
  cpSync(join(HERE, 'solution'), ref, { recursive: true });
  const want = evaluate(ref), got = evaluate(dir);
  const same = (k) => want[k] != null && !want[k].error && JSON.stringify(got[k]) === JSON.stringify(want[k]);
  const ms = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].filter(same);
  const self = selfMeasure(dir);
  if (self.ok) ms.push('m7');
  return {
    pass: ms.length === 7,
    detail: { milestones: `${ms.length}/7`, passed: ms.map((x) => x.toUpperCase()), self,
      failing: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].filter((k) => !ms.includes(k)).map((k) => `${k.toUpperCase()}${got[k]?.error ? `: ${got[k].error}` : ''}`) },
    progress: ms.length / 7,
  };
}
export const _evaluate = evaluate;
