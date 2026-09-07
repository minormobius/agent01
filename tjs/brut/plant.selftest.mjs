// tjs/brut/plant.selftest.mjs — node selftest for the botany kernel.
// Run: node tjs/brut/plant.selftest.mjs
//
// A procedural tree looks right or it does not, and "looks right" is exactly
// the kind of test that lets a wrong number through. So what is checked here is
// not the shape — it is the three relations the shape is a consequence of, and
// each is checked against closed form or against its own inverse:
//
//   · the PIPE MODEL, at every fork in every tree: d_parent^n = Σ d_child^n.
//     This is simultaneously the botany and the statics, so if it holds the
//     taper is a consequence of the crown rather than a parameter of it.
//   · the ALLOMETRY, round-tripped, and Chave's biomass equation against a
//     hand-computed case — because the mass IS the load, and a load computed
//     from a diameter the geometry never had is theatre.
//   · VOGEL RECONFIGURATION, against its rigid limit at the reference speed and
//     against the direction it has to move in above it.
//
// And the coupling that makes this procgen rather than instancing: a clipped
// envelope must produce a genuinely different tree, not the same tree squashed.

import {
  SPECIES, SPECIES_IDS, SOIL, SUBSTRATE, soilFor, soilLoad,
  dbhFor, heightFor, crownFor, dryMass, freshMass, MOISTURE,
  pipeRadius, grow, envelopeFor, dragOn, plantParts, plantPlan, check,
  plantElevation, plantSection, crownProfile, foliage,
  Rand, AIR, U_REF,
} from './plant.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m} (got ${a}, want ${b} ±${tol})`);

/* 1. THE PIPE MODEL — the one equation that is both the shape rule and the
      structural rule, so it is the one worth checking hardest. */
{
  // the bare relation first
  near(pipeRadius([0.03, 0.04], 2), Math.sqrt(0.03 ** 2 + 0.04 ** 2), 1e-12,
    'two branches combine as the root of the sum of squares');
  near(pipeRadius([0.03, 0.04], 2), 0.05, 1e-12, 'and 3-4-5 comes out exactly, as it must');
  near(pipeRadius([0.02], 2.4), 0.02, 1e-12, 'a single child passes its radius straight through, at any exponent');
  ok(pipeRadius([], 2, 0.007) === 0.007, 'a tip is the tip radius');
  // the exponent really is the exponent
  for (const n of [2.0, 2.2, 2.5]) {
    const r = pipeRadius([0.02, 0.03, 0.01], n);
    near(r ** n, 0.02 ** n + 0.03 ** n + 0.01 ** n, 1e-12, `area conservation holds at n = ${n}`);
  }
  // a parent is always thicker than any one child, and never thicker than the
  // sum — the two bounds that say the model is a model
  const r = pipeRadius([0.02, 0.03, 0.01], 2.2);
  ok(r > 0.03 && r < 0.06, `a fork is thicker than its thickest child and thinner than their sum (${r.toFixed(4)})`);
}

/* 2. AND IT HOLDS ON EVERY REAL TREE, at every fork. This is the check that
      would catch the radii being assigned by depth, or by a taper curve, or by
      anything other than what actually hangs off the branch. */
{
  // ONLY THE BRANCHING FORMS. The pipe model is a statement ABOUT branching —
  // cross-sectional area is conserved through a FORK — so a rosette of grass
  // blades and a clump of bamboo canes are not subject to it and never were.
  // They have no trunk, no forks, and their "diameter at breast height" is a
  // fiction the mass allometry does not use either (mats and tufts are weighed
  // per square metre). Asserting it over them was the test being wrong about
  // the code rather than the other way round.
  let forks = 0, worst = 0, branching = 0, radial = 0;
  for (const sp of SPECIES_IDS) {
    for (const s of ['a', 'b', 'c']) {
      const t = grow(sp, { seed: `pipe-${s}`, detail: 1.2 });
      if (t.form) { radial++; continue; }
      branching++;
      // rebuild the child lists from the segments and re-derive every parent
      const byNode = new Map();
      t.segments.forEach((seg, i) => {
        const key = `${seg.x0},${seg.y0},${seg.z0}`;
        if (!byNode.has(key)) byNode.set(key, []);
        byNode.get(key).push(seg);
      });
      const S = SPECIES[sp];
      for (const seg of t.segments) {
        const kidsOf = byNode.get(`${seg.x1},${seg.y1},${seg.z1}`) || [];
        if (kidsOf.length < 2) continue;              // only forks are interesting
        forks++;
        const want = Math.pow(kidsOf.reduce((a, k) => a + Math.pow(k.r, S.pipe), 0), 1 / S.pipe);
        const err = Math.abs(seg.r - want) / Math.max(1e-9, want);
        worst = Math.max(worst, err);
      }
    }
  }
  ok(forks > 150, `the sweep actually produced forks to check (${forks})`);
  ok(branching > 20 && radial > 8,
    `the sweep covers both the branching and the non-branching forms (${branching} branching, ${radial} radial)`);
  // the radii are rounded to a millimetre for the drawing, so the tolerance is
  // the rounding and nothing else
  ok(worst < 0.06, `the pipe model holds at every fork in every tree (worst ${(worst * 100).toFixed(2)} %)`);
}

