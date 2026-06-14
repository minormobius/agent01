// items.js — the ITEM CHARACTERISTICS ENGINE behind mega.mino.mobi/sprite/item/.
//
// The bet (cousin of hoop/econ's "economies as ecosystems"): an item is the material cousin of a
// place. A place has a ROLE (verb) × a DOMAIN (matter) × FLOWS; an item has a KIND (what it is) ×
// a MATERIAL (what it's made of) × QUALITY (how well) × AFFIXES (what's been done to it). From a
// seed, that bundle rolls a fully-determined item you can SCORE — the same deck → roll → oracle →
// genome arc econ.js runs for towns:
//
//   deck   — KINDS, MATERIALS, QUALITY, AFFIXES (the closed catalog below)
//   roll   — rollItem(n, genome): seed n → kind × material × quality × affixes → realized stats
//   oracle — scoreItem(item): the realized stats → an appraised `worth` 0..100 + a grade band
//   genome — DEFAULT_GENOME + ARCHETYPES + rollGenome(n): the heritable bias on what a hoard rolls
//
// Determinism is load-bearing: (n, genome) ⇒ the same item on every machine, so /?n=… is a stable
// permalink and a roll can be persisted as an ATProto record and re-derived. Colours are keyed to
// the shared hoop world palette so sprites agree with the rest of the cylinder.
//
// Consumed by /hoop (loot/wares) and rendered by sprite.js. Pure, zero-dep, node-testable.

import { rng, R } from './prng.js';

// ── DECK 1: KINDS — what an item IS. glyph + accent (hoop palette) + sprite `form` + base stats. ──
// `base` are the five characteristic axes before material/quality/affixes scale them.
// `mats` is the kind's material affinity (a weighted shortlist — a blade wants metal, a tome paper).
export const AXES = ['weight', 'value', 'durability', 'potency', 'lore'];
export const KINDS = {
  blade:   { glyph: '⚔', accent: '#cf3b3b', form: 'blade',   slot: 'hand',  base: { weight: 3.0, value: 40, durability: 60, potency: 72, lore: 10 }, mats: { iron: 14, steel: 10, bronze: 8, silver: 4, bone: 3, stone: 2 } },
  tool:    { glyph: '⚒', accent: '#e0772f', form: 'tool',    slot: 'hand',  base: { weight: 2.5, value: 24, durability: 72, potency: 30, lore: 6 },  mats: { iron: 14, bronze: 9, steel: 7, wood: 8, stone: 5 } },
  vessel:  { glyph: '⚱', accent: '#7fd8d0', form: 'vessel',  slot: 'pack',  base: { weight: 1.5, value: 30, durability: 30, potency: 22, lore: 16 }, mats: { glass: 12, clay: 12, bronze: 6, silver: 4, gold: 2 } },
  garment: { glyph: '☷', accent: '#c853a0', form: 'garment', slot: 'worn',  base: { weight: 1.0, value: 34, durability: 44, potency: 16, lore: 22 }, mats: { cloth: 14, leather: 12, silver: 2, gold: 1 } },
  charm:   { glyph: '✦', accent: '#f4bf62', form: 'charm',   slot: 'worn',  base: { weight: 0.3, value: 62, durability: 50, potency: 42, lore: 56 }, mats: { silver: 10, gold: 8, crystal: 8, bone: 6, bronze: 3 } },
  tome:    { glyph: '❍', accent: '#5570d8', form: 'tome',    slot: 'pack',  base: { weight: 1.8, value: 46, durability: 34, potency: 20, lore: 82 }, mats: { paper: 14, leather: 10, bone: 4, silver: 2 } },
  staff:   { glyph: '✣', accent: '#b39bd8', form: 'staff',   slot: 'hand',  base: { weight: 2.2, value: 50, durability: 55, potency: 62, lore: 50 }, mats: { wood: 12, crystal: 6, silver: 5, bronze: 4, bone: 3 } },
  lamp:    { glyph: '☀', accent: '#dfe7e2', form: 'lamp',    slot: 'pack',  base: { weight: 1.2, value: 28, durability: 46, potency: 36, lore: 26 }, mats: { bronze: 12, iron: 8, glass: 8, silver: 3 } },
};
export const KIND_ORDER = Object.keys(KINDS);

