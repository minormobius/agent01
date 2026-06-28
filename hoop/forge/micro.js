// micro.js — FROM MACRO TO MICRO: one chunk-floor a nave-dweller walks. The macro (/forge/ship) is the whole
// circulation; this is one locale at floor level, and it carries three things the player feels with their feet:
//
//   1. A DIRECTIONAL GRADIENT WITH BARRIERS. Along the radial axis (inner→outer / top→bottom in section): the
//      OFFICE layer (white collar, nave-side) → [barrier 1] → the PRODUCTION FLOOR (the machines) → [barrier 2]
//      → the LOWER-RIND portal. The portal touches ONLY the production floor, so you reach the lower rind only
//      by crossing it. Two gates, three layers, one direction.
//
//   2. THE WHITE-COLLAR LAYER. Production is autonomic — the material runs lights-out. The white collars are the
//      cortex over it: perfusion-watch, dispatch, scheduling, gate-control, telemetry, inventory (`WHITE_COLLAR`).
//
//   3. THE CAPILLARY STRUCTURE IS WOVEN SURFACES, NOT NODES. The white-collar system and the material system
//      aren't pipe-trees — they're broad SURFACES (sheets) that WEAVE together. Two phase-boundary sheets, a
//      quarter-wave out of phase so they cross OVER-UNDER (a weave), bounding THREE broad layers (white-collar
//      phase / the production weave / material phase). Because each sheet is one BROAD connected surface spanning
//      the whole floor, EVERY office touches EVERY production facility — broad, not deep (three good layers tops).
//      This is the weird math of interwoven surfaces: a triply-periodic minimal surface (the GYROID) / the
//      lamellar↔gyroid phases of block-copolymer microphase separation — two surfaces partitioning space into
//      interpenetrating labyrinths, each phase still in contact with everything. The material sheet leans toward
//      the lower rind (rises from below); the white-collar sheet leans toward the office (descends from above);
//      they meet and weave at the production floor, with a facility at every weave crossing.
//
// Pure + deterministic from the seed. Node-tested in test/micro.selftest.mjs.

const PRODUCTION = ['foundry', 'chemworks', 'mill', 'fab', 'weave', 'assembly', 'fluid', 'reclaim'];

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const DEFAULTS = {
  W: 560, H: 520, seed: 1,
  officeFrac: 0.22, portalFrac: 0.16,   // the office (top) & portal (bottom) layer heights; floor = the rest
  nLobes: 4,                            // how many broad lobes the sheets weave through (broad → small)
  ampFrac: 0.34, biasFrac: 0.34,        // sheet undulation amplitude & the lean (white→office, material→rind)
  samples: 140,
};

// the white collars' jobs — the cortex over the autonomic production system
export const WHITE_COLLAR = [
  { id: 'perfusion', label: 'perfusion watch', blurb: 'reads the flux field — every facility fed, or one going ischemic?' },
  { id: 'dispatch', label: 'dispatch', blurb: 'sends a tech across the weave to a faulting facility' },
  { id: 'schedule', label: 'scheduling', blurb: 'allocates the fulfillment lift; sets production priority' },
  { id: 'gate', label: 'gate control', blurb: 'holds the two barriers — who/what passes inward, who descends' },
  { id: 'telemetry', label: 'telemetry', blurb: 'the trunk health, the spiderbot census, the energy draw' },
  { id: 'inventory', label: 'inventory', blurb: 'what the floor has made; what the nave above has ordered' },
];

// the two woven phase-boundary surfaces, evaluated at x. `white` leans up (office), `material` leans down
// (lower rind); they're a quarter-wave out of phase so they cross over-under — the weave.
function geom(o) {
  const { W, H, officeFrac, portalFrac, nLobes, ampFrac, biasFrac, seed } = o;
  const zOfficeBot = H * (1 - officeFrac), zPortalTop = H * portalFrac, floorMid = (zOfficeBot + zPortalTop) / 2;
  const A = (zOfficeBot - zPortalTop) * ampFrac, bias = A * biasFrac, k = 2 * Math.PI * nLobes / W;
  const ph0 = mulberry32((seed ^ 0x5f3a) >>> 0)() * Math.PI * 2;   // seeded phase so seeds differ
  const surfZ = (which, x) => floorMid + (which === 'white' ? bias : -bias) + A * Math.sin(k * x + (which === 'white' ? 0 : Math.PI / 2) + ph0);
  return { zOfficeBot, zPortalTop, floorMid, A, bias, k, surfZ };
}

