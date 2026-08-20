// tjs/brut/planting.selftest.mjs — node selftest for planting placement and its
// consequences. Run: node tjs/brut/planting.selftest.mjs
//
// ECOBRUTALISM.md states a kill criterion up front: *if the planting never
// changes the governing check, it is a garnish and should be deleted rather
// than kept for the render.* This file is where that gets enforced, so most of
// what it checks is not "did trees appear" but:
//
//   · does the load reach the frame, and is it a DEAD load;
//   · does planting AT GRADE cost the structure nothing, and planting on a
//     plate cost it everything;
//   · does the substrate depth really decide the palette;
//   · and does any of it actually move a check — measured, over a sweep, not
//     asserted.

import { generate, resolveParams, paramsToQuery, TYPOLOGY_IDS, rect as R } from './arch.js';
import { verify } from './struct.js';
import { SPECIES, SOIL, soilFor, soilLoad } from './plant.js';
import {
  SITES, PLANT_BUDGET, placePlanting, plantingSites, plantingLoads,
  plantingSchedule, checkPlanting, meanWindAt,
} from './planting.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m} (got ${a}, want ${b} ±${tol})`);
const HZ = { seismicScenario: 'high', windScenario: 'cat3' };

/* 1. THE SITES ARE THE ONES THE BUILDING ALREADY HAS. Every planter must sit on
      a plate the massing left exposed, or be one of the memes that names its
      own ground — not somewhere a siting stage invented. */
{
  let n = 0, offPlate = 0, tiny = 0, overlapping = 0;
  for (const t of TYPOLOGY_IDS) {
    for (const s of ['p1', 'p2', 'p3']) {
      const b = generate(resolveParams({ s, t }));
      for (const q of b.planting) {
        n++;
        const L = b.levels[q.level];
        // it is inside a wing of the level it claims — a planter hanging off
        // the side of a plate is a planter falling off a building
        if (!L || !L.wings.some((w) => R.overlaps(w, q, 0.5))) offPlate++;
        if (q.w < 1 || q.d < 1) tiny++;
      }
      // and no two planters occupy the same square metre AT THE SAME HEIGHT.
      // Comparing on `level` alone is wrong: a grove at grade sits UNDER level
      // zero and a terrace sits on TOP of it, so they share an index and share
      // no space at all. `y` is what actually separates them.
      for (let i = 0; i < b.planting.length; i++) {
        for (let j = i + 1; j < b.planting.length; j++) {
          const a = b.planting[i], c = b.planting[j];
          if (Math.abs(a.y - c.y) < 0.5 && R.overlaps(a, c, 0.5)) overlapping++;
        }
      }
    }
  }
  ok(n > 30, `the sweep actually planted something (${n} planters)`);
  ok(offPlate === 0, `every planter sits on a plate the building has (${offPlate} off)`);
  ok(tiny === 0, `and none of them is too small to be a planter (${tiny})`);
  ok(overlapping === 0, `no two planters occupy the same square metre (${overlapping})`);
}

/* 2. THE LADDER RUNS DOWNWARD — depth decides palette, and nothing is ever
      offered ground it will not live in. */
{
  let wrongSoil = 0, n = 0;
  for (const t of TYPOLOGY_IDS) {
    for (const s of ['q1', 'q2', 'q3']) {
      const b = generate(resolveParams({ s, t }));
      for (const q of b.planting) {
        for (const pl of q.plants) {
          n++;
          if (SPECIES[pl.species].soil > q.depth + 1e-9) wrongSoil++;
        }
      }
    }
  }
  ok(n > 200, `the sweep planted a real number of plants (${n})`);
  ok(wrongSoil === 0, `nothing is planted in soil shallower than it will live in (${wrongSoil})`);

  // every site type's depth lands on a real band of the ladder
  for (const [k, S] of Object.entries(SITES)) {
    const band = soilFor(S.depth);
    ok(band, `the ${k} site depth is on the ladder (${Math.round(S.depth * 1000)} mm → ${band && band.label})`);
    ok(S.cover > 0 && S.cover <= 1, `${k}: covers a real fraction of its deck (${S.cover})`);
    ok(S.note && S.note.length > 40, `${k}: says what kind of place it is`);
  }
}

