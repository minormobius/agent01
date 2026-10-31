// craft/builds.mjs — things a player builds near home that keep working:
// a pen, an enchanting corner, an anvil, an automatic smelter, a sugar-cane
// farm that harvests itself, and a rail line.
//
// Every build is laid out ON THE TILE GRAPH by a site search: a pen's fence
// is the ring one hop out from a patch of ground; a machine's parts go on
// neighbouring tiles with the right geometry (a piston needs a tile beside the
// cane with a straight-on tile past it for the cane to land on). Whether a
// layout exists depends on the tiling, and the search says so when it does
// not. System 2 wrote these by hand; they are what a planner would have to
// write, and the site searches are where Penrose makes it hard.
//
// Every voxel a build owns goes into sim.protect (the planners never dig
// through it) and its columns into sim.team.reserved (no other build lands on
// them).

import { B, BLOCKS, H, BREED_FOOD, PLACE_AS, SMELT, FUEL, RECIPES, stackSize, ENCH, itemKind, durability, repairMaterial, PICK_TIER } from './world.mjs';
import { goTo, craft, shortfall, describeShort, visiblePigs, stepOp, placeStation, chestAt } from './macros.mjs';
import { MOMENTUM as MOMENTUM_PLAN, railCost as railCostPlan } from './machines.mjs';

// ------------------------------------------------------------- helpers ----
export function reserved(sim) {
  const r = new Set(sim.team.reserved || []);
  const h = sim._house;
  if (h) { for (const c of [...h.interior, ...h.ring]) r.add(c); for (const n of sim.cols[h.door].adj) r.add(n); }
  for (const k of sim.ow('portals')) r.add(Math.floor(k / H));
  if (sim.team.chest != null) r.add(Math.floor(sim.team.chest / H));
  return r;
}
export function reserve(sim, cols) { sim.team.reserved = [...new Set([...(sim.team.reserved || []), ...cols])]; }
const protectAll = (sim, vox) => { for (const [c, y] of vox) sim.protect.add(c * H + y); };
// where a body stands on column c: its surface, if that is standable and not up a tree
export function standY(sim, c) {
  const y = sim.surface(c), below = sim.get(c, y - 1);
  if (below === B.leaves || below === B.log || below === B.water) return null;
  return sim.canStand(c, y) ? y : null;
}
// columns near home, nearest (in hops) first
export function nearHome(sim, r = 14) {
  const base = sim.home ? sim.home[0] : sim.player.c;
  return [...sim.ballCols(base, r)].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([c]) => c);
}
const okCol = (sim, res, u) => !res.has(u) && sim.seen[u] && sim.cols[u].adj.length && !sim.cols[u].nb.includes(-1);

// stand somewhere the voxel can be reached from, not in it
function* reachFor(sim, c, y, maxNodes = 20000) {
  const p = sim.player;
  if (sim.reachable(p.c, p.y, c, y) && !(p.c === c && (p.y === y || p.y + 1 === y))) return { ok: true };
  return yield* goTo(sim, (sc, sy) => sim.reachable(sc, sy, c, y) && !(sc === c && (sy === y || sy + 1 === y)), maxNodes);
}
export function* mineAt(sim, c, y) {
  const id = sim.get(c, y);
  if (id === B.air || id === B.water) return { ok: true };
  const go = yield* reachFor(sim, c, y);
  if (!go.ok) return { ok: false, why: `could not reach ${c},${y} (${go.why})` };
  const r = yield { op: 'mine', c, y };
  return r.ok ? { ok: true } : { ok: false, why: r.why };
}
// put `item` at (c, y), clearing what is there first; `face` for parts that face somewhere
export function* placeAt(sim, c, y, item, face = null, maxNodes = 20000) {
  const want = B[PLACE_AS[item] || item];
  if (sim.get(c, y) === want && !face) return { ok: true };
  const cur = sim.get(c, y);
  if (cur !== B.air && cur !== B.water && !BLOCKS[cur].plant) { const m = yield* mineAt(sim, c, y); if (!m.ok) return m; }
  if (!sim.has(item)) return { ok: false, why: `no ${item.replace(/_/g, ' ')}` };
  let last = '';
  for (let tries = 0; tries < 12; tries++) {
    const go = yield* reachFor(sim, c, y, maxNodes);
    if (!go.ok) return { ok: false, why: `could not reach ${c},${y} (${go.why})` };
    const r = yield { op: 'place', c, y, item, ...(face ? { face } : {}) };
    if (r.ok) return { ok: true };
    last = r.why;
    if (r.why === 'an entity is there') {
      // the builder standing in its own way steps aside; anything else is waited out
      if (sim.player.c === c && (sim.player.y === y || sim.player.y + 1 === y)) yield* goTo(sim, (sc, sy) => !(sc === c && (sy === y || sy + 1 === y)) && sim.reachable(sc, sy, c, y), 4000);
      else {
        // an animal that will not move off the spot, in the end, is dinner
        const o = sim.occupied(c, y) || sim.occupied(c, y - 1);
        if (o && tries >= 6 && ['pig', 'sheep', 'cow', 'chicken'].includes(o.kind)) {
          const go2 = yield* goTo(sim, (sc, sy) => (sc === o.c || sim.cols[sc].adj.includes(o.c)) && Math.abs(sy - o.y) <= 1, 4000);
          for (let h = 0; go2.ok && h < 8 && sim.ents.has(o.id) && sim.adjacentTo(sim.player, o); h++) yield { op: 'attack', id: o.id };
        } else yield { op: 'wait', ticks: 4 };
      }
      continue;
    }
    if (r.why === 'out of reach') continue;
    return { ok: false, why: r.why };
  }
  return { ok: false, why: `could not place the ${item.replace(/_/g, ' ')} (${last})` };
}
export function* toggleAt(sim, c, y) {
  for (let tries = 0; tries < 8; tries++) {
    const go = yield* reachFor(sim, c, y);
    if (!go.ok) return { ok: false, why: go.why };
    const r = yield { op: 'toggle', c, y };
    if (r.ok) return { ok: true };
    if (r.why === 'something is in the gateway') { yield { op: 'wait', ticks: 3 }; continue; }
    return { ok: false, why: r.why };
  }
  return { ok: false, why: 'the gateway stayed blocked' };
}
// make at least n of item (crafting what it is made of), or say what is short
export function* ensure(sim, item, n = 1) {
  if ((sim.inv[item] || 0) >= n) return { ok: true };
  const sh = shortfall(sim, item, n);
  if (Object.keys(sh).length) return { ok: false, why: `short of ${describeShort(sh)}` };
  return yield* craft(sim, item, n);
}

