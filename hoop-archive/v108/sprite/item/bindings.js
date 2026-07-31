// bindings.js — the ITEM ↔ PLACE AFFINITY MATRIX.
//
// ┌─ FOR THE PLACE-SIDE OWNER (econ / hoop civic genome) ──────────────────────────────────────┐
// │ This is authored on the item-engine branch as the SOURCE OF TRUTH for how item-KINGDOMS     │
// │ relate to civic-ROLES. It is intentionally NOT wired into econ here (cross-package). On      │
// │ merge, fold it in two ways:                                                                  │
// │   1. SUPPLY WEB: treat item-kingdoms as flow tokens. A role's `makes` set are its `out`; its │
// │      `wants` set are its `in`. econ's existing `in → nearest out` graph then BECOMES the     │
// │      item↔place map for free — no second graph to maintain.                                  │
// │   2. HOARDS: `hoardForPlace(place)` turns a place's (role, domain) into a hoard genome, so    │
// │      the loot/wares AT a place are just that place's hoard (genome.js rollItem(n, hoard)).    │
// │                                                                                              │
// │ The map is authored at the VERB level (13 roles × 10 kingdoms ≈ a sparse 130-cell table), so │
// │ it stays small and expands combinatorially to every species × every building. It is a true  │
// │ many-to-many relation (govern `wears` adorn AND `wants` lore AND `holds` channel).           │
// └──────────────────────────────────────────────────────────────────────────────────────────┘
//
// Pure, zero-dep beyond taxa/genome; node-testable.

import { KINGDOM_ORDER } from './taxa.js';
import { DEFAULT_HOARD } from './genome.js';

// The 13 civic verbs (source of truth: hoop/econ.js ROLES). Listed here so this file is self-
// contained for review; the place side already owns the canonical list.
export const CIVIC_ROLES = ['dwell', 'grow', 'make', 'mend', 'trade', 'serve', 'play', 'heal', 'learn', 'worship', 'govern', 'move', 'store'];
// econ DOMAINS (the matter a domain-parameterised role works in). Used to refine make/mend/trade/store.
export const CIVIC_DOMAINS = ['grain', 'fiber', 'metal', 'wood', 'glass', 'brew', 'clay', 'oil', 'paper', 'spice'];

// ── THE MATRIX — per civic role, the item-kingdoms it relates to, by RELATION TYPE + weight ─────
//   makes  → the place PRODUCES these (its supply-web `out`)
//   wants  → the place CONSUMES/NEEDS these (its supply-web `in`)
//   holds  → the place STOCKS/SELLS these (inventory present, not produced)
//   wears  → the place DISPLAYS/USES these as part of its function (regalia, implements)
// `any: true` means "the whole catalog" (a market/warehouse stocks everything) — resolved to the
// wild kingdom mix.
export const BINDINGS = {
  dwell:   { wants: { hold: 1.0, light: 0.8, sustain: 1.0, adorn: 0.5 }, holds: { hold: 0.8, sustain: 0.6 } },
  grow:    { makes: { sustain: 1.0 }, wants: { craft: 0.6 } },
  make:    { makes: { craft: 1.0 }, wants: { craft: 0.3 } },              // + DOMAIN_KINGDOM[domain]
  mend:    { makes: { craft: 1.0 }, wants: { craft: 0.6, strike: 0.6, ward: 0.6, hold: 0.4 } },
  trade:   { holds: { any: true }, wants: {} },
  serve:   { wants: { hold: 1.0, sustain: 0.8 }, holds: { sustain: 0.7 } },
  play:    { wants: { sound: 1.0 }, holds: { sound: 0.8 }, makes: { sound: 0.4 } },
  heal:    { makes: { sustain: 1.0 }, wants: { sustain: 0.8, hold: 0.5 } },
  learn:   { makes: { lore: 1.0 }, wants: { lore: 0.6, light: 0.5 }, holds: { lore: 0.6 } },
  worship: { wears: { adorn: 1.0, channel: 1.0 }, wants: { adorn: 0.6, channel: 0.8, light: 0.5 }, makes: { channel: 0.4 } },
  govern:  { wears: { adorn: 1.0, channel: 0.8 }, wants: { lore: 0.8 }, holds: { lore: 0.5 } },
  move:    { wants: { hold: 1.0, light: 0.7 }, holds: { hold: 0.6 } },
  store:   { holds: { any: true } },
};

