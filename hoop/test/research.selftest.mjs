// research.selftest.mjs — pins the dossier's active-figure kernels (hoop/js/research.js)
// against the numbers the three modelling wings publish. Run: node hoop/test/research.selftest.mjs
import {
  shellStress, shellSection, materialById, columnProfile, lakeSecantSag, fountainParcel,
  ratchetParams, fillLake, drainsTo, crestTheta, elevation, foodWebRun, foodWebDefaults,
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

// ── FIGURE 1b: the SECANT CABLE WEB — the alternate load path ──
{
  const carbon = materialById('cfrp');
  const bare = shellSection({ R: 8000, g: 0.8, mat: carbon, phi: 0 });
  const webbed = shellSection({ R: 8000, g: 0.8, mat: carbon, phi: 0.7 });
  ok(webbed.sigmaShell < bare.sigmaShell, 'a secant web carrying φ of the load drops hull stress');
  near(webbed.sigmaSelf, bare.sigmaSelf, 1, 'ρv² is unchanged by the web — the floor cables cannot remove');
  ok(!bare.holds && webbed.holds, 'a bare 8 km carbon hull tears; the secant web saves it');
  // the {N/k} clear core = R·cos(πk/N): tighter chords (low reach) leave a bigger open core
  const tight = shellSection({ R: 8000, g: 0.8, mat: carbon, phi: 0.5, reach: 0.15 });
  const wide = shellSection({ R: 8000, g: 0.8, mat: carbon, phi: 0.5, reach: 1.0 });
  ok(tight.coreClear > wide.coreClear, 'rim-hugging chords leave a clearer core than diametral ones');
  near(tight.coreClear, Math.cos(Math.PI * tight.k / tight.N), 1e-9, 'clear core = cos(πk/N)');
  // steel is material-limited at 8 km: ρv² alone is over the line, so NO web can save it
  const steelWeb = shellSection({ R: 8000, g: 0.8, mat: materialById('steel'), phi: 0.9 });
  ok(steelWeb.materialLimited && !steelWeb.holds, 'steel is ρv²-limited at 8 km — even a 90% web cannot hold it');
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

// ── FIGURE 2b: the lake topology (NOT a secant) + the fountain jet ──
{
  near(lakeSecantSag(8000, 4400), 308, 12, 'a 4.4 km lake on an 8 km radius sags ~300 m as a secant');
  ok(lakeSecantSag(8000, 1000) < lakeSecantSag(8000, 6000), 'the secant fallacy grows with lake span');

  const omega = Math.sqrt(9.81 / 10000); // 1 g at the 10 km skin (~0.031 rad/s)
  const ballistic = fountainParcel({ R: 8000, omega, v0: 120, alphaDeg: 0, coriolis: false });
  ok(ballistic.energyDrift < 1e-3, 'the ballistic jet conserves specific energy (½v²−½ω²r², drift ' + ballistic.energyDrift.toExponential(1) + ')');
  ok(Math.abs(ballistic.driftArc_m) < 50, 'with Coriolis OFF a radial jet returns to its launch (no drift)');
  const coriolis = fountainParcel({ R: 8000, omega, v0: 120, alphaDeg: 0, coriolis: true });
  ok(coriolis.energyDrift < 1e-3, 'the Coriolis jet still conserves energy (it does no work)');
  ok(Math.abs(coriolis.driftArc_m) > 200, 'with Coriolis ON the jet curves into a sheet (drifts ' + Math.round(coriolis.driftArc_m) + ' m)');
  const fast = fountainParcel({ R: 8000, omega, v0: 240, alphaDeg: 0, coriolis: true });
  ok(fast.axisReachFrac > coriolis.axisReachFrac, 'a faster jet (nearer ωR) climbs closer to the axis');
}

// ── FIGURE 2c: the REAL ratchet topography (tide/ratchet, ported) ──
{
  const p = ratchetParams(8000);
  // the sawtooth: basin floor at the lake centre, crest at crestTheta, glide descending after
  ok(elevation(p, 0) === 0, 'the lake centre sits on the basin floor (e=0)');
  near(elevation(p, crestTheta(p)), p.crest, 1, 'elevation peaks at the crest (the scarp top)');
  ok(elevation(p, crestTheta(p) + 0.3) < p.crest, 'past the crest the long glide descends');

  const L = fillLake(p);
  ok(L.rw < p.R && L.depthMax > 0 && !L.overflow, 'the lake fills the basin as an equipotential arc below the crest');
  ok(L.depthMax < p.crest, 'the surface stays below the crest — a lake, not an annular sea');
  near(L.secantSag_m, 303, 25, 'the ~4.4 km default lake sags ~300 m as a secant (tide’s headline)');
  // ASYMMETRY: the lake leans far up the gentle glide, penned short by the steep scarp
  ok(Math.abs(L.shoreRetro) > 3 * Math.abs(L.shorePro), 'shorelines are asymmetric — the lake leans up the glide, penned by the scarp');

  // THE RATCHET RIVER: a slow jet runs home; a fast one clears the crest and feeds the next lake
  const slow = fountainParcel({ R: 8000, omega: p.omega, v0: 90, coriolis: true });
  const quick = fountainParcel({ R: 8000, omega: p.omega, v0: 200, coriolis: true });
  ok(drainsTo(p, slow.driftRad) === 0, 'a slow jet lands before the crest and drains back home');
  ok(drainsTo(p, quick.driftRad) >= 1, 'a fast jet clears the crest and ratchets forward into the next lake');
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