/* 3. ALLOMETRY — round-tripped, because a one-way relation is how a load gets
      computed from a diameter the geometry never had. */
{
  for (const sp of SPECIES_IDS) {
    for (const h of [0.5, 2, 6, 12]) {
      if (h < SPECIES[sp].h[0] * 0.4 || h > SPECIES[sp].h[1] * 2.5) continue;
      const d = dbhFor(sp, h);
      near(heightFor(sp, d), h, 1e-9, `${sp}: height → diameter → height round-trips at ${h} m`);
      ok(d > 0 && d < 3, `${sp}: and the diameter is a real one (${(d * 1000).toFixed(0)} mm at ${h} m)`);
    }
  }
  // a taller tree of a species is always a thicker one
  for (const sp of SPECIES_IDS) {
    ok(dbhFor(sp, 8) > dbhFor(sp, 4), `${sp}: taller is thicker`);
    ok(crownFor(sp, 0.4) > crownFor(sp, 0.2), `${sp}: thicker is wider`);
  }

  // CHAVE ET AL. 2014, hand-computed: AGB = 0.0673·(ρ·D²·H)^0.976
  // ρ = 0.64, D = 30 cm, H = 12 m  →  ρD²H = 0.64 · 900 · 12 = 6912
  {
    const want = 0.0673 * Math.pow(0.64 * 900 * 12, 0.976);
    near(dryMass('plane', 0.30, 12), want, 1e-9, 'Chave 2014 matches the equation term by term');
    ok(want > 250 && want < 500, `and a 300 mm, 12 m tree is a few hundred kg dry (${want.toFixed(0)} kg)`);
    near(freshMass('plane', 0.30, 12), want * MOISTURE, 1e-9, 'fresh mass is dry mass times the moisture ratio');
  }
  // it scales with the square of diameter, near enough — the exponent is 0.976
  // on the whole product, so doubling D should be about 4×
  {
    const a = dryMass('plane', 0.2, 10), b = dryMass('plane', 0.4, 10);
    ok(b / a > 3.6 && b / a < 4.0, `doubling the diameter is very nearly four times the mass (${(b / a).toFixed(2)}×)`);
  }
  // and a denser wood is a heavier tree, linearly-ish
  ok(dryMass('plane', 0.3, 10) > dryMass('poplar', 0.3, 10), 'denser wood, heavier tree');
}

