// grow.js — GENERATIVE BOTANY. The math under the garden's plants, replacing hand-sketched stems with
// the real theory of how plants branch and root.
//
// ONE idea does both halves of the plant: a FORAGING NETWORK (space-colonization, the physarum family
// we use everywhere — grow toward a cloud of attractors, reinforce, prune what's reached). A plant is
// two of them meeting at the collar:
//   • the SHOOT forages UPWARD toward a cloud of LIGHT attractors (crown shaped by growth-form),
//   • the ROOT forages DOWNWARD toward a cloud of WATER/NUTRIENT attractors in the soil.
// Roots-as-foraging-network is literally the hydroponic reading — the same solver that finds streets
// finds the geometry that best reaches scattered resources. Branch thickness follows MURRAY'S LAW
// (Da Vinci's rule): a parent's radius is the r-power sum of its children's — so trunks taper into
// twigs by the load they carry, not by a hand-tuned width ramp.
//
// Leaves, florets and seed-heads are placed by PHYLLOTAXIS — the golden angle 137.507° (Vogel's model)
// — the actual arrangement rule of real plants, not a jitter loop.
//
// Pure, deterministic (seeded), no DOM. Node-tested (test/grow.selftest.mjs). The flora kernel composes
// this; the renderer just strokes the segments it returns.

// ── seeded PRNG (repo house family) ──
function xmur3(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; }; }
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const rngFor = (s) => mulberry32(xmur3(String(s))());
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));   // 137.507° — the phyllotactic divergence

// ── PHYLLOTAXIS ──────────────────────────────────────────────────────────────────────────────────
// a Vogel spiral of n points (the sunflower/composite-head arrangement): r = c·√i, θ = i·goldenAngle.
export function vogelSpiral(n, c = 1) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = i * GOLDEN_ANGLE, r = c * Math.sqrt(i + 0.5); pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, i }); }
  return pts;
}
// leaves along a stem: successive nodes rotate by the golden angle (2-D projection = a side-to-side
// alternation with a slow drift), climbing the internodes. Returns {t (0..1 up the stem), side, roll}.
export function phyllotaxis(n, { base = 0 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) { const roll = base + i * GOLDEN_ANGLE; out.push({ t: (i + 0.5) / n, roll, side: Math.sin(roll) >= 0 ? 1 : -1, lean: Math.cos(roll) }); }
  return out;
}

// ── the FORAGING NETWORK (space colonization / physarum family) ────────────────────────────────────
// forage({ base, attractors, influence, kill, step, dirBias, maxNodes, seed }) → { nodes, segments, tips }
//   base:{x,y}         the collar the network grows from
//   attractors:[{x,y}] the resource cloud it grows toward (light above / water below)
//   dirBias:{x,y}      a gentle global pull (gravitropism / phototropism), magnitude ~0..1
// nodes carry {x,y,parent,radius}; segments {x0,y0,x1,y1,w0,w1}; tips = leaf-node indices.
export function forage({ base = { x: 0, y: 0 }, attractors = [], influence = 0.5, kill = 0.06, step = 0.045, dirBias = { x: 0, y: 0 }, maxNodes = 240, seed = 1 } = {}) {
  const R = rngFor('forage#' + seed);
  const nodes = [{ x: base.x, y: base.y, parent: -1, children: 0 }];
  const live = attractors.map((a) => ({ x: a.x, y: a.y }));
  let guard = 0;
  while (live.length && nodes.length < maxNodes && guard++ < maxNodes * 3) {
    // associate each attractor with its nearest node (within influence); accumulate a pull per node
    const pull = new Map();
    for (const a of live) {
      let best = -1, bd = influence * influence;
      for (let i = 0; i < nodes.length; i++) { const dx = a.x - nodes[i].x, dy = a.y - nodes[i].y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
      if (best < 0) continue;
      const n = nodes[best], dx = a.x - n.x, dy = a.y - n.y, len = Math.hypot(dx, dy) || 1;
      const p = pull.get(best) || { x: 0, y: 0, k: 0 }; p.x += dx / len; p.y += dy / len; p.k++; pull.set(best, p);
    }
    if (!pull.size) {   // nothing in reach — extend the closest node one step toward the nearest attractor
      let bi = 0, ba = live[0], bd = Infinity;
      for (const a of live) for (let i = 0; i < nodes.length; i++) { const d = (a.x - nodes[i].x) ** 2 + (a.y - nodes[i].y) ** 2; if (d < bd) { bd = d; bi = i; ba = a; } }
      const n = nodes[bi], dx = ba.x - n.x, dy = ba.y - n.y, len = Math.hypot(dx, dy) || 1;
      nodes.push({ x: n.x + dx / len * step, y: n.y + dy / len * step, parent: bi, children: 0 });
    } else {
      for (const [i, p] of pull) {
        const n = nodes[i];
        let dx = p.x / p.k + dirBias.x, dy = p.y / p.k + dirBias.y; const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        const jit = (R() - 0.5) * 0.35; const cs = Math.cos(jit), sn = Math.sin(jit);   // seeded wobble → no ruler-straight limbs
        const gx = dx * cs - dy * sn, gy = dx * sn + dy * cs;
        nodes.push({ x: n.x + gx * step, y: n.y + gy * step, parent: i, children: 0 });
      }
    }
    // prune attractors reached by any node
    for (let a = live.length - 1; a >= 0; a--) { for (const n of nodes) { if ((live[a].x - n.x) ** 2 + (live[a].y - n.y) ** 2 < kill * kill) { live.splice(a, 1); break; } } }
  }
  // Murray's law taper: post-order, leaf radius r0; parent radius = (Σ child^k)^(1/k)
  for (const n of nodes) n.children = 0;
  for (let i = nodes.length - 1; i > 0; i--) nodes[nodes[i].parent].children++;
  const rad = new Float64Array(nodes.length);
  const K = 2.3, r0 = 0.006;
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].children === 0) rad[i] = r0;
    else { let s = 0; for (let j = 0; j < nodes.length; j++) if (nodes[j].parent === i) s += Math.pow(rad[j], K); rad[i] = Math.pow(s, 1 / K); }
  }
  const segments = [], tips = [];
  for (let i = 1; i < nodes.length; i++) { const p = nodes[i].parent; segments.push({ x0: nodes[p].x, y0: nodes[p].y, x1: nodes[i].x, y1: nodes[i].y, w0: rad[p], w1: rad[i] }); }
  for (let i = 0; i < nodes.length; i++) if (nodes[i].children === 0 && i > 0) tips.push(i);
  return { nodes, segments, tips, radius: rad };
}

