// taxa.js — the OBJECT PHYLOGENY: the cladistic half of the item genome.
//
// Parallel to the civic genome (hoop/econ ROLES), but for things. "All items are tools — they DO
// something, even if that something is to decorate." So the root identity is a VERB. The tree:
//
//   KINGDOM (the verb — what it does)  →  PHYLUM (the body-plan — how it's shaped)  →  SPECIES (the leaf)
//
// This rank is HERITABLE/CLADISTIC: an item inherits its kingdom & phylum from its lineage, and the
// phylum fixes which sprite PRIMITIVE draws it. The orthogonal trait dials (genome.js TRAITS:
// durability, potency, mass, value, tech, ornament, complexity, provenance) cut ACROSS this tree —
// they mean the same thing on a blade or a lamp — so they live separately, layered on top.
//
// Today's v1 KINDS (blade, vessel, charm…) reappear here as PHYLA, now grouped under their verb and
// given sibling body-plans. Pure data + lookups; zero-dep; node-testable.

// ── KINGDOMS — the ten verbs of objects. glyph + accent (hoop palette) + a `does` gloss. ────────
// `bias` nudges trait means for the whole kingdom (a strike-thing leans potent; an adorn-thing leans
// ornamented). `phyla` lists the body-plans beneath it.
export const KINGDOMS = {
  strike:  { glyph: '⚔', accent: '#cf3b3b', does: 'applies force — cuts, crushes, pierces', bias: { potency: 0.25, durability: 0.10, mass: 0.10 } },
  craft:   { glyph: '⚒', accent: '#e0772f', does: 'shapes matter — makes and mends',        bias: { durability: 0.20, complexity: 0.12 } },
  ward:    { glyph: '✜', accent: '#33408f', does: 'protects the body — covers and blocks',   bias: { durability: 0.30, mass: 0.12 } },
  hold:    { glyph: '⚱', accent: '#566066', does: 'contains — carries and stores',           bias: { durability: 0.05 } },
  adorn:   { glyph: '✦', accent: '#f4bf62', does: 'signifies — decorates and marks rank',    bias: { ornament: 0.45, value: 0.25, mass: -0.20 } },
  lore:    { glyph: '❍', accent: '#5570d8', does: 'records — holds knowledge',               bias: { provenance: 0.25, complexity: 0.10 } },
  channel: { glyph: '✣', accent: '#b39bd8', does: 'focuses — invokes and directs',           bias: { potency: 0.20, ornament: 0.15, provenance: 0.15 } },
  light:   { glyph: '☀', accent: '#dfe7e2', does: 'reveals — illuminates',                   bias: { tech: 0.10, complexity: 0.10 } },
  sustain: { glyph: '❀', accent: '#5aa845', does: 'sustains — feeds and heals',              bias: { potency: 0.15, durability: -0.25, mass: -0.15 } },
  sound:   { glyph: '◍', accent: '#3bb0c9', does: 'plays — makes signal and song',           bias: { complexity: 0.20, ornament: 0.15 } },
};
export const KINGDOM_ORDER = Object.keys(KINGDOMS);

