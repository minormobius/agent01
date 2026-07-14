// mappa/civ/signals.js — civ-signals, THE INTERESTINGNESS BATTERY (M8).
//
// The civilizational analogue of mappa's world-signals, one level up. A civilization
// has no objective to play, so "interesting" is not a normative property: it's
// VARIETY, CONTRAST, STRUCTURE and STORY-POTENTIAL — a fractured phylogeny, several
// separated homelands, independent takeoffs, collapse-and-recovery — and the opposite
// (instant extinction, a single-hegemon monoculture, stuck-foraging) is the boring
// degeneracy to screen out. A hand-authored weighted battery over the sim's OWN fields
// (the chronicle), each 0..1, summed to 0..100, with degeneracy flags, positive
// highlights, and an evocative descriptor.
//
// Honest posture (after mappa's world-signals and the games critic): this is a
// DESIGNED aesthetic for RANKING/surfacing runs out of a config line — not a claim
// that a civilization is objectively good. Pure + deterministic from the chronicle.

import { MAX_TIER, PKG, NPKG, PKG_ID } from './caps.js';

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const bump = (x, c, w) => Math.max(0, 1 - ((x - c) / w) ** 2);
const sum = a => a.reduce((s, v) => s + v, 0);
function shannon(sizes) {
  const tot = sum(sizes); if (tot <= 0) return { H: 0, n: 0 };
  let H = 0, n = 0;
  for (const s of sizes) { if (s <= 0) continue; const p = s / tot; H -= p * Math.log(p); n++; }
  return { H, n };
}
// depth + leaf count of a forest given parent pointers (-1 = root).
function treeStats(nodes) {
  const depth = new Int32Array(nodes.length).fill(-1);
  const byId = new Map(nodes.map(n => [n.id, n]));
  const childCount = new Map();
  for (const n of nodes) if (n.parent >= 0) childCount.set(n.parent, (childCount.get(n.parent) || 0) + 1);
  const d = id => {
    let node = byId.get(id), steps = 0, guard = 0;
    while (node && node.parent >= 0 && guard++ < 100000) { node = byId.get(node.parent); steps++; }
    return steps;
  };
  let maxDepth = 0, leaves = 0;
  for (const n of nodes) { const dd = d(n.id); if (dd > maxDepth) maxDepth = dd; if (!childCount.get(n.id)) leaves++; }
  return { maxDepth, leaves, size: nodes.length };
}

