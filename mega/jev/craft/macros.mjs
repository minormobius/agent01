// craft/macros.mjs — the palette. System 2 writes these; System 1 picks one.
//
// A macro is a generator over one Sim: it yields primitive actions
// ({op:'move'|'mine'|'place'|'craft'|'eat'|'attack'|'wait', …}) and receives
// each action's result back from the runner. It returns a summary
// { ok, why? }. Macros do the computing — pathfinding, choosing which block,
// in what order — so the model that picks among them only ever DECIDES
// (the rule from ../CLAUDE.md: the caller computes, the model decides).
//
// Every macro must fail cleanly: a missing ingredient, an unreachable goal or
// a blocked step returns { ok: false, why } rather than looping. The runner
// can also abort any macro between two actions (an interrupt), so a macro
// holds no state that is only valid mid-sequence.

import { B, BLOCKS, H, RECIPES, PICK_TIER } from './world.mjs';

const MAX_STEPS = 400;

// ------------------------------------------------------------ movement ------
// Get to the nearest standing state that satisfies goal — walking where it
// can, mining through where that is cheaper (sim.digPath). Re-plans when a
// step is refused (a mob in the way, a block that changed under us).
export function* goTo(sim, goal, maxNodes = 30000) {
  const p = sim.player;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (goal(p.c, p.y)) return { ok: true };
    const path = sim.digPath(p, goal, maxNodes);
    if (!path) return { ok: false, why: 'no path, even digging' };
    let blocked = false;
    for (const st of path.slice(0, MAX_STEPS)) {
      for (const [c, y] of st.mine) {
        if (!BLOCKS[sim.get(c, y)].solid) continue;
        const r = yield { op: 'mine', c, y };
        if (!r.ok) { blocked = true; break; }
      }
      if (blocked) break;
      if (st.c !== p.c) {
        const r = yield { op: 'move', to: st.c };
        if (!r.ok) { blocked = true; break; }
      }
      if (p.c !== st.c || p.y !== st.y) { blocked = true; break; }   // the world disagreed with the plan
    }
    if (!blocked && goal(p.c, p.y)) return { ok: true };
    if (blocked && attempt >= 2) yield { op: 'wait', ticks: 2 };      // let a mob wander off
  }
  return { ok: false, why: 'kept getting blocked' };
}

// true when a block of one of `ids` is in reach from a body at (c, y)
function reachHas(sim, c, y, ids) {
  for (const [tc, ty] of sim.reachSet(c, y)) if (ids.includes(sim.get(tc, ty))) return true;
  return false;
}

// mine every block of `ids` in reach
function* mineInReach(sim, ids, max = Infinity) {
  let n = 0;
  const p = sim.player;
  // highest first: mining a block under our own feet drops us a layer and
  // changes what is in reach, so it goes last
  const targets = sim.reachSet().filter(([c, y]) => ids.includes(sim.get(c, y)))
    .sort((a, b) => b[1] - a[1]);
  for (const [c, y] of targets) {
    if (n >= max) break;
    if (!sim.reachable(p.c, p.y, c, y)) continue;      // we fell; what is left is re-found next pass
    const r = yield { op: 'mine', c, y };
    if (r.ok) n++;
  }
  return n;
}

// ------------------------------------------------------------- the palette --

// Chop trees until holding `n` logs.
export function* gatherWood(sim, n = 6) {
  let dry = 0;
  while ((sim.inv.log || 0) < n) {
    const go = yield* goTo(sim, (c, y) => reachHas(sim, c, y, [B.log]));
    if (!go.ok) return { ok: false, why: `no reachable tree (${go.why})` };
    const got = yield* mineInReach(sim, [B.log]);
    if (!got && ++dry > 3) return { ok: false, why: 'trees out of reach' };
  }
  return { ok: true };
}

