// Mozzie, council day 2026-10-04.  node proposals/mozzie-stale.mjs [days=1000] [seed=1]
// Part 1: shows vv keeps a pass after the code it verified has changed (on a temp copy; tools/ untouched).
// Part 2: des sizing. How many requirement-hours does a project show as "verified" while broken, under four policies?
import { cpSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sim, Resource } from '../tools/des/des.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DAYS = +(process.argv[2] ?? 1000), SEED = +(process.argv[3] ?? 1);

// ---- Part 1: the gap, live --------------------------------------------------------------
{
  const d = mkdtempSync(join(tmpdir(), 'vvgap-'));
  try {
    cpSync(join(here, '../tools/vv'), d, { recursive: true });
    const cov = () => JSON.parse(execFileSync('node', ['cli.mjs', '.'], { cwd: d })).coverage;
    const before = cov();
    const src = readFileSync(join(d, 'vv.mjs'), 'utf8');
    writeFileSync(join(d, 'vv.mjs'), src.replace('export function lint(req) {', 'export function lint(req) { return [];'));
    const stale = cov();
    let exit = 0; try { execFileSync('node', ['test.mjs'], { cwd: d, stdio: 'ignore' }); } catch (e) { exit = e.status; }
    const rerun = cov();
    console.log('vv on its own folder; lint() then broken to return []:');
    console.log(`  before the break          verified ${before.verified}/${before.total}, failed ${before.failed}`);
    console.log(`  after the break, no rerun verified ${stale.verified}/${stale.total}, failed ${stale.failed}   <- the report hasn't noticed`);
    console.log(`  after rerunning test.mjs  verified ${rerun.verified}/${rerun.total}, failed ${rerun.failed}   (test exit ${exit})`);
  } finally { rmSync(d, { recursive: true, force: true }); }
}

// ---- Part 2: sizing ---------------------------------------------------------------------
// A project the size of the proposals on the table: 16 leaves, 6 artifacts, each leaf implemented
// by 1-2 artifacts, one check per leaf taking 0.5-3 min. An 8-hour working day (480 min). Edits
// arrive Poisson, 2 an hour; an edit breaks each leaf it touches with probability 0.1, and a
// later edit to the same artifact fixes a broken leaf with probability 0.5 (someone notices).
// ASSUMED numbers, all of them; a real repo's history would replace them.
const LEAVES = 16, ARTS = 6, EDIT_RATE = 2 / 60, P_BREAK = 0.1, P_FIX = 0.5, DAY = 480;
// Policies:
//   never   - vv today: evidence stands until someone runs the whole suite, once at day end
//   all     - rerun the whole suite after every edit (one runner; edits during a run coalesce)
//   traced  - rerun only checks traced (implements links) to the edited artifact
//   fresh   - traced, plus: evidence older than the last edit to its artifacts doesn't count
const POLICIES = ['never', 'all', 'traced', 'fresh'];

function day(policy, seed) {
  const sim = new Sim({ seed });
  const impl = []; // leaf -> artifacts
  for (let l = 0; l < LEAVES; l++) {
    const a = Math.floor(sim.random() * ARTS), b = Math.floor(sim.random() * ARTS);
    impl.push(a === b || sim.random() < 0.5 ? [a] : [a, b]);
  }
  const dur = impl.map(() => sim.uniform(0.5, 3));
  const broken = new Array(LEAVES).fill(false);     // truth
  const shown = new Array(LEAVES).fill(true);       // latest evidence says pass (start of day: all verified)
  const evAt = new Array(LEAVES).fill(0);           // when the shown evidence was taken
  const lastEdit = new Array(ARTS).fill(-1);
  const runner = new Resource(sim, { capacity: 1 });
  const pending = new Set();
  let falseMin = 0, staleMin = 0, runMin = 0, last = 0;
  const showsVerified = (l) => shown[l] && (policy !== 'fresh' || impl[l].every((a) => lastEdit[a] < evAt[l]));
  const account = () => {
    const dt = sim.now - last; last = sim.now;
    for (let l = 0; l < LEAVES; l++) {
      if (showsVerified(l) && broken[l]) falseMin += dt;
      if (policy === 'fresh' && shown[l] && !showsVerified(l)) staleMin += dt;
    }
  };
  let running = false;
  function* worker() {
    running = true;
    while (pending.size) {
      const l = Math.min(...pending); pending.delete(l);
      const req = runner.request(); yield req;
      const t0 = sim.now;
      yield sim.timeout(dur[l]);
      account(); runMin += sim.now - t0;
      shown[l] = !broken[l]; evAt[l] = t0;           // result reflects code as at the run's start
      runner.release(req);
    }
    running = false;
  }
  const enqueue = (ls) => { for (const l of ls) pending.add(l); if (!running) sim.process(worker); };
  sim.process(function* () {
    for (;;) {
      yield sim.timeout(sim.exponential(EDIT_RATE));
      if (sim.now >= DAY) return;
      account();
      const a = Math.floor(sim.random() * ARTS); lastEdit[a] = sim.now;
      const touched = [];
      for (let l = 0; l < LEAVES; l++) if (impl[l].includes(a)) {
        touched.push(l);
        if (broken[l]) { if (sim.random() < P_FIX) broken[l] = false; }
        else if (sim.random() < P_BREAK) broken[l] = true;
      }
      if (policy === 'all') enqueue([...Array(LEAVES).keys()]);
      if (policy === 'traced' || policy === 'fresh') enqueue(touched);
    }
  });
  sim.run({ until: DAY });
  account();
  return { falseH: falseMin / 60, staleH: staleMin / 60, runH: runMin / 60 };
}

const rows = [];
for (const p of POLICIES) {
  let f = 0, s = 0, r = 0, worst = 0;
  for (let i = 0; i < DAYS; i++) {
    const o = day(p, SEED * 100003 + i);   // same seed per day across policies: same edits, same breaks
    f += o.falseH; s += o.staleH; r += o.runH; worst = Math.max(worst, o.falseH);
  }
  rows.push([p, (f / DAYS).toFixed(2), worst.toFixed(1), (s / DAYS).toFixed(2), (r / DAYS).toFixed(2)]);
}
console.log(`\nsizing: ${DAYS} seeded 8-hour days, 16 leaves, 2 edits/h (assumed)`);
console.log('policy   false-verified req-h/day (mean, worst)   shown-stale req-h/day   runner h/day');
for (const [p, f, w, s, r] of rows) console.log(`${p.padEnd(8)} ${f.padStart(10)} ${w.padStart(8)} ${s.padStart(22)} ${r.padStart(14)}`);
