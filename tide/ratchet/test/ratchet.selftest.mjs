// Self-test for the ratchet topology. Run: node tide/ratchet/test/ratchet.selftest.mjs
// The headline physics: a rotating lake's free surface is an equipotential ARC (constant
// radius), never a secant/chord; a smooth cylinder holds no lakes at all (uniform film);
// the asymmetric teeth route runoff — home off the scarp side, forward off the glide.
import {
  defaultParams, toothAngle, crestTheta, elevation, fillLake, drainsTo, ratchetFlow,
} from '../sim/ratchet.mjs';
import { defaultParams as fountainDefaults } from '../../fountain/sim/fountain.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`✓  ${name}${extra ? '  — ' + extra : ''}`); }
  else { fail++; console.log(`✗  ${name}${extra ? '  — ' + extra : ''}`); }
};

// ── 1. The terrain is a sane ratchet ─────────────────────────────────────────
{
  const p = defaultParams();
  const T = toothAngle(p);
  ok('basin floors sit at zero elevation', elevation(p, 0) === 0 && elevation(p, T) === 0);
  const atCrest = elevation(p, crestTheta(p));
  ok('the crest reaches the design height', Math.abs(atCrest - p.crest) < 1e-6,
     `${atCrest.toFixed(1)} m vs ${p.crest} m`);
  const scarpGrade = p.crest / (p.scarpFrac * T * p.R);
  const glideGrade = p.crest / ((1 - p.basinFrac - p.scarpFrac) * T * p.R);
  ok('the scarp is much steeper than the glide (the ratchet asymmetry)',
     scarpGrade > 4 * glideGrade,
     `scarp ${(scarpGrade * 100).toFixed(1)}% vs glide ${(glideGrade * 100).toFixed(1)}%`);
  ok('terrain is periodic across teeth', Math.abs(elevation(p, 0.3) - elevation(p, 0.3 + T)) < 1e-9);
}

// ── 2. The free surface is an equipotential arc, and it conserves the water ──
{
  const p = defaultParams();
  const f = fillLake(p);
  // the surface is constant-r BY CONSTRUCTION; the honest check is volume closure
  ok('fill solves the surface to machine-precision volume closure',
     Math.abs(f.areaSolved - f.areaTarget) / f.areaTarget < 1e-9,
     `rel err ${((f.areaSolved - f.areaTarget) / f.areaTarget).toExponential(1)}`);
  ok('the lake is a lake, not an overflowed film', !f.overflow,
     `depth ${f.depthMax.toFixed(0)} m < crest ${p.crest} m`);
  ok('rotating-frame hydrostatics: bed pressure ≈ ρ·g_floor·depth for a shallow lake',
     Math.abs(f.bedPressure_Pa - 1000 * f.gFloor * f.depthMax) / f.bedPressure_Pa < 0.01,
     `${(f.bedPressure_Pa / 1000).toFixed(0)} kPa at ${f.depthMax.toFixed(0)} m`);
}

// ── 3. The secant fallacy — a chord is NOT a level lake surface ──────────────
{
  const p = defaultParams();
  const f = fillLake(p);
  const expected = f.rw * (1 - Math.cos(f.span / 2));
  ok('a chord across the lake sags toward the axis by rw(1−cos φ)',
     Math.abs(f.secantSag_m - expected) < 1e-9 && f.secantSag_m > 100,
     `${f.secantSag_m.toFixed(0)} m of spurious head across ${(f.surfaceArc_m / 1000).toFixed(1)} km`);
  const small = fillLake(p, 2e3);                       // a pond
  ok('the sag shrinks for small lakes (locally the chord is almost level)',
     small.secantSag_m < f.secantSag_m / 10,
     `pond ${small.secantSag_m.toFixed(2)} m vs lake ${f.secantSag_m.toFixed(0)} m`);
}

// ── 4. No lakes on a smooth cylinder — water relaxes into a film ─────────────
{
  const p = { ...defaultParams(), crest: 0.5 };         // essentially smooth
  const f = fillLake(p);
  const T = toothAngle(p);
  const filmThickness = p.lakeArea_m2pm / (p.R * T);
  ok('with no terrain the water overflows into a connected annular film', f.overflow);
  ok('film thickness matches area / (R·tooth-arc)',
     Math.abs(f.depthMax - filmThickness) / filmThickness < 0.05,
     `${f.depthMax.toFixed(1)} m vs ${filmThickness.toFixed(1)} m`);
}

// ── 5. Shoreline asymmetry — the lake leans up the glide, the scarp cuts it ──
{
  const p = defaultParams();
  const f = fillLake(p);
  ok('the retrograde shore (gentle glide tail) lies far beyond the prograde shore (scarp)',
     -f.shoreRetro > 2 * f.shorePro,
     `retro ${(f.shoreRetro * p.R / 1000).toFixed(1)} km vs pro ${(f.shorePro * p.R / 1000).toFixed(1)} km`);
  const deep = fillLake({ ...p, crest: 400 });
  const shallow = fillLake({ ...p, crest: 150 });
  ok('higher teeth pen the same water into a deeper lake', deep.depthMax > shallow.depthMax,
     `${shallow.depthMax.toFixed(0)} → ${deep.depthMax.toFixed(0)} m`);
}

// ── 6. Drainage routing — home off the scarp side, forward off the glide ─────
{
  const p = defaultParams();
  ok('the basin drains to itself', drainsTo(p, 0) === 0);
  ok('the scarp face drains back home', drainsTo(p, crestTheta(p) * 0.9) === 0);
  ok('past the crest, the glide drains to the NEXT lake prograde',
     drainsTo(p, crestTheta(p) * 1.5) === 1);
  ok('the retrograde approach (previous glide tail) drains into THIS lake',
     drainsTo(p, -0.3 * toothAngle(p)) === 0);
}

// ── 7. The ratchet river — the jet decides whether the water circulates ──────
{
  const p = defaultParams();
  const fan = ratchetFlow(p, { ...fountainDefaults(), nozzle: 'fan', v0: 160, angleDeg: 10 });
  ok('the irrigation fan lands short of the crest — runoff returns home (closed local loop)',
     fan.hopFraction === 0 && !fan.circulates,
     `lands ${fan.meanLandingArc_m.toFixed(0)} m, crest at ${fan.crestArc_m.toFixed(0)} m`);
  const jet = ratchetFlow(p, { ...fountainDefaults(), nozzle: 'jet', v0: 200, angleDeg: 0 });
  ok('a strong jet clears the crest — the water ratchets into the next lake',
     jet.hopFraction === 1 && jet.circulates,
     `lands ${jet.meanLandingArc_m.toFixed(0)} m past a ${jet.crestArc_m.toFixed(0)} m crest`);
}

// ── 8. Determinism ───────────────────────────────────────────────────────────
{
  const a = fillLake(defaultParams()), b = fillLake(defaultParams());
  ok('the fill is deterministic', a.rw === b.rw && a.secantSag_m === b.secantSag_m);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