// Craft `item` until holding `n`, crafting intermediates (planks, sticks,
// a crafting table, a furnace) along the way and placing a station if one
// is needed and none is near. Does not gather raw materials.
export function* craft(sim, item, n = 1) {
  let guard = 0;
  while ((sim.inv[item] || 0) < n) {
    if (++guard > 40) return { ok: false, why: `gave up crafting ${item}` };
    const r = RECIPES[item];
    if (!r) return { ok: false, why: `${item} cannot be crafted` };
    // the station first: building one spends planks the recipe may need
    if (r.at && !sim.near(B[r.at])) {
      const st = yield* placeStation(sim, r.at);
      if (!st.ok) return st;
    }
    // crafting one ingredient can eat another (sticks are made of planks),
    // so re-check the whole list until a pass finds nothing missing
    for (let pass = 0; pass < 4; pass++) {
      const missing = Object.entries(r.need).filter(([k, q]) => (sim.inv[k] || 0) < q);
      if (!missing.length) break;
      for (const [k, q] of missing) {
        if (!RECIPES[k] || k === 'iron_ore') return { ok: false, why: `needs ${q} ${k}, holding ${sim.inv[k] || 0}` };
        const sub = yield* craft(sim, k, q);
        if (!sub.ok) return sub;
      }
    }
    const res = yield { op: 'craft', item };
    if (!res.ok) return { ok: false, why: res.why };
  }
  return { ok: true };
}

// Put a station down in reach — carrying one, or crafting one first.
export function* placeStation(sim, name) {
  if (!sim.has(name)) {
    const made = yield* craft(sim, name, 1);
    if (!made.ok) return made;
  }
  let spot = placeSpot(sim);
  if (!spot) {
    const wall = carveSpot(sim);
    if (wall) { const m = yield { op: 'mine', c: wall[0], y: wall[1] }; if (m.ok) spot = wall; }
  }
  if (!spot) return { ok: false, why: `nowhere to put the ${name}` };
  const r = yield { op: 'place', c: spot[0], y: spot[1], item: name };
  return r.ok ? { ok: true } : { ok: false, why: r.why };
}
// an air voxel in reach with something solid under it. In a tunnel there is
// none, so carve one out of the wall first (the caller mines it).
function placeSpot(sim) {
  const p = sim.player;
  for (const y of [p.y, p.y + 1]) for (const n of sim.cols[p.c].adj) {
    const here = sim.get(n, y);
    if ((here === B.air || here === B.water) && sim.solid(n, y - 1) && !sim.occupied(n, y)) return [n, y];
  }
  return null;
}
function carveSpot(sim) {
  const p = sim.player;
  for (const n of sim.cols[p.c].adj) {
    if (sim.solid(n, p.y - 1) && sim.clearCost(n, p.y, sim.pickTier()) < Infinity && sim.get(n, p.y) !== B.air) return [n, p.y];
  }
  return null;
}

