// formation3d.js — HOW FACTORY FORMATION CHANGES IN 3D. The 2D optimizer laid the supply chain out RADIALLY
// (reclaim/assembly ringing a central hub — optimizeLayout). But the hub is a VERTICAL lift to the nave, so
// in 3D the gradient rotates upright: the supply chain becomes a TOWER. And gravity gives it a preferred
// order — raw + heavy at the BOTTOM (reclaim, foundry), refined in the MIDDLE, finished + light at the TOP by
// the nave (assembly → the lift → out). Waste falls back DOWN to the reclaim yards. The radial supply
// gradient becomes a VERTICAL one; the footprint stops being a wide disc and becomes a compact column.
//
// This derives each engine's supply STAGE (its depth in the chain) and stratifies the factory into floors by
// stage, then measures the transport tradeoff vs the flat 2D disc. Pure + deterministic. Node-tested.

import { ENGINES, ENGINE_IDS, consumersOf } from './engines.js';

// the engine→engine feed graph (A feeds B if A's output tag is B's intake). The recycle loop (anything →
// reclaim, via worn product/waste) makes the raw graph cyclic, so we cut the RETURN edges: reclaim is the
// raw SOURCE (the decomposer), never fed forward. What's left is the forward production DAG we can stage.
function feedGraph() {
  const feeds = {}; for (const id of ENGINE_IDS) feeds[id] = new Set();
  for (const a of ENGINE_IDS) for (const tag of (ENGINES[a].output || [])) for (const b of consumersOf(tag)) {
    if (b === 'reclaim') continue;   // edges INTO reclaim are the recycle return, not forward supply
    if (a !== b) feeds[a].add(b);
  }
  return feeds;
}

// STAGE = the longest forward path from an engine to fulfillment (the product sink). fulfillment = 0;
// assembly = 1; refiners (mill/chem/fab/weave) = 2; foundry = 3; fluid/reclaim = the deepest (raw). Deeper
// stage ⇒ lower floor (closer to the raw, the reclaim yards, the bottom).
export function engineStage() {
  const feeds = feedGraph(), memo = {}, vis = {};
  const stage = (e) => {
    if (e === 'fulfillment') return 0;
    if (memo[e] != null) return memo[e]; if (vis[e]) return 0; vis[e] = 1;
    let best = -1; for (const c of feeds[e]) best = Math.max(best, stage(c));
    return (memo[e] = best < 0 ? 1 : best + 1);
  };
  const out = {}; for (const id of ENGINE_IDS) out[id] = stage(id); return out;
}

// the balanced tower mix (engine → facility count). reclaim/foundry are the heavy base; assembly the apex.
const MIX = { reclaim: 2, foundry: 2, fluid: 1, mill: 2, chemworks: 2, fab: 2, weave: 2, assembly: 3 };