// domain → the item-kingdoms a `make`/`mend` of that domain emits (couples to econ DOMAINS).
export const DOMAIN_KINGDOM = {
  grain: { sustain: 1.0 }, fiber: { ward: 1.0 }, metal: { strike: 1.0, craft: 0.8 },
  wood: { craft: 0.8, hold: 0.7, sound: 0.5 }, glass: { hold: 0.8, light: 0.7 }, brew: { sustain: 0.9, hold: 0.4 },
  clay: { hold: 1.0 }, oil: { light: 1.0 }, paper: { lore: 1.0 }, spice: { sustain: 1.0 },
};

// per-role trait nudges (so a govern hoard skews ornate/storied, a make hoard skews sturdy/complex).
const ROLE_TRAITS = {
  make: { durability: 0.1, complexity: 0.1 }, mend: { durability: 0.12 },
  trade: { value: 0.12 }, govern: { ornament: 0.2, provenance: 0.2, value: 0.12 },
  worship: { ornament: 0.25, provenance: 0.2 }, learn: { provenance: 0.15, complexity: 0.12 },
  heal: { potency: 0.12, durability: -0.1 }, dwell: { ornament: -0.08 }, grow: { value: -0.1 },
};

// ── hoardForPlace(place) → a hoard genome (shape matches genome.js rollHoard output) ────────────
// `place` = { role, domain?, techMean? }. The loot/wares at a place: rollItem(n, hoardForPlace(place)).
export function hoardForPlace({ role, domain, techMean = 0.45 } = {}) {
  const b = BINDINGS[role] || {};
  const mix = {};
  const add = (set, scale = 1) => { if (!set) return; if (set.any) { for (const k of KINGDOM_ORDER) mix[k] = (mix[k] || 0) + DEFAULT_HOARD.kingdomMix[k] * scale; return; } for (const k in set) mix[k] = (mix[k] || 0) + set[k] * scale; };
  add(b.makes, 1.4); add(b.wears, 1.0); add(b.holds, 0.8); add(b.wants, 0.3);
  if (domain && DOMAIN_KINGDOM[domain]) add(DOMAIN_KINGDOM[domain], 1.6);
  if (!Object.keys(mix).length) for (const k in DEFAULT_HOARD.kingdomMix) mix[k] = DEFAULT_HOARD.kingdomMix[k];
  // scale into a sane weight band (so it reads like a kingdomMix)
  const max = Math.max(...Object.values(mix));
  for (const k in mix) mix[k] = Math.max(0.2, (mix[k] / max) * 12);
  const traitMeans = { ...DEFAULT_HOARD.traitMeans };
  const nud = ROLE_TRAITS[role] || {}; for (const t in nud) traitMeans[t] = Math.max(0, Math.min(1, (traitMeans[t] ?? 0.5) + nud[t]));
  return { archetype: `place:${role}${domain ? '/' + domain : ''}`, kingdomMix: mix, traitMeans, techMean, techSpread: 0.16, spread: 0.28 };
}

// ── reverse lookup — which roles make/want/hold/wear a given item-kingdom (for the item side + UI) ──
export function bindingsFor(kingdom) {
  const out = { makes: [], wants: [], holds: [], wears: [] };
  for (const role of CIVIC_ROLES) { const b = BINDINGS[role]; if (!b) continue; for (const rel of ['makes', 'wants', 'holds', 'wears']) { const s = b[rel]; if (s && (s.any || s[kingdom])) out[rel].push(role); } }
  return out;
}

const BIND = { CIVIC_ROLES, CIVIC_DOMAINS, BINDINGS, DOMAIN_KINGDOM, hoardForPlace, bindingsFor };
if (typeof globalThis !== 'undefined') globalThis.BIND = BIND;
export default BIND;
