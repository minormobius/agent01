// verbflow.js — THE FLAVOUR PALETTE for upperrind. Pure, no canvas, node-testable.
//
// THE DOMINANT-VERBS PALETTE. Every white thread carries a faction WARD whose `exclusive` verb is
// that thread's dominant verb (mend / worship / govern / grow / learn / play — the six read
// distinctly, one per white). Production threads have no ward verb; their dominant "verb" is the
// make of their own engine, so they wear the engine hue. This module owns the verb→colour map and
// the (world,key)→verb / →floor-hue resolvers.
//
// The concourse's FIELD (the flux lines and their flow) is a separate concern — see fluxfield.js.
// Pinned by verbflow.selftest.mjs. Nothing here touches the pocket kernel — this is presentation
// over the exact same topology.

const TAU = Math.PI * 2;

// ── colour helpers (hex ↔ rgb, mix) ──
export const vhex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const vmix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const vrgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// THE PALETTE. The six ward verbs first (the ones that actually land on white concourses — each a
// distinct hue: restorative green, votive gold, order blue, verdant lime, inquiry cyan, levity
// magenta). The remaining faction/room verbs are included so a legend can name any verb the mix
// throws up; they never collide with the six on a single floor.
export const VERB_COLORS = {
  mend: '#5fbf86', worship: '#d9a24a', govern: '#5f82e6', grow: '#8fce4e', learn: '#46cfef', play: '#e879b4',
  move: '#e0954e', trade: '#d7b24f', make: '#e07a4e', store: '#8892a3', dwell: '#b48ead', serve: '#7fc9a8',
};
const VERB_FALLBACK = '#7f8a9a';
export const verbColor = (verb) => VERB_COLORS[verb] || VERB_FALLBACK;

// the ordered ward verbs (for the legend), in the canonical faction order R·C·D × two roles
export const WARD_VERBS = ['mend', 'worship', 'govern', 'grow', 'learn', 'play'];

// the dominant verb of a thread — null for anything without a ward (commons / bridges / engines)
export function dominantVerb(world, key) {
  if (key && key[0] === 'W' && key !== 'CW') {
    const wp = world.warps[+key.slice(1)];
    return wp && wp.ward ? wp.ward.exclusive : null;
  }
  return null;
}

// the CONCOURSE floor hue for a thread, as an [r,g,b]:
//   • white  → its dominant verb's colour (the verbs palette)
//   • engine → its own engine hue (production, colour-coded by which engine makes)
//   • CP works commons → gold (the nexus register)   • CW ops commons / X interface → teal
export function floorHue(world, key, TEAL = [127, 216, 208]) {
  const v = dominantVerb(world, key);
  if (v) return vhex(verbColor(v));
  if (key && key[0] === 'P') { const e = world.wefts[+key.slice(1)]; return e && e.color ? vhex(e.color) : [...TEAL]; }
  if (key === 'CP') return vhex('#d9b24a');
  return [...TEAL];   // CW commons, X interfaces — the shared, unflavoured floor
}

// The FLOW/FLUX of the concourse (the field lines and their direction) lives in fluxfield.js — this
// module owns only the flavour PALETTE and its resolvers.

if (typeof globalThis !== 'undefined') globalThis.RindVerbFlow = { VERB_COLORS, verbColor, dominantVerb, floorHue, WARD_VERBS };
