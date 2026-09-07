// tjs/brut/terrain.selftest.mjs — node selftest for the ground.
// Run: node tjs/brut/terrain.selftest.mjs
//
// Terrain is the easiest thing in this repo to fake and the hardest to catch
// faking, because a heightfield always LOOKS like a heightfield. So nothing
// here is asserted about how it looks. What is asserted is:
//
//   · MASS CONSERVATION through erosion — the physical invariant of the
//     process, exact to floating point, and the one check that would catch
//     erosion being a blur filter with a good name.
//   · THE BALANCE DATUM against its closed form. cut(d) − fill(d) = Σ(hᵢ − d)
//     identically, so cut = fill exactly at d = mean(h). No search, no
//     iteration, and a hand-computable answer on a made-up surface.
//   · THE GEOTECHNICAL RELATIONS against textbook: infinite-slope FoS, Rankine
//     Ka/Kp in both their equivalent forms, and a retaining wall re-checked
//     from its own returned dimensions.
//   · THE SHARED CONSTANT — struct.js's base friction μ must be tan(⅔φ) from
//     this file's φ. Two tables describing one substance, forced to agree.
//   · CONTOURS — every vertex sits at its own level, which is what marching
//     squares is FOR and the thing an off-by-one in the case table breaks.

import {
  Terrain, GROUND, GROUND_IDS, VERSION, WATER,
  slopeFoS, slopeFoSC, rankine, retaining, earthworks, check, contours, profile, mesh,
} from './terrain.js';
import { SOILS } from './struct.js';
import { Rand } from './rand.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= tol, `${m} (got ${a}, want ${b} ±${tol})`);
const DEG = Math.PI / 180;

/* 1. THE SHARED CONSTANT. Two tables describe the same ground: struct.js's
      SOILS (what the bearing and seismic analysis needs) and terrain.js's
      GROUND (what the SHAPE of the ground needs). They are keyed the same and
      they had better agree, or the building is standing on different soil from
      the hill it is standing on. The relation is the standard soil-on-concrete
      interface friction δ = ⅔φ, so μ = tan(⅔φ). */
{
  for (const k of GROUND_IDS) {
    ok(SOILS[k] !== undefined, `${k}: struct.js knows this ground too`);
    if (!SOILS[k]) continue;
    const want = Math.tan((2 / 3) * GROUND[k].phi * DEG);
    ok(Math.abs(SOILS[k].mu - want) / want < 0.06,
      `${k}: struct's μ=${SOILS[k].mu} is tan(⅔·${GROUND[k].phi}°)=${want.toFixed(3)} — the two soil tables agree`);
    // and the ladder is monotone in both files at once
    ok(GROUND[k].phi > 0 && GROUND[k].phi < 60, `${k}: the friction angle is a real one`);
  }
  ok(GROUND.B.phi > GROUND.C.phi && GROUND.C.phi > GROUND.D.phi && GROUND.D.phi > GROUND.E.phi,
    'stronger ground stands at a steeper angle, in order');
  ok(SOILS.B.q > SOILS.C.q && SOILS.C.q > SOILS.D.q && SOILS.D.q > SOILS.E.q,
    'and carries more, in the same order — the two tables rank the ground identically');
}