/* 4. THE SOIL LADDER — it runs DOWNWARD, from what the slab takes to what will
      grow, and the load it implies is the argument for the whole exercise. */
{
  ok(soilFor(0.05) === null, 'below the thinnest mat, nothing grows');
  ok(soilFor(0.10).label === 'sedum mat', '100 mm is a sedum mat and nothing else');
  ok(soilFor(0.35).label === 'semi-intensive', '350 mm is semi-intensive');
  ok(soilFor(2.0).label === 'deep tree pit', 'two metres is a deep tree pit');
  // monotone: deeper never grows less
  for (let d = 0.08; d < 2; d += 0.05) {
    const a = soilFor(d), b = soilFor(d + 0.05);
    if (a && b) ok(b.palette.length >= 1 && b.min >= a.min, `the ladder never goes backwards at ${d.toFixed(2)} m`);
  }
  // THE HEADLINE NUMBER, checked: a metre of saturated substrate against an
  // office floor's 2.4 kPa live load
  near(soilLoad(1.0), 1.0 * SUBSTRATE.saturated * 9.81, 1e-9, 'saturated load is depth × density × g');
  const kPa = soilLoad(1.0) / 1000;
  ok(kPa > 15 && kPa < 17, `a 1 m planter is about 16 kPa (${kPa.toFixed(1)})`);
  ok(kPa / 2.4 > 6, `which is over six times an office floor's live load (${(kPa / 2.4).toFixed(1)}×)`);
  // and every species can actually be grown by some band on the ladder
  for (const sp of SPECIES_IDS) {
    const band = SOIL.filter((s) => s.palette.includes(sp));
    ok(band.length > 0, `${sp} appears somewhere on the soil ladder`);
    ok(band.every((s) => s.min >= SPECIES[sp].soil - 1e-9),
      `${sp} is never offered by a band shallower than it will live in`);
  }
}

/* 5. VOGEL RECONFIGURATION — against the rigid limit it must equal at U_ref,
      and against the direction it must move above it. */
{
  const t = grow('plane', { seed: 'wind', detail: 1.4 });
  // AT the reference speed, reconfiguration is exactly nothing
  const at = dragOn(t, U_REF);
  near(at.force, at.rigid, 1e-6, 'at the reference speed the drag is exactly the rigid-body answer');
  near(at.ratio, 1, 1e-9, 'so the ratio is one');
  // and the rigid answer is ½ρCdAU², computed here rather than trusted
  near(at.rigid, 0.5 * AIR * at.cd * at.area * U_REF * U_REF, 0.01,
    'and that rigid answer is ½ρCdAU² term by term');

  // ABOVE it, the crown furls and the drag falls behind U²
  const fast = dragOn(t, 30);
  ok(fast.force < fast.rigid, 'above the reference speed the crown reconfigures and the drag is less than rigid');
  ok(fast.ratio < 0.75, `and materially so — ${Math.round(fast.ratio * 100)} % of a signboard of the same area`);
  ok(fast.force > at.force, 'but the force still rises with the wind, because Ψ > −2');
  // BELOW it, the opposite — an unfurled crown is more than rigid
  ok(dragOn(t, 4).ratio > 1, 'and below it the crown is fully unfurled, so the drag is above the rigid line');

  // OUT OF LEAF is a different load case, and a genuinely different number
  const bare = dragOn(t, 30, { inLeaf: false });
  ok(bare.force < fast.force, 'a bare winter crown takes far less force than one in leaf');
  ok(bare.ratio > fast.ratio, 'but what is left is much closer to rigid — there is nothing to furl');

  // the exponent really is doing the work
  const g = SPECIES.grass, w = SPECIES.plane;
  ok(g.vogel < w.vogel, 'grass reconfigures more than a tree — it lies flat in a gale');
  const gt = grow('grass', { seed: 'wind', detail: 1 });
  ok(dragOn(gt, 30).ratio < dragOn(t, 30).ratio, 'and its drag ratio at 30 m/s is lower for it');

  ok(at.moment > 0 && fast.moment > at.moment, 'the overturning moment rises with the force');
}