// a walking route that steps round bodies (the animal being led crowds you)
export function walkRoute(sim, goal, maxNodes = 8000) {
  const p = sim.player, occ = new Set();
  for (const e of sim.ents.values()) if (e !== p && e.kind !== 'item') for (let k = 0; k < sim.tallOf(e); k++) occ.add(e.c * H + e.y + k);
  const key = (c, y) => c * H + y, start = key(p.c, p.y), prev = new Map([[start, -1]]), q = [start];
  for (let qi = 0; qi < q.length && prev.size < maxNodes; qi++) {
    const u = q[qi], c = Math.floor(u / H), y = u % H;
    if (goal(c, y)) { const out = []; for (let v = u; v !== start; v = prev.get(v)) out.push([Math.floor(v / H), v % H]); return out.reverse(); }
    for (const n of sim.cols[c].adj) {
      if (!sim.seen[n]) continue;
      const yy = sim.stepTarget(c, y, n, 2, 3);
      if (yy == null || occ.has(key(n, yy)) || occ.has(key(n, yy + 1)) || sim.get(n, yy + 1) === B.water) continue;
      const k = key(n, yy);
      if (!prev.has(k)) { prev.set(k, u); q.push(k); }
    }
  }
  return null;
}

// ----------------------------------------------------------------- pens ----
// A pen: the ring one hop out from a patch of flat ground, fenced, with a gate
// level with the floor and standing ground outside it. On a tiling the ring
// is the graph ball's boundary, so every interior tile's every neighbour is
// interior or fence: nothing walks out. The ring may sit a layer above or
// below the floor — a fence there still stops a step, and nothing stands on
// one.
export function penPlan(sim, c0, R = 1, res = reserved(sim)) {
  const d = sim.ballCols(c0, R + 2);
  const g = standY(sim, c0);
  if (g == null) return null;
  const interior = [], ring = [];
  for (const [u, k] of d) if (k <= R) interior.push(u); else if (k === R + 1) ring.push(u);
  for (const u of [...interior, ...ring]) if (!okCol(sim, res, u)) return null;
  // the floor need not be flat: a fence at a ring tile's surface leaves that
  // tile nowhere to stand, whatever level an animal comes at it from
  const lvl = {};
  for (const u of interior) { const y = standY(sim, u); if (y == null || Math.abs(y - g) > 2 || sim.wet(u, y)) return null; lvl[u] = y; }
  const fences = [];
  for (const u of ring) {
    const y = sim.surface(u), id = sim.get(u, y), under = sim.get(u, y - 1);
    if (y < g - 3 || y > g + 3) return null;
    if (id !== B.air && !BLOCKS[id].plant) return null;
    if (under === B.water || under === B.leaves || under === B.log || BLOCKS[under].hazard || !BLOCKS[under].solid) return null;
    fences.push([u, y]);
  }
  // the gate: level with an interior tile beside it and with standing ground outside
  const outOf = (u, y) => sim.cols[u].adj.find((o) => d.get(o) === R + 2 && !res.has(o) && standY(sim, o) === y);
  const gate = fences.find(([u, y]) => sim.cols[u].adj.some((i) => lvl[i] === y) && outOf(u, y) != null);
  if (!gate) return null;
  return { c0, R, g, lvl, interior, ring, fences, gate, out: outOf(gate[0], gate[1]) };
}
export function penSite(sim) {
  const res = reserved(sim);
  for (const c of nearHome(sim, 12)) {
    const plan = penPlan(sim, c, 1, res);
    if (plan && plan.interior.length >= 4) return plan;
  }
  return null;
}
export const penFences = (plan) => plan.fences.length - 1;
export function* buildPen(sim) {
  if (sim.team.pen) return { ok: false, why: 'the team already has a pen' };
  const plan = penSite(sim);
  if (!plan) return { ok: false, why: 'no flat patch of ground near home for a pen' };
  const need = penFences(plan);
  // the ground the fence stands on and the pen's floor: never dug, from now on
  // (measured: the builder's own route dug a pit under the gate, and the cows
  // walked out beneath it)
  const ground = [...plan.fences.map(([u, y]) => [u, y - 1]), ...plan.interior.map((u) => [u, plan.lvl[u] - 1])];
  protectAll(sim, ground);
  let r = yield* ensure(sim, 'fence', need);
  if (!r.ok) return r;
  r = yield* ensure(sim, 'fence_gate', 1);
  if (!r.ok) return r;
  // the gate first: it is the way in and out while the rest goes up
  r = yield* placeAt(sim, plan.gate[0], plan.gate[1], 'fence_gate');
  if (!r.ok) return { ok: false, why: `the gate: ${r.why}` };
  sim.protect.add(plan.gate[0] * H + plan.gate[1]);
  let fails = 0;
  const left = plan.fences.filter(([u]) => u !== plan.gate[0]);
  while (left.length) {
    const p = sim.player;
    left.sort((a, b) => sim.dist(a[0], p.c) - sim.dist(b[0], p.c));
    const [u, y] = left.shift();
    const f = yield* placeAt(sim, u, y, 'fence');
    if (f.ok) sim.protect.add(u * H + y);        // at once: the way to the next fence must not dig through this one
    if (!f.ok && ++fails > 2) return { ok: false, why: `a fence: ${f.why}` };
  }
  // one more go at any that did not go up (a pig stood there; the route was blocked)
  for (const [u, y] of plan.fences) if (u !== plan.gate[0] && sim.get(u, y) !== B.fence) { const f = yield* placeAt(sim, u, y, 'fence'); if (f.ok) sim.protect.add(u * H + y); }
  // proven, not assumed: every fence is up, or it is not a pen
  const gap = plan.fences.find(([u, y]) => ![B.fence, B.fence_gate, B.fence_gate_open].includes(sim.get(u, y)) || !sim.solid(u, y - 1));
  if (gap) return { ok: false, why: `a gap in the fence at ${gap[0]},${gap[1]}` };
  protectAll(sim, plan.fences);
  // and the step outside the gate: a chest set down there later walled the
  // player into its own pen (measured, hex/3, 116 failed macros in a row)
  reserve(sim, [...plan.interior, ...plan.ring, plan.out]);
  protectAll(sim, [[plan.out, plan.gate[1] - 1]]);
  sim.team.pen = plan;
  sim.note('pen', { c: plan.c0, y: plan.g, tiles: plan.interior.length, fences: plan.fences.length });
  return { ok: true };
}
export const inPen = (sim, e) => !!sim.team.pen && sim.team.pen.interior.includes(e.c);
export const penned = (sim, kind) => [...sim.ents.values()].filter((e) => (!kind ? ['pig', 'sheep', 'cow', 'chicken'].includes(e.kind) : e.kind === kind) && inPen(sim, e));
// Lead animals into the pen, holding out their food (they follow a player
// holding it, round the fence and through the open gate). The gate is shut
// from INSIDE while they are still following, and the player walks out
// through it: a shut gate stops animals, not the player (measured: a cow that
// followed the player back out stood in the gateway, and it could not be shut).
export function* penAnimals(sim, { kind = 'cow', n = 2 } = {}) {
  const pen = sim.team.pen;
  if (!pen) return { ok: false, why: 'no pen yet' };
  const food = BREED_FOOD[kind];
  if (!sim.has(food)) return { ok: false, why: `needs ${food.replace(/_/g, ' ')} to lead ${kind}s` };
  const p = sim.player, [gc, gy] = pen.gate;
  const lv = (c) => (pen.lvl ? pen.lvl[c] : pen.g);
  const inside = (c, y) => pen.interior.includes(c) && y === lv(c);
  // lead to the tile farthest from the gate: an animal that stops beside you
  // there is well inside, not standing in the gateway
  const hop = sim.ballCols(gc, 4);
  const deep = pen.interior.filter((u) => !sim.cols[u].adj.includes(gc)).sort((a, b) => (hop.get(b) ?? 9) - (hop.get(a) ?? 9))[0] ?? pen.c0;
  const shutFromInside = function* () {
    if (sim.get(gc, gy) !== B.fence_gate_open) return { ok: true };
    // from inside if there is room (a full pen may leave none): from outside, then
    let go = yield* goTo(sim, (c, y) => inside(c, y) && sim.reachable(c, y, gc, gy), 4000);
    if (!go.ok) go = yield* reachFor(sim, gc, gy);
    if (!go.ok) return go;
    for (let w = 0; w < 50; w++) {
      const r = yield { op: 'toggle', c: gc, y: gy };
      if (r.ok) { p.luring = false; return { ok: true }; }
      // what is standing in the gateway: one of the herd, called on in; anything else, waited out, then driven off
      const o = sim.occupied(gc, gy);
      p.luring = !!o && o.kind === kind;
      if (o && o.kind !== kind && w >= 30 && sim.adjacentTo(p, o)) yield { op: 'attack', id: o.id };
      else yield { op: 'wait', ticks: 1 };
    }
    p.luring = false;
    return { ok: false, why: 'the gateway stayed blocked' };
  };
  let led = 0;
  try {
    for (let k = 0; k < 6 && penned(sim, kind).length < n; k++) {
      const a = visiblePigs(sim, 30, kind).filter((e) => !inPen(sim, e) && !e.young).sort((x, y) => sim.dist(x.c, pen.c0) - sim.dist(y.c, pen.c0))[0];
      if (!a) break;
      if (sim.get(gc, gy) === B.fence_gate) { const t = yield* toggleAt(sim, gc, gy); if (!t.ok) return t; }
      p.luring = false;
      const go = yield* goTo(sim, (c, y) => sim.cols[c].adj.includes(a.c) && Math.abs(y - a.y) <= 1, 12000);
      if (!go.ok) continue;
      p.luring = true;
      // lead it in, a step at a time, waiting for it to keep up; it crowds
      // in behind (or in front): step round it
      for (let replan = 0; replan < 8 && !(p.c === deep && p.y === lv(deep)); replan++) {
        const route = walkRoute(sim, (c, y) => c === deep && y === lv(deep));
        if (!route) break;
        let lost = false, blocked = false;
        for (const [c, y] of route) {
          const r = yield stepOp(sim, c, y);
          if (!r.ok) { blocked = true; break; }
          for (let w = 0; w < 24 && sim.ents.has(a.id) && sim.dist(a.c, p.c) > 2.5; w++) yield { op: "wait", ticks: 1 };
          if (!sim.ents.has(a.id) || sim.dist(a.c, p.c) > 6) { lost = true; break; }
        }
        if (lost || !blocked) break;
      }
      for (let w = 0; w < 40 && sim.ents.has(a.id) && !inPen(sim, a); w++) yield { op: "wait", ticks: 1 };
      p.luring = false;                          // it stays where it is; go and shut the gate
      yield* shutFromInside();
      if (inPen(sim, a)) led++;
    }
  } finally { p.luring = false; }
  const shut = yield* shutFromInside();
  // out through the shut gate
  yield* goTo(sim, (c, y) => c === pen.out && y === gy, 6000);
  if (!shut.ok || sim.get(gc, gy) !== B.fence_gate) return { ok: false, why: `the gate is left open: ${shut.why || 'it would not shut'}` };
  const now = penned(sim, kind).length;
  return now >= n ? { ok: true } : now ? { ok: true, partial: true } : { ok: false, why: led ? 'they wandered out again' : `could not lead a ${kind} in` };
}