// ── PHYLA — body-plans under each kingdom. `prim` selects the sprite PRIMITIVE; `p` parameterises it ──
// (the same parametric Bauplan a real clade shares). `mats` is the material affinity; `base` are the
// raw stat scales (before genes/material) for mass(kg)/durability/potency/value. `species` are leaves.
export const PHYLA = {
  // strike
  blade:     { kingdom: 'strike', prim: 'long',   p: { head: 'tip', hilt: 'grip', edge: 1, len: 1.0 }, mats: { iron: 14, steel: 12, bronze: 8, silver: 3, bone: 3, stone: 2 }, base: { mass: 1.6, durability: 60, potency: 72, value: 40 }, species: ['Dagger', 'Sword', 'Cleaver', 'Rapier'] },
  haft:      { kingdom: 'strike', prim: 'long',   p: { head: 'axe', hilt: 'grip', len: 1.05 },          mats: { iron: 12, steel: 10, bronze: 8, stone: 6, wood: 5 },           base: { mass: 2.6, durability: 66, potency: 80, value: 38 }, species: ['Axe', 'Maul', 'Mace'] },
  point:     { kingdom: 'strike', prim: 'long',   p: { head: 'spike', hilt: 'knob', len: 1.25 },        mats: { iron: 12, steel: 9, bronze: 7, bone: 5, wood: 6 },             base: { mass: 1.8, durability: 55, potency: 76, value: 34 }, species: ['Spear', 'Pick', 'Lance'] },
  // craft
  percussor: { kingdom: 'craft',  prim: 'long',   p: { head: 'hammer', hilt: 'grip', len: 0.85 },       mats: { iron: 14, bronze: 9, steel: 7, wood: 8, stone: 6 },            base: { mass: 2.0, durability: 78, potency: 40, value: 22 }, species: ['Hammer', 'Mallet'] },
  graver:    { kingdom: 'craft',  prim: 'long',   p: { head: 'chisel', hilt: 'grip', len: 0.8 },        mats: { iron: 12, steel: 12, bronze: 6, bone: 3 },                    base: { mass: 0.9, durability: 70, potency: 48, value: 24 }, species: ['Chisel', 'Awl', 'Burin'] },
  gauge:     { kingdom: 'craft',  prim: 'panel',  p: { aspect: 1.8, marks: 1, thin: 1 },                mats: { wood: 12, bronze: 8, iron: 6, glass: 4, alloy: 3 },            base: { mass: 0.5, durability: 60, potency: 34, value: 28 }, species: ['Rule', 'Square', 'Caliper'] },
  // ward
  worn:      { kingdom: 'ward',   prim: 'garment',p: { length: 1.0, hood: 0 },                          mats: { cloth: 14, leather: 12, silver: 2, gold: 1 },                 base: { mass: 1.0, durability: 44, potency: 18, value: 34 }, species: ['Robe', 'Cloak', 'Tunic'] },
  plate:     { kingdom: 'ward',   prim: 'panel',  p: { aspect: 0.8, round: 1, studs: 1 },               mats: { iron: 12, steel: 14, bronze: 8, alloy: 4 },                   base: { mass: 6.0, durability: 92, potency: 30, value: 60 }, species: ['Breastplate', 'Pauldron'] },
  shield:    { kingdom: 'ward',   prim: 'disc',   p: { boss: 1, ring: 1 },                              mats: { wood: 8, iron: 10, steel: 10, bronze: 8, alloy: 3 },           base: { mass: 4.0, durability: 88, potency: 26, value: 46 }, species: ['Buckler', 'Roundshield', 'Kite'] },
  // hold
  open:      { kingdom: 'hold',   prim: 'vessel', p: { belly: 1.3, neck: 0, mouth: 1.4 },               mats: { clay: 12, glass: 10, bronze: 6, silver: 4, gold: 2 },          base: { mass: 0.9, durability: 34, potency: 18, value: 24 }, species: ['Bowl', 'Cup', 'Basin'] },
  necked:    { kingdom: 'hold',   prim: 'vessel', p: { belly: 1.0, neck: 1.2, mouth: 0.5 },             mats: { glass: 12, clay: 10, bronze: 6, silver: 4, gold: 2 },          base: { mass: 1.4, durability: 32, potency: 20, value: 30 }, species: ['Flask', 'Amphora', 'Ewer'] },
  chest:     { kingdom: 'hold',   prim: 'compound', p: { box: 1, lid: 1 },                              mats: { wood: 12, iron: 8, bronze: 6, leather: 6, steel: 3 },          base: { mass: 5.0, durability: 64, potency: 14, value: 40 }, species: ['Coffer', 'Casket', 'Crate'] },
  // adorn
  pendant:   { kingdom: 'adorn',  prim: 'disc',   p: { small: 1, gem: 1, chain: 1 },                    mats: { silver: 10, gold: 10, crystal: 8, bone: 5, bronze: 3 },        base: { mass: 0.25, durability: 50, potency: 36, value: 64 }, species: ['Amulet', 'Locket', 'Talisman'] },
  band:      { kingdom: 'adorn',  prim: 'disc',   p: { ring: 1, gem: 0.6, small: 1 },                   mats: { gold: 12, silver: 10, bronze: 6, crystal: 6, iron: 3 },        base: { mass: 0.1, durability: 60, potency: 40, value: 70 }, species: ['Ring', 'Circlet', 'Torc'] },
  gemset:    { kingdom: 'adorn',  prim: 'disc',   p: { gem: 1.4, facets: 1 },                           mats: { crystal: 12, gold: 8, silver: 6, glass: 6 },                  base: { mass: 0.15, durability: 44, potency: 48, value: 90 }, species: ['Brooch', 'Jewel', 'Seal'] },
  // lore
  codex:     { kingdom: 'lore',   prim: 'panel',  p: { aspect: 0.78, book: 1, spine: 1 },               mats: { paper: 14, leather: 10, bone: 3, silver: 2 },                  base: { mass: 1.6, durability: 36, potency: 18, value: 46 }, species: ['Tome', 'Grimoire', 'Ledger'] },
  scroll:    { kingdom: 'lore',   prim: 'long',   p: { scroll: 1, hilt: 'none', len: 1.0 },             mats: { paper: 14, leather: 8, cloth: 4 },                             base: { mass: 0.4, durability: 24, potency: 16, value: 38 }, species: ['Scroll', 'Map', 'Charter'] },
  tablet:    { kingdom: 'lore',   prim: 'panel',  p: { aspect: 0.85, tablet: 1 },                       mats: { stone: 10, clay: 10, bronze: 6, alloy: 4, crystal: 4 },        base: { mass: 2.2, durability: 70, potency: 20, value: 40 }, species: ['Slate', 'Sigil-Tablet'] },
  // channel
  rod:       { kingdom: 'channel',prim: 'long',   p: { head: 'orb', hilt: 'none', len: 1.3 },           mats: { wood: 12, crystal: 7, silver: 6, bronze: 4, bone: 3 },         base: { mass: 1.4, durability: 55, potency: 64, value: 50 }, species: ['Staff', 'Wand', 'Scepter'] },
  focus:     { kingdom: 'channel',prim: 'disc',   p: { orb: 1, glow: 1 },                               mats: { crystal: 12, glass: 8, silver: 5, gold: 4 },                  base: { mass: 0.8, durability: 40, potency: 70, value: 60 }, species: ['Orb', 'Lens', 'Prism'] },
  sigil:     { kingdom: 'channel',prim: 'disc',   p: { small: 1, rune: 1 },                             mats: { bone: 8, silver: 7, crystal: 7, gold: 4, stone: 4 },           base: { mass: 0.3, durability: 50, potency: 58, value: 52 }, species: ['Talisman', 'Charm', 'Ward-Token'] },
  // light
  lantern:   { kingdom: 'light',  prim: 'vessel', p: { lantern: 1, glass: 1, bail: 1, belly: 1.0 },     mats: { bronze: 12, iron: 8, glass: 8, silver: 3, alloy: 4 },          base: { mass: 1.2, durability: 46, potency: 38, value: 30 }, species: ['Lantern', 'Lamp'] },
  torch:     { kingdom: 'light',  prim: 'long',   p: { head: 'flame', hilt: 'grip', len: 1.05 },        mats: { wood: 12, iron: 6, bronze: 4 },                                base: { mass: 0.8, durability: 30, potency: 42, value: 16 }, species: ['Torch', 'Brand'] },
  beacon:    { kingdom: 'light',  prim: 'disc',   p: { rays: 1, glow: 1 },                              mats: { bronze: 8, glass: 8, alloy: 8, crystal: 6 },                  base: { mass: 2.0, durability: 56, potency: 50, value: 44 }, species: ['Beacon', 'Signal-Lamp'] },
  // sustain
  ration:    { kingdom: 'sustain',prim: 'disc',   p: { blob: 1 },                                       mats: { cloth: 6, leather: 5, paper: 6, clay: 4 },                     base: { mass: 0.5, durability: 12, potency: 30, value: 14 }, species: ['Ration', 'Loaf', 'Cake'] },
  draught:   { kingdom: 'sustain',prim: 'vessel', p: { belly: 0.8, neck: 1.0, mouth: 0.4, cork: 1 },    mats: { glass: 14, clay: 6, crystal: 4 },                              base: { mass: 0.5, durability: 22, potency: 56, value: 34 }, species: ['Draught', 'Tonic', 'Elixir'] },
  salve:     { kingdom: 'sustain',prim: 'vessel', p: { belly: 1.1, neck: 0.3, mouth: 1.0, lid: 1, squat: 1 }, mats: { clay: 10, glass: 8, bronze: 4 },                          base: { mass: 0.4, durability: 26, potency: 50, value: 30 }, species: ['Salve', 'Poultice', 'Balm'] },
  // sound
  string:    { kingdom: 'sound',  prim: 'compound', p: { instrument: 'string' },                        mats: { wood: 14, bone: 4, silver: 3, gold: 2 },                      base: { mass: 1.4, durability: 38, potency: 44, value: 48 }, species: ['Lute', 'Harp', 'Lyre'] },
  wind:      { kingdom: 'sound',  prim: 'long',   p: { head: 'bell', hilt: 'none', holes: 1, len: 1.1 },mats: { bronze: 10, wood: 8, silver: 5, bone: 5, alloy: 3 },           base: { mass: 0.7, durability: 42, potency: 46, value: 44 }, species: ['Horn', 'Flute', 'Pipe'] },
  percussion:{ kingdom: 'sound',  prim: 'disc',   p: { drum: 1 },                                       mats: { wood: 8, leather: 10, bronze: 6, alloy: 3 },                  base: { mass: 1.6, durability: 50, potency: 40, value: 36 }, species: ['Drum', 'Gong', 'Bell'] },
};
export const PHYLUM_ORDER = Object.keys(PHYLA);
export const phylaOf = (kingdom) => PHYLUM_ORDER.filter((p) => PHYLA[p].kingdom === kingdom);