// Dig a staircase down, one layer per step, keeping every stone, coal and
// (tier permitting) iron in reach. Stops at layer `floor` or when `until()`.
export function* staircase(sim, { floor = 8, until = () => false } = {}) {
  if (sim.pickTier() < 1) return { ok: false, why: 'needs a pickaxe' };
  const p = sim.player;
  let prev = -1;
  for (let k = 0; k < 60 && !until(); k++) {
    yield* grabOre(sim);
    if (until()) break;
    // the next column: the neighbour farthest from where we came from, so the
    // stair runs roughly straight instead of spiralling into itself
    const here = sim.cols[p.c];
    let best = -1, bd = -Infinity;
    for (const n of here.adj) {
      if (n === prev) continue;
      const need = p.y > floor ? [p.y + 1, p.y, p.y - 1] : [p.y + 1, p.y];
      if (need.some((y) => sim.clearCost(n, y, sim.pickTier()) === Infinity)) continue;
      if (p.y > floor && !sim.solid(n, p.y - 2)) continue;    // a stair needs a tread
      // first step: head inland (more ground under us); after that, straight on
      const d = prev < 0 ? -Math.hypot(sim.cols[n].x, sim.cols[n].z) : sim.dist(n, prev);
      if (d > bd) { bd = d; best = n; }
    }
    if (best < 0) {
      // nowhere to stair to (water on every side, or a dead end): dig
      // straight down one instead, if what is under that is solid ground
      if (p.y > floor && sim.solid(p.c, p.y - 2) && sim.clearCost(p.c, p.y - 1, sim.pickTier()) < Infinity) {
        const r = yield { op: 'mine', c: p.c, y: p.y - 1 };
        if (!r.ok) return { ok: false, why: r.why };
        prev = -1;
        continue;
      }
      // last resort: let the digging pathfinder find ANY way one layer down
      const y0 = p.y;
      const go = yield* goTo(sim, (c, y) => y < y0, 6000);
      if (!go.ok) return { ok: false, why: 'boxed in' };
      prev = -1;
      continue;
    }
    const down = p.y > floor;
    const ys = down ? [p.y + 1, p.y, p.y - 1] : [p.y + 1, p.y];
    for (const y of ys) {
      const id = sim.get(best, y);
      if (!BLOCKS[id].solid) continue;
      const r = yield { op: 'mine', c: best, y };
      if (!r.ok) return { ok: false, why: r.why };
    }
    const from = p.c;
    let m = yield { op: 'move', to: best };
    for (let w = 0; !m.ok && m.why === 'occupied' && w < 4; w++) { yield { op: 'wait', ticks: 3 }; m = yield { op: 'move', to: best }; }
    if (!m.ok) return { ok: false, why: m.why };
    prev = from;
  }
  return { ok: true };
}

// mine every ore in reach the pick can take
export function* grabOre(sim) {
  const ids = [B.coal_ore, B.stone];
  if (sim.pickTier() >= 2) ids.push(B.iron_ore);
  const ores = sim.reachSet().filter(([c, y]) => [B.coal_ore, B.iron_ore].includes(sim.get(c, y)));
  let got = 0;
  for (const [c, y] of ores) {
    const r = yield { op: 'mine', c, y };
    if (r.ok) got++;
  }
  return got;
}

// Collect `n` cobblestone by staircasing down.
export function* mineStone(sim, n = 11) {
  return yield* staircase(sim, { floor: 4, until: () => (sim.inv.cobblestone || 0) >= n });
}

// Tunnel down to the iron band, then along it, until holding the targets.
export function* mineIron(sim, { iron = 3, coal = 3 } = {}) {
  if (sim.pickTier() < 2) return { ok: false, why: 'iron needs a stone pickaxe' };
  const enough = () => (sim.inv.iron_ore || 0) + (sim.inv.iron_ingot || 0) >= iron && (sim.inv.coal || 0) >= coal;
  for (let leg = 0; leg < 6 && !enough(); leg++) {
    const r = yield* staircase(sim, { floor: 9, until: enough });
    if (!r.ok && !enough()) return r;
  }
  return enough() ? { ok: true } : { ok: false, why: 'the vein ran out' };
}

// Dig two layers straight down and cap the hole: a one-block shelter. On any
// tiling the walls are whatever the neighbour columns already hold.
export function* digIn(sim) {
  const p = sim.player;
  const cap = ['dirt', 'cobblestone', 'planks', 'sand', 'log'].find((k) => sim.has(k));
  for (let k = 0; k < 2; k++) {
    if (sim.get(p.c, p.y - 1) === B.bedrock) break;
    const r = yield { op: 'mine', c: p.c, y: p.y - 1 };
    if (!r.ok) return { ok: false, why: r.why };
  }
  const item = cap || ['dirt', 'cobblestone', 'planks', 'sand', 'log'].find((k) => sim.has(k));
  if (!item) return { ok: false, why: 'nothing to cap the hole with' };
  if (sim.get(p.c, p.y + 2) === B.air) {
    const r = yield { op: 'place', c: p.c, y: p.y + 2, item };
    if (!r.ok) return { ok: false, why: r.why };
  }
  return { ok: true };
}

