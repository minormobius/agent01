// stats.js — the STAT SPINE: FLESH · CHASSIS · ANIMA. The shared substrate under both character
// creation and combat. Sci-fi technomagic; everyone is a little bit robot, so no domain is ever zero.
//
//   FLESH   — wetware. The meat that wants to live: vitality, repair, nerve.
//   CHASSIS — hardware. The frame that bears load: armour, force, a power core.
//   ANIMA   — software-soul. The ghost that wills: resolve, cognition, and FLUX (the technomagic).
//
// A character is a BLEND of the three (weights that sum to 1, each ≥ a floor) times a POWER scalar.
// The blend expresses into nine attributes; the dominant pair names a CAST (a metallic temperament).
// Technomagic is modelled as CROSS-DOMAIN CONVERSIONS — the soul overclocking the frame, the core
// stoking the meat's repair — which are the seeds the skill system (combat) will grow from.
//
// Pure + deterministic (seeded), zero-dep, node-testable. (n, vocation) ⇒ the same person everywhere.

import { rng, R } from './sprite/item/prng.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ri = (x) => Math.round(x);

// ── THE TRIAD ─────────────────────────────────────────────────────────────────────────────────
export const TRIAD = {
  flesh:   { label: 'Flesh',   glyph: '❤', accent: '#cf3b3b', gloss: 'wetware — the meat that wants to live' },
  chassis: { label: 'Chassis', glyph: '⬡', accent: '#7fd8d0', gloss: 'hardware — the frame that bears load' },
  anima:   { label: 'Anima',   glyph: '✦', accent: '#b39bd8', gloss: 'software-soul — the ghost that wills' },
};
export const TRIAD_ORDER = ['flesh', 'chassis', 'anima'];
const FLOOR = 0.1;          // everyone is a little bit robot (and a little bit meat, and a little haunted)

// ── THE NINE ATTRIBUTES — three per domain. `base` is the value at blend-weight 1.0 & power 10. ──
export const ATTRS = {
  vitality: { domain: 'flesh',   label: 'Vitality', glyph: '✚', base: 14, gloss: 'the depth of the HP well' },
  regen:    { domain: 'flesh',   label: 'Regen',    glyph: '♻', base: 8,  gloss: 'self-repair between blows' },
  nerve:    { domain: 'flesh',   label: 'Nerve',    glyph: '⚡', base: 10, gloss: 'resists stun & fear; crits under pressure' },
  frame:    { domain: 'chassis', label: 'Frame',    glyph: '⛨', base: 12, gloss: 'plating — soaks incoming force' },
  servo:    { domain: 'chassis', label: 'Servo',    glyph: '⚙', base: 12, gloss: 'actuated force — strikes & carry' },
  core:     { domain: 'chassis', label: 'Core',     glyph: '◉', base: 10, gloss: 'the power cell technomagic draws on' },
  will:     { domain: 'anima',   label: 'Will',     glyph: '☥', base: 11, gloss: 'resolve — resists anima attacks' },
  cogit:    { domain: 'anima',   label: 'Cogit',    glyph: '❍', base: 10, gloss: 'cognition — accuracy & how fast you learn' },
  flux:     { domain: 'anima',   label: 'Flux',     glyph: '✣', base: 9,  gloss: 'the technomagic charge you spend' },
};
export const ATTR_ORDER = Object.keys(ATTRS);