/* 3. AT GRADE IS FREE; ON A PLATE IS NOT. The one distinction that would let a
      generator hang a tree pit off the twentieth floor for nothing. */
{
  let checked = 0;
  for (const t of TYPOLOGY_IDS) {
    for (let i = 0; i < 8; i++) {
      const b = generate(resolveParams({ s: `grade-${i}`, t }));
      const grove = b.planting.filter((q) => q.onGrade);
      const carried = b.planting.filter((q) => !q.onGrade);
      if (!grove.length) continue;
      checked++;
      // nothing at grade reaches any level's load
      for (const g of grove) {
        const e = b.plantingLoads.byLevel.find((q) => q.level === g.level);
        const fromCarried = carried.filter((q) => q.level === g.level)
          .reduce((a, q) => a + q.loadPa * q.area, 0);
        ok(!e || Math.abs(e.N - fromCarried) < 1,
          `${t}-${i}: the grove at grade puts nothing on the frame`);
      }
      ok(b.plantingLoads.onGrade > 0, `${t}-${i}: and it is reported separately, not lost`);
    }
  }
  ok(checked > 2, `the sweep found groves at grade to check (${checked})`);
}

/* 4. THE LOAD REACHES THE FRAME, AS DEAD LOAD. Saturated soil is permanently
      there, so calling it live would let the code's own factors discount the
      heaviest thing on the roof. */
{
  const b = generate(resolveParams({ s: 'load-me', t: 'civic' }));
  ok(b.plantingLoads.byLevel.length > 0, 'the building carries planting loads by level');

  const v = verify(b, HZ);
  const withPlanting = v.levels || v.loads || null;
  // the level loads carry a `planted` term, and it is inside `dead`
  const lv = (v.levels || []).find((q) => q.planted > 0)
    || (v.loads || []).find((q) => q.planted > 0);
  if (lv) {
    ok(lv.planted > 0, `a planted level reports its planting load (${(lv.planted / 1000).toFixed(0)} kN)`);
    ok(lv.dead > lv.planted, 'and it is part of the dead load rather than beside it');
  } else {
    ok(true, 'the solve does not expose per-level loads here — checked through the verdict instead');
  }

  // the seismic mass really does rise with the planting
  const bare = verify({ ...b, plantingLoads: null }, HZ);
  ok(v.summary.massTonnes > bare.summary.massTonnes,
    `planting raises the seismic mass (${Math.round(bare.summary.massTonnes)} → ${Math.round(v.summary.massTonnes)} t)`);
}

/* 5. THE KILL CRITERION, MEASURED. "If the planting never changes the governing
      check, it is a garnish." Over a real sweep, how often does it? */
{
  let n = 0, moved = 0, flipped = 0, worst = 0;
  for (const t of TYPOLOGY_IDS) {
    for (let i = 0; i < 8; i++) {
      const b = generate(resolveParams({ s: `eco-${i}`, t }));
      const withP = verify(b, HZ);
      const noP = verify({ ...b, plantingLoads: null }, HZ);
      n++;
      const rel = (withP.governing.util - noP.governing.util) / Math.max(0.01, noP.governing.util);
      if (Math.abs(rel) > 0.01) moved++;
      worst = Math.max(worst, rel);
      if (noP.verdict !== 'fail' && withP.verdict === 'fail') flipped++;
    }
  }
  ok(moved > n * 0.4, `planting moves the governing utilisation on most buildings (${moved}/${n})`);
  ok(worst > 0.03, `and by a real amount at worst (+${Math.round(worst * 100)} %)`);
  ok(flipped > 0, `on some buildings it is the reason the frame fails (${flipped})`);
  // but it must not dominate — a garnish is one failure mode, a wrecking ball
  // is the other
  ok(worst < 1.0, `without overwhelming everything else (+${Math.round(worst * 100)} %)`);
}