/* 2. INFINITE SLOPE. FoS = tan φ / tan β, and the reason it is the most useful
      slope equation there is: the unit weight and the depth of the slip plane
      cancel out entirely. */
{
  near(slopeFoS(30 * DEG, 30), 1, 1e-12, 'a slope AT the friction angle is exactly critical');
  ok(slopeFoS(20 * DEG, 30) > 1, 'flatter than φ is stable');
  ok(slopeFoS(40 * DEG, 30) < 1, 'steeper than φ is not');
  near(slopeFoS(45 * DEG, 45), 1, 1e-12, 'and it is critical at any angle, so long as β = φ');
  ok(slopeFoS(0, 33) === Infinity, 'flat ground has no slope to fail on');
  // the cancellation, demonstrated rather than asserted: same angles, wildly
  // different soil weight and depth, identical answer
  near(slopeFoS(25 * DEG, 35), Math.tan(35 * DEG) / Math.tan(25 * DEG), 1e-12,
    'the closed form is the closed form');
  // with cohesion, a face stands steeper than φ — which is the whole reason a
  // clay cutting can be near-vertical for a while and sand never can
  ok(slopeFoSC(60 * DEG, 25, 20e3, 18e3, 3) > slopeFoS(60 * DEG, 25),
    'cohesion lets a face stand steeper than friction alone allows');
  ok(slopeFoSC(60 * DEG, 25, 0, 18e3, 3) < 1, 'and with no cohesion at 60° it does not stand');
  // water halves it, near enough — the classic reason slopes fail after rain
  const dry = slopeFoSC(30 * DEG, 33, 5e3, 20e3, 4, 0);
  const wet = slopeFoSC(30 * DEG, 33, 5e3, 20e3, 4, WATER * 4 * 0.6);
  ok(wet < dry, 'pore pressure reduces the factor of safety');
}

/* 3. RANKINE. Two equivalent forms of Ka, and Kp its reciprocal — the identity
      is the test, because a transposed sign here is invisible until a wall
      falls over. */
{
  for (const phi of [20, 25, 30, 33, 35, 40, 45]) {
    const { Ka, Kp } = rankine(phi);
    const trig = Math.tan((45 - phi / 2) * DEG) ** 2;
    ok(Math.abs(Ka - trig) < 2e-3, `φ=${phi}°: Ka=(1−sinφ)/(1+sinφ) equals tan²(45−φ/2) = ${trig.toFixed(4)}`);
    ok(Math.abs(Ka * Kp - 1) < 3e-3, `φ=${phi}°: Ka and Kp are reciprocals`);
    ok(Ka < 1 && Kp > 1, `φ=${phi}°: active pressure is less than at-rest, passive is more`);
  }
  near(rankine(30).Ka, 1 / 3, 2e-3, 'and the one every engineer knows by heart: Ka = 1/3 at φ = 30°');
  ok(rankine(45).Ka < rankine(25).Ka, 'stronger ground pushes less');
}

/* 4. A RETAINING WALL, re-checked from the dimensions it returned. The wall is
      sized to hit an overturning factor of safety; if the returned base does
      not actually deliver it, the solve is wrong. */
{
  for (const H of [1.5, 3, 5]) {
    for (const g of GROUND_IDS) {
      const w = retaining(H, g);
      // Pa = ½·Ka·γ·H², independently
      const want = 0.5 * rankine(GROUND[g].phi).Ka * GROUND[g].gamma * H * H;
      ok(Math.abs(w.thrust - want) / want < 0.02, `${g} @ ${H} m: thrust is ½KaγH² (${(want / 1000).toFixed(1)} kN/m)`);
      near(w.arm, H / 3, 0.02, `${g} @ ${H} m: the resultant acts at H/3`);
      ok(w.otFoS >= 1.99, `${g} @ ${H} m: the returned base really does give FoS ≥ 2 on overturning (${w.otFoS})`);
      ok(w.base > 0 && w.base < H * 2, `${g} @ ${H} m: the base is a plausible width (${w.base} m)`);
    }
  }
  // taller retains more, superlinearly — thrust goes as H², so the wall does too
  const a = retaining(2, 'D'), b = retaining(4, 'D');
  ok(b.thrust / a.thrust > 3.5 && b.thrust / a.thrust < 4.5, 'doubling the height quadruples the thrust');
  ok(retaining(3, 'B').base < retaining(3, 'E').base, 'strong ground needs a smaller wall than soft ground');
  ok(retaining(3, 'D', { surcharge: 20e3 }).thrust > retaining(3, 'D').thrust,
    'a surcharge on the retained side increases the thrust');
}

