// mappa/lib/world-signals.js — THE INTERESTINGNESS BATTERY.
//
// "What is interesting in a whole world?" A board game has a free answer —
// you play it, and skill-beats-chance / it-ends / it's-fair are ground truth
// (see the Ludographer). A world has no objective to play, so interesting is
// not a normative, simulatable property: it's VARIETY, CONTRAST, STRUCTURE and
// STORY-POTENTIAL, and the opposite — a featureless monotone — is the boring
// degeneracy to screen out. This module is a hand-authored signal battery: a
// weighted set of measurements over the engine's own fields, each 0..1, summed
// to a 0..100 score, with degeneracy flags and an evocative descriptor.
//
// It is DELIBERATELY a designed aesthetic, not a discovered one. The honest
// posture (after the games critic): the score is for RANKING — surfacing the
// gems out of a seed line — not for claiming a world is objectively good. The
// civilization projection (the atlas k-means) is the closest thing worlds have
// to a self-labeling "playtest"; a later rung can fold it in. v1 reads only the
// raw engine world, so it runs in node and on the cheap API output.
//
// Pure + deterministic from the world. import { worldSignals } from this file.

import { BIOMES } from '../engine.js';
const BI = Object.fromEntries(BIOMES.map((b, i) => [b.id, i]));

// biome semantic sets (by index)
const SET = (...ids) => new Set(ids.map(id => BI[id]));
const FROZEN   = SET('ice', 'glacier', 'snow', 'sea_ice');
const ARABLE   = SET('temperate_for', 'temperate_rain', 'steppe', 'savanna', 'trop_seasonal', 'trop_rain'); // the livable belts
const ARID     = SET('desert', 'cold_desert');
const TROPICAL = SET('savanna', 'trop_seasonal', 'trop_rain');
const TEMPERATE= SET('temperate_for', 'temperate_rain', 'steppe', 'taiga');
const POLAR    = SET('tundra', 'ice', 'glacier', 'snow');

// smooth "goldilocks" bump: 1 at center, falling to 0 by ±width
const bump = (x, c, w) => Math.max(0, 1 - ((x - c) / w) ** 2);
const clamp01 = x => Math.max(0, Math.min(1, x));

// connected components over a predicate(cellIndex) using the mesh adjacency.
// returns array of {size, area, cells:[seed]} sorted largest-first.
function components(world, pred) {
  const N = world.N, seen = new Uint8Array(N), comps = [];
  for (let s = 0; s < N; s++) {
    if (seen[s] || !pred(s)) continue;
    let size = 0, area = 0, any = s; const q = [s]; seen[s] = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h]; size++; area += (world.area ? world.area[i] : 1);
      for (const j of world.adj[i]) if (!seen[j] && pred(j)) { seen[j] = 1; q.push(j); }
    }
    comps.push({ size, area, seed: any });
  }
  comps.sort((a, b) => b.area - a.area);
  return comps;
}

