// micro.js — FROM MACRO TO MICRO: one chunk-floor a nave-dweller actually walks. The macro view (/forge/ship)
// is the whole infinite circulation; this is one locale at the floor level, and it encodes three things the
// player feels with their feet:
//
//   1. A DIRECTIONAL GRADIENT WITH BARRIERS. Along the radial axis (inner→outer): the OFFICE band (white
//      collar, nave-side, clean) → [barrier 1] → MATERIAL TRANSIT (the working artery floor: freight, hazard)
//      → [barrier 2] → the LOWER-RIND PORTAL. The portal touches ONLY the transit band, so you can reach the
//      lower rind *only* by crossing the material transit. Two gates, three zones, one direction.
//
//   2. THE WHITE-COLLAR LAYER. The production apparatus is autonomic — the material arteries hum lights-out.
//      The white collars are the cortex over that autonomic system: they WATCH PERFUSION (is every chamber
//      fed, or going ischemic?), DISPATCH a tech down a crew capillary to a fault, SCHEDULE the fulfillment
//      lift, and HOLD THE GATES. They work the mezzanine and look down on the machines (deck2.js's deck 1).
//
//   3. THE CAPILLARY STRUCTURE OF THE ARTERIES. Each artery is a space-colonization tree (the leaf-venation /
//      angiogenesis algorithm): trunk → arteriole → capillaries that perfuse EVERY chamber. There are two
//      beds — the MATERIAL arterial bed (deck 0) and the WHITE-COLLAR crew bed (deck 1). Their 2D projections
//      CROSS — which is precisely why they can't be coplanar and must live on separate decks (the two-species
//      result, made concrete). At each chamber a drop connects the decks (the per-room exchange).
//
// Pure + deterministic from the seed. Node-tested in test/micro.selftest.mjs.

const PRODUCTION = ['foundry', 'chemworks', 'mill', 'fab', 'weave', 'assembly', 'fluid', 'reclaim'];

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const DEFAULTS = {
  W: 440, H: 660, seed: 1,
  officeFrac: 0.26, portalFrac: 0.16,   // band heights as fractions of H (transit = the remainder)
  nChambers: 15, jitter: 0.5,
  influence: 150, kill: 26, step: 16, maxNodes: 900,   // space-colonization params
};

// ── space colonization (Runions et al.): grow a tree from `root` so its tips reach every attractor ──────────
// Returns { nodes:[{x,y,parent}], reached:[bool per attractor] }. Deterministic given attractors + params.
export function spaceColonize(root, attractors, o = {}) {
  const { influence, kill, step, maxNodes } = { ...DEFAULTS, ...o };
  const nodes = [{ x: root.x, y: root.y, parent: -1 }];
  const live = attractors.map(() => true);
  const reached = attractors.map(() => false);
  const MINSEP = step * 0.5;
  let guard = 0;
  while (live.some(Boolean) && nodes.length < maxNodes && guard++ < maxNodes * 3) {
    // each live attractor votes for its nearest node (within influence); attractors within kill are captured
    const pull = new Map(); let captured = 0;
    for (let i = 0; i < attractors.length; i++) {
      if (!live[i]) continue; const a = attractors[i];
      let best = -1, bd = Infinity;
      for (let n = 0; n < nodes.length; n++) { const d = (nodes[n].x - a.x) ** 2 + (nodes[n].y - a.y) ** 2; if (d < bd) { bd = d; best = n; } }
      const dist = Math.sqrt(bd);
      if (dist <= kill) { live[i] = false; reached[i] = true; captured++; continue; }
      if (dist < influence) { const v = pull.get(best) || { dx: 0, dy: 0 }; const inv = 1 / dist; v.dx += (a.x - nodes[best].x) * inv; v.dy += (a.y - nodes[best].y) * inv; pull.set(best, v); }
    }
    let grew = 0;
    for (const [ni, v] of pull) {
      const L = Math.hypot(v.dx, v.dy); if (L < 1e-3) continue;          // symmetric pull → don't spawn a duplicate
      const nx = nodes[ni].x + v.dx / L * step, ny = nodes[ni].y + v.dy / L * step;
      let dup = false; for (let n = 0; n < nodes.length; n++) { if ((nodes[n].x - nx) ** 2 + (nodes[n].y - ny) ** 2 < MINSEP * MINSEP) { dup = true; break; } }
      if (dup) continue; nodes.push({ x: nx, y: ny, parent: ni }); grew++;
    }
    if (grew === 0 && captured === 0) {              // stalled (incl. symmetric lock) → reach toward the nearest live attractor
      let bn = -1, ba = -1, bd = Infinity;
      for (let i = 0; i < attractors.length; i++) { if (!live[i]) continue; for (let n = 0; n < nodes.length; n++) { const d = (nodes[n].x - attractors[i].x) ** 2 + (nodes[n].y - attractors[i].y) ** 2; if (d < bd) { bd = d; bn = n; ba = i; } } }
      if (bn < 0) break; const a = attractors[ba], nd = nodes[bn], L = Math.hypot(a.x - nd.x, a.y - nd.y) || 1, t = Math.min(step, L);
      nodes.push({ x: nd.x + (a.x - nd.x) / L * t, y: nd.y + (a.y - nd.y) / L * t, parent: bn });
    }
  }
  return { nodes, reached };
}