// ── attractor clouds shaped by growth-form (seeded) ────────────────────────────────────────────────
// crown: where the shoot forages (above the collar). Different forms scatter light differently.
export function crownCloud(form, { height = 0.5, spread = 0.25, n = 40, seed = 1 } = {}) {
  const R = rngFor('crown#' + form + seed), pts = [];
  const push = (x, y) => pts.push({ x, y });
  for (let i = 0; i < n; i++) {
    const u = R(), v = R();
    switch (form) {
      case 'broadleaf': { const a = u * Math.PI * 2, r = spread * Math.sqrt(v); push(Math.cos(a) * r, height * (0.55 + 0.45 * v) + Math.sin(a) * r * 0.5); break; }   // rounded crown, high
      case 'conifer': { const t = v, r = spread * (1 - t) * (0.6 + 0.4 * u); push((u - 0.5) * 2 * r, height * (0.4 + 0.6 * t)); break; }                              // narrow cone
      case 'shrub': { const a = u * Math.PI * 2, r = spread * (0.5 + 0.5 * Math.sqrt(v)); push(Math.cos(a) * r, height * (0.3 + 0.7 * v)); break; }                    // low, wide, multi-stem
      case 'reed': case 'grain': push((u - 0.5) * spread * 0.5, height * (0.4 + 0.6 * v)); break;                                                                       // vertical column of blades
      case 'vine': push((u - 0.5) * 2 * spread * 1.4, height * (0.1 + 0.5 * v)); break;                                                                                 // horizontal sprawl, low
      case 'rosette': push((u - 0.5) * spread * 0.6, height * (0.2 + 0.5 * v)); break;                                                                                  // short — leaves come from the base
      default: { const a = u * Math.PI * 2, r = spread * (0.4 + 0.6 * Math.sqrt(v)); push(Math.cos(a) * r * 0.8, height * (0.35 + 0.65 * v)); }                         // herb clump / stalk
    }
  }
  return pts;
}
// root: where the root forages (below the collar, y<0). Taproot vs fibrous vs spreading by form.
export function rootCloud(form, { depth = 0.35, spread = 0.25, n = 30, seed = 1 } = {}) {
  const R = rngFor('root#' + form + seed), pts = [];
  const taproot = form === 'rosette';
  for (let i = 0; i < n; i++) {
    const u = R(), v = R();
    if (taproot) { pts.push({ x: (u - 0.5) * spread * 0.35, y: -depth * (0.4 + 0.6 * v) }); }                                  // deep central column + a few laterals
    else if (form === 'broadleaf' || form === 'conifer') { const a = u * Math.PI * 2, r = spread * (0.7 + 0.6 * v); pts.push({ x: Math.cos(a) * r, y: -depth * (0.3 + 0.7 * Math.sqrt(v)) }); }  // wide root plate
    else { const a = (u - 0.5) * Math.PI * 1.2, r = spread * (0.5 + 0.6 * v); pts.push({ x: Math.sin(a) * r, y: -depth * (0.35 + 0.65 * v) }); }                              // fibrous fan
  }
  return pts;
}

export default { GOLDEN_ANGLE, vogelSpiral, phyllotaxis, forage, crownCloud, rootCloud, rngFor };
