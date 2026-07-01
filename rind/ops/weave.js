// weave.js — THE OPS WEAVE: how the 6 white-collar surfaces touch all 8 production surfaces.
//
// THE PROBLEM (the user's, restated as math). The rind's production floor is autonomic — eight engines
// (foundry · chemworks · mill · fab · weave · assembly · fluid · reclaim) run lights-out. Over them sits the
// OPS cortex: six white-collar surfaces (perfusion · dispatch · scheduling · gate · telemetry · inventory).
// EVERY white-collar surface must be able to reach EVERY production surface. As a graph, the contact we need
// is the COMPLETE BIPARTITE graph K(6,8): 6 + 8 vertices, 6·8 = 48 edges, every white touches every prod.
//
// WHY THE GYROID DID NOT MAKE IT. The earlier proto (hoop/forge/micro.js) modelled this as a GYROID — two
// broad woven SHEETS (one "white", one "material") crossing over-under, claiming "every office touches every
// facility". But a gyroid is the TWO-PHASE minimal surface: it merges all 6 whites into ONE sheet and all 8
// prods into ONE sheet, then asserts contact by fiat (`whiteTouches = facilities.map(()=>true)`). It gives
// contact-by-AREA but dissolves the per-surface IDENTITY — so there is no TOUR. You cannot follow "white
// surface 3's path through all 8 prods" because there is no white surface 3, only a single sheet with labels.
//
// THE FIX: a PLAIN WEAVE (a plaid), not a gyroid. Keep all 14 surfaces as distinct THREADS:
//   • 6 WARP threads  = the white-collar tours (run along the tour direction)
//   • 8 WEFT threads  = the production lines    (run across)
// In a plain weave EVERY warp crosses EVERY weft exactly once. Those 48 crossings ARE the 48 contacts of
// K(6,8) — realised, not asserted. Each crossing is a FACILITY where one white surface meets one production
// surface (the old "facility at every weave crossing", now honest). Over/under alternates on a checkerboard
// (warp-over iff (w+f) even) — a real plain weave, genuinely 2 interpenetrating layers ("broad, not deep").
//
// THE TOUR. Follow ONE warp thread and you visit all 8 wefts in order — that is the user's "enter one of the
// 6 white surfaces and tour the 8 production surfaces from its point of view". Wrapped onto the rind CYLINDER
// the 8 wefts become 8 azimuthal stations and the 6 warps become helices, each entering from the SAME point
// and wound at a different phase offset (a cyclic Latin rectangle, rows = shifts of Z/8) so the six tours stay
// CONFLICT-FREE (no two whites at the same prod at the same step) yet interleave into a TANGLE — the woven
// tube. K(6,8) is non-planar (it contains K(3,3)); its genus is 6. The tangle is not a bug — it is the genus.
//
// Pure, deterministic, zero-dep. Node-tested in test/weave.selftest.mjs. Attaches to globalThis for the page.

// ── the surfaces ────────────────────────────────────────────────────────────────────────────────────────
// 6 white-collar OPS surfaces — the cortex over the autonomic production (cf. hoop/forge micro.js WHITE_COLLAR)
export const WHITE = [
  { id: 'perfusion', label: 'perfusion watch', blurb: 'reads the flux field — every engine fed, or one going ischemic?' },
  { id: 'dispatch',  label: 'dispatch',        blurb: 'sends a tech across the weave to a faulting engine' },
  { id: 'schedule',  label: 'scheduling',      blurb: 'allocates the fulfillment lift; sets production priority' },
  { id: 'gate',      label: 'gate control',    blurb: 'holds the barriers — who/what passes inward, who descends' },
  { id: 'telemetry', label: 'telemetry',       blurb: 'trunk health, the spiderbot census, the energy draw' },
  { id: 'inventory', label: 'inventory',       blurb: 'what the floor has made; what the nave above has ordered' },
];

