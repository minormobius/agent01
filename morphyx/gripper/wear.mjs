#!/usr/bin/env node
// wear.mjs — the DUTY model, and an honest account of what it can and cannot
// tell you. Run: node wear.mjs
//
// The split this file exists to make: DUTY is geometry, LIFE is tribology.
// How far each interface slides per cycle, how fast, under what pressure, and
// how many reversals it sees are all consequences of the design and the duty
// cycle — exact, and the platform could compute every one of them from the
// document. How long that takes to wear something out depends on a coefficient
// that spans three orders of magnitude until somebody measures it.
//
// So every row below carries a TIER:
//   1  vendor-rated, from a standardised test (ISO 281 L10 = 90% survival).
//      Still a comparison number, not a prediction; derate 2–5× for real life.
//   2  physics with a coefficient. The equation is sound, the coefficient is
//      not known to better than ~3 decades. Report bands, never point values.
//   3  not calculable. Stick-slip, bedding-in, debris migration, spring
//      relaxation. These are what actually kill mechanisms. Only a test knows.
import { D, screwTorque } from './gripper.mjs';

const r2 = (v, n = 2) => Number(v.toFixed(n));
const CYCLE_REV = 2;                                    // brake slips one turn gripping, one turn open
const STROKES = 2;                                      // close and open, per cycle
const rows = [];
const add = (tier, item, quantity, value, note) => rows.push({ tier, item, quantity, value, note });

// ── TIER 0: pure kinematics. Exact, and derivable from the document itself ──
const brakeArc = CYCLE_REV * 2 * Math.PI * D.brakeR;                        // mm of rub per cycle
const brakeArea = Math.PI * ((D.brakeRingOD / 2) ** 2 - (D.brakeHubBore / 2) ** 2);
const brakeP = D.brakePreload / brakeArea;                                  // MPa
const brakeV = ((D.rpm * 2 * Math.PI) / 60) * (D.brakeR / 1000);            // m/s
const screwTurns = STROKES * (D.ynClosed - D.ynOpen) / D.lead;
const threadArc = screwTurns * Math.PI * (D.screw - D.lead / 2);            // mm of flank rub per cycle
const railTravel = STROKES * D.travel;                                      // mm per block per cycle
const linkSwing = 45.4 - 19.7;                                              // deg, closed to open (forces())
const bushArc = STROKES * (linkSwing * Math.PI / 180) * (D.pin / 2);
add(0, 'brake face', 'rub per cycle', `${r2(brakeArc)} mm`, `${CYCLE_REV} rev at r ${r2(D.brakeR)}`);
add(0, 'brake face', 'contact pressure', `${r2(brakeP, 4)} MPa`, `${r2(D.brakePreload)} N over ${r2(brakeArea)} mm²`);
add(0, 'brake face', 'PV', `${r2(brakeP * brakeV, 6)} MPa·m/s`, `vs ~1–2 for any friction material: 3–4 decades under`);
add(0, 'brake face', 'energy per cycle', `${r2(D.brakeTorque * CYCLE_REV * 2 * Math.PI, 3)} J`, 'only while slipping');
add(0, 'screw thread', 'flank rub per cycle', `${r2(threadArc)} mm`, `${r2(screwTurns)} turns at dm ${D.screw - D.lead / 2}`);
add(0, 'MGN9 block', 'travel per cycle', `${railTravel} mm`, 'two strokes of the full jaw travel');
add(0, 'link bushing', 'arc per cycle', `${r2(bushArc)} mm`, `${r2(linkSwing, 1)}° oscillation on a Ø${D.pin} pin — no film`);
add(0, 'roller ring', 'revolutions per cycle', `${CYCLE_REV}`, 'both roll phases');

// ── TIER 1: vendor-rated ────────────────────────────────────────────────────
const C = 1863, MY = 7.36, yaw = 3.2;                    // N and N·m, MGN9C catalogue
const Peq = C * (yaw / MY), railKm = (C / Peq) ** 3 * 50;
add(1, 'MGN9 block', 'L10', `${r2(railKm)} km ≈ ${(railKm * 1e6 / railTravel).toExponential(1)} cycles`,
  `P_eq ${r2(Peq)} N from ${yaw}/${MY} N·m of yaw; 90% survival, clean and aligned`);
add(1, 'roller ring', 'L10', '> 1e8 cycles', `2 rev/cycle at a fraction of its rating — not the limit`);

// ── TIER 2: physics with a coefficient. BANDS ONLY ──────────────────────────
// Archard: V = k·F·s/H. k spans 1e-6 (bedded friction material) to 1e-3 (dry
// steel, severe). H 1.5 GPa mild steel. Depth = V / area.
const archardCycles = (k, F, s_mm, area_mm2, allow_mm, H = 1.5e9) =>
  allow_mm / ((k * F * (s_mm / 1000) / H) * 1e9 / area_mm2);
const ALLOW = 0.1;                                       // mm of face wear, see the sensitivity below
for (const k of [1e-6, 1e-4, 1e-3]) {
  add(2, 'brake face', `cycles to ${ALLOW} mm wear, k=${k.toExponential(0)}`,
    archardCycles(k, D.brakePreload, brakeArc, brakeArea, ALLOW).toExponential(1),
    k === 1e-6 ? 'bedded friction facing' : k === 1e-4 ? 'dry steel, moderate' : 'dry steel, severe');
}
add(2, 'screw thread', 'life', '1e4 – 1e6 cycles',
  `${r2(threadArc)} mm of rub a cycle under ${D.thrust} N — same Archard spread, and the nut material decides it`);

// ── THE SENSITIVITY, which is the number that actually matters ──────────────
// Grip force is set by brake torque, which is set by spring preload, which
// falls as the face wears. A stiff spring in a thin gap turns a little wear
// into a lot of grip drift.
console.log('\n── what wear does to the GRIP, which is the real failure mode ──');
console.log('the brake sets the grip, so face wear is grip drift, not just wear:\n');
const travelOf = (gap) => Math.max(0.2, 0.55 * gap);     // a wave washer's working deflection ≈ half its gap
for (const gap of [...new Set([1, 2, D.brakeSpringT, 4])].sort((a, b) => a - b)) {
  const defl = travelOf(gap), rate = D.brakePreload / defl;
  const lossN = rate * ALLOW, pct = (100 * lossN) / D.brakePreload;
  console.log(`  spring gap ${gap} mm → ~${r2(defl)} mm of working deflection, rate ${r2(rate)} N/mm` +
    `  →  ${ALLOW} mm of wear costs ${r2(lossN)} N = ${r2(pct, 1)}% of grip` + (gap === D.brakeSpringT ? '   ← as drawn' : ''));
}

console.log('\n── duty and life ──');
console.table(rows);
console.log(`cycle: ${r2((2 * (360 * (D.ynClosed - D.ynOpen) / D.lead + 360)) / 360 * 60 / D.rpm, 1)} s at ${D.rpm} rpm; at a realistic 300 rpm it is ${r2((2 * (360 * (D.ynClosed - D.ynOpen) / D.lead + 360)) / 360 * 60 / 300, 2)} s`);
console.log('TIER 3, not in the table because there is no equation for it: stick-slip at the');
console.log('  brake, bedding-in drift in µ over the first few hundred cycles, wave-washer');
console.log('  relaxation, and whether brake debris reaches the encoder gap or the rail.');
console.log('  These are what kill mechanisms. Only a test knows, and this machine can run it —');
console.log('  breakaway drift shows up directly as motor steps between home and θᵣ moving.');