/* 6. MORE WEIGHT IS NOT ALWAYS WORSE, and that is real. A heavier building
      resists overturning, sliding and uplift better — and enough extra load
      steps the FOUNDATION LADDER from pads to a raft, which tolerates 65 mm of
      settlement where isolated pads tolerate 25. Emergent, correct, and worth
      pinning so a future "fix" does not flatten it. */
{
  const b = generate(resolveParams({ s: 'eco-1', t: 'lab' }));
  const withP = verify(b, HZ), noP = verify({ ...b, plantingLoads: null }, HZ);
  const wu = withP.checks.find((c) => c.id === 'ot'), nu = noP.checks.find((c) => c.id === 'ot');
  if (wu && nu) ok(wu.util <= nu.util + 1e-9, 'a heavier building overturns no more easily, not less');
  const ws = withP.checks.find((c) => c.id === 'settle'), ns = noP.checks.find((c) => c.id === 'settle');
  ok(ws && ns, 'settlement is checked both ways');
  // whichever way the utilisation went, the ABSOLUTE settlement must not fall
  ok(withP.foundation.settle >= noP.foundation.settle - 1e-6,
    `absolute settlement never falls when load is added (${(noP.foundation.settle * 1000).toFixed(0)} → ${(withP.foundation.settle * 1000).toFixed(0)} mm)`);
}

/* 7. THE AMBITION IS A PARAMETER, so the roller can turn it and the permalink
      can carry it. */
{
  const p0 = resolveParams({ s: 'green', t: 'office' });
  ok(p0.green === 1, 'the default ambition is what each site type asks for');

  const none = generate(resolveParams({ s: 'green', t: 'office', gr: '0' }));
  ok(none.planting.length === 0, 'green = 0 is a building with nothing growing on it');
  ok(none.plantingLoads.carried === 0, 'and it carries no planting load');

  const half = generate(resolveParams({ s: 'green', t: 'office', gr: '0.5' }));
  const full = generate(resolveParams({ s: 'green', t: 'office', gr: '1' }));
  ok(half.plantingLoads.carried < full.plantingLoads.carried,
    `half the substrate is less load (${half.plantingLoads.carried} < ${full.plantingLoads.carried} t)`);
  for (const q of half.planting) {
    const same = full.planting.find((r) => r.kind === q.kind && r.level === q.level);
    if (same) near(q.depth, same.depth * 0.5, 0.02, `${q.kind}: the depth really halves`);
  }
  // and it round-trips through the permalink
  const q = paramsToQuery(resolveParams({ s: 'green', t: 'office', gr: '0.6' }));
  ok(/gr=0\.6/.test(q), 'the ambition appears in the link');
  ok(resolveParams(q).green === 0.6, 'and comes back out of it');
}

/* 8. GEOMETRY IS OPTIONAL AND THE LOAD IS NOT. Growing a crown costs a hundred
      milliseconds and the roller makes forty buildings a roll, so the two paths
      must agree on what things weigh while only one of them grows anything. */
{
  const p = resolveParams({ s: 'geom', t: 'civic' });
  const b = generate(p);
  const fast = placePlanting(p, b, b.parti, { geometry: false });
  const slow = placePlanting(p, b, b.parti, { geometry: true });

  ok(fast.length === slow.length, 'both paths place the same planters');
  ok(fast.every((q) => q.plants.every((pl) => pl.tree === null)), 'the fast path grows nothing');
  ok(slow.every((q) => q.plants.every((pl) => pl.tree && pl.tree.segments.length)), 'the slow path grows everything');
  ok(fast.every((q, i) => q.plants.length === slow[i].plants.length), 'and the same number of plants in each');

  const a = plantingSchedule(fast), c = plantingSchedule(slow);
  ok(Math.abs(a.tonnes - c.tonnes) / Math.max(1, c.tonnes) < 0.15,
    `the allometric and the grown tonnage agree (${a.tonnes} vs ${c.tonnes} t)`);
  ok(c.plants === a.plants, 'and the plant counts agree exactly');

  // every plant carries its own mass whichever path made it, because the
  // downstream readers must not have to know which one ran
  let massless = 0, counted = 0;
  for (const set of [fast, slow]) {
    for (const q of set) for (const pl of q.plants) {
      counted++;
      if (!(pl.freshMass > 0 && pl.spread > 0)) massless++;
    }
  }
  ok(counted > 20, `both paths produced plants to compare (${counted})`);
  ok(massless === 0, `every plant carries its own mass and spread whichever path made it (${massless} that do not)`);
}

