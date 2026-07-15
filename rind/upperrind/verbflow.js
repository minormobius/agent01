// verbflow.js — THE FLAVOUR LAYER for upperrind. Two pure pieces, no canvas, node-testable:
//
//   1. THE DOMINANT-VERBS PALETTE. Every white thread carries a faction WARD whose `exclusive`
//      verb is that thread's dominant verb (mend / worship / govern / grow / learn / play — the
//      six read distinctly, one per white). Production threads have no ward verb; their dominant
//      "verb" is the make of their own engine, so they wear the engine hue. This module owns the
//      verb→colour map and the (world,key)→verb / →floor-hue resolvers.
//
//   2. THE WHORL FLOW-FIELD. The concourse has a real direction (the spine runs hub→rim, curving
//      the way the analytic spiral does). We imply that FLOW in the floor tiling: each concourse
//      cell carries a log-ish whorl (a short spiral eddy) oriented to the LOCAL flow tangent and
//      curling with the thread's spin. Same field, curved by the spine ⇒ the floor reads as a
//      current. `flowAt` gives the tangent at a point; `whorlPath` is the eddy geometry. Both are
//      pure arrays of numbers so the drawing layer just strokes them, and the selftest can pin
//      the math (monotone radius, tangent at the two ends, chirality sign).
//
// Pinned by verbflow.selftest.mjs. Imported by app.js (the only consumer). Nothing here touches
// the pocket kernel — this is presentation over the exact same topology.

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

// ── the flow field ──
// the local flow TANGENT (as an angle) at a point on a thread pocket. The spine samples carry the
// unit normal (nx,ny) from the kernel; the tangent that runs hub→rim is (ny,-nx). Nearest-sample
// is enough for a floor field (cells are tiny next to the spine's curvature). Returns { theta, i }.
export function flowAt(spine, x, y) {
  if (!spine || !spine.length) return { theta: 0, i: -1 };
  let bi = 0, bd = Infinity;
  for (let i = 0; i < spine.length; i++) { const d = (spine[i].x - x) ** 2 + (spine[i].y - y) ** 2; if (d < bd) { bd = d; bi = i; } }
  const s = spine[bi];
  const tx = (s.ny ?? 0), ty = -(s.nx ?? 0);              // hub→rim tangent
  return { theta: Math.atan2(ty, tx), i: bi };
}

// a whorl — a bounded eddy that LEADS along `theta` then curls, so a field of them reads as a
// current. Parametrised t∈[0,1]: radius grows r0·t (bounded, unlike a raw log spiral), the heading
// starts AT theta (t=0 tangent = the flow) and accelerates its curl as chir·curl·t² — the "roll" of
// an eddy. `chir` (±1) is the thread spin, so white and production whorls counter-rotate exactly as
// the weave does. Returns a flat [x0,y0,x1,y1,…] polyline for a single stroke.
export function whorlPath(cx, cy, r0, theta, chir = 1, opts = {}) {
  const curl = opts.curl ?? 1.35, N = Math.max(6, opts.samples ?? 22);
  const pts = new Array((N + 1) * 2);
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const ang = theta + chir * curl * TAU * t * t;        // starts tangent to the flow, curls into the roll
    const r = r0 * t;
    pts[2 * i] = cx + Math.cos(ang) * r;
    pts[2 * i + 1] = cy + Math.sin(ang) * r;
  }
  return pts;
}

if (typeof globalThis !== 'undefined') globalThis.RindVerbFlow = { VERB_COLORS, verbColor, dominantVerb, floorHue, flowAt, whorlPath, WARD_VERBS };