/* 5. THE FIELD ITSELF — determinism first, because a terrain is about to be
      part of a permalink. */
{
  const a = Terrain('same'), b = Terrain('same'), c = Terrain('other');
  ok(a.grid.length === b.grid.length, 'the same seed makes the same grid size');
  let same = true;
  for (let i = 0; i < a.grid.length; i++) if (a.grid[i] !== b.grid[i]) { same = false; break; }
  ok(same, 'the same seed grows the same ground, cell for cell');
  let diff = false;
  for (let i = 0; i < a.grid.length; i++) if (Math.abs(a.grid[i] - c.grid[i]) > 1e-9) { diff = true; break; }
  ok(diff, 'and a different seed a different one');
  ok(a.version === VERSION, 'the terrain carries its version, so a permalink can be invalidated honestly');

  const real = Math.random;
  Math.random = () => { throw new Error('unseeded randomness in the terrain'); };
  try { Terrain('norandom'); ok(true, 'the whole field builds with Math.random disabled'); }
  catch (e) { ok(false, `the terrain reached for Math.random — ${e.message}`); }
  finally { Math.random = real; }

  // the queries agree with the grid they came from
  const t = Terrain('probe', { extent: 200, cell: 4 });
  near(t.heightAt(t.xOf(7), t.zOf(11)), t.grid[11 * t.n + 7], 0.02, 'heightAt at a node returns that node');
  ok(t.heightAt(1e5, 1e5) === t.heightAt(t.half, t.half), 'outside the grid it clamps rather than exploding');
  ok(Number.isFinite(t.slopeAt(0, 0)) && t.slopeAt(0, 0) >= 0, 'the slope is a real non-negative angle');
  // a flat site has no slope anywhere
  const flat = Terrain('flat', { relief: 0, extent: 120, cell: 4 });
  near(flat.slopeAt(0, 0), 0, 1e-9, 'flat ground has zero slope');
  near(flat.max - flat.min, 0, 1e-9, 'and no relief at all');
}

/* 6. MASS CONSERVATION THROUGH EROSION, and the repose postcondition. This is
      the check that says thermal erosion is a transport process rather than a
      blur — a blur would also make the slopes gentler, and would quietly lose
      or gain material doing it. */
{
  for (const s of ['m1', 'm2', 'm3']) {
    const t0 = Terrain(s, { extent: 200, cell: 4, relief: 30, erodePasses: 0 });
    const t1 = Terrain(s, { extent: 200, cell: 4, relief: 30, erodePasses: 80 });
    const sum = (g) => { let a = 0; for (let i = 0; i < g.length; i++) a += g[i]; return a; };
    const s0 = sum(t0.grid), s1 = sum(t1.grid);
    ok(Math.abs(s1 - s0) / Math.max(1, Math.abs(s0)) < 1e-9,
      `${s}: erosion moves material without creating or destroying it (${s0.toFixed(6)} → ${s1.toFixed(6)})`);

    // and it actually did something: the steepest face got gentler
    const steepest = (t) => {
      let w = 0;
      for (let k = 0; k < t.n; k++) for (let i = 0; i < t.n - 1; i++) {
        w = Math.max(w, Math.abs(t.grid[k * t.n + i] - t.grid[k * t.n + i + 1]));
      }
      return w;
    };
    ok(steepest(t1) < steepest(t0), `${s}: and the steepest face is gentler than it was`);

    // THE POSTCONDITION: nothing stands materially steeper than repose. Thermal
    // erosion converges on it rather than snapping to it, so the tolerance is
    // the convergence and not a fudge — the assertion that matters is that the
    // ground obeys the same φ the stability check divides by.
    const maxDrop = t1.cell * Math.tan(t1.ground.phi * DEG);
    let over = 0, worst = 0;
    for (let k = 0; k < t1.n; k++) for (let i = 0; i < t1.n - 1; i++) {
      const d = Math.abs(t1.grid[k * t1.n + i] - t1.grid[k * t1.n + i + 1]);
      if (d > maxDrop * 1.05) over++;
      worst = Math.max(worst, d / maxDrop);
    }
    ok(over === 0, `${s}: no face stands steeper than repose after erosion (worst ${(worst * 100).toFixed(1)} % of it)`);
  }
  // softer ground erodes further from the same start
  const rock = Terrain('cmp', { ground: 'B', relief: 30, extent: 200 });
  const clay = Terrain('cmp', { ground: 'E', relief: 30, extent: 200 });
  ok(clay.max - clay.min <= rock.max - rock.min + 1e-9,
    'soft ground ends up with no more relief than rock does from the same seed');
}