// ------------------------------------------------------------ stations ----
// A spot for one station near home, outside the house: flat, with a tile
// beside it to stand on. Stations kept at home: sim.team.stations[name].
export function stationSite(sim, res = reserved(sim)) {
  for (const c of nearHome(sim, 10)) {
    if (!okCol(sim, res, c)) continue;
    const g = standY(sim, c);
    if (g == null || sim.get(c, g) !== B.air) continue;
    if (!sim.cols[c].adj.some((n) => !res.has(n) && standY(sim, n) === g)) continue;
    return [c, g];
  }
  return null;
}
export const stationAt = (sim, name) => (sim.team.stations || {})[name] || null;
export function* setUpStation(sim, name) {
  const at = stationAt(sim, name);
  if (at && sim.get(at[0], at[1]) === B[name]) return { ok: false, why: `the team already has a ${name.replace(/_/g, ' ')} at home` };
  let r = yield* ensure(sim, name, 1);
  if (!r.ok) return r;
  const site = stationSite(sim);
  if (!site) return { ok: false, why: `nowhere near home to put the ${name.replace(/_/g, ' ')}` };
  r = yield* placeAt(sim, site[0], site[1], name);
  if (!r.ok) return r;
  sim.protect.add(site[0] * H + site[1]);
  reserve(sim, [site[0]]);
  (sim.team.stations ||= {})[name] = site;
  return { ok: true };
}
function* toStation(sim, name, ids = [B[name]]) {
  if (sim.nearBlock(ids)) return { ok: true };
  const at = name === 'enchanting_table' ? tableAt(sim) : stationAt(sim, name);
  if (!at) return { ok: false, why: `no ${name.replace(/_/g, ' ')} at home` };
  const go = yield* goTo(sim, (c, y) => sim.nearBlock(ids, c, y) != null, 30000);
  return go.ok ? { ok: true } : { ok: false, why: `could not get to the ${name.replace(/_/g, ' ')} (${go.why})` };
}

