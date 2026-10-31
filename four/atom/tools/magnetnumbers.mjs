/* The motion chapter's magnetic atoms, as JSON for tools/pages/genpages.py: js/magnet.js on js/table.js. Diamagnetism
   against our measured noble gases (cm³/mol, Gaussian), spins by Hund's first rule against NIST's ground terms, and
   how many 4D atoms carry a spin.
     node four/atom/tools/magnetnumbers.mjs */
import { TABLE } from "../js/table.js";
import * as M from "../js/magnet.js";
const MEAS = { 2: -1.88, 10: -6.74, 18: -19.32, 36: -28.8 }; // measured molar susceptibilities, 10⁻⁶ cm³/mol (CRC)
const NIST = [0.5, 0, 0.5, 0, 0.5, 1, 1.5, 1, 0.5, 0, 0.5, 0, 0.5, 1, 1.5, 1, 0.5, 0, 0.5, 0, 0.5, 1, 1.5, 3, 2.5, 2, 1.5, 1, 0.5, 0, 0.5, 1, 1.5, 1, 0.5, 0]; // ground-term S, Z = 1–36
const u4 = TABLE[4].map((a) => M.unpaired(a, 4)), u3 = TABLE[3].map((a) => M.unpaired(a, 3)), mx = Math.max(...u4);
console.log(JSON.stringify({
  he: M.diamagnetic(TABLE[4][1], 4) / M.diamagnetic(TABLE[3][1], 3),
  dev: Object.entries(MEAS).map(([Z, m]) => (M.diamagnetic(TABLE[3][Z - 1], 3) * M.CGS_MOLAR * 1e6) / m - 1),
  nist: TABLE[3].filter((a) => M.spinOf(a, 3) === NIST[a.Z - 1]).length, n3: TABLE[3].length, n4: TABLE[4].length,
  spin4: u4.filter((u) => u > 0).length, none4: TABLE[4].filter((a, i) => !u4[i]).map((a) => a.Z),
  max4: mx, maxZ: TABLE[4].filter((a, i) => u4[i] === mx).map((a) => a.Z), max3: Math.max(...u3),
  ratio: M.curie(0.5, 300 * M.KELVIN) / -M.diamagnetic(TABLE[4][0], 4),
}));