// Wait out the night where you stand, then climb back to the surface.
export function* sleepUntilDawn(sim) {
  const DAYLEN = 4800;
  const left = DAYLEN - (sim.tick % DAYLEN);
  if (left > 0 && sim.isNight()) yield { op: 'wait', ticks: left };
  return yield* surface(sim);
}

// Pillar up out of a hole: mine the cap, stand on placed blocks.
export function* surface(sim) {
  const p = sim.player;
  for (let k = 0; k < 20; k++) {
    if (sim.skyOpen(p.c, p.y + 2) && sim.cols[p.c].adj.some((n) => sim.stepTarget(p.c, p.y, n) != null)) return { ok: true };
    if (sim.solid(p.c, p.y + 2)) { const r = yield { op: 'mine', c: p.c, y: p.y + 2 }; if (!r.ok) return { ok: false, why: r.why }; }
    // step out sideways if we can now climb
    for (const n of sim.cols[p.c].adj) {
      if (sim.stepTarget(p.c, p.y, n) === p.y + 1) { yield { op: 'move', to: n }; break; }
    }
    if (sim.skyOpen(p.c, p.y + 2)) continue;
    // otherwise dig a step up in a neighbour
    const n = sim.cols[p.c].adj[0];
    for (const y of [p.y + 1, p.y + 2]) if (sim.solid(n, y)) yield { op: 'mine', c: n, y };
    yield { op: 'move', to: n };
  }
  return { ok: sim.skyOpen(p.c, p.y + 2) };
}

// Hit the nearest adjacent hostile until it dies or we must stop.
export function* fight(sim, kind = 'zombie') {
  for (let k = 0; k < 20; k++) {
    const t = [...sim.ents.values()].find((e) => e.kind === kind && sim.adjacentTo(sim.player, e));
    if (!t) return { ok: true };
    const r = yield { op: 'attack', id: t.id };
    if (!r.ok) return { ok: false, why: r.why };
  }
  return { ok: false, why: 'fight dragged on' };
}

// Chase down the nearest pig for food.
export function* hunt(sim) {
  const pig = () => [...sim.ents.values()].filter((e) => e.kind === 'pig')
    .sort((a, b) => sim.dist(a.c, sim.player.c) - sim.dist(b.c, sim.player.c))[0];
  for (let k = 0; k < 8; k++) {
    const g = pig();
    if (!g) return { ok: false, why: 'no pigs' };
    if (sim.adjacentTo(sim.player, g)) {
      yield* fight(sim, 'pig');
      if (!sim.ents.has(g.id)) return { ok: true };
      continue;
    }
    const go = yield* goTo(sim, (c, y) => (sim.cols[c].adj.includes(g.c) || c === g.c) && Math.abs(y - g.y) <= 1, 8000);
    if (!go.ok) return { ok: false, why: 'could not reach a pig' };
  }
  return { ok: false, why: 'the pig kept moving' };
}

export function* eat(sim) {
  const food = ['cooked_porkchop', 'apple', 'porkchop'].find((k) => sim.has(k));
  if (!food) return { ok: false, why: 'no food' };
  const r = yield { op: 'eat', item: food };
  return r.ok ? { ok: true } : { ok: false, why: r.why };
}

// The palette as a table: name → (sim, args) => generator. What a planner (or
// Jev's `choice` question) picks from.
export const PALETTE = {
  gather_wood: (sim, a) => gatherWood(sim, a?.n),
  craft: (sim, a) => craft(sim, a.item, a.n),
  mine_stone: (sim, a) => mineStone(sim, a?.n),
  mine_iron: (sim, a) => mineIron(sim, a),
  dig_in: (sim) => digIn(sim),
  sleep_until_dawn: (sim) => sleepUntilDawn(sim),
  surface: (sim) => surface(sim),
  fight: (sim) => fight(sim),
  hunt: (sim) => hunt(sim),
  eat: (sim) => eat(sim),
};