/* 6. THE ENVELOPE IS THE COUPLING — a clipped crown has to be a DIFFERENT tree,
      not the same tree squashed. This is the check that says this is procgen
      responding to architecture rather than an asset being scaled. */
{
  const free = grow('plane', { seed: 'env', detail: 1.4 });
  const soffit = grow('plane', { seed: 'env', detail: 1.4, clear: 5 });
  const facade = grow('plane', { seed: 'env', detail: 1.4, half: 'z+' });

  ok(soffit.height < free.height, `a tree under a 5 m soffit is shorter (${soffit.height} vs ${free.height} m)`);
  ok(soffit.segments.length !== free.segments.length, 'and it is not the same skeleton');

  // a half envelope really does put the crown on one side
  const side = (t) => {
    let neg = 0, pos = 0;
    for (const s of t.segments) { if (s.z1 < -0.3) neg++; else if (s.z1 > 0.3) pos++; }
    return { neg, pos };
  };
  const sf = side(facade), sfree = side(free);
  ok(sf.pos > sf.neg * 3, `a tree against a facade grows toward the light (${sf.pos} out, ${sf.neg} back)`);
  ok(Math.abs(sfree.pos - sfree.neg) < sfree.pos, 'where a free-standing one is roughly even');

  // and the mass follows the geometry rather than the label: a clipped tree is
  // a smaller tree, and the load it applies is smaller too
  ok(soffit.freshMass < free.freshMass, 'a clipped tree weighs less, because the mass is read off the geometry');
  ok(soffit.frontalArea < free.frontalArea, 'and presents less to the wind');
}

/* 7. THE SKELETON IS A TREE — connected, rooted, and nothing floating. */
{
  for (const sp of SPECIES_IDS) {
    const t = grow(sp, { seed: 'shape', detail: 1.4 });
    ok(t.segments.length > 4, `${sp}: grows something (${t.segments.length} segments)`);
    ok(t.nodes[0].parent === -1, `${sp}: has exactly one root`);
    ok(t.nodes.filter((n) => n.parent === -1).length === 1, `${sp}: and only one`);
    // every node's parent is earlier in the list, so the bottom-up pass is valid
    ok(t.nodes.every((n, i) => n.parent < i), `${sp}: the skeleton is topologically ordered`);
    // nothing floats: every segment starts where another ends, or at the root
    const ends = new Set(['0,0,0', ...t.segments.map((s) => `${s.x1},${s.y1},${s.z1}`)]);
    ok(t.segments.every((s) => ends.has(`${s.x0},${s.y0},${s.z0}`)), `${sp}: every branch is attached to another`);
    // THE THICKEST THING IS AT THE GROUND — in every form. What the ground
    // stems then ADD UP TO is a pipe-model claim, so it is asked only of the
    // plants that branch: a rosette's blades are not a trunk that was split.
    const roots = t.segments.filter((s) => s.y0 === 0);
    ok(roots.length >= 1, `${sp}: something is attached to the ground`);
    const thickest = Math.max(...roots.map((s) => s.r));
    ok(t.segments.every((s) => s.r <= thickest + 1e-9), `${sp}: nothing is thicker than the stem at the ground`);
    if (!t.form) {
      const combined = Math.pow(roots.reduce((a, s) => a + Math.pow(s.r, SPECIES[sp].pipe), 0), 1 / SPECIES[sp].pipe);
      near(combined * 2, t.dbh, Math.max(0.004, t.dbh * 0.05),
        `${sp}: the ground stems carry exactly the diameter the allometry asked for`);
    } else {
      // What a non-branching form owes instead. Not the pipe model, and NOT a
      // comparison against `dbh` — a mat's diameter at breast height is a
      // fiction (there is no breast height) and the drawn blade has a real
      // thickness of its own that the fiction would fail against. The honest
      // claim is monotone taper: no segment is thicker than the one it grew
      // out of, all the way from the ground to the tip.
      const thickestEndingAt = new Map();
      for (const s of t.segments) {
        const k = `${s.x1},${s.y1},${s.z1}`;
        thickestEndingAt.set(k, Math.max(thickestEndingAt.get(k) ?? 0, s.r));
      }
      ok(t.segments.every((s) => {
        const parentR = thickestEndingAt.get(`${s.x0},${s.y0},${s.z0}`);
        return parentR === undefined || s.r <= parentR + 1e-9;
      }), `${sp}: a ${t.form} tapers monotonically from the ground outward`);
    }
    ok(t.height > 0 && t.spread > 0, `${sp}: has real dimensions`);
  }
}