export const edgesOf = (bed) => bed.nodes.filter((n) => n.parent >= 0).map((n) => [bed.nodes[n.parent], n]);

// segment intersection (proper crossing, for the "the two beds cross in 2D" check)
function ccw(a, b, c) { return (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x); }
export function segsCross(p1, p2, p3, p4) {
  const d1 = ccw(p3, p4, p1), d2 = ccw(p3, p4, p2), d3 = ccw(p1, p2, p3), d4 = ccw(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// the white collars' jobs — the cortex over the autonomic production system
export const WHITE_COLLAR = [
  { id: 'perfusion', label: 'perfusion watch', blurb: 'reads the flux field — every chamber fed, or one going ischemic?' },
  { id: 'dispatch', label: 'dispatch', blurb: 'sends a tech down a crew capillary to a faulting chamber' },
  { id: 'schedule', label: 'scheduling', blurb: 'allocates the fulfillment lift; sets production priority' },
  { id: 'gate', label: 'gate control', blurb: 'holds the two barriers — who/what passes inward, who descends' },
  { id: 'telemetry', label: 'telemetry', blurb: 'the trunk health, the spiderbot census, the energy draw' },
  { id: 'inventory', label: 'inventory', blurb: 'what the bed has made; what the nave above has ordered' },
];

export function buildMicroChunk(seed, opts = {}) {
  const o = { ...DEFAULTS, ...opts, seed: seed >>> 0 };
  const { W, H, officeFrac, portalFrac, nChambers, jitter } = o;
  const rng = mulberry32((o.seed ^ 0x10c0) >>> 0);
  const h1 = Math.round(H * officeFrac), h2 = Math.round(H * (1 - portalFrac));   // the two barriers (y)
  const bands = {
    office: { y0: 0, y1: h1, role: 'office' },
    transit: { y0: h1, y1: h2, role: 'transit' },
    portal: { y0: h2, y1: H, role: 'portal' },
  };
  // chambers: production rooms, jittered grid inside the TRANSIT band (the working floor)
  const cols = Math.ceil(Math.sqrt(nChambers * (W / (h2 - h1)))), rows = Math.ceil(nChambers / cols);
  const chambers = []; const pad = 44;
  for (let r = 0; r < rows && chambers.length < nChambers; r++) for (let c = 0; c < cols && chambers.length < nChambers; c++) {
    const gx = pad + (W - 2 * pad) * (c + 0.5) / cols, gy = h1 + pad * 0.5 + (h2 - h1 - pad) * (r + 0.5) / rows;
    const x = gx + (rng() - 0.5) * (W / cols) * jitter, y = gy + (rng() - 0.5) * ((h2 - h1) / rows) * jitter;
    chambers.push({ id: chambers.length, x, y, engine: PRODUCTION[(rng() * PRODUCTION.length) | 0] });
  }
  // the perfusion FIELD: a capillary bed perfuses tissue, not just discrete rooms. So the attractor set is the
  // chambers (first, for the coverage test) PLUS scattered interstitial points across the transit band — the
  // tissue the capillaries fill. The beds grow lush, the way a real vascular bed does.
  const nTissue = Math.round(nChambers * 2.6), tissue = [];
  for (let i = 0; i < nTissue; i++) tissue.push({ x: pad * 0.6 + (W - 1.2 * pad) * rng(), y: h1 + 18 + (h2 - h1 - 36) * rng(), tissue: true });
  const field = chambers.concat(tissue);
  // arterial bed (deck 0): the MATERIAL supply. Root at the office/transit barrier (supply crosses inward),
  // perfuses every chamber. The drain (waste) collects to the transit/portal barrier — waste goes DOWN.
  const artRoot = { x: W * 0.42, y: h1 };
  const arterial = spaceColonize(artRoot, field, o);
  const drain = { x: W * 0.58, y: h2 };                          // waste sink at barrier 2 (down to the lower rind)
  // crew bed (deck 1): the WHITE-COLLAR maintenance capillaries. Root at the office (top), also reaches every
  // chamber — a tech can get anywhere — but it lives a deck up, so it never shares a channel with the freight.
  const crewRoot = { x: W * 0.5, y: Math.round(h1 * 0.5) };
  const crew = spaceColonize(crewRoot, field, { ...o, kill: o.kill * 1.1 });
  // offices (the white collar) strung across the office band, each running one job
  const nOff = WHITE_COLLAR.length, offices = WHITE_COLLAR.map((w, i) => ({
    ...w, x: pad + (W - 2 * pad) * (i + 0.5) / nOff, y: Math.round(h1 * (0.4 + 0.32 * (i % 2))),
  }));
  // the gated walk: nave entry (top) → through an office → GATE 1 → transit spine → GATE 2 → lower-rind portal
  const gate1 = { x: W * 0.4, y: h1 }, gate2 = { x: W * 0.62, y: h2 };
  const walk = [
    { x: W * 0.5, y: 6, label: 'from the nave' },
    { x: offices[2].x, y: offices[2].y, label: 'office' },
    { x: gate1.x, y: gate1.y, label: 'barrier 1 · into transit' },
    { x: W * 0.5, y: (h1 + h2) / 2, label: 'material transit' },
    { x: gate2.x, y: gate2.y, label: 'barrier 2 · descend' },
    { x: W * 0.5, y: H - 10, label: 'lower-rind portal' },
  ];
  return { W, H, bands, barriers: [{ y: h1, gate: gate1.x, name: 'office → transit' }, { y: h2, gate: gate2.x, name: 'transit → lower rind' }],
    chambers, nChambers: chambers.length, tissue, arterial, crew, drain, artRoot, crewRoot, offices, walk, seed: o.seed };
}

// every chamber is both perfused (arterial) and covered (crew) — checked over the chamber prefix of the field
export const coverage = (mc) => { const n = mc.nChambers;
  return { arterial: mc.arterial.reached.slice(0, n).filter(Boolean).length, crew: mc.crew.reached.slice(0, n).filter(Boolean).length, total: n }; };

// do the two beds' 2D projections cross? (yes → they can't be coplanar → the two decks are necessary)
export function bedsCrossInPlane(mc) {
  const A = edgesOf(mc.arterial), C = edgesOf(mc.crew);
  for (const [a1, a2] of A) for (const [c1, c2] of C) if (segsCross(a1, a2, c1, c2)) return true;
  return false;
}