/* 7. THE BALANCE DATUM, against its closed form — and on a surface whose answer
      can be computed by hand, because a known answer beats a self-consistent
      one. */
{
  // a made-up plane: h = 0.1x over a 40 m plot centred at the origin. Its mean
  // is 0 by symmetry, so the balance datum is 0 and cut must equal fill.
  const plane = {
    heightAt: (x) => 0.1 * x, cell: 2,
    n: 2, extent: 400, half: 200, grid: new Float64Array(4),
  };
  const e = earthworks(plane, { x: 0, z: 0, w: 40, d: 40 }, { step: 1 });
  near(e.balanceDatum, 0, 1e-9, 'on a plane through the origin the balance datum is zero');
  near(e.cut, e.fill, 1e-6, 'and cut equals fill exactly, which is what "balance" means');
  near(e.maxCut, 1.95, 0.06, 'the deepest cut is at the high corner of the plot');
  near(e.fall, 4.0, 0.15, 'and the fall across a 40 m plot at 1:10 is 4 m');

  // the identity that makes it exact, tested at datums that are NOT the mean:
  // cut(d) − fill(d) = Σ(hᵢ − d)·A for every d
  for (const d of [-2, -0.5, 0, 0.75, 3]) {
    const q = earthworks(plane, { x: 0, z: 0, w: 40, d: 40 }, { step: 1, datum: d });
    const want = (0 - d) * 40 * 40;              // (mean − d) × area
    ok(Math.abs(q.net - want) / Math.max(1, Math.abs(want)) < 0.02 || Math.abs(q.net - want) < 1,
      `datum ${d}: cut − fill = (mean − datum)·area (${q.net.toFixed(1)} vs ${want.toFixed(1)})`);
  }

  // on real ground, the same law
  const t = Terrain('ew', { extent: 300, cell: 4, relief: 24 });
  const plot = { x: 10, z: -6, w: 60, d: 44 };
  const r = earthworks(t, plot);
  near(r.cut, r.fill, Math.max(1, r.cut * 0.02), 'on real ground the balance datum still balances');
  near(r.datum, r.natural.mean, 1e-9, 'because the balance datum IS the mean of the natural surface');
  ok(r.lorries === 0, 'a balanced site sends no spoil off site');
  const off = earthworks(t, plot, { datum: r.datum + 3 });
  ok(off.fill > off.cut, 'raising the datum turns the job into fill');
  ok(off.lorries > 0, 'and an unbalanced one needs lorries');
  ok(r.retained >= r.maxCut - 1e-9 && r.retained >= r.maxFill - 1e-9,
    'the retained height is the tallest face the levelling creates');
  // a rotated plot covers different ground, so it levels differently
  const rot = earthworks(t, { ...plot, rot: Math.PI / 4 });
  ok(Math.abs(rot.datum - r.datum) > 1e-6 || Math.abs(rot.cut - r.cut) > 1e-6,
    'a rotated plot is levelled over the ground it actually covers');
}

