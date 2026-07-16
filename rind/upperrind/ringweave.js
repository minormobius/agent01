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

// `turns` is the WEAVE-TIGHTNESS knob: high ⇒ the spiral wraps more ⇒ crossings crammed near the core;
// low ⇒ loose ⇒ crossings spread out to the rim. Floor ≈ 0.5 — below it some white×engine pairs stop
// crossing and K(6,6) breaks (the view reports pairsCovered so the slider can't silently break it).
export const RINGWEAVE_DEFAULTS = { N: 6, turns: 0.7, r0: 0.13, innerRf: 0.27, outerRf: 0.95, spin: 1, samples: 120, belowPhase: 0.5 };

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

// ── 3D: the ANALYTIC SOLVE with OVER/UNDER PARITY (spin it around) ──
// A weave is a weave because the threads go OVER and UNDER as they cross. We lift the 2D solve into z:
// every crossing is a control point at ±amp (over/under), and the height between is SMOOTHSTEP — which has
// zero derivative at each control ⇒ a ZERO-GRADE FLAT sits at every crossing. That flat is exactly where
// the ANTECHAMBER belongs (the neutral z=0 plane where the two floors meet at grade — no ladder). We emit:
//   • threads3d — each thread's (x,y,z) polyline, weaving over engines it's "over" (i+j even) and under
//     the rest, and complementary to whichever ring it meets.
//   • rings3d — each ring's (x,y,z) loop, alternating over/under around its circumference (a real weave),
//     with a zero-grade flat at each of its 12 thread-crossings.
//   • antechambers — a proposed chamber at EVERY crossing (36 K + 24 ring), sitting on the z=0 midplane.
const smooth = (a, b, t) => { const ts = t * t * (3 - 2 * t); return a + (b - a) * ts; };
function zProfile(controls) {   // controls sorted by rf; zero-grade (flat) at each control
  return (rf) => {
    if (rf <= controls[0].rf) return controls[0].z;
    for (let i = 0; i < controls.length - 1; i++) { const a = controls[i], b = controls[i + 1]; if (rf <= b.rf) return smooth(a.z, b.z, (rf - a.rf) / (b.rf - a.rf || 1)); }
    return controls[controls.length - 1].z;
  };
}
function zProfileWrap(cs, period) {   // angular version (the ring loops back on itself)
  if (!cs.length) return () => 0;
  const ext = cs.map((c) => ({ ...c })); ext.push({ ang: cs[0].ang + period, z: cs[0].z }); const base = cs[0].ang;
  return (ang) => {
    const a = ((ang - base) % period + period) % period + base;
    for (let i = 0; i < ext.length - 1; i++) if (a >= ext[i].ang && a <= ext[i + 1].ang) return smooth(ext[i].z, ext[i + 1].z, (a - ext[i].ang) / (ext[i + 1].ang - ext[i].ang || 1));
    return cs[0].z;
  };
}

