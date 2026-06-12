// biome/gacha/sim/score.mjs — the VIABILITY oracle. A rolled food web → one `interest` (0..100)
// and a rarity tier. Rarity tracks the life-support jackpot: does the loop CLOSE, stay STABLE,
// resist shocks, keep its species alive, and carry a big crew? A gorgeous but unstable web scores
// low on purpose — that was the design call. Built entirely on builder.analyzeDesign (closure +
// the community-matrix stability solver), so the score is the real model's verdict, not taste.

import { analyzeDesign } from '../../cycles/sim/builder.mjs';

const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

// viability sub-signals, each 0..1, weighted into the base score
const WEIGHTS = { closes: 0.26, persist: 0.16, stable: 0.16, fed: 0.16, air: 0.12, robust: 0.10, buffer: 0.04 };

const TIERS = [
  { tier: 'Legendary', min: 88 },
  { tier: 'Epic',      min: 72 },
  { tier: 'Rare',      min: 55 },
  { tier: 'Uncommon',  min: 38 },
  { tier: 'Common',    min: 0  },
];
export const tierOf = (interest) => TIERS.find((t) => interest >= t.min).tier;

// longest producer→…→predator chain (trophic depth), over the wired diet
export function trophicDepth(species) {
  const byId = Object.fromEntries(species.map((s) => [s.id, s]));
  const memo = {};
  const level = (id, seen) => {
    if (id === 'litter') return 0;
    const s = byId[id]; if (!s) return 0;
    if (s.kind === 'producer') return 0;
    if (memo[id] != null) return memo[id];
    if (seen.has(id)) return 0;                       // cycle guard
    seen.add(id);
    let mx = 0; for (const e of s.eats || []) mx = Math.max(mx, level(e, seen) + 1);
    seen.delete(id); memo[id] = mx; return mx;
  };
  let d = 0; for (const s of species) if (s.kind === 'animal') d = Math.max(d, level(s.id, new Set()));
  return d;
}

// ── evaluate a roll: run the solver, compute signals, return interest + tier + everything. ──
export function evaluateRoll(roll, { days = 500 } = {}) {
  const R = analyzeDesign(roll.design, { days });
  if (!R.ok) return { ...roll, ok: false, interest: 0, tier: 'Common', problems: R.problems, report: R };

  const sp = roll.design.species, n = sp.length;
  const c = R.closure, st = R.stability || {};
  const last = R.last;
  const aliveFrac = (n - (c.extinct?.length || 0)) / Math.max(1, n);

  const sig = {
    closes:  c.closes ? 1 : 0,
    persist: clamp(aliveFrac),
    stable:  st.stable ? (st.marginal ? 0.5 : 1) : 0,
    fed:     clamp((c.calorieRatio || 0) / 1.2),
    air:     (c.o2OK && c.co2OK) ? 1 : (c.o2OK || c.co2OK ? 0.4 : 0),
    robust:  st.stable ? (clamp(1 - (st.returnTime || 1e9) / 1500) * 0.6 + clamp(1 - (st.reactivity || 9) / 3) * 0.4) : 0,
    buffer:  clamp((c.foodDays || 0) / 30),
  };
  let base = 0; for (const k in WEIGHTS) base += WEIGHTS[k] * sig[k];
  base *= 100;

  // the jackpot edge: closing for a big crew is the prize
  const crewBonus = c.closes ? clamp((roll.design.crew || 0) / 200) * 8 : 0;
  const depth = trophicDepth(sp);
  const depthBonus = Math.min(3, Math.max(0, depth - 2));   // deep webs read richer (small, secondary)

  // degeneracy penalties — the mush a roll can land in
  const producers = sp.filter((s) => s.kind === 'producer');
  const prodBio = producers.map((s) => last?.[s.id] || 0);
  const prodTotal = prodBio.reduce((a, b) => a + b, 0) || 1;
  const monoculture = producers.length <= 1 || Math.max(...prodBio, 0) / prodTotal > 0.85;
  const animals = sp.filter((s) => s.kind === 'animal');
  const oneGuild = animals.length > 0 && new Set(animals.map((s) => s.guild)).size === 1;
  let penalty = 0;
  if (aliveFrac < 0.5) penalty += 25;                                   // collapse
  if (monoculture) penalty += 10;                                       // one plant carries it
  if ((last?.co2_ppm ?? 400) < 50 || (last?.co2_ppm ?? 400) > 4000) penalty += 12;  // crash / runaway
  if (oneGuild) penalty += 8;
  if (n < 8) penalty += 6;
  if (!st.stable && (st.spectralAbscissa || 0) > 0.01) penalty += 8;    // actively unstable

  const interest = Math.round(clamp(base + crewBonus + depthBonus - penalty, 0, 100));
  const tier = tierOf(interest);

  return { ...roll, ok: true, interest, tier, signals: sig, depth,
    headline: headlineFor({ c, st, interest, crew: roll.design.crew, aliveFrac, n }),
    report: R };
}

function headlineFor({ c, st, interest, crew, aliveFrac, n }) {
  if (interest >= 88) return `A self-closing world: holds the air, feeds ${crew}, and shrugs off shocks.`;
  if (!c.closes && aliveFrac < 0.5) return `Collapses — ${Math.round((1 - aliveFrac) * 100)}% of species die out.`;
  if (!c.closes && !c.fedOK) return `Lives, but starves the crew (${Math.round((c.calorieRatio || 0) * 100)}% of demand).`;
  if (c.closes && !st.stable) return `Closes, but it's unstable — a shock could tip it over.`;
  if (c.closes) return `Closes the loop and carries ${crew} crew${st.marginal ? ', if precariously' : ''}.`;
  if (!c.o2OK || !c.co2OK) {
    const o2 = c.o2_kPa, co2 = c.co2_ppm;
    if (!(o2 > 0 && o2 < 100) || !(co2 > 0 && co2 < 1e5)) return `The atmosphere runs away — fixation and respiration never balance.`;
    return `Air goes off-spec (O₂ ${o2.toFixed(1)} kPa, CO₂ ${Math.round(co2)} ppm).`;
  }
  return `A partial web — ${n} species, but the loop won't quite close.`;
}

const Score = { evaluateRoll, tierOf, trophicDepth };
if (typeof globalThis !== 'undefined') globalThis.GachaScore = Score;
export default Score;