// ── VOCATION ↔ CIVIC TREE — class IS a civic role. Each leans the triad + nudges attributes. ─────
// The 13 civic verbs (the same ROLES that breed towns in econ/ and dress sprites in v3/sprite-core).
// `lean` is a triad bias added before normalisation; `kit` hints the item-kingdom the starting pack
// should favour (wires character → inventory). `tag` is the in-world title.
export const VOCATIONS = {
  dwell:   { lean: { flesh: .5, chassis: .3, anima: .2 }, kit: 'hold',    tag: 'Tenant',     gloss: 'keeps a berth in the hull; endures' },
  grow:    { lean: { flesh: .7, chassis: .1, anima: .2 }, kit: 'sustain', tag: 'Tender',     gloss: 'coaxes life from the green decks' },
  make:    { lean: { flesh: .2, chassis: .7, anima: .1 }, kit: 'craft',   tag: 'Wright',     gloss: 'shapes matter; reads a machine by feel' },
  mend:    { lean: { flesh: .3, chassis: .5, anima: .2 }, kit: 'craft',   tag: 'Mender',     gloss: 'patches flesh and frame alike' },
  trade:   { lean: { flesh: .3, chassis: .2, anima: .5 }, kit: 'adorn',   tag: 'Factor',     gloss: 'moves goods and reads people' },
  serve:   { lean: { flesh: .5, chassis: .2, anima: .3 }, kit: 'hold',    tag: 'Steward',    gloss: 'tends others; quietly indispensable' },
  play:    { lean: { flesh: .4, chassis: .1, anima: .5 }, kit: 'sound',   tag: 'Player',     gloss: 'makes signal and song; quick of hand' },
  heal:    { lean: { flesh: .6, chassis: .1, anima: .3 }, kit: 'sustain', tag: 'Chirurgeon', gloss: 'closes wounds; knows the body as a system' },
  learn:   { lean: { flesh: .1, chassis: .2, anima: .7 }, kit: 'lore',    tag: 'Adept',      gloss: 'reads the old code; remembers' },
  worship: { lean: { flesh: .1, chassis: .1, anima: .8 }, kit: 'channel', tag: 'Celebrant',  gloss: 'tends the ship-soul; channels flux' },
  govern:  { lean: { flesh: .3, chassis: .3, anima: .4 }, kit: 'ward',    tag: 'Warden',     gloss: 'holds the line; bears responsibility' },
  move:    { lean: { flesh: .5, chassis: .4, anima: .1 }, kit: 'strike',  tag: 'Runner',     gloss: 'carries word and cargo through the decks' },
  store:   { lean: { flesh: .2, chassis: .6, anima: .2 }, kit: 'hold',    tag: 'Keeper',     gloss: 'guards the stores; built like a vault' },
};
export const VOCATION_ORDER = Object.keys(VOCATIONS);

// ── CASTS — the dominant-pair temperament. A character's "what are you" in one word. ─────────────
// keyed by `${dominant}.${second}` (the two heaviest domains, in order).
export const CASTS = {
  'flesh.flesh':   { label: 'Quick',          gloss: 'almost all meat — fast, fragile, alive' },
  'flesh.chassis': { label: 'Brute',          gloss: 'meat over iron — heavy and stubborn' },
  'flesh.anima':   { label: 'Feverish',       gloss: 'meat lit by will — runs hot, burns out' },
  'chassis.chassis':{ label: 'Wrought',        gloss: 'almost all frame — a walking redoubt' },
  'chassis.flesh': { label: 'Reinforced',     gloss: 'iron sheathing a beating heart' },
  'chassis.anima': { label: 'Haunted Engine', gloss: 'a frame with something thinking inside it' },
  'anima.anima':   { label: 'Wired',          gloss: 'almost all soul — thin body, vast inner weather' },
  'anima.flesh':   { label: 'Mystic',         gloss: 'soul rooted in living tissue' },
  'anima.chassis': { label: 'Construct',      gloss: 'a will poured into a machine' },
};
export function castOf(triad) {
  const o = TRIAD_ORDER.slice().sort((a, b) => triad[b] - triad[a]);
  const spread = triad[o[0]] - triad[o[1]];
  const key = spread > 0.34 ? `${o[0]}.${o[0]}` : `${o[0]}.${o[1]}`;
  return { key, dominant: o[0], second: o[1], ...(CASTS[key] || CASTS[`${o[0]}.${o[0]}`]) };
}

// ── TECHNOMAGIC — cross-domain conversions. The seeds the skill trees (combat) grow from. ────────
// from/to are domains; `rate` is how much of the spent resource becomes the gained one.
export const CONVERSIONS = [
  { key: 'overclock', from: 'anima',   to: 'chassis', spend: 'flux',     gain: 'servo', rate: 1.4, gloss: 'the soul drives the frame past spec — burn Flux for raw Servo' },
  { key: 'graft',     from: 'chassis', to: 'flesh',   spend: 'core',     gain: 'regen', rate: 1.2, gloss: 'route the power core into the meat — Core stokes repair' },
  { key: 'adrenal',   from: 'flesh',   to: 'anima',   spend: 'vitality', gain: 'flux',  rate: 0.9, gloss: 'spend life to charge the ghost — Vitality bleeds into Flux' },
  { key: 'harden',    from: 'anima',   to: 'chassis', spend: 'will',     gain: 'frame', rate: 1.0, gloss: 'set your jaw and the plating answers — Will into Frame' },
  { key: 'lucid',     from: 'flesh',   to: 'anima',   spend: 'nerve',    gain: 'cogit', rate: 1.1, gloss: 'cold focus in the moment — Nerve sharpens Cogit' },
];

