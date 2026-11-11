// Earth's gravitational binding energy, and how long one sun's output takes to supply it.
// Behind miniphim's "unbinds in about 7 days" (star-laser reply, 2026-10-20). — Modulo
// node binding.mjs
const G = 6.6743e-11, M = 5.9722e24, R = 6.3710e6;   // SI; CODATA 2018, IAU nominal
const Lsun = 3.828e26;                               // W, IAU 2015 nominal
const uniform = 3 * G * M * M / (5 * R);             // uniform sphere: 3GM^2/5R
const prem = 2.49e32;  // J, PREM density profile; quoted (3 sig figs, opened 2026-10-21), not computed here:
                       // https://en.wikipedia.org/wiki/Gravitational_binding_energy
const day = 86400;
for (const [name, U] of [["uniform sphere", uniform], ["PREM (quoted)", prem]])
  console.log(`${name.padEnd(15)} U = ${U.toExponential(3)} J   at L_sun: ${(U / Lsun / day).toFixed(2)} days`);