/* 8. DRAWN IS BUILT — the same rule the facade and the stairs live by. */
{
  const t = grow('plane', { seed: 'parts', detail: 1.4 });
  const p = plantParts(t, { x: 10, y: 3, z: -4 });
  ok(p.filter((q) => q.kind === 'branch').length === t.segments.length,
    'every segment the model grows is a branch the bench builds');
  ok(p.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z)),
    'and every part has a real position');
  ok(p.filter((q) => q.kind === 'branch').every((q) => q.dir && q.dir.length === 3),
    'a branch carries a direction rather than three Euler angles — a branch points anywhere');
  ok(p.some((q) => q.kind === 'foliage'), 'a tree has foliage');
  ok(plantParts(grow('sedum', { seed: 'mat', detail: 1 })).every((q) => q.kind !== 'foliage'),
    'a sedum mat does not');

  const pl = plantPlan(t, { x: 2, z: 5 });
  near(pl.r, t.spread / 2, 1e-9, 'the plan symbol is drawn at the MATURE spread, which is the dimension that matters');
  ok(pl.trunk > 0 && pl.trunk < pl.r, 'and the trunk inside it');
}

/* 9. THE CHECKS — each says what it protects, and each is a reason a real
      planted facade gets redesigned. */
{
  const t = grow('plane', { seed: 'check', detail: 1.4 });
  const bad = check(t, { depth: 0.2, gust: 20 });
  ok(!bad.pass, 'a tree in 200 mm of substrate fails');
  ok(bad.governing.id === 'soil', 'and the soil depth is what governs');

  const good = check(t, { depth: 1.6, gust: 15, slabCapacity: 40e3 });
  ok(good.checks.length === 4, 'four checks, every time');
  ok(good.checks.every((c) => c.note.length > 30), 'and every one says what it is protecting');

  // the wind check really binds at height
  const windy = check(t, { depth: 1.6, gust: 30, heightAboveGrade: 60 });
  ok(!windy.pass && windy.checks.find((c) => c.id === 'wind').pass === false,
    'a 30 m/s mean at sixty metres is more than this species will take');

  // and the slab check really is the governing load case it claims to be
  const heavy = check(t, { depth: 1.5, gust: 12, slabCapacity: 8e3 });
  ok(heavy.checks.find((c) => c.id === 'load').pass === false,
    'a 1.5 m planter on a slab designed for 8 kPa fails, which is the whole point');
}

/* 10. DETERMINISM — a tree is part of a permalink, so it must not wobble. */
{
  const a = JSON.stringify(grow('plane', { seed: 'same', detail: 1.4 }));
  const b = JSON.stringify(grow('plane', { seed: 'same', detail: 1.4 }));
  ok(a === b, 'the same seed grows the same tree, byte for byte');
  ok(a !== JSON.stringify(grow('plane', { seed: 'other', detail: 1.4 })),
    'and a different seed grows a different one');

  // no bare Math.random anywhere in the growth path
  const real = Math.random;
  Math.random = () => { throw new Error('unseeded randomness in the growth model'); };
  try {
    for (const sp of SPECIES_IDS) grow(sp, { seed: 'norandom', detail: 1 });
    ok(true, 'the whole growth model runs with Math.random disabled');
  } catch (e) {
    ok(false, `the growth model reached for Math.random — ${e.message}`);
  } finally { Math.random = real; }

  const r = Rand('x', 'y');
  ok(r.f() >= 0 && r.f() < 1, 'the seeded stream is in range');
}