// ── ROLL — a blend from (seed, vocation). Archetype-style correlated lean + seeded jitter. ───────
export function rollTriad(n, vocation) {
  const r = rng(n, 'triad');
  const lean = (VOCATIONS[vocation] || VOCATIONS.dwell).lean;
  let w = { flesh: 0, chassis: 0, anima: 0 };
  for (const d of TRIAD_ORDER) w[d] = clamp01((lean[d] ?? 0.33) + (r() - 0.5) * 0.5);
  return normTriad(w);
}
export function normTriad(w) {
  // share the weights, then lift each onto a floor so no domain is ever truly absent (sum stays 1):
  // out[d] = FLOOR + (1-3·FLOOR)·share[d]  ⇒  each ≥ FLOOR, Σ = 1.
  const raw = {}; let s = 0;
  for (const d of TRIAD_ORDER) { raw[d] = Math.max(0, w[d] || 0); s += raw[d]; }
  const out = {};
  for (const d of TRIAD_ORDER) { const share = s > 0 ? raw[d] / s : 1 / 3; out[d] = FLOOR + (1 - 3 * FLOOR) * share; }
  return out;
}

// ── EXPRESS — blend × power → the nine attributes. Each attribute scales with its domain weight. ─
// At blend-weight = 1/3 (even) and power 10, an attribute sits near 0.55·base; a maxed domain ≈ base.
export function deriveAttrs(triad, power = 10, n = 0) {
  const r = rng(n || 1, 'attr');
  const lvl = power / 10;
  const out = {};
  for (const k of ATTR_ORDER) {
    const A = ATTRS[k], w = triad[A.domain];
    const jitter = 0.86 + r() * 0.28;                       // ±14% per-attribute spread
    out[k] = Math.max(1, ri(A.base * (0.35 + 1.0 * w) * lvl * jitter));
  }
  return out;
}

// ── CHARACTERISTICS — weird, procedurally-generated quirks. Each leans a domain & nudges attrs. ──
// The "huge space": flavour × domain × magnitude, seeded. Mechanically small but flavourful.
const CHARACTERISTIC_POOL = [
  { domain: 'chassis', label: 'salvaged-servo arm',     mods: { servo: 3, regen: -1 }, gloss: 'one limb is scavenged actuator; it hits harder, heals worse' },
  { domain: 'chassis', label: 'ablative plating',       mods: { frame: 3, cogit: -1 }, gloss: 'bolt-on armour slabs; slow to think, hard to dent' },
  { domain: 'chassis', label: 'overbuilt frame',        mods: { frame: 2, vitality: 1 }, gloss: 'built like a bulkhead' },
  { domain: 'anima',   label: 'dreams in machine code', mods: { flux: 3, nerve: -1 }, gloss: 'the sleep-cycle leaks into the waking; rich in flux, jumpy' },
  { domain: 'anima',   label: 'second voice',           mods: { will: 2, cogit: 2, vitality: -2 }, gloss: 'something else thinks alongside you; brilliant, thin' },
  { domain: 'anima',   label: 'haloed in static',       mods: { flux: 2, will: 1 }, gloss: 'a faint corona of interference; the ship-soul knows you' },
  { domain: 'flesh',   label: 'phantom-limb empathy',   mods: { nerve: 2, will: 1 }, gloss: 'feels others’ wounds; reads a room cold' },
  { domain: 'flesh',   label: 'fast-clotting blood',    mods: { regen: 3, flux: -1 }, gloss: 'closes wounds in seconds; dampens the ghost' },
  { domain: 'flesh',   label: 'adrenal surplus',        mods: { nerve: 2, servo: 1, regen: -1 }, gloss: 'always one breath from fight-or-flight' },
  { domain: 'chassis', label: 'cooling-fan hum',        mods: { core: 3, nerve: -1 }, gloss: 'runs cold and quiet — big core, no startle reflex' },
  { domain: 'anima',   label: 'lapsed celebrant',       mods: { flux: 2, frame: -1 }, gloss: 'once tended the ship-soul; still half-tuned to it' },
  { domain: 'flesh',   label: 'grafted gills',          mods: { vitality: 2, servo: -1 }, gloss: 'breathes the wet decks; deep-lunged, soft-handed' },
  { domain: 'chassis', label: 'magnetised soles',       mods: { frame: 1, servo: 2 }, gloss: 'never loses footing in spin-gravity' },
  { domain: 'anima',   label: 'eidetic cache',          mods: { cogit: 3, regen: -1 }, gloss: 'forgets nothing; the body pays the upkeep' },
];
export function rollCharacteristics(n, k = 2) {
  const r = rng(n, 'quirk');
  const pool = CHARACTERISTIC_POOL.slice();
  const out = [];
  for (let i = 0; i < k && pool.length; i++) {
    const idx = Math.floor(r() * pool.length);
    out.push({ key: `q${n % 9973}-${i}`, ...pool.splice(idx, 1)[0] });
  }
  return out;
}
export function applyCharacteristics(attrs, chars) {
  const out = { ...attrs };
  for (const c of chars || []) for (const k in c.mods) out[k] = Math.max(1, (out[k] || 0) + c.mods[k]);
  return out;
}

