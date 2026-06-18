// economy.js — the engine that turns a founded site into a growing town.
//
// Ties the theory's load-bearing pieces to running numbers:
//   • the FOUNDING ENGINE sets the basic (export) employment — the big game in town
//   • the BASE MULTIPLIER  M = 1/(1−s) spins basic into total (s = local-serving share)
//   • the HINTERLAND surplus sets the carrying capacity K (you can't feed past it)
//   • POPULATION grows on a LOGISTIC curve toward a target = min(K, economic demand)
//   • AGGLOMERATION raises productivity ~size^ε (increasing returns)
//   • the TECH clock lifts K (ag surplus), lowers transport cost (base reach) and
//     raises s (the multiplier) over time — a MOVING ceiling (stacked S-curves)
//   • FLOURISH has two faces: a bloom that rises with size, a dusk complexity cost
//   • CONQUER is the one discrete event the curves can't produce (a shock)

const KPP = 2600;       // people the local hinterland feeds per fertility-unit
const IMPORT_PP = 9000; // people fed by imported food per unit of trade capacity (away-markets)
const POP0 = 6;         // a founding hamlet

// hinterland surplus: fertility summed over a radius around the town
export function hinterlandSurplus(s, cell, R = 10) {
  const cx = cell % s.W, cy = (cell / s.W) | 0; let sum = 0;
  for (let y = Math.max(0, cy - R); y <= Math.min(s.H - 1, cy + R); y++)
    for (let x = Math.max(0, cx - R); x <= Math.min(s.W - 1, cx + R); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > R * R) continue;
      sum += s.fertility[y * s.W + x];
    }
  return sum;
}

// engine → basic-sector population draw (people the export sector directly sustains)
function baseEmployment(s, town) {
  const i = town.cell, flow = s.flow[i];
  let coast = 0; for (const j of s.nb4(i)) if (s.water[j] === 1) coast = 1;
  const fl = Math.min(5, flow / 25);
  switch (town.engine) {
    case 'gateway':       return 7000 + 1400 * fl + 4000 * coast;     // away-market trade
    case 'break-of-bulk': return 5000 + 1200 * fl;                    // transshipment
    case 'staple':        return 6500;                                // a mine: one commodity
    case 'fortress':      return 2600;                                // small base + coercion
    default:              return 700 + 130 * town.surplus;            // market: serve the hinterland
  }
}

// engine → trade capacity (food it can IMPORT from away-markets, so a gateway on a
// poor coast can still grow into a metropolis — Venice, Amsterdam)
function tradeCapacity(s, town) {
  const i = town.cell; let coast = 0; for (const j of s.nb4(i)) if (s.water[j] === 1) coast = 1;
  const fl = Math.min(5, s.flow[i] / 25);
  switch (town.engine) {
    case 'gateway':       return 1.0 + 0.4 * fl + 0.6 * coast;
    case 'break-of-bulk': return 0.5 + 0.3 * fl;
    default:              return 0;
  }
}

// build the initial economic state of a town from substrate + site
export function initEconomy(s, town) {
  const surplus = hinterlandSurplus(s, town.cell);
  const t = { ...town, surplus };
  t.base = baseEmployment(s, t);
  t.trade = tradeCapacity(s, t);
  t.s = 0.45;                                   // local-serving share (rises with tech/size)
  t.coercion = town.engine === 'fortress' ? 0.6 : 0.15;
  t.K0 = surplus * KPP;                         // local food ceiling at founding tech
  t.pop = POP0;
  t.alive = true;
  t.tributary = false;                          // set true when conquered-and-milked
  t.history = [];
  t.flourishHist = [];
  return t;
}

const TIERS = [[1e6, 'metropolis'], [2.5e4, 'city'], [4e3, 'town'], [400, 'village'], [0, 'hamlet']];
export function tierOf(pop) { for (const [thr, name] of TIERS) if (pop >= thr) return name; return 'hamlet'; }

// flourishing: bloom (talent/size) minus dusk (complexity cost) → can peak then fall
export function flourish(t) {
  const size = Math.max(1, t.pop);
  const bloom = 30 + 26 * Math.log10(size) / 3;                 // rises with scale (talent, tech-gen)
  const complexity = 22 * Math.pow(size / 6e4, 1.3);            // Tainter: marginal returns turn negative
  const tribute = t.tributary ? 18 : 0;                         // milked cities flourish less
  return Math.max(0, Math.min(100, bloom - complexity - tribute));
}

// one tick: tech nudges the parameters, then population grows logistically toward
// the moving target = min(K, economic demand). `tech` ∈ [0,1] is the global clock.
export function step(t, { r = 0.16, tech = 0 } = {}) {
  if (!t.alive) { t.history.push(0); t.flourishHist.push(0); return t; }
  // the tech clock lifts the ceilings (ag surplus ↑ K, transport ↓ → imports ↑, s ↑ → M ↑)
  const surplusGain = 1 + 1.6 * tech;                          // agriculture raises the local food ceiling
  const reachGain = 1 + 1.4 * tech;                            // cheaper transport widens trade/imports
  const s = Math.min(0.72, t.s + 0.22 * tech);                // multiplier creeps up
  const M = 1 / (1 - s);
  const agglom = Math.pow(Math.max(5000, t.pop) / 5000, 0.16); // increasing returns (rich-get-richer)
  // ceiling = local food (hinterland) + imported food (away-markets, tech-scaled)
  const ceiling = t.K0 * surplusGain + t.trade * IMPORT_PP * reachGain;
  const demand = t.base * M * agglom * (t.tributary ? 0.55 : 1);
  const target = Math.min(ceiling, demand);
  t.pop = Math.max(1, t.pop + r * t.pop * (1 - t.pop / Math.max(1, target)));
  t.ceiling = ceiling; t.target = target; t.M = M;
  t.tier = tierOf(t.pop);
  t.flourishVal = flourish(t);
  t.history.push(Math.round(t.pop));
  t.flourishHist.push(Math.round(t.flourishVal));
  return t;
}

// conquest — the discrete shock. outcome ∈ sack | tribute | elite | absorb.
// damage is size-dependent: a diversified metropolis shrugs; a one-engine town can die.
export function conquer(t, outcome = 'tribute') {
  const monofunctional = (t.engine === 'staple' || t.engine === 'fortress') && t.pop < 4000;
  switch (outcome) {
    case 'sack':    t.pop *= monofunctional ? 0.05 : 0.5; if (monofunctional) t.alive = t.pop > 2; break;
    case 'tribute': t.tributary = true; break;                 // kept, milked: surplus flows out
    case 'elite':   /* govern sector swapped; population continues */ break;
    case 'absorb':  /* changes hands, carries on */ break;
  }
  t.lastEvent = outcome;
  return t;
}