export function civSignals(chronicle) {
  const s = chronicle.series, ev = chronicle.events || [], meta = chronicle.meta || {}, fin = chronicle.final || {};
  const T = s.tick.length || 1;
  const finalPop = fin.pop ?? (s.pop[s.pop.length - 1] || 0);
  const peakPop = Math.max(1, ...(s.pop.length ? s.pop : [1]));
  const cultures = fin.cultures || [];
  const countEv = type => ev.filter(e => e.type === type).length;

  // ---- A. cultural diversity (not one hegemon, not shattered dust) ----------------
  // effective number of cultures = exp(Shannon); the interesting band is a handful to a
  // few dozen — a single hegemon (→1) AND hyper-fragmentation into ephemeral dust both
  // read as less interesting than a legible plurality.
  const sizes = cultures.map(c => c.size);
  const { H, n: nCult } = shannon(sizes);
  const effCult = Math.exp(H);
  const largestFrac = finalPop > 0 && sizes.length ? sizes[0] / finalPop : 1;
  const diversitySig = clamp01(0.7 * clamp01(bump(Math.log2(effCult), Math.log2(14), 3.4)) + 0.3 * clamp01(1 - largestFrac));

  // ---- B. phylogenetic depth & balance -------------------------------------------
  const phy = treeStats(fin.languages || []);
  const depthSig = clamp01(phy.maxDepth / 8);
  const balanceSig = clamp01(phy.leaves / Math.max(4, phy.size * 0.5)); // many leaves vs a chain
  const phyloSig = clamp01(0.6 * depthSig + 0.4 * balanceSig);

  // ---- C. migration structure ----------------------------------------------------
  const pulses = countEv('migrationPulse');
  const meanDisp = sum(s.dispersers || []) / T;
  const frontier = (sum(s.displace || []) + sum(s.convert || [])) / T; // sustained admixture front
  const migSig = clamp01(0.4 * clamp01(pulses / 6) + 0.3 * clamp01(meanDisp / (peakPop * 0.03)) + 0.3 * clamp01(frontier / 30));

  // ---- D. era progression (independent origins score high) -----------------------
  const maxTier = Math.max(0, ...(s.maxTier.length ? s.maxTier : [0]));
  const tierSig = maxTier / MAX_TIER;
  const agriOrigins = meta.agriOrigins || 0, indOrigins = meta.industrialOrigins || 0;
  const originSig = clamp01(0.5 * clamp01((agriOrigins - 1) / 2) + 0.5 * clamp01(indOrigins / 2)); // >1 independent = jackpot
  const eraSig = clamp01(0.7 * tierSig + 0.3 * originSig);

  // ---- E. institutional diversity + collapse/recovery cycles ---------------------
  const inst = fin.inst || {};
  const orgTypes = (inst.chief > 0 ? 1 : 0) + (inst.stateCells > 0 ? 1 : 0) + (inst.firmCells > 0 ? 1 : 0) + 1; // band always
  const collapses = countEv('collapse');
  const peakStates = Math.max(0, ...(s.states.length ? s.states : [0]));
  const instSig = clamp01(0.45 * (orgTypes / 4) + 0.3 * clamp01(bump(peakStates, 8, 12)) + 0.25 * clamp01(collapses / 4));

  // ---- F. geographic contestation (several homelands, no single sweep) -----------
  const homelands = fin.occupiedLandmasses || 1;
  const contestSig = clamp01(0.4 * clamp01((homelands - 1) / 3) + 0.35 * clamp01(1 - largestFrac) + 0.25 * clamp01(frontier / 25));

  // ---- G. endogenous drama -------------------------------------------------------
  const dramaEvents = countEv('collapse') + countEv('migrationPulse') + countEv('admixtureSpike');
  const dramaSig = clamp01(dramaEvents / 12);

  // ---- weighted score ------------------------------------------------------------
  const parts = {
    diversity:     { w: 18, v: diversitySig },
    phylogeny:     { w: 14, v: phyloSig },
    migration:     { w: 14, v: migSig },
    era:           { w: 20, v: eraSig },
    institutions:  { w: 14, v: instSig },
    contestation:  { w: 12, v: contestSig },
    drama:         { w: 8,  v: dramaSig },
  };
  let score = 0; for (const k in parts) score += parts[k].w * parts[k].v;

  // ---- degeneracy flags (and the penalties that pull them below the gems) --------
  const flags = [];
  const note = (cond, tag, penalty) => { if (cond) { flags.push(tag); score -= (penalty || 0); } };
  // did the population collapse to near-nothing early and stay there?
  const earlyDeath = finalPop < 20 || (peakPop > 200 && finalPop < peakPop * 0.02);
  note(earlyDeath, 'instant-extinction', 40);
  note(!earlyDeath && largestFrac > 0.7 && nCult <= 3, 'single-hegemon-sweep', 16);
  note(maxTier === 0, 'stuck-foraging', 18);
  note(nCult > 0 && nCult <= 2 && !earlyDeath, 'monoculture', 14);
  note((meta.finalPop || 0) >= 255000 || peakPop >= 255000, 'runaway-population', 12);
  // static: almost nothing changed over the whole run
  const popVar = variation(s.pop), cultVar = variation(s.cultures);
  note(!earlyDeath && popVar < 0.15 && cultVar < 0.15 && maxTier <= 1, 'static', 12);
  score = Math.max(0, Math.min(100, Math.round(score)));

  // ---- positive highlights (feed the descriptor) ---------------------------------
  const highlights = [];
  if (indOrigins >= 2) highlights.push(`${indOrigins} independent industrial takeoffs`);
  else if (indOrigins === 1) highlights.push('an industrial takeoff');
  if (agriOrigins >= 2) highlights.push(`${agriOrigins} independent agricultures`);
  if (phy.maxDepth >= 5) highlights.push('a deep language phylogeny');
  if (peakStates >= 4) highlights.push(`${peakStates} contending states`);
  if (pulses >= 2) highlights.push('migration pulses');
  if (collapses >= 2) highlights.push('collapse-and-recovery cycles');
  if (homelands >= 3) highlights.push(`${homelands} separated homelands`);

  const descriptor = buildDescriptor({ nCult, maxTier, indOrigins, agriOrigins, homelands, largestFrac, subDist: fin.subDist, highlights, score, earlyDeath, flags });

  return {
    score, flags, highlights, descriptor,
    signals: Object.fromEntries(Object.entries(parts).map(([k, p]) => [k, +p.v.toFixed(3)])),
    facts: {
      finalPop, peakPop, cultures: nCult, languages: (fin.languages || []).length,
      phyloDepth: phy.maxDepth, phyloLeaves: phy.leaves,
      maxTier, agriOrigins, industrialOrigins: indOrigins, homelands,
      largestCultureFrac: +largestFrac.toFixed(3), migrationPulses: pulses, collapses,
      peakStates, meanFrontier: +frontier.toFixed(1),
      subsistence: subLabel(fin.subDist),
    },
  };
}

// coefficient of variation of the back half of a series (steady-state variability)
function variation(arr) {
  if (!arr || arr.length < 4) return 1;
  const h = arr.slice(Math.floor(arr.length / 2));
  const m = sum(h) / h.length; if (m <= 0) return 0;
  let v = 0; for (const x of h) v += (x - m) ** 2; v = Math.sqrt(v / h.length);
  return v / m;
}
function subLabel(subDist) {
  if (!subDist) return {};
  const tot = sum(subDist) || 1, out = {};
  for (let p = 0; p < NPKG; p++) if (subDist[p] > 0) out[PKG[p].id] = +(subDist[p] / tot).toFixed(2);
  return out;
}
function buildDescriptor(x) {
  if (x.earlyDeath) return `A stillborn world — the founders died out. ★${x.score}.`;
  const dominant = x.subDist ? PKG[argmax(x.subDist)].id : 'forager';
  const structureNoun = x.homelands >= 3 ? `${x.homelands} separated homelands`
    : x.homelands === 2 ? 'two homelands'
    : x.largestFrac > 0.7 ? 'one sweeping hegemon' : 'a contested mainland';
  const eraWord = ['a foraging world', 'a neolithic world', 'a bronze-age world', 'a classical world', 'an industrial world', 'a modern world'][x.maxTier] || 'a world';
  const clause = x.highlights.length ? ' — ' + x.highlights.slice(0, 3).join(', ') : '';
  return `${cap(eraWord)} over ${structureNoun}, ${x.nCult} surviving ${x.nCult === 1 ? 'culture' : 'cultures'} (mostly ${dominant})${clause}. ★${x.score}.`;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function argmax(a) { let bi = 0, bv = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > bv) { bv = a[i]; bi = i; } return bi; }