// ── NAMING — sci-fi crew names, deterministic from seed. ─────────────────────────────────────────
const GIVEN = ['Vex', 'Sol', 'Pell', 'Mara', 'Cael', 'Iris', 'Doro', 'Tann', 'Wick', 'Esh', 'Bryn', 'Orr', 'Lune', 'Sabel', 'Cinder', 'Quill'];
const SUFFIX = ['-7', '-of-Hull-9', ' Vant', ' Okra', ' Sed', ' Marrow', ' Halt', ' Tibb', ' Cassiel', ' Drey', '-Two', ' Voss'];
export function nameCharacter(n, vocation, cast) {
  const r = rng(n, 'name');
  return R.pick(r, GIVEN) + R.pick(r, SUFFIX);
}

// ── ASSEMBLE — the whole person. The object combat + the HUD + the sprite consume. ───────────────
export function rollCharacter(n, opts = {}) {
  n = (n >>> 0) || 1;
  const vocation = opts.vocation && VOCATIONS[opts.vocation] ? opts.vocation
    : R.pick(rng(n, 'voc'), VOCATION_ORDER);
  const power = opts.power || 10;
  const triad = opts.triad ? normTriad(opts.triad) : rollTriad(n, vocation);
  const cast = castOf(triad);
  const characteristics = opts.characteristics || rollCharacteristics(n, opts.quirks ?? 2);
  const baseAttrs = deriveAttrs(triad, power, n);
  const attrs = applyCharacteristics(baseAttrs, characteristics);
  const sprite = opts.sprite || { seed: `mega:char:${n}`, role: vocation, arch: 'balanced', size: 17 };
  return {
    n, seed: n, name: opts.name || nameCharacter(n, vocation, cast),
    vocation, vocTag: VOCATIONS[vocation].tag, kit: VOCATIONS[vocation].kit,
    power, triad, cast, characteristics, attrs, sprite,
  };
}

// ── DERIVE COMBAT — the character (+ what they hold) → the numbers combat will read. ─────────────
// Aligns to story/engine.js's BASE_HP/ATK/DEF so the two systems mesh. `weapon`/`armour` are items
// from the item engine (their expressed stats feed in); both optional (an unarmed brawler still fights).
export const BASE_HP = 20, BASE_ATK = 2, BASE_DEF = 1;
export function deriveCombat(character, { weapon = null, armour = null } = {}) {
  const a = character.attrs;
  const wPot = weapon?.stats?.potency || 0, wMass = weapon?.stats?.mass || 0;
  const aDur = armour?.stats?.durability || 0, aMass = armour?.stats?.mass || 0;
  const hp = ri(BASE_HP + a.vitality * 1.6 + a.frame * 0.7);
  const atk = ri(BASE_ATK + a.servo * 0.45 + wPot * 0.12 + a.nerve * 0.1);   // weapon helps, doesn't dominate
  const def = ri(BASE_DEF + a.frame * 0.5 + aDur * 0.1);
  const speed = +(1 + a.nerve * 0.03 - (wMass + aMass) * 0.04).toFixed(2);   // load slows you
  const accuracy = +(0.6 + a.cogit * 0.018).toFixed(2);                       // cognition → hit chance
  const crit = +(0.03 + a.nerve * 0.006).toFixed(3);                          // nerve → crit
  const fluxPool = ri(a.flux * 1.5 + a.core * 0.5);                           // technomagic budget
  return { hp, atk, def, speed, accuracy, crit, fluxPool, power: character.power };
}

const STATS = { TRIAD, ATTRS, VOCATIONS, CASTS, CONVERSIONS, rollCharacter, deriveAttrs, deriveCombat, castOf };
if (typeof globalThis !== 'undefined') globalThis.MEGA_STATS = STATS;
export default STATS;