// 8 production surfaces — the engines (cf. hoop/forge engines.js). glyph + colour for the render.
export const PROD = [
  { id: 'foundry',   label: 'Foundry',        glyph: '🜂', color: '#e0772f' },
  { id: 'chemworks', label: 'Chemical works', glyph: '⚗', color: '#b39bd8' },
  { id: 'mill',      label: 'Mill',           glyph: '⊏', color: '#9aa3b2' },
  { id: 'fab',       label: 'Cleanroom fab',  glyph: '▤', color: '#45c1c9' },
  { id: 'weave',     label: 'Weave hall',     glyph: '𝍱', color: '#5aa845' },
  { id: 'assembly',  label: 'Assembly line',  glyph: '⊶', color: '#d9b24a' },
  { id: 'fluid',     label: 'Fluid works',    glyph: '◍', color: '#4f86d6' },
  { id: 'reclaim',   label: 'Reclaim yard',   glyph: '♺', color: '#7a8a6a' },
];

export const NW = WHITE.length;   // 6 warps
export const NF = PROD.length;    // 8 wefts

// documented facts about the contact graph (verified by the selftest, not just asserted here)
export const K = { warps: NW, wefts: NF, edges: NW * NF, planar: false, genus: 6 /* ceil((6-2)(8-2)/4) */ };

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// the cyclic tour order for warp w: visits wefts (w+0), (w+1), … (w+7) mod 8 — a shift-of-Z/8 Latin rectangle
// row. Distinct offsets ⇒ at every tour step the 6 warps sit on 6 distinct wefts (conflict-free).
export const tourOrder = (w) => Array.from({ length: NF }, (_, k) => (w + k) % NF);
// plain-weave parity: warp passes OVER the weft iff (w+f) is even — the checkerboard that alternates along
// every warp AND every weft, i.e. a genuine plain weave (two interpenetrating layers).
export const warpOver = (w, f) => ((w + f) % 2) === 0;

// ── build the model ─────────────────────────────────────────────────────────────────────────────────────
export const DEFAULTS = { W: 760, H: 560, R: 150, turns: 1, seed: 1 };

export function buildWeave(seed = DEFAULTS.seed, opts = {}) {
  const o = { ...DEFAULTS, ...opts, seed: (seed >>> 0) };
  const { W, H, R, turns } = o;
  const rng = mulberry32((o.seed ^ 0x09a5) >>> 0);

  const wc = WHITE.map((w, i) => ({ ...w, w: i }));
  const prod = PROD.map((p, i) => ({ ...p, f: i }));

  // FLAT LOOM CHART layout: warps are 6 vertical columns, wefts are 8 horizontal rows. The single ENTRY sits
  // above, fanning to the 6 warp heads. The pretty chart that proves K(6,8) at a glance.
  const padX = W * 0.10, padY = H * 0.14, cw = W - 2 * padX, ch = H - 2 * padY;
  const colX = (w) => padX + cw * (w + 0.5) / NW;               // warp column x
  const rowY = (f) => padY + ch * (f + 0.5) / NF;               // weft row y
  const entry = { x: W / 2, y: padY * 0.42 };

  // the 48 crossings = the 48 contacts of K(6,8). k = which tour-step of warp w lands on weft f.
  const crossings = [];
  for (let w = 0; w < NW; w++) for (let f = 0; f < NF; f++) {
    const k = (f - w + NF) % NF;                                 // tour step (cylinder phase); flat chart shows all
    crossings.push({
      w, f, k,
      over: warpOver(w, f) ? 'warp' : 'weft',                    // who sits on top in the plain weave
      x: colX(w), y: rowY(f),                                    // flat-chart position
      wc: wc[w].id, prod: prod[f].id,
    });
  }

  // CYLINDER / BRAID layout (side view of the woven tube): 8 weft RINGS stacked along the axis; 6 warp HELICES
  // entering from one point and wound at phase offset w (the Latin-rectangle shift) → the tangle.
  const az0 = -Math.PI / 2;                                      // all helices leave the entry near the front
  const ringZ = (f) => (f + 0.5) / NF;                           // 0 (top/nave side) → 1 (bottom/lower rind)
  const phaseOf = (w) => (2 * Math.PI * w) / NF;                 // start azimuth offset per warp
  const rings = prod.map((p) => ({ ...p, z: ringZ(p.f), R }));
  const SAMP = 120;
  const helices = wc.map((c) => {
    const ph = phaseOf(c.w), pts = [];
    for (let i = 0; i <= SAMP; i++) {
      const t = i / SAMP;                                        // axial param, top→bottom
      const az = az0 + ph + 2 * Math.PI * turns * t;             // wind around as we descend
      pts.push({ t, az, sin: Math.sin(az), cos: Math.cos(az) }); // cos>0 ⇒ front (drawn OVER the rings)
    }
    // this warp's contacts, in tour order — the ITINERARY from this white surface's point of view
    const itinerary = tourOrder(c.w).map((f, k) => ({ k, f, prod: prod[f].id, over: warpOver(c.w, f) ? 'warp' : 'weft' }));
    return { ...c, phase: ph, pts, itinerary };
  });

  return { W, H, R, turns, seed: o.seed, wc, prod, entry, crossings, rings, helices, colX, rowY, ringZ, _rng: rng };
}