export function worldSignals(world) {
  const N = world.N, W = world.water, B = world.biome, E = world.elev, T = world.temperature;
  const meta = world.meta || {};
  const isLand = i => W[i] === 0;

  // ---- tallies -------------------------------------------------------------
  let land = 0, totA = 0, landA = 0, frozenA = 0, aridA = 0, arableA = 0, lakeCells = 0, peak = 0;
  const biomeArea = new Float64Array(BIOMES.length);
  let hasTrop = 0, hasTemp = 0, hasPolar = 0;
  for (let i = 0; i < N; i++) {
    const a = world.area ? world.area[i] : 1; totA += a;
    if (W[i] === 2) lakeCells++;
    if (isLand(i)) {
      land++; landA += a; biomeArea[B[i]] += a;
      if (E[i] > peak) peak = E[i];
      if (FROZEN.has(B[i])) frozenA += a;
      if (ARID.has(B[i])) aridA += a;
      if (ARABLE.has(B[i])) arableA += a;
      if (TROPICAL.has(B[i])) hasTrop = 1;
      if (TEMPERATE.has(B[i])) hasTemp = 1;
      if (POLAR.has(B[i])) hasPolar = 1;
    } else if (FROZEN.has(B[i])) frozenA += a; // sea ice counts toward a frozen world
  }
  const seaPct = totA > 0 ? 1 - landA / totA : 0;
  const landFrac = landA / totA;

  // ---- A. land/sea balance (the stage) -------------------------------------
  // Earth ~0.71 sea; interesting band ~0.45–0.80. Hard-penalise the monotone ends.
  const seaSig = clamp01(bump(seaPct, 0.62, 0.34));

  // ---- B. landmass structure (continents vs Pangaea vs archipelago) --------
  const masses = components(world, isLand);
  const subThresh = 0.02 * landA;                         // a "substantial" landmass = ≥2% of all land
  const sub = masses.filter(m => m.area >= subThresh);
  const nSub = sub.length;
  const largestFrac = landA > 0 && masses.length ? masses[0].area / landA : 0;
  // reward several substantial masses (peak ~3–4) and a non-dominant largest
  const countSig = clamp01(bump(nSub, 3.5, 4.0));          // 0 at 0 or ~7+, peak 3–4
  const spreadSig = clamp01(bump(largestFrac, 0.42, 0.46)); // penalise one blob (→1) and pure dust (→0)
  const structureSig = clamp01(0.5 * countSig + 0.5 * spreadSig);

  // ---- C. relief / tectonics -----------------------------------------------
  let mountainA = 0; for (let i = 0; i < N; i++) if (isLand(i) && E[i] > 0.5) mountainA += (world.area ? world.area[i] : 1);
  const mountainFrac = landA > 0 ? mountainA / landA : 0;
  const plateCount = meta.plateCount || (world.plates ? world.plates.length : 8);
  const peakSig = clamp01(peak / 0.7);                                  // real high ground present
  const plateSig = clamp01(bump(plateCount, 16, 18));                  // 1 plate dull, ~12–20 lively
  const reliefSig = clamp01(0.5 * peakSig + 0.25 * plateSig + 0.25 * clamp01(mountainFrac / 0.18));

  // ---- D. climate diversity (the Whittaker spread) -------------------------
  let H = 0, nBiome = 0; const landBiomeA = landA || 1;
  for (let b = 0; b < BIOMES.length; b++) {
    const f = biomeArea[b] / landBiomeA;
    if (f > 0.004) { nBiome++; H -= f * Math.log(f); }
  }
  const entropy = H / Math.log(Math.max(2, 10));            // normalise by ~log(10) typical land biomes
  const zoneSpan = (hasTrop + hasTemp + hasPolar) / 3;       // spans tropics→temperate→poles?
  const frozenFrac = frozenA / Math.max(1e-9, totA);
  const climateSig = clamp01(0.6 * clamp01(entropy) + 0.4 * zoneSpan);

  // ---- E. hydrology (rivers, lakes, the rare enclosed sea) -----------------
  const rivers = (world.rivers ? world.rivers.length : 0);
  const oceans = components(world, i => W[i] === 1);
  // an "inland sea" = a secondary ocean body, small vs the world ocean but not a puddle
  let inlandSea = 0, biggestOcean = oceans.length ? oceans[0].area : 0;
  for (let k = 1; k < oceans.length; k++) {
    const r = oceans[k].area / Math.max(1e-9, totA);
    if (r > 0.01 && r < 0.18) { inlandSea = 1; break; }
  }
  const riverSig = clamp01(rivers / (N * 0.06));            // density of channels
  const lakeSig = clamp01(lakeCells / (N * 0.03));
  const hydroSig = clamp01(0.5 * riverSig + 0.25 * lakeSig + 0.25 * inlandSea);

  // ---- F. habitability & geopolitical texture (the civ proxy) --------------
  // not "is it habitable" but: enough arable land, SPLIT into separated zones
  // (more separated homelands → more potential cultures, more contested borders).
  const arableFrac = arableA / Math.max(1e-9, landA);
  const arableZones = components(world, i => isLand(i) && ARABLE.has(B[i])).filter(z => z.area >= 0.01 * landA).length;
  const habAmount = clamp01(bump(arableFrac, 0.5, 0.55));   // not barren, not wall-to-wall jungle
  const habSplit = clamp01(bump(arableZones, 4, 5));        // a handful of separated breadbaskets
  const habSig = clamp01(0.6 * habAmount + 0.4 * habSplit);

  // ---- weighted score ------------------------------------------------------
  const parts = {
    sea:        { w: 12, v: seaSig },
    structure:  { w: 22, v: structureSig },
    relief:     { w: 16, v: reliefSig },
    climate:    { w: 22, v: climateSig },
    hydrology:  { w: 12, v: hydroSig },
    habitability:{ w: 16, v: habSig },
  };
  let score = 0; for (const k in parts) score += parts[k].w * parts[k].v;

  // ---- degeneracy flags (and the penalties that pull them below the gems) --
  const flags = [];
  const note = (cond, tag, penalty) => { if (cond) { flags.push(tag); score -= (penalty || 0); } };
  note(seaPct > 0.85, 'waterworld', 12);
  note(landFrac > 0.92, 'no-ocean', 16);
  note(frozenFrac > 0.62, 'iceball', 20);
  note(aridA / Math.max(1e-9, landA) > 0.82, 'desert-world', 14);
  note(nBiome <= 2, 'monobiome', 14);
  note(plateCount <= 2, 'single-plate', 8);
  note(peak < 0.18, 'flat-world', 8);
  note(nSub <= 1 && landFrac > 0.06, 'one-supercontinent', 6); // a story, but low variety
  note(nSub >= 8 && largestFrac < 0.12, 'all-archipelago', 6);
  score = Math.max(0, Math.min(100, Math.round(score)));

  // positive highlights (descriptors, not penalties)
  const highlights = [];
  if (inlandSea) highlights.push('inland sea');
  if (mountainFrac > 0.14) highlights.push('high mountains');
  if (hasTrop && hasPolar && nBiome >= 8) highlights.push('full climate range');
  if (rivers > N * 0.08) highlights.push('great rivers');

  // ---- evocative descriptor ------------------------------------------------
  const meanLandT = (() => { let s = 0, c = 0; for (let i = 0; i < N; i++) if (isLand(i)) { s += T[i]; c++; } return c ? s / c : 0; })();
  const climateAdj = frozenFrac > 0.45 ? 'frozen'
    : aridA / Math.max(1e-9, landA) > 0.5 ? 'arid'
    : meanLandT > 22 ? 'tropical'
    : arableFrac > 0.5 ? 'verdant'
    : meanLandT < 4 ? 'cold' : 'temperate';
  const structureNoun = nSub <= 1 ? 'supercontinent'
    : largestFrac < 0.12 ? 'archipelago'
    : nSub === 2 ? 'twin continents'
    : nSub <= 5 ? `${nSub} continents`
    : 'scattered lands';
  const clause = highlights.length ? ' with ' + highlights.slice(0, 2).join(' and ') : '';
  const descriptor = `A ${climateAdj} ${structureNoun}${clause}, ${Math.round(seaPct * 100)}% ocean.`;

  return {
    score, flags, highlights, descriptor,
    signals: Object.fromEntries(Object.entries(parts).map(([k, p]) => [k, +p.v.toFixed(3)])),
    facts: {
      seaPct: +seaPct.toFixed(3), landmasses: masses.length, substantial: nSub,
      largestFrac: +largestFrac.toFixed(3), biomes: nBiome, entropy: +entropy.toFixed(3),
      zoneSpan, rivers, lakeCells, inlandSea: !!inlandSea, plateCount,
      peakM: Math.round(peak * 9000), mountainFrac: +mountainFrac.toFixed(3),
      arableFrac: +arableFrac.toFixed(3), arableZones,
    },
  };
}