// -------------------------------------------------------- the anvil -------
export function* repairTool(sim, item) {
  if (!sim.has(item)) return { ok: false, why: `no ${item}` };
  const t = yield* toStation(sim, 'anvil');
  if (!t.ok) return t;
  const r = yield { op: 'repair', item };
  return r.ok ? { ok: true } : { ok: false, why: r.why };
}
// what repairing would do now: units of material, the level cost, uses gained
export function repairQuote(sim, item) {
  const d = durability(item), mat = repairMaterial(item), p = sim.player;
  if (!d || !mat || !sim.has(item)) return null;
  const left = (p.wear || {})[item] ?? d;
  if (left >= d) return null;
  const units = Math.min(Math.ceil((d - left) / Math.floor(d / 4)), sim.inv[mat] || 0, 4);
  const work = (p.work || {})[item] || 0;
  return { mat, units, cost: units + (2 ** work - 1), left, gain: Math.min(d, left + units * Math.floor(d / 4)) - left, tooExpensive: units + (2 ** work - 1) >= 40 };
}

// ------------------------------------------------- the enchanting corner --
// A table on flat ground, the tiles beside it to stand on, and bookshelves on
// the tiles two hops out (two layers of them), leaving one of those tiles as
// the way in. Its power is the shelves within two hops, 15 at most.
export function enchantSite(sim, res = reserved(sim)) {
  for (const c of nearHome(sim, 12)) {
    if (!okCol(sim, res, c)) continue;
    const g = standY(sim, c);
    if (g == null) continue;
    const d = sim.ballCols(c, 3);
    const ring1 = [...d].filter(([, k]) => k === 1).map(([u]) => u);
    const ring2 = [...d].filter(([, k]) => k === 2).map(([u]) => u);
    if (!ring1.every((u) => okCol(sim, res, u) && standY(sim, u) === g)) continue;
    const spots = ring2.filter((u) => okCol(sim, res, u) && standY(sim, u) === g);
    if (spots.length < 4) continue;
    const entrance = spots.find((u) => sim.cols[u].adj.some((o) => d.get(o) === 3 && standY(sim, o) === g && !res.has(o)));
    if (entrance == null) continue;
    const shelves = spots.filter((u) => u !== entrance).flatMap((u) => [[u, g], [u, g + 1]]);
    return { c, g, ring1, entrance, shelves, cols: [c, ...ring1, ...spots] };
  }
  return null;
}
export const tableAt = (sim) => sim.team.table ? [sim.team.table.c, sim.team.table.g] : null;
export function* setUpEnchanting(sim) {
  if (sim.team.table) return yield* addShelves(sim);
  let r = yield* ensure(sim, 'enchanting_table', 1);
  if (!r.ok) return r;
  const site = enchantSite(sim);
  if (!site) return { ok: false, why: 'no flat patch near home for an enchanting table and its shelves' };
  r = yield* placeAt(sim, site.c, site.g, 'enchanting_table');
  if (!r.ok) return r;
  sim.protect.add(site.c * H + site.g);
  reserve(sim, site.cols);
  sim.team.table = site;
  sim.note('enchanting_table', { c: site.c, y: site.g });
  yield* addShelves(sim);
  return { ok: true };
}
export function* addShelves(sim) {
  const site = sim.team.table;
  if (!site) return { ok: false, why: 'no enchanting table yet' };
  let placed = 0;
  for (const [u, y] of site.shelves) {
    if (!sim.has('bookshelf')) break;
    if (sim.get(u, y) === B.bookshelf) continue;
    if (y > site.g && sim.get(u, y - 1) !== B.bookshelf) continue;      // the upper shelf goes on a lower one
    const r = yield* placeAt(sim, u, y, 'bookshelf');
    if (r.ok) { placed++; sim.protect.add(u * H + y); }
  }
  return placed ? { ok: true } : { ok: false, why: sim.has('bookshelf') ? 'no room for more shelves' : 'no bookshelves (6 planks + 3 books)' };
}
export const tablePower = (sim) => sim.team.table ? sim.shelfPower(sim.team.table.c, sim.team.table.g) : 0;
// what the table offers for an item, and which of them the player can take now
export function enchantQuote(sim, item) {
  if (!sim.team.table || !sim.has(item) || !itemKind(item) || ((sim.player.ench || {})[item])) return null;
  const offers = sim.enchantOffers(item, tablePower(sim));
  const lv = sim.player.level || 0, lapis = sim.inv.lapis || 0;
  const can = offers.filter((o) => Object.keys(o.ench).length && lv >= o.level && lapis >= o.cost);
  return { offers, best: can.length ? can[can.length - 1] : null };
}
export function* enchantItem(sim, item) {
  const q = enchantQuote(sim, item);
  if (!q) return { ok: false, why: sim.team.table ? `cannot enchant the ${item.replace(/_/g, ' ')}` : 'no enchanting table yet' };
  if (!q.best) return { ok: false, why: `nothing affordable: offers need level ${q.offers.map((o) => o.level).join('/')} (at ${sim.player.level || 0}), lapis ${sim.inv.lapis || 0}` };
  const t = yield* toStation(sim, 'enchanting_table');
  if (!t.ok) return t;
  // the offers are the same wherever you stand (the seed and the shelves decide them)
  const again = enchantQuote(sim, item);
  const r = yield { op: 'enchant', item, slot: again.best.slot };
  return r.ok ? { ok: true } : { ok: false, why: r.why };
}

// ---------------------------------------------------------- sugar cane ----
// cane in sight: [base column, base layer, height]
export function canesInSight(sim, r = 24) {
  const p = sim.player, out = [];
  for (const k of sim.canes) {
    const c = Math.floor(k / H), y = k % H;
    if (!sim.seen[c] || sim.dist(c, p.c) > r || sim.b[k] !== B.sugar_cane) continue;
    let h = 1; while (sim.get(c, y + h) === B.sugar_cane) h++;
    out.push([c, y, h]);
  }
  return out.sort((a, b) => sim.dist(a[0], p.c) - sim.dist(b[0], p.c));
}
// Cut cane in sight above its bottom piece (the plant grows back); if none is
// taller than one, take a whole one to plant.
export function* harvestCane(sim, n = 3) {
  const want = (sim.inv.sugar_cane || 0) + n;
  for (let k = 0; k < 8 && (sim.inv.sugar_cane || 0) < want; k++) {
    const tall = canesInSight(sim).filter(([, , h]) => h >= 2);
    const [c, y] = tall[0] || (!sim.has('sugar_cane') ? canesInSight(sim)[0] || [] : []);
    if (c == null) break;
    const cut = tall[0] ? y + 1 : y;
    const r = yield* mineAt(sim, c, cut);
    if (!r.ok) { (sim.player._badCane ||= new Set()).add(c); continue; }
    yield { op: 'wait', ticks: 2 };                             // the pieces above fall beside you and are picked up
  }
  const got = (sim.inv.sugar_cane || 0) - (want - n);
  return got >= n ? { ok: true } : got > 0 ? { ok: true, partial: true } : { ok: false, why: 'no sugar cane to cut in sight' };
}
// where cane would take root: sand, dirt or grass with water beside it, near home first
export function caneSpots(sim, r = 16) {
  const res = reserved(sim), out = [];
  for (const c of nearHome(sim, r)) {
    if (res.has(c) || !sim.seen[c]) continue;
    const y = sim.surface(c);
    if (sim.get(c, y) !== B.air || sim.occupied(c, y) || !sim.canePlaceable(c, y) || sim.get(c, y - 1) === B.sugar_cane) continue;
    out.push([c, y]);
  }
  return out;
}
export function* plantCane(sim, n = 3) {
  if (!sim.has('sugar_cane')) return { ok: false, why: 'no sugar cane to plant' };
  let planted = 0;
  for (const [c, y] of caneSpots(sim)) {
    if (planted >= n || !sim.has('sugar_cane')) break;
    const r = yield* placeAt(sim, c, y, 'sugar_cane');
    if (r.ok) planted++;
  }
  return planted ? { ok: true } : { ok: false, why: 'nowhere by the water near home to plant it' };
}