// ── verification (this is the point — prove the theory, don't assert it) ────────────────────────────────────
// Real checks: is the contact graph actually K(6,8)? does every warp tour all 8? is the schedule conflict-free?
// does the weave genuinely alternate over/under? Returns booleans the selftest pins.
export function contact(m) {
  // (1) completeness: exactly 48 crossings, every (w,f) pair present exactly once → simple complete bipartite
  const seen = new Set();
  for (const c of m.crossings) seen.add(c.w + ':' + c.f);
  const complete = m.crossings.length === NW * NF && seen.size === NW * NF;

  // (2) every white surface tours every production surface (each warp's itinerary is a permutation of 0..7)
  const toursCoverAll = m.helices.every((h) => {
    const fs = new Set(h.itinerary.map((s) => s.f));
    return h.itinerary.length === NF && fs.size === NF;
  });

  // (3) conflict-free schedule: at every tour step k, the 6 warps occupy 6 DISTINCT production surfaces
  let conflictFree = true;
  for (let k = 0; k < NF; k++) {
    const at = new Set(); for (let w = 0; w < NW; w++) at.add((w + k) % NF);
    if (at.size !== NW) conflictFree = false;
  }

  // (4) genuine plain weave: over/under alternates along every warp AND every weft
  let weaveAlternates = true;
  for (let w = 0; w < NW; w++) for (let f = 1; f < NF; f++) if (warpOver(w, f) === warpOver(w, f - 1)) weaveAlternates = false;
  for (let f = 0; f < NF; f++) for (let w = 1; w < NW; w++) if (warpOver(w, f) === warpOver(w - 1, f)) weaveAlternates = false;

  return {
    warps: NW, wefts: NF, crossings: m.crossings.length, expected: NW * NF,
    complete, toursCoverAll, conflictFree, weaveAlternates,
    // the bottom line: every white surface reaches every production surface, provably
    everyTouchesEvery: complete && toursCoverAll,
  };
}

// the itinerary for one white surface — "tour the 8 production surfaces from this surface's point of view"
export function tour(m, w) {
  const h = m.helices[w]; if (!h) return null;
  return { wc: h.id, label: h.label, stops: h.itinerary.map((s) => ({ ...s, prodLabel: (m.prod[s.f] || {}).label })) };
}

// braid stats: the woven tube is a real tangle — each helix crosses every ring, front/back alternates enough
export function braidStats(m) {
  let frontBack = 0;
  for (const h of m.helices) { let prev = null; for (const p of h.pts) { const fr = p.cos > 0; if (prev !== null && fr !== prev) frontBack++; prev = fr; } }
  return { helices: m.helices.length, rings: m.rings.length, crossingsPerHelix: NF, totalCrossings: m.crossings.length, frontBackFlips: frontBack };
}

// node + browser
if (typeof globalThis !== 'undefined') globalThis.RindOps = { WHITE, PROD, K, buildWeave, contact, tour, braidStats, tourOrder, warpOver };
