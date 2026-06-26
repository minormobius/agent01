// chunkroller/biomes.js — CHUNK BIOMES + the slider rollup that biases room creation.
//
// A chunk biome is a programme: a bias on WHICH rooms a chunk grows. The lever is the engine's additive
// `roleMix` override (v099/v7/foam.js drawRole/castCharacter, default = the wild-type ROLE_MIX) — so a
// biome/slider set just reweights ROLE_MIX and hands it to solveChunk. Pure data + one pure function;
// node-tested. The sliders are the user-facing characteristics; a biome is a named slider preset.

import { ROLE_MIX } from '../v099/econ/econ.js';

// the slider characteristics — each owns a group of roles it scales. 1.0 = wild type; >1 grows that
// part of the programme, <1 shrinks it. "significantly bias room creation" = move these off 1.
export const SLIDERS = [
  { key: 'homes', label: 'Homes', roles: ['dwell'], hint: 'residential density' },
  { key: 'industry', label: 'Industry', roles: ['make', 'mend', 'trade', 'store'], hint: 'the productive trades' },
  { key: 'greenery', label: 'Greenery', roles: ['grow'], hint: 'gardens & green decks' },
  { key: 'lore', label: 'Lore', roles: ['learn', 'worship'], hint: 'the sacred & the studied' },
  { key: 'leisure', label: 'Leisure', roles: ['play', 'serve'], hint: 'third places — café, pitch, hall' },
  { key: 'care', label: 'Care', roles: ['heal'], hint: 'clinics' },
  { key: 'order', label: 'Order', roles: ['govern', 'move'], hint: 'the civic & the transit spine' },
];
const OWNER = {}; for (const s of SLIDERS) for (const r of s.roles) OWNER[r] = s.key;

export const NEUTRAL = Object.fromEntries(SLIDERS.map((s) => [s.key, 1]));
export const SLIDER_MAX = 3;

// sliders { homes, industry, … } → a biased ROLE_MIX (same [role, weight][] shape econ uses). All-1 ⇒
// byte-identical to the wild-type ROLE_MIX, so the chunk reproduces the game's default.
export function mixFromSliders(vals = NEUTRAL) {
  return ROLE_MIX.map(([role, w]) => [role, Math.max(0.01, w * (vals[OWNER[role]] == null ? 1 : vals[OWNER[role]]))]);
}

// the resulting role share (normalized to %), for the readout — what the chunk is biased toward.
export function mixShares(vals = NEUTRAL) {
  const mix = mixFromSliders(vals), tot = mix.reduce((s, m) => s + m[1], 0) || 1;
  return mix.map(([role, w]) => [role, w / tot]).sort((a, b) => b[1] - a[1]);
}

// named biomes = slider presets, each a "flourishing society with room variety".
export const BIOMES = {
  wild: { label: 'Wild type', sliders: { ...NEUTRAL } },
  commons: { label: 'The Commons', sliders: { homes: 0.8, industry: 0.6, greenery: 1.2, lore: 1.5, leisure: 2.2, care: 1.3, order: 0.9 } },
  market: { label: 'Market Ward', sliders: { homes: 0.7, industry: 2.0, greenery: 0.5, lore: 0.9, leisure: 1.6, care: 0.8, order: 1.0 } },
  garden: { label: 'Garden Terrace', sliders: { homes: 0.9, industry: 0.4, greenery: 2.8, lore: 1.1, leisure: 1.2, care: 1.0, order: 0.7 } },
  foundry: { label: 'Foundry Row', sliders: { homes: 0.7, industry: 2.6, greenery: 0.4, lore: 0.6, leisure: 0.7, care: 0.9, order: 1.1 } },
  cloister: { label: 'Cloister', sliders: { homes: 0.6, industry: 0.4, greenery: 1.0, lore: 2.8, leisure: 0.8, care: 1.3, order: 1.1 } },
  seat: { label: 'Civic Seat', sliders: { homes: 0.7, industry: 0.7, greenery: 0.7, lore: 1.3, leisure: 1.2, care: 1.1, order: 2.8 } },
  dormitory: { label: 'Dormitory', sliders: { homes: 2.0, industry: 0.8, greenery: 0.6, lore: 0.6, leisure: 0.6, care: 0.6, order: 0.6 } },
};

// a tint per biome, for the floor "ward map" (each chunk painted by its biome).
export const BIOME_COLOR = {
  wild: '#6b7280', commons: '#3bb0c9', market: '#cf3b3b', garden: '#5aa845',
  foundry: '#e0772f', cloister: '#b39bd8', seat: '#5570d8', dormitory: '#d9b24a',
};

// a biome may steer the GRAND ANCHOR roles too — the civic centrepiece a big pocket plants (solveChunk
// `grand`). Defaults to rooms.js GRAND_ROLES when a biome has no override.
export const BIOME_GRAND = {
  commons: ['serve', 'play', 'learn'], market: ['trade', 'serve'], garden: ['grow', 'serve'],
  foundry: ['make', 'store'], cloister: ['worship', 'learn'], seat: ['govern', 'learn'], dormitory: ['serve', 'play'],
};
