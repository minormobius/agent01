// The tape wave 1 check. The lab plays the household (household.mjs, hidden): the SD card, the
// flash, the card reader, evenings of cards on and off the pad, a laptop that adds books and
// sometimes mangles the bindings file, and power that goes in the middle of a write. The box
// passes a milestone when no household month catches it breaking its promise.
//
// Two milestones run outside the household: E builds the enclosure with the repo's own CAD engine
// (packages/cad, not the copy lent to the souls), and V is the project measured in its own vv.
// Every milestone is measured every time, so a failure in one never hides another (eleventh light).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CAD = join(HERE, '..', '..', '..', '..', 'cad');
const PRINTER = 200; // mm per axis: the build volume the lab assumes for a printer at work

const node = (cwd, args, timeout = 600000) => {
  try { return { ok: true, out: execFileSync('node', args, { cwd, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 << 20 }) }; }
  catch (e) { return { ok: false, out: String(e.stdout || ''), err: String(e.stderr || e.message || '').slice(0, 400) }; }
};

export function evaluate(dir) {
  const r = node(dir, [join(HERE, 'household.mjs')]);
  try { return JSON.parse(r.out.trim().split('\n').pop()); } catch { return { __error: r.err || 'the household could not run' }; }
}

// E: every enclosure/*.json builds watertight in the exact kernel and fits the printer; one of them
// is big enough to hold a 63 × 88 mm card with clearance.
export function enclosure(dir) {
  const d = join(dir, 'enclosure');
  if (!existsSync(d)) return { ok: false, why: 'no enclosure/ folder' };
  const parts = readdirSync(d).filter((f) => f.endsWith('.json'));
  if (!parts.length) return { ok: false, why: 'no CAD trees in enclosure/' };
  const out = mkdtempSync(join(tmpdir(), 'tape-enc-'));
  let holdsCard = false;
  const built = [];
  for (const f of parts) {
    const json = join(out, f);
    const r = node(CAD, ['agent/build.mjs', join(d, f), '--json', json], 120000);
    let b; try { b = JSON.parse(readFileSync(json, 'utf8')); } catch { return { ok: false, why: `${f} did not build: ${r.err.split('\n')[0]}` }; }
    if (!b.ok || !b.invariants?.watertight) return { ok: false, why: `${f}: ${b.ok ? 'not watertight' : 'did not build'}` };
    const [lo, hi] = b.invariants.bbox, size = hi.map((x, i) => x - lo[i]);
    if (size.some((x) => x > PRINTER)) return { ok: false, why: `${f} is ${size.map((x) => x.toFixed(0)).join(' × ')} mm: larger than a ${PRINTER} mm printer` };
    const [a, b2] = [...size].sort((x, y) => y - x);
    if (a >= 89 && b2 >= 64) holdsCard = true;
    built.push({ part: f, size: size.map((x) => Math.round(x * 10) / 10), volume: Math.round(b.invariants.volume) });
  }
  if (!holdsCard) return { ok: false, why: 'no part is large enough to hold a 63 × 88 mm card with clearance', built };
  return { ok: true, built };
}

// V: requirements held in vv; tests write evidence; the folder explains itself to the builders and
// to the household.
export function selfMeasure(dir) {
  const tests = node(dir, ['test.mjs']).ok;
  if (!tests || !existsSync(join(dir, 'evidence.json'))) return { ok: false, tests, why: 'test.mjs failed or wrote no evidence.json' };
  let r; try { r = JSON.parse(node(dir, ['tools/vv/cli.mjs', '.']).out); } catch { return { ok: false, tests, why: 'tools/vv/cli.mjs . printed no JSON' }; }
  const len = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8').length : 0);
  const ok = (r.problems || []).length === 0 && (r.coverage?.ratio ?? 0) >= 0.8 && (r.coverage?.total ?? 0) >= 10 && len('README.md') > 600 && len('HOUSEHOLD.md') > 600;
  return { ok, tests, problems: (r.problems || []).length, ratio: r.coverage?.ratio ?? null, leaves: r.coverage?.total ?? 0, readme: len('README.md'), household: len('HOUSEHOLD.md') };
}

const MILESTONES = ['H', 'W1', 'W2', 'W3', 'F', 'P', 'B', 'C', 'K', 'U', 'R', 'E', 'V'];

export default async function check(dir) {
  const g = evaluate(dir);
  const e = enclosure(dir);
  const v = selfMeasure(dir);
  const res = { H: g.h, W1: g.w1, W2: g.w2, W3: g.w3, F: g.f, P: g.p, B: g.b, C: g.c, K: g.k, U: g.u, R: g.r, E: e, V: v };
  const pass = Object.fromEntries(MILESTONES.map((k) => [k, res[k]?.ok === true]));
  const passed = MILESTONES.filter((k) => pass[k]);
  const why = (k) => { const x = res[k]; return x?.why ? `${k}: ${x.why}` : g.__error ? `${k}: ${g.__error.split('\n')[0]}` : `${k}: not reached`; };
  return {
    pass: passed.length === MILESTONES.length,
    detail: { milestones: `${passed.length}/${MILESTONES.length}`, passed, failing: MILESTONES.filter((k) => !pass[k]).map(why), enclosure: e.built || null, self: v },
    progress: passed.length / MILESTONES.length,
  };
}