// ── DECK 2: MATERIALS — what it's made of. factors scale each axis; color+sheen drive the sprite. ──
// The economic cousin of econ's DOMAINS (the matter lexicon). Colours come from the hoop palette.
export const MATERIALS = {
  wood:    { name: 'Wood',    color: '#9b6b3a', sheen: 0.10, weight: 0.6, value: 0.7, durability: 0.8, potency: 0.7, lore: 0.8 },
  iron:    { name: 'Iron',    color: '#6b7a82', sheen: 0.32, weight: 1.4, value: 0.9, durability: 1.3, potency: 1.2, lore: 0.6 },
  bronze:  { name: 'Bronze',  color: '#c08a3e', sheen: 0.50, weight: 1.2, value: 1.1, durability: 1.1, potency: 1.1, lore: 0.9 },
  steel:   { name: 'Steel',   color: '#aeb8c2', sheen: 0.62, weight: 1.3, value: 1.3, durability: 1.5, potency: 1.4, lore: 0.7 },
  silver:  { name: 'Silver',  color: '#dfe7e2', sheen: 0.80, weight: 1.1, value: 1.6, durability: 1.0, potency: 1.1, lore: 1.3 },
  gold:    { name: 'Gold',    color: '#f4bf62', sheen: 0.95, weight: 1.6, value: 2.4, durability: 0.7, potency: 0.9, lore: 1.5 },
  glass:   { name: 'Glass',   color: '#7fd8d0', sheen: 0.85, weight: 0.7, value: 1.0, durability: 0.4, potency: 0.8, lore: 1.0 },
  clay:    { name: 'Clay',    color: '#b5734a', sheen: 0.15, weight: 0.9, value: 0.5, durability: 0.5, potency: 0.6, lore: 0.7 },
  bone:    { name: 'Bone',    color: '#d8cbb0', sheen: 0.25, weight: 0.7, value: 0.8, durability: 0.7, potency: 1.0, lore: 1.2 },
  leather: { name: 'Leather', color: '#7a5230', sheen: 0.20, weight: 0.5, value: 0.8, durability: 0.9, potency: 0.7, lore: 0.8 },
  cloth:   { name: 'Cloth',   color: '#b0607f', sheen: 0.18, weight: 0.4, value: 0.7, durability: 0.5, potency: 0.5, lore: 0.7 },
  paper:   { name: 'Paper',   color: '#e8dcc0', sheen: 0.10, weight: 0.3, value: 0.6, durability: 0.3, potency: 0.4, lore: 1.4 },
  crystal: { name: 'Crystal', color: '#b39bd8', sheen: 0.92, weight: 0.9, value: 2.0, durability: 0.6, potency: 1.5, lore: 1.6 },
  stone:   { name: 'Stone',   color: '#566066', sheen: 0.20, weight: 1.8, value: 0.6, durability: 1.4, potency: 0.9, lore: 0.7 },
};

// ── DECK 3: QUALITY — the crafted rarity. `mult` scales every axis; `affixes` is how many affix ──
// slots {prefix, suffix} get filled; `frame` tints the sprite's rarity ring. The cousin of econ's
// vitality TIERS, but here it's an INPUT the roll draws (genome.qualityCurve weights it), while the
// oracle's `grade` is the independent OUTPUT — quality is cause, grade is the appraisal.
export const QUALITY = [
  { id: 'crude',  label: 'Crude',      mult: 0.62, affixes: [0, 0], frame: '#566066' },
  { id: 'plain',  label: 'Plain',      mult: 0.85, affixes: [0, 1], frame: '#9b6b3a' },
  { id: 'fine',   label: 'Fine',       mult: 1.05, affixes: [0, 1], frame: '#7fd8d0' },
  { id: 'rare',   label: 'Rare',       mult: 1.32, affixes: [1, 1], frame: '#5570d8' },
  { id: 'master', label: 'Masterwork', mult: 1.62, affixes: [1, 2], frame: '#f4bf62' },
  { id: 'relic',  label: 'Relic',      mult: 2.10, affixes: [2, 2], frame: '#b39bd8' },
];
const QIDX = Object.fromEntries(QUALITY.map((q, i) => [q.id, i]));