export function buildMicroChunk(seed, opts = {}) {
  const o = { ...DEFAULTS, ...opts, seed: seed >>> 0 };
  const { W, H, samples } = o;
  const g = geom(o);
  const rng = mulberry32((o.seed ^ 0x10c0) >>> 0);
  const bands = {
    office: { z0: g.zOfficeBot, z1: H, role: 'office' },          // top — inner / nave side
    floor: { z0: g.zPortalTop, z1: g.zOfficeBot, role: 'floor' }, // the production weave
    portal: { z0: 0, z1: g.zPortalTop, role: 'portal' },          // bottom — outward / lower rind
  };
  const barriers = [{ z: g.zOfficeBot, name: 'office → floor' }, { z: g.zPortalTop, name: 'floor → lower rind' }];

  // sample the two broad surfaces (for rendering + analysis)
  const white = [], material = [];
  for (let i = 0; i <= samples; i++) { const x = W * i / samples; white.push({ x, z: g.surfZ('white', x) }); material.push({ x, z: g.surfZ('material', x) }); }
  const surfaces = { white, material };

  // the WEAVE: crossings where white passes over/under material (sign changes of white−material). A production
  // facility sits at every crossing — touched by both broad sheets.
  const crossings = [];
  for (let i = 1; i <= samples; i++) {
    const x0 = W * (i - 1) / samples, x1 = W * i / samples;
    const d0 = g.surfZ('white', x0) - g.surfZ('material', x0), d1 = g.surfZ('white', x1) - g.surfZ('material', x1);
    if ((d0 > 0) !== (d1 > 0)) { const t = d0 / (d0 - d1), x = x0 + (x1 - x0) * t, z = g.surfZ('white', x); crossings.push({ x, z, over: d0 > 0 ? 'material' : 'white' }); }
  }
  const facilities = crossings.map((c, i) => ({ id: i, x: c.x, z: c.z, engine: PRODUCTION[(rng() * PRODUCTION.length) | 0], weaveOver: c.over }));

  // offices (the white collar) strung along the white-collar surface
  const offices = WHITE_COLLAR.map((w, i) => { const x = 30 + (W - 60) * (i + 0.5) / WHITE_COLLAR.length; return { ...w, x, z: g.surfZ('white', x) }; });

  // CONTACT: each sheet is one broad connected surface spanning every facility's x, so it touches every
  // facility; offices live on the white sheet → every office reaches every facility (complete bipartite).
  const whiteTouches = facilities.map(() => true), matTouches = facilities.map(() => true);

  // the gated walk in section: nave (top) → office → barrier 1 → the weave floor → barrier 2 → lower rind
  const walk = [
    { x: W * 0.5, z: H - 6, label: 'from the nave' },
    { x: offices[2].x, z: offices[2].z, label: 'office' },
    { x: W * 0.4, z: g.zOfficeBot, label: 'barrier 1 · onto the floor' },
    { x: W * 0.5, z: g.floorMid, label: 'the production weave' },
    { x: W * 0.6, z: g.zPortalTop, label: 'barrier 2 · descend' },
    { x: W * 0.5, z: 8, label: 'lower-rind portal' },
  ];

  return {
    W, H, bands, barriers, surfaces, crossings, facilities, offices, walk,
    layers: ['white-collar (office phase)', 'the production weave', 'material (rind phase)'],   // ≤ 3
    whiteTouches, matTouches, floorMid: g.floorMid, nLobes: o.nLobes, seed: o.seed,
  };
}

// every facility is in contact with BOTH broad sheets (broad coverage), and — since each sheet is one connected
// surface — every office touches every facility (complete bipartite). Returns the contact summary.
export function contact(mc) {
  const facCovered = mc.facilities.every((_, i) => mc.whiteTouches[i] && mc.matTouches[i]);
  const pairs = mc.offices.length * mc.facilities.length;
  return { facilities: mc.facilities.length, offices: mc.offices.length, facCovered, pairs, complete: facCovered, layers: mc.layers.length };
}

// the weave is genuine over-under: the two sheets cross many times, and the "over" sheet alternates.
export function weaveStats(mc) {
  let alternations = 0; for (let i = 1; i < mc.crossings.length; i++) if (mc.crossings[i].over !== mc.crossings[i - 1].over) alternations++;
  return { crossings: mc.crossings.length, alternations, woven: mc.crossings.length >= mc.nLobes && alternations >= mc.crossings.length - 1 };
}
