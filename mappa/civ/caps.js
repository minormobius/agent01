// mappa/civ/caps.js — the capability ladder + subsistence packages.
//
// Eras are NOT scripted. A culture's `techVector` is a bitset of unlocked
// CAPABILITIES; behaviour branches on capabilities present, never on a hardcoded
// "era". Agriculture and industry are just capabilities that, once present, raise
// carrying capacity and unlock institution types — selection then flips the
// population. This file is the static rulebook: the DAG of prerequisites, the tier
// each capability sits at (for progression scoring), and how capabilities enable
// higher-density subsistence packages (the density ratchet that drives expansion).

// ---- capabilities (bit index = position; ≤32 so one Uint32 holds the vector) ---
export const CAPS = [
  'fire',          // 0  — baseline control of fire (foragers)
  'pottery',       // 1  — storage → surplus enabler
  'herding',       // 2  — → pastoral package
  'horticulture',  // 3  — → hoe horticulture package
  'metallurgy',    // 4  — bronze/iron
  'plough',        // 5  — → plough package (needs metallurgy + horticulture)
  'irrigation',    // 6  — → irrigation package (needs pottery + horticulture)
  'writing',       // 7  — record-keeping → states
  'wheel',         // 8  — transport/mechanical advantage
  'masonry',       // 9  — monumental building → cities
  'sail',          // 10 — ocean traversal → maritime package + island hopping
  'mathematics',   // 11 — abstraction → engineering
  'mechanisation', // 12 — machines (needs metallurgy + wheel + mathematics)
  'steamPower',    // 13 — energy (needs mechanisation + masonry) → industry
  'electricity',   // 14 — modernity (needs steamPower + mathematics)
  'printing',      // 15 — mass knowledge diffusion (needs writing + masonry)
  // ---- the AGTECH RATCHET (epoch 3) — what Malthus missed: technology raising
  // farming efficiency, so food capacity outruns the land's raw ceiling. Lineage
  // vendored from cards/js/pools/tech-pool.js (agriculture domain):
  'granary',       // 16 — storage smooths bad years (cards: Granary ← Neolithic Rev.)
  'cropRotation',  // 17 — fallow cycles (cards: Crop rotation ← Heavy plough)
  'terracing',     // 18 — hillsides bloom (masonry applied to slopes)
  'seedDrill',     // 19 — row sowing (cards: Seed drill ← Iron + Crop rotation)
  'fertilizer',    // 20 — mineral nutrients (cards: Superphosphate / Haber process)
  'greenRev',      // 21 — the full package (cards: Green Revolution)
  // ---- FRESH WATER works — the balance's supply side:
  'wells',         // 22 — groundwater where rain fails (qanats)
  'aqueduct',      // 23 — move water to the people (cards: Aqueduct)
];
export const CAP = Object.fromEntries(CAPS.map((c, i) => [c, i]));
export const NCAP = CAPS.length;
export const bit = i => (1 << i) >>> 0;
export const has = (vec, i) => (vec & bit(i)) !== 0;

// ---- prerequisite DAG: cap i unlockable only once all PREREQ[i] bits are held ---
const P = (...names) => names.reduce((m, n) => m | bit(CAP[n]), 0) >>> 0;
export const PREREQ = new Uint32Array(NCAP);
PREREQ[CAP.fire]          = 0;
PREREQ[CAP.pottery]       = P('fire');
PREREQ[CAP.herding]       = P('fire');
PREREQ[CAP.horticulture]  = P('fire');
PREREQ[CAP.metallurgy]    = P('pottery');
PREREQ[CAP.plough]        = P('metallurgy', 'horticulture');
PREREQ[CAP.irrigation]    = P('pottery', 'horticulture');
PREREQ[CAP.writing]       = P('pottery');
PREREQ[CAP.wheel]         = P('metallurgy');
PREREQ[CAP.masonry]       = P('pottery');
PREREQ[CAP.sail]          = P('fire');
PREREQ[CAP.mathematics]   = P('writing');
PREREQ[CAP.mechanisation] = P('metallurgy', 'wheel', 'mathematics');
PREREQ[CAP.steamPower]    = P('mechanisation', 'masonry');
PREREQ[CAP.electricity]   = P('steamPower', 'mathematics');
PREREQ[CAP.printing]      = P('writing', 'masonry');
PREREQ[CAP.granary]       = P('pottery', 'horticulture');
PREREQ[CAP.cropRotation]  = P('plough');
PREREQ[CAP.terracing]     = P('masonry', 'horticulture');
PREREQ[CAP.seedDrill]     = P('cropRotation', 'wheel');
PREREQ[CAP.fertilizer]    = P('steamPower');
PREREQ[CAP.greenRev]      = P('fertilizer', 'mechanisation');
PREREQ[CAP.wells]         = P('pottery');
PREREQ[CAP.aqueduct]      = P('masonry', 'mathematics');

