/* ken/lab/gate.selftest.mjs — known answers for the theory of the gate.

   Three claims carry WP4 and each is asserted at its corners as well as
   in the middle, because every one of them is the kind that is easy to
   state and easy to get backwards:

     a check does not attenuate, so coverage removes a defect at any gap
     a check can be wrong, and what it gets wrong it certifies
     independent attempts do not fail independently

   The last one has an empirical anchor and the model is Eckhardt–Lee
   rather than the independence one, so the corners at rho 0 and rho 1
   are checked against closed forms by hand. */

import {
  ungated, specifyFirst, unsoundnessCeiling, stoppingPoint, optimalCoverage,
  agreementFloor, strategies, STRATEGIES, VERIFICATION_FIRST, CHOICE,
} from '../graph/gate.mjs';
import { density } from '../graph/equivalence.mjs';
import { buildShape } from '../graph/shapes.mjs';
import { buildProfile } from '../graph/profiles.mjs';
import { shapeInvariants, positionTable } from '../graph/roles.mjs';
import { HYPOTHESES } from '../graph/hypotheses.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`  ✗ ${m}`); } };
const near = (a, b, t, m) => ok(Math.abs(a - b) <= t, `${m} (got ${a}, want ${b}±${t})`);
const section = (s) => console.log(`\n${s}`);

// ── 1. the shape is the one the catalogue already holds ───────────────
section('duties over a shape that is not new');

{
  const g = buildShape('standard');
  const inv = shapeInvariants(g);
  ok(VERIFICATION_FIRST.profile.join(',') === '1,2,2,1', 'the assignment is a 1-2-2-1 profile');
  ok(VERIFICATION_FIRST.sameShapeAs === 'standard', 'and it names the shape it reuses');
  ok(VERIFICATION_FIRST.duties.length === 6, 'six turns, six duties');
  ok(inv.depth === 3 && inv.width === 2, 'standard is still depth 3 width 2, so WP2 carries over unchanged');
  ok(inv.autOrder === 2, 'and still has an automorphism group of order 2');

  /* THE POINT OF SEPARATING DUTY FROM ROLE: four turns share one role
     and split into two duties, so degree cannot recover the assignment. */
  const middles = VERIFICATION_FIRST.duties.filter((d) => d.roleLanes === 'relay');
  ok(middles.length === 4, 'under lane wiring the four middle turns share one role');
  ok(new Set(middles.map((d) => d.duty)).size === 2, 'and carry two different duties');

  /* THE ROLES ARE DERIVED, NOT TYPED. The first version of this table
     invented splitter/broker/reporter, none of which roles.mjs produces
     for this shape. Compared against the real derivation now. */
  const derived = Object.fromEntries(positionTable(g).map((r) => [r.id, r.role]));
  const ids = ['setup', 'A1', 'A2', 'B1', 'B2', 'cleanup'];
  VERIFICATION_FIRST.duties.forEach((d, i) => {
    ok(d.roleLanes === derived[ids[i]],
      `${d.turn}: roleLanes is what roles.mjs derives (${d.roleLanes} against ${derived[ids[i]]})`);
  });

  /* THE FIRST OPEN QUESTION IS STRUCTURAL, not a preference: giving the
     builder the brief as well as the check changes four of six roles. */
  const briefed = buildProfile([1, 2, 2, 1], { wiring: 'lanes', skip: 'one' });
  const briefedRoles = positionTable(briefed).map((r) => r.role);
  const declared = VERIFICATION_FIRST.duties.map((d) => d.roleBriefed);
  ok(declared.join(',') === briefedRoles.join(','),
    `roleBriefed matches the derivation too (${declared.join(',')} against ${briefedRoles.join(',')})`);
  const changed = VERIFICATION_FIRST.duties.filter((d) => d.roleLanes !== d.roleBriefed).length;
  ok(changed === 4, `FOUR OF SIX ROLES CHANGE with that one wiring decision (got ${changed})`);
  ok(VERIFICATION_FIRST.openQuestions.length === 3, 'three wiring decisions are left open, and are named');
  ok(/changes four of the six derived roles/.test(VERIFICATION_FIRST.openQuestions[0][1]),
    'and the first one records that it is structural');
}

