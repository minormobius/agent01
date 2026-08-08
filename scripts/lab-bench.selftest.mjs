// node scripts/lab-bench.selftest.mjs
//
// Proves lab-bench.mjs reports what a bench measured — and, more importantly,
// that it SAYS SO when it did not.
//
// The failure this guards against is not "the bench crashed". It is a bench
// that returns four results out of forty and reads as complete, because Chrome
// dumps the DOM when the virtual-time budget expires whether the page finished
// or not. Every silent-truncation bug in this repo has had that shape, and each
// one was survivable right up to the run where somebody acted on the number.
//
// Like lab-smoke.selftest.mjs: in CI an unverifiable result is a FAILURE, because
// a runner can do this and a silent skip would restore the blind spot.

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const BENCH = new URL('./lab-bench.mjs', import.meta.url).pathname;
const ci = Boolean(process.env.GITHUB_ACTIONS);
let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

/** Run lab-bench against a throwaway tenant dir holding this bench.html. */
function bench(html, { budget } = {}) {
  const dir = join(mkdtempSync(join(tmpdir(), 'benchtest-')), 'site');
  mkdirSync(dir, { recursive: true });
  if (html !== null) writeFileSync(join(dir, 'bench.html'), html);
  const args = [BENCH, dir];
  if (budget) args.push(`--budget=${budget}`);
  const r = spawnSync('node', args, { encoding: 'utf8' });
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/** The shape the brief tells agents to write. */
const page = (body) => `<!doctype html><title>bench</title><body><script>
function report(label, value){
  var d = document.createElement('div');
  d.setAttribute('data-labbench', label);
  d.textContent = String(value);
  document.body.appendChild(d);
}
function done(){
  var d = document.createElement('div');
  d.setAttribute('data-labbench', 'done');
  document.body.appendChild(d);
}
${body}
</script>`;

console.log('— can this machine run a bench at all? —');
{
  const probe = bench(page('report("probe", 1); done();'));
  if (probe.code === 2) {
    console.log('  ! Chrome here cannot load a page over HTTP, so nothing below can be checked.');
    console.log('  ! Not a pass: lab-bench is UNVERIFIED in this environment.');
    if (ci) {
      console.error('  ✗ in CI this must work — treating an unverifiable bench as a failure');
      process.exit(1);
    }
    process.exit(0);
  }
  ck(probe.code === 0, 'a trivial bench runs and exits 0');
}

console.log('— no bench.html is the normal case, not a failure —');
{
  const r = bench(null);
  ck(r.code === 0, 'exits 0 when there is nothing to measure');
  ck(/nothing to measure/.test(r.out), 'and says so rather than staying silent');
}

console.log('— a real sweep comes back with its numbers —');
{
  const r = bench(page(`
    // Integer counter, not a float accumulator: 0.4+0.4+0.4 is 1.2000000000000002
    // and the last step of the sweep silently never runs. Which is itself a
    // decent argument for measuring instead of reasoning.
    for (var i = 1; i <= 3; i++) {
      var drag = i * 0.4;
      report('drag=' + drag.toFixed(1), 'offset=' + (drag * 0.15).toFixed(4));
    }
    done();
  `));
  ck(r.code === 0, 'exits 0');
  ck(/3 result\(s\)/.test(r.out), 'reports how many results it got');
  ck(/drag=0\.4: offset=0\.0600/.test(r.out), 'the measured value survives the round trip');
  ck(/drag=1\.2: offset=0\.1800/.test(r.out), 'and so does the last one');
  ck(!/CUT OFF/.test(r.out), 'a completed sweep is not flagged as truncated');
  ck(/^BENCH_RESULTS=3$/m.test(r.out), 'emits a machine-readable count for lab-build.yml');
}

console.log('— the count lab-build.yml reads must distinguish none from some —');
{
  // Grepping the prose for "result(s)" would match the sentence saying there
  // were none, and the tuning pass would fire on an empty report.
  const r = bench(page('done();'));
  ck(/^BENCH_RESULTS=0$/m.test(r.out), 'a bench that measured nothing reports zero, not silence');
}

console.log('— THE ONE THAT MATTERS: a sweep cut off must not read as complete —');
{
  const r = bench(page(`
    report('a', 1); report('b', 2);
    // never calls done() — exactly what a page killed mid-sweep looks like
  `));
  ck(r.code === 0, 'still exits 0 — a bench is information, never a verdict');
  ck(/2 result\(s\)/.test(r.out), 'the partial results are still reported');
  ck(/CUT OFF/.test(r.out), 'and it is flagged as PROBABLY CUT OFF');
  ck(/partial sweep, not a complete one/.test(r.out), 'in words that stop someone acting on it');
}

console.log('— a bench that throws explains its own empty result list —');
{
  const r = bench(page(`
    report('before', 1);
    null.missingField;          // throws
    report('after', 2); done();
  `));
  ck(r.code === 0, 'exits 0 — a broken bench does not fail a build');
  ck(/problem\(s\) while running/.test(r.out), 'the fault is surfaced');
  ck(/\[error\]/.test(r.out), 'with the collector kind that caught it');
  ck(/before/.test(r.out), 'and whatever it managed to measure first is kept');
}

console.log('— a bench that measures nothing says nothing was measured —');
{
  const r = bench(page('done();'));
  ck(r.code === 0, 'exits 0');
  ck(/wrote no <div data-labbench/.test(r.out), 'says the contract was not met');
  ck(/Nothing was measured/.test(r.out), 'in the plainest available words');
}

console.log('— timer-driven work finishes inside the virtual budget —');
{
  // 40 × 500ms of setTimeout is 20 real seconds; virtual time collapses it.
  const r = bench(page(`
    var i = 0;
    (function step(){
      if (i >= 40) { report('ticks', i); done(); return; }
      i++; setTimeout(step, 500);
    })();
  `));
  ck(/ticks: 40/.test(r.out), 'all 40 timer ticks ran');
  ck(!/CUT OFF/.test(r.out), 'and the page reached done() rather than being cut off');
}

console.log('— truncation is announced, never silent —');
{
  const r = bench(page(`
    for (var i = 0; i < 400; i++) report('row' + i, 'x'.repeat(120));
    done();
  `));
  ck(/report truncated/.test(r.out), 'says it truncated');
  ck(/showed \d+ of 400 results/.test(r.out), 'and how much it dropped');
}

console.log('— markup in a measured value cannot break the report —');
{
  const r = bench(page(`report('esc', '<b>a & b</b> "q" 5<6'); done();`));
  ck(/esc: <b>a & b<\/b> "q" 5<6/.test(r.out), 'entities are decoded back to the original text');
}

console.log('');
if (failures) { console.error(`${failures} failed`); process.exit(1); }
console.log('all passed');