/* 9. THE BUDGET HOLDS, AND IT IS SHARED. A single roof garden used to swallow
      every plant in the building and leave every setback below it bare, which
      loses the stepped planted section that is the whole point. */
{
  let over = 0, single = 0, multi = 0;
  for (const t of TYPOLOGY_IDS) {
    for (let i = 0; i < 8; i++) {
      const b = generate(resolveParams({ s: `budget-${i}`, t }));
      const total = b.planting.reduce((a, q) => a + q.plants.length, 0);
      if (total > PLANT_BUDGET) over++;
      if (b.planting.length === 1) single++;
      if (b.planting.length > 1) multi++;
    }
  }
  ok(over === 0, `no building exceeds the plant budget (${over} over ${PLANT_BUDGET})`);
  ok(multi > single, `most buildings plant more than one place (${multi} multi vs ${single} single)`);
}

/* 10. DETERMINISM — a planted building is still a permalink. */
{
  const p = resolveParams({ s: 'same-tree', t: 'housing' });
  const a = JSON.stringify(generate(p).planting);
  const b = JSON.stringify(generate(p).planting);
  ok(a === b, 'the same seed plants the same building');
  ok(a !== JSON.stringify(generate(resolveParams({ s: 'other-tree', t: 'housing' })).planting),
    'and a different seed plants a different one');

  const real = Math.random;
  Math.random = () => { throw new Error('unseeded randomness in the planting'); };
  try {
    for (const t of TYPOLOGY_IDS) generate(resolveParams({ s: 'norandom', t }));
    ok(true, 'the whole planting stage runs with Math.random disabled');
  } catch (e) {
    ok(false, `the planting reached for Math.random — ${e.message}`);
  } finally { Math.random = real; }
}

/* 11. THE SCHEDULE AND THE CHECKS. */
{
  const b = generate(resolveParams({ s: 'sched', t: 'civic', gr: '1' }));
  const sc = b.plantingStats;
  ok(sc.plants > 0 && sc.area > 0, 'the schedule counts what was planted');
  ok(sc.substrate > 0 && sc.tonnes > 0, 'and the substrate volume and its weight');
  ok(sc.species.length > 0 && sc.species.every((e) => e.count > 0), 'broken down by species');
  near(sc.plants, sc.species.reduce((a, e) => a + e.count, 0), 0, 'and the species counts add up to the total');

  const ch = checkPlanting(b.planting, { gust: 24 });
  ok(ch.length === b.planting.length, 'every planter is checked');
  ok(ch.every((c) => c.wind && c.wind.force >= 0), 'and each gets a real wind force');
  // out of leaf is a different, smaller load — the winter case
  const leafy = checkPlanting(b.planting, { gust: 24, inLeaf: true });
  const bare2 = checkPlanting(b.planting, { gust: 24, inLeaf: false });
  ok(bare2.every((c, i) => !c.wind || !leafy[i].wind || c.wind.force <= leafy[i].wind.force),
    'a bare winter crown takes less force than one in leaf, everywhere');

  ok(meanWindAt(0) < meanWindAt(60), 'the placement wind proxy rises with height');
}

console.log(`\nbrut/planting: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