// ── 2. a check does not attenuate ─────────────────────────────────────
section('coverage removes a defect at any gap');

{
  // at full coverage and a sound check nothing survives: no decay, no last turn
  const perfect = specifyFirst({ coverage: 1, unsoundness: 0 });
  ok(perfect.density === 0, 'a complete sound check leaves nothing, which no chain length can do');
  ok(perfect.missed === 0 && perfect.certified === 0, 'and neither term contributes');

  // at zero coverage WP3 is recovered exactly, which is the continuity check
  for (const lambda of [0.2, 0.6, 0.9]) {
    const none = specifyFirst({ lambda, coverage: 0 });
    near(none.density, density(6, { q: 0.45, lambda }), 5e-5,
      `at coverage 0 the model is WP3's at lambda ${lambda}, to the 4dp this module rounds to`);
  }
  // coverage is what removes the floor, and it does so proportionally
  const half = specifyFirst({ coverage: 0.5, unsoundness: 0 });
  near(half.density, ungated() / 2, 5e-5, 'a sound check at half coverage halves the density');
}

// ── 3. THE CHECK CAN BE WRONG, AND IT CERTIFIES WHAT IT GETS WRONG ────
section('what the gate itself puts there');

{
  const bad = specifyFirst({ coverage: 1, unsoundness: 0.15 });
  ok(bad.missed === 0, 'at full coverage nothing is missed');
  near(bad.density, 0.15, 5e-5, 'so the density IS the unsoundness');
  ok(bad.selfInflicted === 1, 'and 100% of what survives was put there by the check');

  // the interesting middle: some of each
  const mid = specifyFirst({ coverage: 0.6, unsoundness: 0.3, tail: 2 });
  ok(mid.missed > 0 && mid.certified > 0, 'in between, both terms contribute');
  near(mid.certified, 0.3 * 0.36, 5e-5, 'the created term is u times c^gamma, by hand');
  near(mid.selfInflicted, 0.108 / (0.108 + 0.4 * ungated()), 5e-4,
    'and the self-inflicted share is the created term over the total, by hand');
  ok(mid.selfInflicted > 0.3 && mid.selfInflicted < 0.4,
    `which is about a third here (got ${mid.selfInflicted})`);

  // MORE COVERAGE CAN BE WORSE. The claim the whole section exists for.
  const at8 = specifyFirst({ coverage: 0.8, unsoundness: 0.45, tail: 3 }).density;
  const at95 = specifyFirst({ coverage: 0.95, unsoundness: 0.45, tail: 3 }).density;
  ok(at95 > at8, `at u 0.45 and gamma 3, coverage 0.95 is WORSE than 0.80 (${at95} against ${at8})`);
}

// ── 4. where to stop, in closed form and by search ────────────────────
section('the stopping point');

