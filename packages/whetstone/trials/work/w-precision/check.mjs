// The precision check. Runs the soul's pipeline on sessions it has never seen (hidden/) and
// compares each line with the reference reduction (files/ with solution/ laid over it).
// Then runs their tests and looks for the review.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const node = (cwd, args) => {
  try { return { ok: true, out: execFileSync('node', args, { cwd, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { ok: false, out: String(e.stdout || '') }; }
};
const lines = (out) => out.trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } });
const close = (x, y) => typeof x === 'number' && Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y));

export default async function check(dir) {
  const hidden = readdirSync(join(HERE, 'hidden')).sort().map((f) => join(HERE, 'hidden', f));
  const ref = mkdtempSync(join(tmpdir(), 'whetstone-ref-'));
  cpSync(join(HERE, 'files'), ref, { recursive: true });
  cpSync(join(HERE, 'solution'), ref, { recursive: true });
  const want = lines(node(ref, ['cli.mjs', ...hidden]).out);
  const got = lines(node(dir, ['cli.mjs', ...hidden]).out);
  const right = want.filter((w, i) => got[i] && got[i].n === w.n && close(got[i].delta_permil, w.delta_permil) && close(got[i].se_permil, w.se_permil)).length;
  const tests = node(dir, ['test.mjs']).ok;
  const review = existsSync(join(dir, 'REVIEW.md')) && readFileSync(join(dir, 'REVIEW.md'), 'utf8').trim().length >= 150;
  return {
    pass: right === want.length && got.length === want.length && tests && review,
    detail: { sessions_right: `${right}/${want.length}`, tests_pass: tests, review },
  };
}
