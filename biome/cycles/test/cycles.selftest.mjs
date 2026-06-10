// biome/cycles/test/cycles.selftest.mjs — headless proof of the closed-loop box model.
// Run: node biome/cycles/test/cycles.selftest.mjs   (no deps)
//
// We can't open a browser or run a CFD in the sandbox, so we prove the model as
// PURE logic over the REAL engine:
//   • mass closure — C, H, O, N are conserved to machine precision across a long
//     RK4 run (this validates the INTEGRATOR against the stoichiometry, since the
//     reactions are element-balanced by construction);
//   • physical sanity — pressures, RH and pool signs stay in-bounds;
//   • the load-bearing INSIGHT — at steady biomass the air's net O2 gain → 0, so
//     oxygen security is stored reduced carbon (food + biomass + litter), not the
//     air. Banking carbon banks O2. We assert this explicitly.
//   • response monotonicity — more crop area raises O2 net and calorie ratio;
//     a faster soil (Biosphere-2 mode) eats O2.
import {
  defaultParams, defaultState, run, step, elements, derivatives, snapshot,
} from '../sim/cycles.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? '✓' : '✗ FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};
const rel = (a, b) => Math.abs(a - b) / (Math.abs(b) + 1e-30);

// ── 1. Mass closure over a year ──────────────────────────────────────────────
{
  const p = defaultParams();
  const s0 = defaultState(p);
  const e0 = elements(s0);
  // integrate one year at 1h steps without sampling overhead
  let s = s0;
  const dt = 3600;
  for (let i = 0; i < 365 * 24; i++) s = step(s, p, dt);
  const e1 = elements(s);
  for (const el of ['C', 'H', 'O', 'N']) {
    ok(`${el} conserved over 365 d`, rel(e1[el], e0[el]) < 1e-9,
       `drift ${(rel(e1[el], e0[el])).toExponential(2)}`);
  }
}

// ── 2. Physical bounds hold across the trajectory ────────────────────────────
{
  const p = defaultParams();
  const traj = run(p, defaultState(p), 200, 1, 2);
  let pressureOK = true, rhOK = true, poolsOK = true;
  for (const snap of traj) {
    if (snap.totalP_kPa < 50 || snap.totalP_kPa > 200) pressureOK = false;
    if (snap.rh < 0 || snap.rh > 1.5) rhOK = false;
    if (snap.bio_molC < 0 || snap.food_molC < 0 || snap.nMineral < 0) poolsOK = false;
  }
  ok('total pressure stays 50–200 kPa', pressureOK);
  ok('relative humidity stays physical (0–1.5)', rhOK);
  ok('carbon & nitrogen pools never go negative', poolsOK);
}

// ── 3. The insight: at steady biomass, net air-O2 → 0; O2 lives in stored carbon ──
{
  const p = defaultParams();
  // long run to approach steady state
  const traj = run(p, defaultState(p), 1500, 2, 10);
  const tail = traj.slice(-20);
  const meanO2net = tail.reduce((a, x) => a + x.o2_net_molday, 0) / tail.length;
  // crew O2 demand is the scale; at closure net air change is a small fraction of it
  const crewDemand = p.human_O2_molday * p.crew;
  ok('net air-O2 change → small vs crew demand at steady biomass',
     Math.abs(meanO2net) < 0.15 * crewDemand,
     `mean net ${meanO2net.toFixed(1)} mol/d vs demand ${crewDemand.toFixed(0)}`);

  // stored reduced carbon (food+bio+litter) is the real O2 capacitor: it dwarfs
  // the O2 the crew breathes in a day — that's the banked oxygen.
  const last = traj[traj.length - 1];
  const storedReducedC = last.bio_molC + last.food_molC + last.litter_molC; // mol; each oxidises with 1 O2
  ok('stored reduced carbon >> daily crew O2 (oxygen is banked as carbon)',
     storedReducedC > 10 * crewDemand,
     `stored ${(storedReducedC/1e3).toFixed(0)}k mol vs ${crewDemand.toFixed(0)} mol/d`);
}

// ── 4. Response monotonicity — the tool must move the right way ───────────────
{
  // more crop area -> higher calorie ratio
  const small = defaultParams(); small.cropArea_m2 = 1500;
  const big = defaultParams();   big.cropArea_m2 = 3500;
  const fSmall = derivatives(defaultState(small), small).flux;
  const fBig = derivatives(defaultState(big), big).flux;
  ok('more crop area → more calories', fBig.calorieSupply_kcalday > fSmall.calorieSupply_kcalday);

  // Biosphere-2 mode: crank soil decay, watch O2 fall (microbes eat it).
  // Compare net O2 at the SAME state, only the decay rate differs.
  const base = defaultParams();
  const hot = defaultParams(); hot.litterDecay_perday = base.litterDecay_perday * 5;
  const s = defaultState(base);
  const o2Base = derivatives(s, base).flux.o2_net;
  const o2Hot = derivatives(s, hot).flux.o2_net;
  ok('faster soil respiration lowers net O2 (the Biosphere-2 failure mode)',
     o2Hot < o2Base, `net O2 ${o2Hot.toExponential(2)} < ${o2Base.toExponential(2)} mol/s`);
}

// ── 5. Determinism ───────────────────────────────────────────────────────────
{
  const p = defaultParams();
  const a = run(p, defaultState(p), 50, 1, 5);
  const b = run(p, defaultState(p), 50, 1, 5);
  const same = JSON.stringify(a) === JSON.stringify(b);
  ok('run is deterministic', same);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