// ── DECK 4: AFFIXES — what's been done to it. slot pre/suf, multiplicative stat deltas, a `cue` the ──
// sprite engine decorates with, and the minimum quality index at which it can appear.
export const AFFIXES = [
  { id: 'keen',    slot: 'pre', word: 'Keen',    cue: 'edge',   minQ: 1, delta: { potency: 0.28, value: 0.10 } },
  { id: 'heavy',   slot: 'pre', word: 'Heavy',   cue: 'bulk',   minQ: 0, delta: { durability: 0.30, weight: 0.35, potency: 0.10 } },
  { id: 'fine',    slot: 'pre', word: 'Fine',    cue: 'trim',   minQ: 1, delta: { value: 0.35, lore: 0.10 } },
  { id: 'runed',   slot: 'pre', word: 'Runed',   cue: 'rune',   minQ: 2, delta: { lore: 0.35, potency: 0.20 } },
  { id: 'gilded',  slot: 'pre', word: 'Gilded',  cue: 'trim',   minQ: 2, delta: { value: 0.55, weight: 0.10 } },
  { id: 'ancient', slot: 'pre', word: 'Ancient', cue: 'patina', minQ: 3, delta: { lore: 0.45, value: 0.30, durability: -0.10 } },
  { id: 'warding', slot: 'suf', word: 'of Warding', cue: 'gem', minQ: 1, delta: { durability: 0.40, potency: 0.12 } },
  { id: 'sage',    slot: 'suf', word: 'of the Sage', cue: 'rune', minQ: 1, delta: { lore: 0.45 } },
  { id: 'plenty',  slot: 'suf', word: 'of Plenty', cue: 'gem',   minQ: 2, delta: { value: 0.45 } },
  { id: 'fury',    slot: 'suf', word: 'of Fury',   cue: 'edge',  minQ: 2, delta: { potency: 0.45, durability: -0.08 } },
  { id: 'deep',    slot: 'suf', word: 'of the Deep', cue: 'gem', minQ: 3, delta: { potency: 0.30, lore: 0.30 } },
];

// ── THE ROLL ──────────────────────────────────────────────────────────────────────────────────
function pickAffixes(rnd, K, qIdx, rate) {
  const Q = QUALITY[qIdx];
  const [lo, hi] = Q.affixes;
  let count = R.int(rnd, lo, hi);
  if (rate !== 1 && count > 0 && rnd() > rate) count -= 1;       // genome can dampen affix richness
  if (count <= 0) return [];
  const eligible = AFFIXES.filter((a) => a.minQ <= qIdx);
  const pre = eligible.filter((a) => a.slot === 'pre');
  const suf = eligible.filter((a) => a.slot === 'suf');
  const out = [];
  // fill at most one prefix and one suffix; for a single slot pick the side at random
  const wantPre = count >= 2 ? true : rnd() < 0.5;
  const wantSuf = count >= 2 ? true : !wantPre;
  if (wantPre && pre.length) out.push(R.pick(rnd, pre));
  if (wantSuf && suf.length) out.push(R.pick(rnd, suf));
  return out;
}

function computeStats(K, M, Q, affixes) {
  const stat = {};
  for (const ax of AXES) {
    let v = K.base[ax] * M[ax];
    if (ax !== 'weight') v *= Q.mult;                            // quality lifts the "good" axes
    let mul = 1; for (const a of affixes) if (a.delta[ax]) mul += a.delta[ax];
    v *= mul;
    stat[ax] = ax === 'weight' ? Math.round(v * 10) / 10 : Math.max(0, Math.round(v));
  }
  return stat;
}