// ------------------------------------------------ the automatic smelter ----
// Minecraft's classic, stood up on a tile graph:
//            [input chest]          t, g+2   ore goes in here
//            [hopper ↓   ]          t, g+1
//   [fuel chest]  [furnace]         u, g+1 / t, g
//   [hopper →  ]                    u, g     (feeds the furnace's fuel from the side)
//            [hopper →   ]          t, g-1   takes the furnace's output ...
//   [output chest]                  s, g-1   ... into this chest, set in the ground
// t, s and u are three tiles, s and u neighbours of t. The player stands on
// the output chest to reach all three chests.
const diggable = (sim, c, y) => { const id = sim.get(c, y); return [B.dirt, B.grass, B.sand, B.stone, B.cobblestone].includes(id) && !sim.protect.has(c * H + y); };
export function smelterSite(sim, res = reserved(sim)) {
  for (const t of nearHome(sim, 12)) {
    if (!okCol(sim, res, t)) continue;
    const g = standY(sim, t);
    if (g == null || ![g, g + 1, g + 2].every((y) => sim.get(t, y) === B.air) || !diggable(sim, t, g - 1)) continue;
    for (const s of sim.cols[t].adj) {
      if (!okCol(sim, res, s) || standY(sim, s) !== g || !diggable(sim, s, g - 1)) continue;
      for (const u of sim.cols[t].adj) {
        if (u === s || !okCol(sim, res, u) || standY(sim, u) !== g || sim.get(u, g + 1) !== B.air) continue;
        return { t, s, u, g };
      }
    }
  }
  return null;
}
export const SMELTER_PARTS = { hopper: 3, chest: 3, furnace: 1 };
export function* buildSmelter(sim) {
  if (sim.team.smelter) return { ok: false, why: 'the team already has a smelter' };
  const site = smelterSite(sim);
  if (!site) return { ok: false, why: 'no flat patch near home with room for a smelter' };
  for (const [item, n] of Object.entries(SMELTER_PARTS)) { const r = yield* ensure(sim, item, n); if (!r.ok) return r; }
  const { t, s, u, g } = site;
  const vox = [[t, g - 1], [s, g - 1], [t, g], [t, g + 1], [t, g + 2], [u, g], [u, g + 1]];
  sim.protect.add(t * H + g - 2); sim.protect.add(s * H + g - 2);
  sim._machinePart = true;
  try {
    const steps = [
      [t, g - 1, 'hopper', [s, g - 1]],
      [s, g - 1, 'chest'],
      [t, g, 'furnace'],
      [t, g + 1, 'hopper', [t, g]],
      [t, g + 2, 'chest'],
      [u, g, 'hopper', [t, g]],
      [u, g + 1, 'chest'],
    ];
    for (const [c, y, item, face] of steps) {
      const r = yield* placeAt(sim, c, y, item, face || null);
      if (!r.ok) return { ok: false, why: `the ${item} at ${c},${y}: ${r.why}` };
      sim.protect.add(c * H + y);
    }
  } finally { sim._machinePart = false; }
  protectAll(sim, vox);
  reserve(sim, [t, s, u]);
  sim.team.smelter = { input: [t, g + 2], fuel: [u, g + 1], out: [s, g - 1], furnace: [t, g], stand: [s, g] };
  sim.note('smelter', { c: t, y: g });
  return { ok: true };
}
// what goes in: ores and raw food (the furnace smelts them while you are away), and coal beyond a few for torches
export const SMELT_IN = ['iron_ore', 'gold_ore', 'porkchop', 'beef', 'mutton', 'chicken'];
export function* useSmelter(sim) {
  const sm = sim.team.smelter;
  if (!sm) return { ok: false, why: 'no smelter yet' };
  const go = yield* goTo(sim, (c, y) => [sm.input, sm.fuel, sm.out].every(([tc, ty]) => sim.reachable(c, y, tc, ty)), 30000);
  if (!go.ok) return { ok: false, why: `could not get to the smelter (${go.why})` };
  let moved = 0;
  // collect first (it makes room), then load
  const out = sim.contents(sm.out[0] * H + sm.out[1]) || {};
  for (const [item, n] of Object.entries(out)) { const r = yield { op: 'take', c: sm.out[0], y: sm.out[1], item, n }; if (r.ok) moved += n; }
  for (const item of SMELT_IN) if (sim.has(item)) { const n = sim.inv[item]; const r = yield { op: 'store', c: sm.input[0], y: sm.input[1], item, n }; if (r.ok) moved += n; }
  const spare = (sim.inv.coal || 0) - 4;
  if (spare > 0) { const r = yield { op: 'store', c: sm.fuel[0], y: sm.fuel[1], item: 'coal', n: spare }; if (r.ok) moved += spare; }
  if ((sim.inv.charcoal || 0) > 0) { const r = yield { op: 'store', c: sm.fuel[0], y: sm.fuel[1], item: 'charcoal', n: sim.inv.charcoal }; if (r.ok) moved++; }
  return moved ? { ok: true } : { ok: false, why: 'nothing to load or collect' };
}
// what is in the smelter now: waiting, burning, done
export function smelterState(sim) {
  const sm = sim.team.smelter;
  if (!sm) return null;
  const f = sim.ow('furnaces').get(sm.furnace[0] * H + sm.furnace[1]);
  const box = (k) => sim.ow('chests').get(k) || {};
  return { waiting: box(sm.input[0] * H + sm.input[1]), fuel: box(sm.fuel[0] * H + sm.fuel[1]), done: box(sm.out[0] * H + sm.out[1]), furnace: f ? { in: f.in, out: f.out, burning: f.burn > 0 } : null };
}