// tier per capability (0 palaeo … 5 modern) — feeds the era-progression signal and
// the "late then accelerating" innovation cost (higher tier ⇒ needs more pop+trace).
export const TIER = new Uint8Array(NCAP);
const setTier = (t, ...ns) => ns.forEach(n => TIER[CAP[n]] = t);
setTier(0, 'fire');
setTier(1, 'pottery', 'herding', 'horticulture', 'sail');
setTier(2, 'metallurgy', 'writing', 'masonry', 'plough', 'irrigation', 'wheel', 'granary', 'wells');
setTier(3, 'mathematics', 'printing', 'cropRotation', 'terracing', 'aqueduct');
setTier(4, 'mechanisation', 'steamPower', 'seedDrill', 'fertilizer');
setTier(5, 'electricity', 'greenRev');
export const MAX_TIER = 5;

// highest tier any bit in a vector reaches (the culture's "era").
export function vecTier(vec) {
  let t = 0;
  for (let i = 0; i < NCAP; i++) if (has(vec, i) && TIER[i] > t) t = TIER[i];
  return t;
}
export function popcount(vec) { let c = 0; for (let v = vec >>> 0; v; v &= v - 1) c++; return c; }

// candidate capabilities: prereqs satisfied and not yet held. Returns list of indices.
export function candidates(vec) {
  const out = [];
  for (let i = 0; i < NCAP; i++) {
    if (has(vec, i)) continue;
    if ((vec & PREREQ[i]) === PREREQ[i]) out.push(i);
  }
  return out;
}

// ---- subsistence packages: the density ratchet ---------------------------------
// index → { id, capNeeded (-1 = always available), subMult (carrying-capacity ceiling) }
export const PKG = [
  { id: 'forager',      cap: -1,            sub: 0.18 },
  { id: 'pastoral',     cap: CAP.herding,   sub: 0.38 },
  { id: 'horticulture', cap: CAP.horticulture, sub: 0.95 },
  { id: 'plough',       cap: CAP.plough,    sub: 1.70 },
  { id: 'irrigation',   cap: CAP.irrigation, sub: 2.60 },
  { id: 'maritime',     cap: CAP.sail,      sub: 0.80 },
];
export const NPKG = PKG.length;
export const PKG_ID = Object.fromEntries(PKG.map((p, i) => [p.id, i]));
export const subMult = pkg => PKG[pkg].sub;
// can a culture adopt this package? (has the enabling capability, or none needed)
export function pkgUnlocked(vec, pkg) {
  const c = PKG[pkg].cap;
  return c < 0 || has(vec, c);
}

// ---- the agtech food multiplier (the anti-Malthus ratchet) ----------------------
// Multiplies effective carrying capacity for a culture holding the caps; terracing
// only pays on slopes (the caller passes `hilly`). Compounding by design: a
// green-revolution culture feeds ~2.4× what its land alone would.
export function foodTechMul(vec, hilly) {
  let m = 1;
  if (has(vec, CAP.granary)) m *= 1.06;
  if (has(vec, CAP.cropRotation)) m *= 1.12;
  if (has(vec, CAP.terracing) && hilly) m *= 1.25;
  if (has(vec, CAP.seedDrill)) m *= 1.15;
  if (has(vec, CAP.fertilizer)) m *= 1.30;
  if (has(vec, CAP.greenRev)) m *= 1.45;
  return m;
}

// ---- institution types (programmable aggregates) -------------------------------
// level ladder: band → chiefdom → state → (firms are a parallel industrial org).
export const ORG = { BAND: 0, CHIEFDOM: 1, STATE: 2, FIRM: 3 };
export const ORG_NAME = ['band', 'chiefdom', 'state', 'firm'];