// rollItem(n, genome) — the pull. Seed n forks independent streams for kind/material/quality/affix,
// so each axis reproduces from n and the whole item is determined by (n, genome).
export function rollItem(n, genome = DEFAULT_GENOME) {
  n = n >>> 0;
  const kindId = R.weighted(rng(n, 'kind'), Object.entries(genome.kindMix));
  const K = KINDS[kindId];
  // material weight = global availability (genome) × this kind's affinity; only the kind's mats roll
  const matEntries = Object.entries(K.mats).map(([m, aff]) => [m, aff * (genome.materials[m] || 0.001)]);
  const matId = R.weighted(rng(n, 'mat'), matEntries);
  const M = MATERIALS[matId];
  const qId = R.weighted(rng(n, 'quality'), genome.qualityCurve);
  const qIdx = QIDX[qId];
  const Q = QUALITY[qIdx];
  const affixes = pickAffixes(rng(n, 'affix'), K, qIdx, genome.affixRate);
  const stats = computeStats(K, M, Q, affixes);
  const oracle = scoreItem({ kind: kindId, material: matId, quality: qId, stats });
  return {
    n, seed: n, kind: kindId, material: matId, quality: qId, qIdx,
    affixes: affixes.map((a) => a.id), affixCues: affixes.map((a) => a.cue),
    stats, glyph: K.glyph, accent: K.accent, color: M.color, sheen: M.sheen, frame: Q.frame,
    worth: oracle.worth, grade: oracle.grade, gradeLabel: oracle.label, signals: oracle.signals,
    headline: oracle.headline, name: nameItem(kindId, matId, affixes),
  };
}
export const forge = rollItem;   // alias — /hoop calls it forging
export function rollMany(seeds, genome = DEFAULT_GENOME) { return seeds.map((s) => rollItem(s, genome)); }

// ── THE ORACLE — appraise an item's realized stats into a worth 0..100 + a grade band ───────────
// Independent of the quality that was rolled (mirrors econ: genome breeds, oracle scores). Worth is
// a weighted blend of the desirable axes, with weight as a mild carry penalty.
const WORTH_W = { value: 0.30, potency: 0.26, durability: 0.22, lore: 0.22 };
const REF = { value: 150, potency: 130, durability: 120, lore: 140 };   // normalisation ceilings
const clamp01 = (x) => Math.max(0, Math.min(1, x));
export function scoreItem({ stats }) {
  const sig = {
    value:      clamp01(stats.value / REF.value),
    potency:    clamp01(stats.potency / REF.potency),
    durability: clamp01(stats.durability / REF.durability),
    lore:       clamp01(stats.lore / REF.lore),
  };
  let base = 0; for (const k in WORTH_W) base += WORTH_W[k] * sig[k];
  const heft = clamp01((stats.weight - 4) / 6);                 // only heavy things pay a penalty
  const worth = Math.round(clamp01(base - heft * 0.12) * 100);
  const { id, label } = gradeFor(worth);
  return { worth, grade: id, label, signals: sig, headline: gradeHeadline(id, sig, stats) };
}
export const GRADES = [
  { id: 'junk',   label: 'Junk',   min: 0,  color: '#566066' },
  { id: 'meagre', label: 'Meagre', min: 25, color: '#9b6b3a' },
  { id: 'fair',   label: 'Fair',   min: 40, color: '#7fd8d0' },
  { id: 'solid',  label: 'Solid',  min: 55, color: '#5aa845' },
  { id: 'superb', label: 'Superb', min: 70, color: '#f4bf62' },
  { id: 'mythic', label: 'Mythic', min: 85, color: '#b39bd8' },
];
function gradeFor(worth) { let g = GRADES[0]; for (const t of GRADES) if (worth >= t.min) g = t; return g; }
function gradeHeadline(grade, sig, stats) {
  if (grade === 'mythic') return `A mythic find — it excels on every axis (worth caps out).`;
  if (sig.value > 0.7) return `Treasure-grade: worth ${stats.value} on value alone.`;
  if (sig.potency > 0.7) return `A potent piece (${stats.potency}) — built to do work.`;
  if (sig.lore > 0.7) return `Heavy with lore (${stats.lore}) — a scholar's prize.`;
  if (sig.durability > 0.7) return `Built to last (${stats.durability} durability).`;
  if (grade === 'junk') return `Junk — nothing here stands out.`;
  return `A serviceable ${grade} item.`;
}

// ── NAMING ──────────────────────────────────────────────────────────────────────────────────────
export function nameItem(kindId, matId, affixes) {
  const kindWord = kindId[0].toUpperCase() + kindId.slice(1);
  const pre = affixes.find((a) => a.slot === 'pre');
  const suf = affixes.find((a) => a.slot === 'suf');
  let s = `${MATERIALS[matId].name} ${kindWord}`;
  if (pre) s = `${pre.word} ${s}`;
  if (suf) s = `${s} ${suf.word}`;
  return s;
}