// -------------------------------------------- the self-harvesting cane ----
// One unit per cane plant, laid out on the tile graph:
//   w  a tile of still water (poured from a bucket) the cane drinks from
//   n  the cane, on the ground beside w; it grows to three pieces, g … g+2
//   O  an OBSERVER watching the top piece's place (n, g+2) — from above, or
//      from a neighbouring tile. When the cane grows into it, it pulses out of
//      its back, and a WIRE carries the pulse (routed over the graph) to
//   P  a PISTON at (k, g+1), k beside n, facing the MIDDLE piece. It cuts it;
//      the top piece falls. The head goes where the observer is not looking,
//      so the cut does not set the next one off (measured: an observer
//      watching the piece the piston cut made a clock, 1,000 pushes a day).
//   d  the tile straight on past n from k: what the piston knocks off lands
//      there, on a HOPPER set in the ground at (d, g-1),
//   e  which passes it into a chest at (e, g-1) beside it.
// Whether a tiling has such a neighbourhood near home is the site search's
// question, and it says so when it has none.
const openAt = (sim, c, ...ys) => ys.every((y) => sim.get(c, y) === B.air && !sim.occupied(c, y));
// wire voxels from `start` to any voxel in `goal` (a Set of keys), each on
// something solid or on a support block to be placed; not in `avoid` columns
function wireRoute(sim, start, goal, avoid, maxLen = 7, top = H - 2) {
  const key = (c, y) => c * H + y;
  // on something solid (not a fence), or over air where a block can go under it
  const canWire = (c, y) => y > 1 && y <= top && sim.get(c, y) === B.air && !sim.occupied(c, y) && !avoid.has(c)
    && (sim.get(c, y - 1) === B.air || (BLOCKS[sim.get(c, y - 1)].solid && !BLOCKS[sim.get(c, y - 1)].fence));
  const [sc, sy] = start;
  if (sim.get(sc, sy) !== B.air) return null;
  const s0 = key(sc, sy), prev = new Map([[s0, -1]]), q = [[s0, 0]];
  for (let qi = 0; qi < q.length; qi++) {
    const [u, dist] = q[qi];
    if (goal.has(u)) { const out = []; for (let v = u; v !== -1; v = prev.get(v)) out.push([Math.floor(v / H), v % H]); return out.reverse(); }
    if (dist >= maxLen) continue;
    const c = Math.floor(u / H), y = u % H;
    for (const n of sim.cols[c].adj) for (const yy of [y, y + 1, y - 1]) {
      const k = key(n, yy);
      if (prev.has(k) || !canWire(n, yy)) continue;
      prev.set(k, u); q.push([k, dist + 1]);
    }
  }
  return null;
}
export function caneUnit(sim, w, g, used, res) {
  const free = (c) => !used.has(c) && okCol(sim, res, c);
  let best = null;
  for (const n of sim.cols[w].adj) {
    if (!free(n) || standY(sim, n) !== g || ![B.grass, B.dirt, B.sand].includes(sim.get(n, g - 1)) || !openAt(sim, n, g, g + 1, g + 2)) continue;
    for (const k of sim.cols[n].adj) {
      if (k === w || !free(k) || !openAt(sim, k, g + 1)) continue;
      const d = sim.straightOn(k, n);
      if (d == null || d === w || !free(d) || standY(sim, d) !== g || !openAt(sim, d, g, g + 1, g + 2) || !diggable(sim, d, g - 1)) continue;
      const e = sim.cols[d].adj.find((x) => ![w, n, k].includes(x) && free(x) && standY(sim, x) === g && diggable(sim, x, g - 1));
      if (e == null) continue;
      const P = k * H + g + 1;
      const beside = new Set(sim.besides(P).filter((v) => v !== n * H + g + 1));
      // the observer: above the cane looking down, or on a neighbour looking across
      // (everything within reach from the ground, g+2 at most: a part up in the air cannot be placed)
      const choices = [];
      for (const o of sim.cols[n].adj) {
        if ([w, k, d, e].includes(o) || !free(o) || !openAt(sim, o, g + 2)) continue;
        const bk = sim.backOf(o * H + g + 2, n * H + g + 2);
        if (bk != null) choices.push({ obs: [o, g + 2], back: [Math.floor(bk / H), bk % H], o });
      }
      for (const ch of choices) {
        const avoid = new Set([w, n, d, e, ...[...used]].filter((c) => c !== ch.back[0] || c !== n));
        if (ch.o != null) avoid.add(ch.o);
        if (avoid.has(ch.back[0]) && ch.back[0] !== n) continue;
        if (ch.back[1] > g + 2) continue;
        const route = wireRoute(sim, ch.back, beside, new Set([...avoid].filter((c) => !(c === n && ch.back[0] === n))), 7, g + 2);
        if (!route) continue;
        // (a route may not come back down beside the cane's own column below the observer)
        if (route.some(([c, y]) => c === n && y <= g + 3)) continue;
        const cost = route.length + route.filter(([c, y]) => sim.get(c, y - 1) === B.air).length;
        if (!best || cost < best.cost) best = { w, n, k, d, e, g, obs: ch.obs, route, cost, cols: [n, k, d, e, ...(ch.o != null ? [ch.o] : []), ...route.map(([c]) => c)] };
      }
    }
  }
  return best;
}
export function caneFarmSite(sim, units = 2, res = reserved(sim)) {
  let best = null;
  for (const w of nearHome(sim, 14)) {
    if (!okCol(sim, res, w)) continue;
    const g = standY(sim, w);
    if (g == null || !diggable(sim, w, g - 1) || !sim.solid(w, g - 2)) continue;
    const used = new Set([w]), got = [];
    for (let i = 0; i < units; i++) {
      const u = caneUnit(sim, w, g, used, res);
      if (!u) break;
      for (const c of u.cols) used.add(c);
      got.push(u);
    }
    if (got.length && (!best || got.length > best.units.length)) best = { w, g, units: got };
    if (best && best.units.length >= units) break;
  }
  return best;
}
export const CANE_UNIT_PARTS = { observer: 1, piston: 1, hopper: 1, chest: 1 };
export function* buildCaneFarm(sim, { units = 2 } = {}) {
  if (sim.team.caneFarm) return { ok: false, why: 'the team already has a cane farm' };
  if (!sim.has('sugar_cane')) return { ok: false, why: 'no sugar cane to plant' };
  if (!sim.has('bucket') && !sim.has('water_bucket')) return { ok: false, why: 'needs a bucket (3 iron ingots)' };
  const site = caneFarmSite(sim, units);
  if (!site) return { ok: false, why: 'no layout for an observer, a piston and a hopper round a cane plant near home, on this tiling' };
  const k = site.units.length;
  const wires = site.units.reduce((n, u) => n + u.route.length, 0);
  const props = site.units.reduce((n, u) => n + u.route.filter(([c, y]) => sim.get(c, y - 1) === B.air).length, 0);
  for (const [item, n] of [...Object.entries(CANE_UNIT_PARTS).map(([i, m]) => [i, m * k]), ['redstone', wires], ['cobblestone', props]]) { if (!n) continue; const r = yield* ensure(sim, item, n); if (!r.ok) return r; }
  if ((sim.inv.sugar_cane || 0) < k) return { ok: false, why: `needs ${k} sugar cane to plant` };
  const { w, g } = site;
  const put = function* (c, y, item, face = null) {
    const r = yield* placeAt(sim, c, y, item, face);
    if (!r.ok) throw new Error(`the ${item.replace(/_/g, ' ')} at ${c},${y}: ${r.why}`);
    sim.protect.add(c * H + y);
  };
  sim._machinePart = true;
  try {
    // the water: dig the tile out and pour a bucket in (it stays: poured water does not flow)
    sim.protect.add(w * H + g - 2);
    const m = yield* mineAt(sim, w, g - 1);
    if (!m.ok) return { ok: false, why: `the water hole: ${m.why}` };
    if (!sim.has('water_bucket')) { const f = yield* fetchWater(sim); if (!f.ok) return f; }
    const go = yield* reachFor(sim, w, g - 1);
    if (!go.ok) return { ok: false, why: go.why };
    let pr = null;
    for (let t = 0; t < 6; t++) {
      pr = yield { op: 'pour', c: w, y: g - 1 };
      if (pr.ok || pr.why !== 'an entity is there') break;
      // whoever fell in the hole (the builder, or an animal) has to climb out first
      if (sim.player.c === w) yield* goTo(sim, (c, y) => c !== w && sim.reachable(c, y, w, g - 1), 4000);
      else yield { op: 'wait', ticks: 4 };
    }
    if (!pr.ok) return { ok: false, why: `pouring the water: ${pr.why}` };
    sim.protect.add(w * H + g - 1);
    for (const u of site.units) {
      // collection first (the hopper into its chest), then the piston, the wire, the observer, and last the cane
      sim.protect.add(u.d * H + g - 2); sim.protect.add(u.e * H + g - 2); sim.protect.add(u.n * H + g - 1);
      yield* put(u.d, g - 1, 'hopper', [u.e, g - 1]);
      yield* put(u.e, g - 1, 'chest');
      yield* put(u.k, g + 1, 'piston', [u.n, g + 1]);
      for (const [c, y] of u.route) {
        if (sim.get(c, y - 1) === B.air) yield* put(c, y - 1, 'cobblestone');
        yield* put(c, y, 'redstone');
      }
      yield* put(u.obs[0], u.obs[1], 'observer', [u.n, g + 2]);
      yield* put(u.n, g, 'sugar_cane');
    }
  } catch (err) {
    return { ok: false, why: err.message };
  } finally { sim._machinePart = false; }
  reserve(sim, [w, ...site.units.flatMap((u) => u.cols)]);
  sim.team.caneFarm = { ...site, chests: site.units.map((u) => [u.e, g - 1]) };
  sim.note('cane_farm', { c: w, y: g, units: site.units.length });
  return { ok: true };
}
// fill the bucket at the nearest water in sight
function* fetchWater(sim) {
  if (sim.has('water_bucket')) return { ok: true };
  const p = sim.player;
  let best = null;
  for (let c = 0; c < sim.N; c++) {
    if (!sim.seen[c] || sim.dist(c, p.c) > 40) continue;
    const y = sim.surface(c) - 1;
    if (sim.get(c, y) !== B.water) continue;
    const d = sim.dist(c, p.c);
    if (!best || d < best.d) best = { c, y, d };
  }
  if (!best) return { ok: false, why: 'no water in sight to fill the bucket' };
  const go = yield* goTo(sim, (c, y) => sim.reachable(c, y, best.c, best.y) || (c === best.c && Math.abs(y - best.y) <= 1), 30000);
  if (!go.ok) return { ok: false, why: `could not get to the water (${go.why})` };
  const r = yield { op: 'fill', c: best.c, y: best.y };
  return r.ok ? { ok: true } : { ok: false, why: r.why };
}
export function caneFarmHolds(sim) {
  const f = sim.team.caneFarm;
  if (!f) return 0;
  return f.chests.reduce((n, [c, y]) => n + ((sim.ow('chests').get(c * H + y) || {}).sugar_cane || 0), 0);
}
export function* collectCane(sim) {
  const f = sim.team.caneFarm;
  if (!f) return { ok: false, why: 'no cane farm yet' };
  let got = 0;
  for (const [c, y] of f.chests) {
    const n = (sim.ow('chests').get(c * H + y) || {}).sugar_cane || 0;
    if (!n) continue;
    const go = yield* reachFor(sim, c, y);
    if (!go.ok) continue;
    const r = yield { op: 'take', c, y, item: 'sugar_cane', n };
    if (r.ok) got += n;
  }
  return got ? { ok: true } : { ok: false, why: 'the farm\'s chests are empty' };
}

