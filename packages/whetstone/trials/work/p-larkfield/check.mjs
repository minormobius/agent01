// The Larkfield project check: six milestones, each compared with the reference on data the souls
// have never seen (hidden/: another town, columns reordered, CRLF). A milestone passes only if
// every one of its outputs matches. Their code runs in a child process, never in the lab's.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const H = (f) => join(HERE, 'hidden', f);
const START = readFileSync(H('start.txt'), 'utf8').trim();

const HARNESS = `
import { readFileSync } from 'node:fs';
const out = {};
const tryit = async (k, fn) => { try { out[k] = await fn(); } catch (e) { out[k] = { error: String(e.message).slice(0, 120) }; } };
const m = await import(process.cwd() + '/mod.mjs').catch((e) => ({ __error: e.message }));
const [rf, sf, start] = process.argv.slice(2);
const rt = readFileSync(rf, 'utf8'), st = readFileSync(sf, 'utf8');
await tryit('m1', () => [m.parseReports(rt), m.parseResidents(st)]);
const reps = out.m1?.[0] || [], res = out.m1?.[1] || [];
await tryit('m2', () => [reps.map((r) => m.weekOf(r.date, start)), m.weekly(reps, start)]);
await tryit('m3', () => [m.mutes(reps, start), m.mutes(reps, start, { minDistinct: 2 })]);
await tryit('m4', () => [m.rings(reps, res), m.rings(reps, res, { minReports: 3, minOverlap: 0.5, joinedWithinDays: 3 })]);
await tryit('m5', () => [m.fnv32('larkfield'), ...m.mutes(reps, start).map((x) => m.appealJudge({ handle: x.handle, week: x.week, reporters: m.weekly(reps, start)[String(x.week)][x.handle].reporters }, res, start))]);
console.log(JSON.stringify(out));
`;
const node = (cwd, args) => {
  try { return execFileSync('node', args, { cwd, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return String(e.stdout || ''); }
};
function evaluate(dir) {
  const h = join(mkdtempSync(join(tmpdir(), 'lark-')), 'harness.mjs');
  writeFileSync(h, HARNESS);
  let o = {};
  try { o = JSON.parse(node(dir, [h, H('reports.csv'), H('residents.csv'), START])); } catch { /* every milestone fails */ }
  let cli = null;
  try { cli = JSON.parse(node(dir, ['cli.mjs', H('reports.csv'), H('residents.csv'), START])); } catch { /* M6 fails */ }
  return { ...o, m6: cli };
}

export default async function check(dir) {
  const ref = mkdtempSync(join(tmpdir(), 'lark-ref-'));
  cpSync(join(HERE, 'files'), ref, { recursive: true });
  cpSync(join(HERE, 'solution'), ref, { recursive: true });
  const want = evaluate(ref), got = evaluate(dir);
  const same = (k) => want[k] != null && JSON.stringify(got[k]) === JSON.stringify(want[k]);
  const ms = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
  const passed = ms.filter(same);
  const tests = (() => { try { execFileSync('node', ['test.mjs'], { cwd: dir, timeout: 30000, stdio: 'ignore' }); return true; } catch { return false; } })();
  return {
    pass: passed.length === ms.length && tests,
    detail: { milestones: `${passed.length}/${ms.length}`, passed: passed.map((x) => x.toUpperCase()), tests_pass: tests },
    progress: passed.length / ms.length,
  };
}