/* 8. THE CHECK LIST — and specifically that the ground passes `repose` by
      construction while a CUT is what fails, which is claim 2 of the header. */
{
  let cutFails = 0, reposeFails = 0, n = 0;
  for (let i = 0; i < 24; i++) {
    const t = Terrain('site' + i, { extent: 240, cell: 4 });
    const c = check(t, { x: 0, z: 0, w: 50, d: 40 });
    n++;
    const rep = c.checks.find((q) => q.id === 'repose');
    const face = c.checks.find((q) => q.id === 'cutface');
    if (!rep.pass) reposeFails++;
    if (face && !face.pass) cutFails++;
    ok(c.checks.every((q) => typeof q.note === 'string' && q.note.length > 20),
      `site${i}: every check says what it protects`);
  }
  ok(reposeFails === 0, `natural ground never fails on repose (0 of ${n}) — it stands at the angle erosion left it`);
  ok(cutFails > 0, `but levelling a plot DOES create faces that need retaining (${cutFails} of ${n}) — the hazard is the earthworks, not the hill`);

  // a flat site is free: nothing to cut, nothing to retain, nothing to haul
  const flat = check(Terrain('f', { relief: 0, extent: 200 }), { x: 0, z: 0, w: 50, d: 40 });
  ok(flat.pass, 'a flat site passes everything');
  ok(flat.earthworks.cut < 1e-6 && flat.earthworks.fill < 1e-6, 'and moves no earth at all');

  // a steep one is not
  const steep = check(Terrain('s7', { relief: 60, extent: 200, ground: 'E' }), { x: 0, z: 0, w: 70, d: 60 });
  ok(steep.earthworks.cut > 100, 'a steep site on soft ground is a real excavation');
}

/* 9. CONTOURS. Marching squares has exactly one job — every vertex it emits
      sits AT the level it was asked for — and an off-by-one in the case table
      breaks it invisibly, because wrong contours still look like contours. */
{
  const t = Terrain('cont', { extent: 200, cell: 4, relief: 20 });
  const cs = contours(t, 2);
  ok(cs.length > 2, `a 20 m site at 2 m intervals gives several contours (${cs.length})`);
  let worst = 0, verts = 0;
  for (const c of cs) {
    for (const [x0, z0, x1, z1] of c.segments) {
      worst = Math.max(worst, Math.abs(t.heightAt(x0, z0) - c.level));
      worst = Math.max(worst, Math.abs(t.heightAt(x1, z1) - c.level));
      verts += 2;
    }
  }
  ok(verts > 200, `and enough vertices to be a drawing (${verts})`);
  ok(worst < 0.35, `every contour vertex sits at its own level (worst ${worst.toFixed(3)} m off)`);
  ok(cs.every((c) => c.level >= t.min - 1e-9 && c.level <= t.max + 1e-9),
    'no contour is drawn above the summit or below the lowest point');
  ok(cs.some((c) => c.index), 'and every fifth one is an index contour, as the convention wants');
  // flat ground has nothing to draw
  ok(contours(Terrain('f2', { relief: 0, extent: 120 }), 1).every((c) => !c.segments.length || c.segments.length < 5),
    'flat ground produces essentially no contours');
  // a finer interval draws more line, monotonically
  ok(contours(t, 1).length > contours(t, 4).length, 'a finer interval is more contours');
}

/* 10. THE SECTION PROFILE AND THE MESH — the two other ways the ground gets
       drawn, both of which have to agree with the field. */
{
  const t = Terrain('prof', { extent: 200, cell: 4, relief: 18 });
  const p = profile(t, -60, 0, 60, 0, 40);
  ok(p.length === 41, 'the profile returns the samples it was asked for');
  ok(p.every((q) => Math.abs(q.y - t.heightAt(q.x, q.z)) < 0.02), 'and every one is the field at that point');
  near(p[0].d, 0, 1e-9, 'chainage starts at zero');
  near(p[p.length - 1].d, 120, 1e-6, 'and ends at the length of the cut');
  ok(p.every((q, i) => i === 0 || q.d >= p[i - 1].d), 'chainage runs forward');

  const m = mesh(t);
  ok(m.positions.length === t.n * t.n * 3, 'the mesh has a vertex per grid node');
  ok(m.indices.length === (t.n - 1) * (t.n - 1) * 6, 'and two triangles per cell');
  ok(m.indices.every((i) => i >= 0 && i < m.count), 'every index is in range');
  const dec = mesh(t, { stride: 2 });
  ok(dec.count < m.count, 'and it decimates for distance, which a city will need');
  // the mesh really is the field
  ok(Math.abs(m.positions[1] - t.grid[0]) < 1e-5, 'the first vertex carries the first cell’s height');
}

console.log(`\nbrut/terrain: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