{
  // the two methods must agree to the search step
  for (const [lambda, u, tail] of [[0.6, 0.3, 2], [0.4, 0.4, 2.5], [0.9, 0.25, 3]]) {
    const closed = stoppingPoint({ lambda, unsoundness: u, tail }).coverage;
    const searched = optimalCoverage({ lambda, unsoundness: u, tail }).coverage;
    // the search steps 0.005 and both round to 4dp, so agreement to 0.02
    ok(Math.abs(closed - searched) <= 0.02,
      `closed form and search agree at lambda ${lambda} u ${u} gamma ${tail} (${closed} vs ${searched})`);
  }
  // gamma = 1 is linear, so the answer is a corner and says so
  const linear = stoppingPoint({ tail: 1 });
  ok(linear.interior === false && /corner/.test(linear.reason), 'at gamma 1 the optimum is a corner and it is named');

  // a better check-writer specifies more
  const cs = [0.5, 0.4, 0.3, 0.2].map((u) => stoppingPoint({ unsoundness: u }).coverage);
  ok(cs.every((c, i) => i === 0 || c >= cs[i - 1]), `lower unsoundness means more coverage (${cs.join(' < ')})`);

  /* THE INVERSION, and it is the paper's least comfortable result:
     better context flow lowers the optimal amount of specification,
     because the chain would have caught those defects anyway. */
  const byLambda = [0.2, 0.4, 0.6, 0.8, 0.95].map((lambda) => stoppingPoint({ lambda }).coverage);
  ok(byLambda.every((c, i) => i === 0 || c < byLambda[i - 1]),
    `RAISING LAMBDA LOWERS c*: ${byLambda.join(' > ')}`);
  const M = [0.2, 0.95].map((lambda) => ungated({ lambda }));
  ok(M[0] > M[1], 'because the ungated density it is compared against falls');

  // the bare inequality: specify everything iff u < M
  const { ceiling } = unsoundnessCeiling();
  near(ceiling, ungated(), 5e-5, 'the ceiling on a complete specification IS the ungated density');
  ok(specifyFirst({ coverage: 1, unsoundness: ceiling - 0.05 }).density < specifyFirst({ coverage: 0 }).density,
    'just under the ceiling, specifying everything beats specifying nothing');
  ok(specifyFirst({ coverage: 1, unsoundness: ceiling + 0.05 }).density > specifyFirst({ coverage: 0 }).density,
    'and just over it, the reverse');
}

// ── 5. independent attempts do not fail independently ─────────────────
section('the agreement floor');

{
  // the corners, by hand
  near(agreementFloor({ p: 0.4, correlation: 0 }), 0.16, 1e-9, 'at rho 0 two versions give p squared');
  near(agreementFloor({ p: 0.4, correlation: 1 }), 0.4, 1e-9, 'AT RHO 1 TWO VERSIONS BUY NOTHING AT ALL');
  near(agreementFloor({ p: 0.3, correlation: 0, versions: 3 }), 0.027, 1e-9, 'and three give p cubed at rho 0');
  near(agreementFloor({ p: 0.3, correlation: 1, versions: 3 }), 0.3, 1e-9, 'and still nothing at rho 1');

  // Eckhardt-Lee closed form for two versions: p^2 + rho p (1-p)
  for (const [p, rho] of [[0.4, 0.3], [0.2, 0.5], [0.6, 0.15]]) {
    near(agreementFloor({ p, correlation: rho }), p * p + rho * p * (1 - p), 1e-6,
      `two versions at p ${p} rho ${rho} match the closed form`);
  }
  // monotone in correlation, and more versions never hurt
  const byRho = [0, 0.2, 0.4, 0.6, 0.8, 1].map((r) => agreementFloor({ p: 0.4, correlation: r }));
  ok(byRho.every((x, i) => i === 0 || x > byRho[i - 1]), 'the floor rises with correlation');
  ok(agreementFloor({ p: 0.4, correlation: 0.3, versions: 3 }) < agreementFloor({ p: 0.4, correlation: 0.3 }),
    'a third version helps, though less than independence would predict');
  ok(agreementFloor({ p: 0.4, correlation: 0.3, versions: 3 }) > 0.4 ** 3,
    'and by less than p cubed, which is the whole Knight-Leveson point');
  let threw = 0;
  try { agreementFloor({ versions: 1 }); } catch { threw++; }
  try { agreementFloor({ p: 1.5 }); } catch { threw++; }
  ok(threw === 2, 'one version, or a rate outside [0,1], is refused');
}

// ── 6. the three strategies, and that they cross ──────────────────────
section('the crossing');

