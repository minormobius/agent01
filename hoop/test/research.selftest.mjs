// research.selftest.mjs — pins the dossier's active-figure kernels (hoop/js/research.js)
// against the numbers the three modelling wings publish. Run: node hoop/test/research.selftest.mjs
import {
  shellStress, materialById, columnProfile, foodWebRun, foodWebDefaults,
} from '../js/research.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } };
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, `${msg} (got ${a}, want ${b}±${tol})`);

// ── FIGURE 1: structure — rind's "steel tears, carbon holds" at the 8 km / 0.8 g build ──
{
  const steel = shellStress({ R: 8000, g: 0.8, mat: materialById('steel'), arealLoad: 2000 });
  const carbon = shellStress({ R: 8000, g: 0.8, mat: materialById('cfrp'), arealLoad: 2000 });
  near(steel.v, 250.6, 2, 'rim speed at 8 km / 0.8 g ≈ 250 m/s');
  ok(!steel.holds, 'structural steel TEARS under its own spin at the 8 km build');
  ok(carbon.holds, 'carbon fibre HOLDS at the same build');
  ok(steel.selfUtil > carbon.selfUtil, 'steel is more stressed than carbon (specific-strength ordering)');
  ok(steel.reqThk > 0 && carbon.reqThk > 0 && carbon.reqThk < steel.reqThk, 'required shell thickness is finite and lower for carbon');
  // the self-support limit is size-independent for a fixed floor gravity? No — v²=a·R grows with R.
  const small = shellStress({ R: 1000, g: 0.8, mat: materialById('steel'), arealLoad: 2000 });
  ok(small.holds, 'a small 1 km steel ring at 0.8 g holds (v² scales with R)');
}

// ── FIGURE 2: thermodynamics — tide's ~31 K adiabat and ~32% pressure drop at 8 km ──
{
  const p = columnProfile({ R: 8000, Tfloor: 288 });
  near(p.dT, 31.2, 2.5, 'centrifugal adiabat span axis→floor ≈ 31 K');
  near(p.Pdrop, 0.32, 0.04, 'pressure drop axis vs floor ≈ 32%');
  near(p.gFloor, 0.80, 0.03, 'floor gravity ≈ 0.80 g (1 g at the 10 km outer skin)');
  ok(p.Taxis < p.Tfloor, 'the axis is COLDER than the floor (a colder, thinner axis)');
  // Island-Three scale (3.2 km) is much gentler — tide cites ~16 K / ~17%.
  const small = columnProfile({ R: 3200, Tfloor: 288 });
  ok(small.dT < p.dT && small.Pdrop < p.Pdrop, 'a smaller cylinder spans less (Island-Three is gentler)');
  ok(small.dT > 6 && small.dT < 18, 'Island-Three-scale span is a handful of K, not tens (got ' + small.dT.toFixed(1) + ')');
}

// ── FIGURE 3: biological webbing — biome's closure, the pollinator gate, the Biosphere-2 crash ──
{
  const base = foodWebRun(foodWebDefaults());
  ok(base.status === 'ok', 'the default food web CLOSES: ' + base.verdict);
  ok(base.co2End > 250 && base.co2End < 1600, 'CO₂ holds in band at steady state');
  ok(base.foodEnd > 8, 'the larder steadies at a positive buffer');
  ok(base.conserved < 1e-9, 'carbon conserves to ~machine precision (drift ' + base.conserved.toExponential(1) + ')');

  // throttle the decomposer → CO₂ crash (the Biosphere-2 failure mode)
  const throttled = foodWebRun({ ...foodWebDefaults(), decomp: 0.001 });
  ok(throttled.co2End < base.co2End, 'throttling the soil drops steady CO₂ below the closed case');
  ok(throttled.status === 'fail', 'a starved soil fails to close (CO₂ collapse): ' + throttled.verdict);

  // crash the pollinators → fruit set falls → less food (the mutualism)
  const noBees = foodWebRun({ ...foodWebDefaults(), predator: 0.6 });
  ok(noBees.fruitEnd < base.fruitEnd, 'predator pressure suppresses pollinators → fruit set falls (trophic cascade)');
  ok(noBees.foodEnd < base.foodEnd, 'and the larder is smaller when the bees are crashed');

  // area is the lever — more ecosystem feeds more crew
  const small = foodWebRun({ ...foodWebDefaults(), area: 0.5 });
  const big = foodWebRun({ ...foodWebDefaults(), area: 2.5 });
  ok(big.foodEnd > small.foodEnd, 'area is the lever for calories (bigger ecosystem → bigger larder)');
}

console.log(`research.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