function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// build the stratified tower: facilities placed on floors by stage (raw low, product high), the fulfillment
// lift as the vertical axis. Also lays the SAME mix out flat (one 2D disc) so we can compare transport.
export function formFactory(seed, opts = {}) {
  const { floorH = 90, ringGap = 70, kVert = 2.5 } = opts;   // kVert = how much dearer a unit of CLIMB is vs a flat metre
  const rng = mulberry(((seed >>> 0) ^ 0x70a3) >>> 0);
  const st = engineStage();
  const stages = Object.values(MIX).length ? Object.keys(MIX).map((e) => st[e]) : [1];
  const minS = Math.min(...stages), maxS = Math.max(...stages), nFloors = maxS - minS + 1;

  // facility list from the mix; floor-from-bottom = maxStage − stage (raw deepest ⇒ floor 0 ⇒ z=0 bottom).
  const facs = [];
  for (const [eng, cnt] of Object.entries(MIX)) for (let i = 0; i < cnt; i++) facs.push({ engine: eng, stage: st[eng] });
  const byFloor = Array.from({ length: nFloors }, () => []);
  for (const f of facs) { f.floor = maxS - f.stage; byFloor[f.floor].push(f); }

  // ── 3D TOWER placement: each floor is a small disc around the lift axis; z = floor·floorH ──
  for (let fl = 0; fl < nFloors; fl++) {
    const ring = byFloor[fl], R = ringGap * Math.max(0.6, Math.sqrt(ring.length) * 0.5);
    ring.forEach((f, i) => { const a = (i / Math.max(1, ring.length)) * Math.PI * 2 + rng() * 0.3; f.x = Math.cos(a) * R; f.y = Math.sin(a) * R; f.z = fl * floorH; f.color = ENGINES[f.engine].color; });
  }
  const towerTopZ = (nFloors - 1) * floorH;
  const lift = { x: 0, y: 0, z0: 0, z1: towerTopZ };          // the fulfillment axis through every floor
  const nave = { x: 0, y: 0, z: towerTopZ + floorH * 0.9 };   // the nave, above the apex

  // ── 2D FLAT placement (the old way): the SAME facilities on one disc, concentric rings by stage ──
  const flat = facs.map((f) => ({ ...f }));
  const flatByStage = {}; for (const f of flat) (flatByStage[f.stage] = flatByStage[f.stage] || []).push(f);
  for (const s in flatByStage) { const ring = flatByStage[s], R = ringGap * (1 + (maxS - +s)); ring.forEach((f, i) => { const a = (i / ring.length) * Math.PI * 2; f.x = Math.cos(a) * R; f.y = Math.sin(a) * R; f.z = 0; }); }

  const stx = stats(facs, flat, nave, kVert);
  const supply = stx._towerLinks; delete stx._towerLinks;
  return { facs, byFloor, flat, lift, nave, nFloors, floorH, stage: st, supply, stats: stx };
}

// supply edges (emitter → nearest consumer of each output tag) + transport cost. dist3d charges climb at
// kVert× (a metre up the lift costs more than a metre across the floor).
function supplyCost(list, nave, threeD, kVert) {
  const cons = {}; for (let i = 0; i < list.length; i++) for (const tag of (ENGINES[list[i].engine].intake || [])) (cons[tag] = cons[tag] || []).push(i);
  const D = (a, b) => { const dz = Math.abs(a.z - b.z); return Math.hypot(a.x - b.x, a.y - b.y) + (threeD ? kVert * dz : 0); };
  let cost = 0, n = 0, climb = 0; const links = [];
  for (let fi = 0; fi < list.length; fi++) { const f = list[fi]; for (const tag of (ENGINES[f.engine].output || [])) {
    const pool = (cons[tag] || []).filter((gi) => gi !== fi); if (!pool.length) continue;
    let best = pool[0], bd = Infinity; for (const gi of pool) { const d = D(f, list[gi]); if (d < bd) { bd = d; best = gi; } }
    cost += bd; n++; if (threeD) climb += Math.abs(f.z - list[best].z); links.push({ from: fi, to: best, tag });
  } }
  let R = 0; for (const f of list) R = Math.max(R, Math.hypot(f.x, f.y));   // footprint = max horizontal radius
  return { cost, edges: n, climb, footprintR: R, links };
}
function stats(facs, flat, nave, kVert) {
  const tower = supplyCost(facs, nave, true, kVert), disc = supplyCost(flat, nave, false, kVert);
  return {
    _towerLinks: tower.links,
    floors: Math.max(...facs.map((f) => f.floor)) + 1, facilities: facs.length,
    tower: { supplyCost: Math.round(tower.cost), footprintR: Math.round(tower.footprintR), climb: Math.round(tower.climb) },
    flat: { supplyCost: Math.round(disc.cost), footprintR: Math.round(disc.footprintR) },
    footprintShrink: disc.footprintR ? 1 - tower.footprintR / disc.footprintR : 0,   // how much narrower the tower is
    costRatio: disc.cost ? tower.cost / disc.cost : 1,                                // <1 ⇒ the tower also moves less
    kVert,
  };
}