/* 11. THE ELEVATION AND THE SECTION — the projections the drawing office reads.
      A projection is the one place a bug is invisible in every other test: the
      numbers stay right and the picture is wrong. So what is checked is that
      the drawing is the SAME TREE, that the habit survives the projection, and
      that the section's two root geometries are the two different things they
      claim to be. */
{
  for (const sp of SPECIES_IDS) {
    const t = grow(sp, { seed: 'draw', detail: 1.2 });
    const el = plantElevation(t, { x: 7, y: 21, z: -3, axis: 'x' });

    // NOTHING IS INVENTED AND NOTHING IS DROPPED. A projection that quietly
    // resamples is a drawing of a different tree than the model carries.
    ok(el.stems.length === t.segments.length, `${sp}: every segment is projected, none added`);
    ok(el.height === Math.round(t.height * 100) / 100, `${sp}: the drawn height is the grown height`);

    // the origin really is the origin, in both axes
    near(el.u, 7, 1e-9, `${sp}: the elevation stands where it was placed`);
    near(plantElevation(t, { x: 7, y: 21, z: -3, axis: 'z' }).u, -3, 1e-9,
      `${sp}: and on the other axis it reads the other coordinate`);

    // it is painted back to front, which is what makes a grove a grove
    ok(el.stems.every((s, i) => i === 0 || s.v >= el.stems[i - 1].v),
      `${sp}: the stems come back sorted by depth into the page`);

    // THE ENVELOPE IS THE HABIT. It is closed, it is symmetric about the stem,
    // and it never exceeds the mature spread the allometry asked for — the
    // dimension a landscape drawing is actually read for.
    const half = t.spread / 2 + 1e-6;
    ok(el.envelope.every((p) => Math.abs(p.u - el.u) <= half),
      `${sp}: the design envelope never exceeds the mature spread`);
    ok(el.envelope.every((p) => p.y >= 21 - 1e-6 && p.y <= 21 + t.height + 1e-6),
      `${sp}: and it stays between the ground it stands on and its own crown`);

    // and every leaf is inside the crown it grew in, not floating beside it
    ok(el.foliage.every((f) => f.y >= 21 - 1e-6), `${sp}: no foliage below the ground line`);
  }

  // THE HABIT SURVIVES THE PROJECTION — which is the entire reason there are
  // nineteen species instead of one scaled three ways. Two trees of similar
  // height must come out as visibly different silhouettes, and the widest point
  // is where the habit lives: a poplar is widest in the middle of a narrow
  // column, a conifer is widest at the bottom, a vase is widest at the top.
  const widestAt = (sp) => {
    const t = grow(sp, { seed: 'habit', detail: 1 });
    const e = plantElevation(t, {});
    let best = 0, at = 0;
    for (const p of e.envelope) {
      const w = Math.abs(p.u);
      if (w > best) { best = w; at = (p.y - e.crownBase) / Math.max(0.01, t.height - e.crownBase); }
    }
    return { at, slender: t.height / t.spread };
  };
  ok(widestAt('pine').at < 0.25, 'a conifer is widest at the bottom of its crown');
  ok(widestAt('rowan').at > 0.6, 'a vase is widest at the top of its crown');
  ok(widestAt('poplar').slender > 4, 'a columnar habit comes out slender');
  ok(widestAt('willow').slender < 2.2, 'and a weeper comes out broad');

  // THE SECTION'S TWO ROOT GEOMETRIES ARE TWO DIFFERENT THINGS. The ball is how
  // the tree ARRIVED (nursery stock, sized off caliper); the plate is how it
  // GREW (wide and shallow). Collapsing them is the error that puts a mature
  // plane on a three-metre-deep root ball.
  const big = grow('plane', { seed: 'sec', detail: 1.2 });
  const s1 = plantSection(big, { depth: 1.5, halfWidth: 6 });
  ok(s1.rootPlate.r > s1.rootBall.r, 'a grown root plate is wider than the ball it arrived on');
  ok(s1.rootPlate.depth < s1.rootBall.r * 4, 'and shallow — it spreads rather than descends');
  ok(s1.rootPlate.depth <= 1.5 + 1e-9, 'a root cannot go deeper than the substrate it was given');
  ok(s1.soilOK === true, '1.5 m is enough for a plane');
  ok(plantSection(big, { depth: 0.2 }).soilOK === false,
    'and 200 mm is not — the soil ladder says so in the section too');

  // the planter is a real edge: a plate that would be wider than the box it is
  // in comes back CONFINED rather than silently overflowing the drawing
  ok(plantSection(big, { depth: 1.5, halfWidth: 0.8 }).rootPlate.confined,
    'a root plate wider than its planter is reported confined, not clipped in silence');
  ok(!plantSection(big, { depth: 1.5, halfWidth: 40 }).rootPlate.confined,
    'and one with room to spread is not');

  // the section is the elevation plus what is under it — same tree, both times
  ok(s1.stems.length === big.segments.length, 'the section draws the same skeleton as the elevation');
}

console.log(`\nbrut/plant: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
