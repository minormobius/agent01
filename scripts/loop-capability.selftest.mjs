#!/usr/bin/env node
// loop-capability.selftest.mjs — does the cop resist the thing it exists to stop?
//
// The cop is a scorer, and a scorer's failure modes are not ordinary bugs:
//   · scoring a WORKING page as zero halts the loop on a lie;
//   · scoring a BROKEN page as fine is worse, because it removes the only
//     signal that is not the fleet's own homework;
//   · a score that MOVES WHEN NOTHING MOVED is noise the plateau brake reads
//     as progress.
//
// So this file tests the scoring function against fixtures rather than the
// browser. `score()` is pure and that is deliberate: the part that must be
// right on every run is arithmetic, and arithmetic can be pinned without a
// runner. The browser half is exercised by running the cop for real, which
// `preflight` does not do (it costs a chromium) — that is a stated gap, not an
// oversight, and it is why the cop reports `available:false` rather than 0 when
// it cannot drive anything.

import { score, TARGET } from './loop-capability.mjs';

let pass = 0, fail = 0;
const ok = (what, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fail++; console.log(`  ✗ ${what}${detail ? ' — ' + detail : ''}`); }
};

const M = (o = {}) => ({
  controls: 0, distinctRefusals: 0, distinctVerdicts: 0, placed: 0, movesToFirstFail: null, ...o,
});

console.log('\n(1) a dead page scores near zero, and a full one scores 1');
{
  const dead = score(M());
  ok('a page with nothing reachable scores 0', dead.score === 0, String(dead.score));
  const full = score(M({
    controls: TARGET.controls, distinctRefusals: TARGET.refusals,
    distinctVerdicts: TARGET.verdicts, placed: TARGET.placed, movesToFirstFail: TARGET.moves,
  }));
  ok('a page meeting every target scores 1', Math.abs(full.score - 1) < 1e-9, String(full.score));
}

console.log('\n(2) THE ANTI-GAMING PROPERTY: no single axis can buy a good score');
{
  // This is the whole point. The loop already showed it will maximise whatever
  // is cheapest — 2.11 lines of test per line of source. If any one axis could
  // dominate, the cop would just be a new thing to farm.
  for (const axis of ['controls', 'distinctRefusals', 'distinctVerdicts', 'placed']) {
    const m = M({ [axis]: 10000 });
    const s = score(m).score;
    ok(`maxing ${axis} alone stays below 0.4`, s < 0.4, s.toFixed(3));
  }
  const spammed = score(M({ controls: 10000 }));
  ok('and a page that is ALL buttons and no consequence scores under 0.15',
    spammed.score < 0.15, spammed.score.toFixed(3));
}

console.log('\n(3) refusing everything is not a win');
{
  // A page that never lets anything land can reach many refusal sentences.
  // Without the `placed` term it would score highly for being unplayable.
  const refuseOnly = score(M({
    controls: TARGET.controls, distinctRefusals: TARGET.refusals,
    distinctVerdicts: TARGET.verdicts, placed: 0, movesToFirstFail: 1,
  }));
  const alsoBuilds = score(M({
    controls: TARGET.controls, distinctRefusals: TARGET.refusals,
    distinctVerdicts: TARGET.verdicts, placed: TARGET.placed, movesToFirstFail: 1,
  }));
  ok('a page that only ever refuses cannot reach 0.8', refuseOnly.score < 0.8, refuseOnly.score.toFixed(3));
  ok('being able to BUILD is worth strictly more', alsoBuilds.score > refuseOnly.score);
}

console.log('\n(4) never reaching a failure is scored as never reaching one');
{
  const noFail = score(M({ controls: 6, placed: 3, movesToFirstFail: null }));
  const fails = score(M({ controls: 6, placed: 3, movesToFirstFail: 4 }));
  ok('movesToFirstFail=null earns nothing on speed', noFail.parts.speed === 0);
  ok('and reaching a failure scores strictly higher', fails.score > noFail.score);
}

console.log('\n(5) monotonic — more capability is never worth less');
{
  // A non-monotonic scorer makes the plateau brake fire on improvements.
  let bad = 0;
  for (const axis of ['controls', 'distinctRefusals', 'distinctVerdicts', 'placed']) {
    for (let n = 0; n < 12; n++) {
      const a = score(M({ [axis]: n })).score;
      const b = score(M({ [axis]: n + 1 })).score;
      if (b < a - 1e-12) bad++;
    }
  }
  ok('every axis is non-decreasing', bad === 0, `${bad} inversions`);
}

console.log('\n(6) CONTROL: the test above would notice a broken scorer');
{
  // A control that must FAIL against a deliberately wrong scorer, so section
  // (2) cannot pass by being vacuous. A weights-free mean of the same parts
  // lets a single maxed axis carry the score, and (2) must reject it.
  const naive = (m) => {
    const cap = (x, t) => Math.max(0, Math.min(1, x / t));
    return (cap(m.controls, TARGET.controls) + cap(m.distinctRefusals, TARGET.refusals)
      + cap(m.distinctVerdicts, TARGET.verdicts) + cap(m.placed, TARGET.placed)) / 4;
  };
  const spam = naive(M({ controls: 10000 }));
  ok('a naive unweighted scorer WOULD be gameable (so section 2 is not vacuous)',
    spam >= 0.15, `naive gives ${spam.toFixed(3)}, the real one gives ${score(M({ controls: 10000 })).score.toFixed(3)}`);
}

console.log(`\n${fail ? '✗' : '✓'} loop-capability selftest — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