// ── MATERIALS — the categorical trait, GATED BY TECH. `tech:[lo,hi]` is the era band in which the ──
// material is available (stone is primitive; alloy is ship-grade), so the tech gene shapes what a
// thing can be made of. factors scale the stat axes; color+sheen drive the sprite.
export const MATERIALS = {
  stone:   { name: 'Stone',   color: '#566066', sheen: 0.20, tech: [0.00, 0.32], weight: 1.8, value: 0.6, durability: 1.4, potency: 0.9 },
  bone:    { name: 'Bone',    color: '#d8cbb0', sheen: 0.25, tech: [0.00, 0.36], weight: 0.7, value: 0.8, durability: 0.7, potency: 1.0 },
  wood:    { name: 'Wood',    color: '#9b6b3a', sheen: 0.10, tech: [0.00, 0.52], weight: 0.6, value: 0.7, durability: 0.8, potency: 0.7 },
  clay:    { name: 'Clay',    color: '#b5734a', sheen: 0.15, tech: [0.04, 0.42], weight: 0.9, value: 0.5, durability: 0.5, potency: 0.6 },
  leather: { name: 'Leather', color: '#7a5230', sheen: 0.20, tech: [0.08, 0.56], weight: 0.5, value: 0.8, durability: 0.9, potency: 0.7 },
  cloth:   { name: 'Cloth',   color: '#b0607f', sheen: 0.18, tech: [0.10, 0.60], weight: 0.4, value: 0.7, durability: 0.5, potency: 0.5 },
  paper:   { name: 'Paper',   color: '#e8dcc0', sheen: 0.10, tech: [0.15, 0.70], weight: 0.3, value: 0.6, durability: 0.3, potency: 0.4 },
  bronze:  { name: 'Bronze',  color: '#c08a3e', sheen: 0.50, tech: [0.24, 0.70], weight: 1.2, value: 1.1, durability: 1.1, potency: 1.1 },
  iron:    { name: 'Iron',    color: '#6b7a82', sheen: 0.32, tech: [0.30, 0.76], weight: 1.4, value: 0.9, durability: 1.3, potency: 1.2 },
  glass:   { name: 'Glass',   color: '#7fd8d0', sheen: 0.85, tech: [0.35, 0.86], weight: 0.7, value: 1.0, durability: 0.4, potency: 0.8 },
  silver:  { name: 'Silver',  color: '#dfe7e2', sheen: 0.80, tech: [0.40, 0.90], weight: 1.1, value: 1.6, durability: 1.0, potency: 1.1 },
  gold:    { name: 'Gold',    color: '#f4bf62', sheen: 0.95, tech: [0.45, 0.95], weight: 1.6, value: 2.4, durability: 0.7, potency: 0.9 },
  steel:   { name: 'Steel',   color: '#aeb8c2', sheen: 0.62, tech: [0.55, 0.95], weight: 1.3, value: 1.3, durability: 1.5, potency: 1.4 },
  crystal: { name: 'Crystal', color: '#b39bd8', sheen: 0.92, tech: [0.60, 1.00], weight: 0.9, value: 2.0, durability: 0.6, potency: 1.5 },
  alloy:   { name: 'Alloy',   color: '#8fa0b0', sheen: 0.70, tech: [0.80, 1.00], weight: 0.9, value: 1.7, durability: 1.6, potency: 1.5 },
};
export const MATERIAL_ORDER = Object.keys(MATERIALS);
// materials available at a tech level (band contains tech), with their phylum-affinity weight.
export function materialsAt(phylumId, tech) {
  const aff = PHYLA[phylumId].mats;
  return MATERIAL_ORDER
    .filter((m) => tech >= MATERIALS[m].tech[0] && tech <= MATERIALS[m].tech[1])
    .map((m) => [m, aff[m] || 0.5])       // off-affinity materials are still possible, just rarer
    .filter(([, w]) => w > 0);
}

const TAXA = { KINGDOMS, KINGDOM_ORDER, PHYLA, PHYLUM_ORDER, phylaOf, MATERIALS, MATERIAL_ORDER, materialsAt };
if (typeof globalThis !== 'undefined') globalThis.TAXA = TAXA;
export default TAXA;