{
  ok(STRATEGIES.length === 3, 'three strategies');
  const st = strategies();
  ok(st.rows.length === 3 && st.rows.every((r, i) => i === 0 || r.density >= st.rows[i - 1].density),
    'ranked by density');
  ok(st.rows.every((r) => STRATEGIES.includes(r.name)), 'and named from the same list');

  /* THE THREE ARE ON ONE SCALE. The first version of strategies() took
     the per-version error rate as a free parameter, which let
     build-twice pick its own units and win everywhere. It now defaults
     to the ungated density, so all three rows are densities. */
  ok(st.settings.perVersion === ungated(), 'build-twice uses the ungated density as its per-version rate');

  // ungated is never the best when a decent check is available
  ok(strategies({ unsoundness: 0.1 }).best !== 'ungated', 'a sound check beats no check');

  // NEITHER OF THE OTHER TWO WINS EVERYWHERE, which is the paper's claim
  const lowRho = strategies({ correlation: 0.02 }).best;
  const highRho = strategies({ correlation: 0.8 }).best;
  ok(lowRho === 'build-twice', `at rho 0.02 build-twice wins (got ${lowRho})`);
  ok(highRho === 'specify-first', `at rho 0.8 specify-first wins (got ${highRho})`);
  ok(lowRho !== highRho, 'THE STRATEGIES CROSS, so the theory has more than one answer in it');

  // and a poor check-writer flips it back at any correlation
  const poor = [0.1, 0.4, 0.7].map((r) => strategies({ correlation: r, unsoundness: 0.55, coverage: 0.8 }).best);
  ok(poor.every((b) => b === 'build-twice'),
    `with an unreliable check-writer build-twice wins throughout (${poor.join(', ')})`);

  // specify-first does not depend on correlation, which is its whole appeal
  const a = strategies({ correlation: 0.1 }).rows.find((r) => r.name === 'specify-first').density;
  const b = strategies({ correlation: 0.9 }).rows.find((r) => r.name === 'specify-first').density;
  ok(a === b, 'specify-first is flat in correlation');

  ok(CHOICE.length === 3 && CHOICE.every((c) => /nothing/.test(c.standing)),
    'and all three deciding quantities are recorded as unmeasured');
}

// ── 7. the register agrees with the model ─────────────────────────────
section('H10 and H11');

ok(HYPOTHESES.H10 && HYPOTHESES.H10.owner === '/wp4', 'H10 is registered and owned by WP4');
ok(HYPOTHESES.H11 && HYPOTHESES.H11.owner === '/wp4', 'H11 too');
ok(/flat in gap/.test(HYPOTHESES.H10.predicts.map((p) => p[0]).join(' ')),
  'H10 predicts flat detection in gap, which is the non-attenuation claim');
ok(HYPOTHESES.H10.refutedBy.some((r) => /flat at zero/.test(r)),
  'and loses to a check nothing trips, which is the probe ceiling');
ok(/re-run at each later turn rather than summarised/.test(HYPOTHESES.H10.requires),
  'H10 requires the check be re-run rather than summarised, since a summary would attenuate');
ok(/TWELVE TURNS/.test(HYPOTHESES.H10.cost), 'H10 is priced at twelve turns on top of H9');
ok(HYPOTHESES.H11.refutedBy.some((r) => /wins at every setting/.test(r)),
  'H11 loses if one strategy wins everywhere, which is the crossing stated as a refutation');
ok(/held-out scorer/.test(HYPOTHESES.H11.requires),
  'H11 requires a held-out scorer, or specify-first is graded by its own homework');
ok(/EIGHTEEN TURNS PER TASK/.test(HYPOTHESES.H11.cost), 'H11 is priced per task, since the arms are paired');

console.log(`\n${fail === 0 ? '✓' : '✗'} gate ${fail === 0 ? 'passed' : 'FAILED'} — ${fail === 0 ? pass : `${fail} of ${pass + fail}`} checks`);
process.exit(fail === 0 ? 0 : 1);