// ------------------------------------------------------------ the railway --
// A line of rails from a station near home to somewhere worth going, laid
// along a route that climbs or drops at most one layer a tile. A cart starts
// only on a powered rail that is on, coasts MOMENTUM tiles, and each powered
// rail on the way renews it; so powered rails go at both ends and every 24
// tiles, each kept on by a redstone torch beside it.
export const POWERED_EVERY = 24;
export function railRoute(sim, from, goal, maxNodes = 60000) {
  const res = reserved(sim), key = (c, y) => c * H + y;
  const ok = (c, y) => sim.get(c, y) === B.air && sim.get(c, y + 1) === B.air && BLOCKS[sim.get(c, y - 1)].solid && !BLOCKS[sim.get(c, y - 1)].fence && !sim.protect.has(key(c, y - 1)) && sim.seen[c];
  const start = key(from[0], from[1]);
  if (!ok(from[0], from[1])) return null;
  const prev = new Map([[start, -1]]), q = [start];
  for (let qi = 0; qi < q.length && prev.size < maxNodes; qi++) {
    const u = q[qi], c = Math.floor(u / H), y = u % H;
    if (goal(c, y)) { const out = []; for (let v = u; v !== -1; v = prev.get(v)) out.push([Math.floor(v / H), v % H]); return out.reverse(); }
    for (const n of sim.cols[c].adj) {
      if (res.has(n)) continue;
      for (const yy of [y, y + 1, y - 1]) {
        if (!ok(n, yy)) continue;
        if (yy > y && sim.get(c, y + 2) !== B.air) continue;              // headroom to climb
        const k = key(n, yy);
        if (!prev.has(k)) { prev.set(k, u); q.push(k); }
        break;
      }
    }
  }
  return null;
}
// the voxels of a line that get powered rails, and a torch spot beside each
// Powered rails go at both ends and wherever the cart would run low, riding
// the line either way with the cart's own momentum arithmetic (a climb costs
// 4, the flat 1, a drop nothing); each needs a spot beside it for its torch,
// so one may land a tile or two early.
export function railPlan(sim, route) {
  const onRoute = new Set(route.map(([c]) => c)), res = reserved(sim);
  const torchAt = (i) => { const [c, y] = route[i]; const t = sim.cols[c].adj.find((m) => !onRoute.has(m) && !res.has(m) && sim.get(m, y) === B.air && BLOCKS[sim.get(m, y - 1)].solid && !BLOCKS[sim.get(m, y - 1)].fence); return t == null ? null : [t, y]; };
  // the ends: the line may start and stop a tile or three in, where a torch fits
  const a = [0, 1, 2, 3].find((i) => i < route.length && torchAt(i));
  const z = [0, 1, 2, 3].map((k) => route.length - 1 - k).find((i) => i > (a ?? 0) + 4 && torchAt(i));
  if (a == null || z == null) return null;
  route = route.slice(a, z + 1);
  const P = new Map();
  const put = (i) => { const t = torchAt(i); if (t) P.set(i, t); return !!t; };
  put(0); put(route.length - 1);
  for (const dir of [1, -1]) {
    let m = MOMENTUM_PLAN, last = dir > 0 ? 0 : route.length - 1;
    for (let i = last + dir; i >= 0 && i < route.length; i += dir) {
      if (P.has(i)) { m = MOMENTUM_PLAN; last = i; continue; }
      const cost = railCostPlan(route[i][1] - route[i - dir][1]);
      if (m - cost > 2) { m -= cost; continue; }
      // it would run low here: power a rail at or before this tile (after the last powered one)
      let placed = false;
      for (let j = i; j !== last && !placed; j -= dir) if (put(j)) { placed = true; i = j; }
      if (!placed) return null;
      m = MOMENTUM_PLAN; last = i;
    }
  }
  const powered = [...P.entries()].sort((a, b) => a[0] - b[0]).map(([i, torch]) => ({ i, rail: route[i], torch }));
  return { route, powered, rails: route.length - powered.length };
}
export function* buildRail(sim, { to } = {}) {
  if (!to) return { ok: false, why: 'no destination' };
  const home = sim.team.stations?.rail || null;
  const start = home || (() => { const s = stationSite(sim); return s; })();
  if (!start) return { ok: false, why: 'nowhere near home for a station' };
  const route = railRoute(sim, start, (c, y) => sim.dist(c, to[0]) <= 1.5 && Math.abs(y - to[1]) <= 2);
  if (!route) return { ok: false, why: 'no route for rails there (climbs of one layer a tile at most, over seen ground)' };
  const plan = railPlan(sim, route);
  if (!plan) return { ok: false, why: 'no room beside the ends for the torches that keep the powered rails on' };
  route.splice(0, route.length, ...plan.route);
  for (const [item, n] of [['rail', plan.rails], ['powered_rail', plan.powered.length], ['redstone_torch', plan.powered.length]]) {
    const r = yield* ensure(sim, item, n);
    if (!r.ok) return r;
  }
  const pw = new Set(plan.powered.map((p) => p.i));
  // the ground under the whole line and the torches, from now on (the builder's own route would dig it)
  for (const [c, y] of route) sim.protect.add(c * H + y - 1);
  for (const p of plan.powered) sim.protect.add(p.torch[0] * H + p.torch[1] - 1);
  // lay it from the far end back home, so the builder walks the ground, not the rails
  for (let i = route.length - 1; i >= 0; i--) {
    const [c, y] = route[i];
    const r = yield* placeAt(sim, c, y, pw.has(i) ? 'powered_rail' : 'rail', null, 80000);
    if (!r.ok) return { ok: false, why: `rail ${i} of ${route.length}: ${r.why}` };
    sim.protect.add(c * H + y - 1);
  }
  for (const p of plan.powered) {
    const r = yield* placeAt(sim, p.torch[0], p.torch[1], 'redstone_torch', null, 80000);
    if (!r.ok) return { ok: false, why: `a torch for a powered rail: ${r.why}` };
    sim.protect.add(p.torch[0] * H + p.torch[1]);
  }
  (sim.team.lines ||= []).push({ from: route[0], to: route[route.length - 1], length: route.length });
  reserve(sim, [route[0][0]]);
  sim.note('railway', { from: route[0], to: route[route.length - 1], length: route.length });
  return { ok: true };
}
// Ride a line from one end to the other: get to the end nearest you, get in,
// and go till the cart stops. `toward`: 'far' (away from home) or 'home'.
export function* rideRail(sim, { line = 0, toward = 'far' } = {}) {
  const L = (sim.team.lines || [])[line];
  if (!L) return { ok: false, why: 'no railway yet' };
  if (!sim.has('minecart') && !sim.player.cart) return { ok: false, why: 'no minecart (5 iron ingots)' };
  const [a, b] = toward === 'far' ? [L.from, L.to] : [L.to, L.from];
  const p = sim.player;
  if (!(p.c === a[0] && p.y === a[1])) {
    const go = yield* goTo(sim, (c, y) => c === a[0] && y === a[1], 40000);
    if (!go.ok) return { ok: false, why: `could not get to the station (${go.why})` };
  }
  const first = sim.railLinks(p.c, p.y)[0];
  if (!first) return { ok: false, why: 'the rails are broken at the station' };
  const line2 = sim.railLine(p.c, p.y, first[0]);
  let i = 0, stalls = 0;
  while (i < line2.length && stalls < 2) {
    const steps = line2.slice(i, i + 2);
    const before = [p.c, p.y];
    const r = yield { op: 'ride', steps };
    if (!r.ok) break;
    const moved = line2.findIndex(([c, y]) => c === p.c && y === p.y);
    if (moved < 0 || (p.c === before[0] && p.y === before[1])) { stalls++; continue; }
    i = moved + 1;
  }
  yield { op: 'ride', steps: [] };                          // out of the cart, and pick it up
  const there = p.c === b[0] && p.y === b[1];
  return there ? { ok: true } : { ok: false, why: `the cart stopped ${line2.length - i} rails short` };
}