export function buildRingWeave3D(opts = {}) {
  const o = { amp: 0.15, samples: 160, ...opts };
  const w = buildRingWeave(opts), A = o.amp;
  const aIdx = Object.fromEntries(ABOVE.map((t, i) => [t.id, i])), bIdx = Object.fromEntries(BELOW.map((t, i) => [t.id, i]));
  const whiteOver = (wid, pid) => ((aIdx[wid] + bIdx[pid]) % 2) === 0;   // plain-weave parity

  // per-thread crossing control points {rf, z}
  const ctrl = new Map(); const push = (id, rf, z) => { let a = ctrl.get(id); if (!a) ctrl.set(id, a = []); a.push({ rf, z }); };
  for (const c of w.crossings) { const wo = whiteOver(c.white, c.prod); push(c.white, c.rf, wo ? A : -A); push(c.prod, c.rf, wo ? -A : A); }

  // ring parity: alternate over/under around the circumference (a real weave), from the angular order
  const ringParity = {};   // ringKey → Map(threadId → over?)
  for (const rk of ['inner', 'outer']) {
    const cs = w.contacts.filter((c) => c.ringKey === rk).map((c) => ({ ...c, ang: (Math.atan2(c.y, c.x) + TAU) % TAU })).sort((a, b) => a.ang - b.ang);
    const m = new Map(); cs.forEach((c, i) => m.set(c.thread, (i % 2) === 0)); ringParity[rk] = m;
    // each ring crossing is also a control point on the THREAD (thread is complementary to the ring there)
    for (const c of cs) push(c.thread, c.rf, m.get(c.thread) ? -A : A);
  }

  const threads3d = w.threads.map((th) => {
    const cs = (ctrl.get(th.id) || []).slice().sort((a, b) => a.rf - b.rf);
    const controls = [{ rf: 0, z: cs.length ? cs[0].z : 0 }, ...cs, { rf: 1, z: cs.length ? cs[cs.length - 1].z : 0 }];
    const zf = zProfile(controls);
    const line3 = th.line.map((p, s) => [p[0], p[1], zf(s / (th.line.length - 1))]);
    return { ...th, line3, controls, zf };
  });

  const rings3d = {};
  for (const rk of ['inner', 'outer']) {
    const ring = w.rings[rk], m = ringParity[rk];
    const cs = w.contacts.filter((c) => c.ringKey === rk).map((c) => ({ ang: (Math.atan2(c.y, c.x) + TAU) % TAU, z: m.get(c.thread) ? A : -A, thread: c.thread })).sort((a, b) => a.ang - b.ang);
    const zf = zProfileWrap(cs, TAU), M = 200, line3 = [];
    for (let s = 0; s <= M; s++) { const ang = s / M * TAU; line3.push([Math.cos(ang) * ring.r, Math.sin(ang) * ring.r, zf(ang)]); }
    rings3d[rk] = { ...ring, line3, crossings: cs, zf };
  }

  // PROPOSED ANTECHAMBER LOCATIONS — on the zero-grade midplane (z=0). One per K PAIR (the primary /
  // innermost crossing, matching the pocket's one-station-per-pair model, not every spiral re-crossing) +
  // one per ring×thread crossing.
  const antechambers = [];
  const kByPair = new Map();
  for (const c of w.crossings) { const key = c.white + '×' + c.prod; const cur = kByPair.get(key); if (!cur || c.rf < cur.rf) kByPair.set(key, c); }
  for (const c of kByPair.values()) antechambers.push({ kind: 'K', a: c.white, b: c.prod, x: c.x, y: c.y, z: 0, over: whiteOver(c.white, c.prod) ? c.white : c.prod });
  // BEEFY ring antechambers: pair adjacent ring-crossings (by angle) into one 3-way junction (ring + 2 threads)
  let ringAnte = 0;
  for (const rk of ['inner', 'outer']) {
    const cs = w.contacts.filter((c) => c.ringKey === rk).map((c) => ({ ...c, ang: (Math.atan2(c.y, c.x) + TAU) % TAU })).sort((a, b) => a.ang - b.ang);
    for (let i = 0; i < cs.length; i += 2) {
      const a = cs[i], b = cs[i + 1] || cs[i];
      antechambers.push({ kind: 'ring', a: w.rings[rk].id, b: a.thread + (b !== a ? '+' + b.thread : ''), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0, ringKey: rk, beefy: b !== a, threads: b !== a ? [a.thread, b.thread] : [a.thread] });
      ringAnte++;
    }
  }
  return { ...w, amp: A, threads3d, rings3d, antechambers, nexus3d: { ...w.nexus, z: 0 }, counts3d: { antechambers: antechambers.length, kAnte: kByPair.size, ringAnte } };
}

if (typeof globalThis !== 'undefined') globalThis.RindRingWeave = { buildRingWeave, buildRingWeave3D, ABOVE, BELOW, RING_ENGINES, NEXUS };