// ── THE GENOME — the heritable bias on what a HOARD rolls (item-genome groundwork) ──────────────
// DEFAULT_GENOME is the wild type. ARCHETYPES are the correlated pulls (an armory rolls metal blades,
// a scriptorium rolls tomes & charms), and rollGenome(n) breeds one deterministically — the same
// (genome, seed) machinery econ.js uses for towns. /sprite/item exposes this as the "hoard" selector;
// the "get-weird" item-genome phase (per-kind silhouette genes, mutation, lineage) layers on top.
export const DEFAULT_GENOME = {
  kindMix:   { blade: 10, tool: 14, vessel: 12, garment: 11, charm: 8, tome: 7, staff: 6, lamp: 9 },
  materials: { wood: 12, iron: 12, bronze: 9, steel: 6, silver: 5, gold: 2, glass: 8, clay: 9, bone: 6, leather: 9, cloth: 9, paper: 5, crystal: 2, stone: 7 },
  qualityCurve: [['crude', 30], ['plain', 34], ['fine', 20], ['rare', 10], ['master', 5], ['relic', 1.5]],
  affixRate: 1.0,
};
export const ARCHETYPES = [
  { id: 'common',      w: 4, kind: {}, mat: {}, qShift: 1.0 },
  { id: 'armory',      w: 2, kind: { blade: 2.4, tool: 1.6, staff: 1.3, charm: 0.4, tome: 0.3, garment: 0.5 }, mat: { iron: 1.8, steel: 2.2, bronze: 1.4, wood: 0.5, paper: 0.2, cloth: 0.3 }, qShift: 1.15 },
  { id: 'bazaar',      w: 2, kind: { charm: 2.2, vessel: 1.5, garment: 1.6, blade: 0.5, tool: 0.5 }, mat: { gold: 2.6, silver: 2.0, glass: 1.5, crystal: 2.0, clay: 0.4, stone: 0.3 }, qShift: 1.3 },
  { id: 'scriptorium', w: 2, kind: { tome: 2.6, charm: 1.6, staff: 1.4, blade: 0.3, tool: 0.4 }, mat: { paper: 2.6, leather: 1.6, bone: 1.5, silver: 1.4, crystal: 1.6, iron: 0.4 }, qShift: 1.2 },
  { id: 'midden',      w: 1.5, kind: { tool: 1.5, vessel: 1.4, lamp: 1.3, charm: 0.4, tome: 0.4 }, mat: { clay: 2.2, stone: 1.8, wood: 1.6, bone: 1.4, gold: 0.05, crystal: 0.05, silver: 0.2 }, qShift: 0.7 },
];
export function rollGenome(n, base = DEFAULT_GENOME) {
  const rnd = rng(n, 'genome');
  const arc = R.weighted(rnd, ARCHETYPES, (a) => a.w, (a) => a);
  const jit = (v, frac, lo, hi) => Math.max(lo, Math.min(hi, v * (1 + (rnd() - 0.5) * 2 * frac)));
  const kindMix = {}; for (const k in base.kindMix) kindMix[k] = Math.max(0.4, jit(base.kindMix[k], 0.45, 0.4, 200) * (arc.kind[k] || 1));
  const materials = {}; for (const m in base.materials) materials[m] = Math.max(0.05, jit(base.materials[m], 0.45, 0.05, 200) * (arc.mat[m] || 1));
  // qShift > 1 tilts the quality curve toward rarer tiers (later entries), < 1 toward crude.
  const qualityCurve = base.qualityCurve.map(([id, w], i) => [id, Math.max(0.2, w * Math.pow(arc.qShift, i - 1) * (1 + (rnd() - 0.5) * 0.5))]);
  return { n, archetype: arc.id, kindMix, materials, qualityCurve, affixRate: jit(base.affixRate, 0.25, 0.5, 1.0) };
}

const ITEMS = {
  AXES, KINDS, KIND_ORDER, MATERIALS, QUALITY, AFFIXES, GRADES,
  rollItem, forge, rollMany, scoreItem, nameItem,
  DEFAULT_GENOME, ARCHETYPES, rollGenome,
};
if (typeof globalThis !== 'undefined') globalThis.ITEMS = ITEMS;
export default ITEMS;
