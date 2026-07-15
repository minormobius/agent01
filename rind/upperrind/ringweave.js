// ringweave.js — A PROTOTYPE ANALYTIC WEAVE: 6 above · 6 below · two rings. The econ solver
// (econ.js) showed assembly & reclaim aren't spiral arms — they're HUBS every thread meets
// (reclaim touches 7, assembly 6). This re-poses the weave to make that structural:
//
//   • 6 ABOVE — the six white-collar ops threads (the upper layer), spiralling hub→rim.
//   • 6 BELOW — the six RADIAL engines (foundry · chemworks · mill · fab · weave · fluid), the
//     lower layer, counter-rotating ⇒ every white crosses every engine: K(6,6) = 36 crossings.
//   • RECLAIM = the OUTER RING at the rim: the decomposer every one of the 12 threads reaches
//     (12 contacts). Raws are born here and flow INWARD.
//   • ASSEMBLY = the INNER RING near the core: the converger every one of the 12 threads passes
//     (12 contacts), bonded to the FULFILLMENT NEXUS at the centre. Product is finished here and
//     rides the lift UP.
//   • THE RADIAL METABOLISM — outer(reclaim)→raws→refine inward→inner(assembly)→product→nexus(up);
//     wear/waste flows back OUT to the rim. The two rings bookend the radius.
//
// Pure analytic geometry (counter-rotating spirals + two concentric rings), deterministic, zero-dep.
// This is the SCHEMATIC (a prototype, like flat.html's rosette) — not the walked foam. Node-tested.

const TAU = Math.PI * 2;

// the 6 white ops (upper layer) — coloured by their dominant verb (the upperrind palette)
export const ABOVE = [
  { id: 'perfusion', label: 'Perfusion', verb: 'mend',    color: '#5fbf86' },
  { id: 'schedule',  label: 'Schedule',  verb: 'govern',  color: '#5f82e6' },
  { id: 'dispatch',  label: 'Dispatch',  verb: 'learn',   color: '#46cfef' },
  { id: 'telemetry', label: 'Telemetry', verb: 'worship', color: '#d9a24a' },
  { id: 'inventory', label: 'Inventory', verb: 'grow',    color: '#8fce4e' },
  { id: 'gate',      label: 'Gate',      verb: 'play',    color: '#e879b4' },
];
// the 6 radial engines (lower layer) — the eight production verticals minus the two that become rings
export const BELOW = [
  { id: 'foundry',   label: 'Foundry',   color: '#e0772f' },
  { id: 'chemworks', label: 'Chemworks', color: '#b39bd8' },
  { id: 'mill',      label: 'Mill',      color: '#9aa3b2' },
  { id: 'fab',       label: 'Fab',       color: '#45c1c9' },
  { id: 'weave',     label: 'Weave',     color: '#5aa845' },
  { id: 'fluid',     label: 'Fluid',     color: '#4f86d6' },
];
export const RING_ENGINES = {
  outer: { id: 'reclaim',  label: 'Reclaim',  color: '#cf6b4a', role: 'the decomposer — raws born at the rim, flow inward' },
  inner: { id: 'assembly', label: 'Assembly', color: '#d9b24a', role: 'the converger — product finished at the core, rides the lift up' },
};
export const NEXUS = { id: 'fulfillment', label: 'Fulfillment nexus', color: '#cbd3e0' };

export const RINGWEAVE_DEFAULTS = { N: 6, turns: 1.2, r0: 0.13, innerRf: 0.27, outerRf: 0.95, spin: 1, samples: 120, belowPhase: 0.5 };

export function buildRingWeave(opts = {}) {
  const o = { ...RINGWEAVE_DEFAULTS, ...opts };
  const N = o.N, T = o.turns * TAU;
  // a point on a thread at radial fraction rf∈[0,1]: r grows r0→1, angle winds by dir·T·rf from its base
  const rOf = (rf) => o.r0 + (1 - o.r0) * rf;
  const pt = (base, dir, rf) => { const r = rOf(rf), a = base + dir * o.spin * T * rf; return [Math.cos(a) * r, Math.sin(a) * r]; };
  const baseAbove = (i) => (i + 0.5) / N * TAU;
  const baseBelow = (j) => (j + 0.5 + o.belowPhase) / N * TAU;

  const threads = [];
  ABOVE.forEach((t, i) => { const base = baseAbove(i), line = []; for (let s = 0; s <= o.samples; s++) line.push(pt(base, +1, s / o.samples)); threads.push({ ...t, layer: 'above', idx: i, base, dir: +1, line }); });
  BELOW.forEach((t, j) => { const base = baseBelow(j), line = []; for (let s = 0; s <= o.samples; s++) line.push(pt(base, -1, s / o.samples)); threads.push({ ...t, layer: 'below', idx: j, base, dir: -1, line }); });

  const rings = {
    outer: { ...RING_ENGINES.outer, key: 'outer', rf: o.outerRf, r: rOf(o.outerRf) },
    inner: { ...RING_ENGINES.inner, key: 'inner', rf: o.innerRf, r: rOf(o.innerRf) },
  };

  // ring contacts — every thread crosses every ring exactly once (12 per ring = "touches 12 threads")
  const contacts = [];
  for (const th of threads) for (const rk of ['inner', 'outer']) {
    const ring = rings[rk], [x, y] = pt(th.base, th.dir, ring.rf);
    contacts.push({ ring: ring.id, ringKey: rk, thread: th.id, layer: th.layer, threadColor: th.color, x, y, rf: ring.rf, angle: Math.atan2(y, x) });
  }

  // K(6,6) crossings — white i vs engine j: angle_w(rf)=angle_p(rf) mod TAU.
  //   base_w + T·rf = base_p − T·rf + 2πk  ⇒  rf = (base_p − base_w + 2πk) / (2T)
  const crossings = [], pairSeen = new Set();
  for (const w of threads) if (w.layer === 'above') for (const p of threads) if (p.layer === 'below') {
    for (let k = -6; k <= 6; k++) {
      const rf = (p.base - w.base + TAU * k) / (2 * o.spin * T);
      if (rf <= 0.015 || rf >= 0.985) continue;
      const [x, y] = pt(w.base, +1, rf);
      crossings.push({ white: w.id, prod: p.id, whiteColor: w.color, prodColor: p.color, rf, x, y, over: 'white' });   // whites are the upper layer ⇒ over
      pairSeen.add(w.id + '×' + p.id);
    }
  }
  crossings.sort((a, b) => a.rf - b.rf);

  const nexus = { ...NEXUS, x: 0, y: 0, r: rOf(0) };
  // the radial metabolism, as an ordered spec the renderer can arrow
  const flow = [
    { from: 'reclaim(outer ring)', to: 'engines', dir: 'inward',  what: 'raws' },
    { from: 'engines', to: 'assembly(inner ring)', dir: 'inward', what: 'refined stock' },
    { from: 'assembly(inner ring)', to: 'fulfillment(nexus)', dir: 'up', what: 'product' },
    { from: 'fulfillment(nexus)', to: 'reclaim(outer ring)', dir: 'outward', what: 'waste' },
  ];

  return {
    threads, rings, contacts, crossings, nexus, flow, opts: o, N,
    counts: { threads: threads.length, above: N, below: N, contactsPerRing: threads.length, crossings: crossings.length, pairsCovered: pairSeen.size },
  };
}

if (typeof globalThis !== 'undefined') globalThis.RindRingWeave = { buildRingWeave, ABOVE, BELOW, RING_ENGINES, NEXUS };
