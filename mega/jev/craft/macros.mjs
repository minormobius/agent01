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

import { B, BLOCKS, H, RECIPES, PICK_TIER, BUILDING, recipeBags, SPECIES, SPECIES_NAMES, EAT_ORDER } from './world.mjs';
import { habitat, needsFarmland, wet } from './plants.mjs';

const MAX_STEPS = 400;

// ------------------------------------------------------------ movement ------
// Get to the nearest standing state that satisfies goal — walking where it
// can, mining through where that is cheaper (sim.digPath). Re-plans when a
// step is refused (a mob in the way, a block that changed under us).
export function* goTo(sim, goal, maxNodes = 30000) {
  const p = sim.player;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (goal(p.c, p.y)) return { ok: true };
    let path = sim.digPath(p, goal, maxNodes);
    // boxed in (a pit by the sea, where nothing may be dug): build steps out of
    // carried blocks, one layer at a time, then plan again from higher up
    if (!path && attempt === 0) { const up = yield* climbOut(sim); if (up) path = sim.digPath(p, goal, maxNodes); }
    if (!path) {
      // the planner routes around mobs, so a pig in a doorway can close the
      // only way: give it a moment before calling the goal unreachable
      const pig = [...sim.ents.values()].find((e) => e.kind === 'pig' && sim.adjacentTo(p, e));
      if (pig && attempt < 4) { for (let k = 0; k < 12 && sim.ents.has(pig.id); k++) yield { op: 'attack', id: pig.id }; continue; }
      if (attempt < 2 && [...sim.ents.values()].some((e) => e !== p && sim.dist(e.c, p.c) < 12)) { yield { op: 'wait', ticks: 6 }; continue; }
      return { ok: false, why: 'no path, even digging' };
    }
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
    if (blocked) yield { op: 'wait', ticks: 3 };                     // let a mob wander off
  }
  return { ok: false, why: 'kept getting blocked' };
}

// Place a carried block against a wall at foot level and step up onto it,
// up to `max` layers, while that gains height. Returns the layers climbed.
export function* climbOut(sim, max = 6) {
  const p = sim.player;
  let up = 0;
  for (let k = 0; k < max; k++) {
    const item = BUILDING.find((b) => sim.has(b));
    if (!item) break;
    if (!sim.passable(p.c, p.y + 2)) break;                     // no headroom to climb into
    // a neighbour that is a wall higher up (so the step leads somewhere) and
    // open at foot level and above
    const n = sim.cols[p.c].adj.find((w) => sim.passable(w, p.y) && sim.passable(w, p.y + 1) && sim.passable(w, p.y + 2) && !sim.occupied(w, p.y)
      && sim.cols[w].adj.some((v) => v !== p.c && sim.solid(v, p.y + 1)));
    if (n == null) break;
    const r = yield { op: 'place', c: n, y: p.y, item };
    if (!r.ok) break;
    const m = yield { op: 'move', to: n };
    if (!m.ok || p.c !== n) break;
    up++;
  }
  return up;
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
    let go = yield* goTo(sim, (c, y) => reachHas(sim, c, y, [B.log]));
    if (!go.ok) {
      // nothing close enough to plan to: go and find trees, then try again
      const sc = yield* scout(sim, 'tree');
      if (sc.ok) go = yield* goTo(sim, (c, y) => reachHas(sim, c, y, [B.log]));
      if (!go.ok) return { ok: false, why: `no reachable tree (${go.why})` };
    }
    const got = yield* mineInReach(sim, [B.log]);
    if (!got && ++dry > 3) return { ok: false, why: 'trees out of reach' };
  }
  return { ok: true };
}

// What raw materials we are short of to end up HOLDING `q` of `item` (what is
// already carried counts), all the way down the
// recipe tree (sticks → planks → logs), taking the best bag at each level.
// {} means it can be made from what is carried. A station (table, furnace)
// that is neither near nor carried counts too: craft() would have to build it.
export function shortfall(sim, item, q = 1, have = null, depth = 0) {
  have = have || { ...sim.inv };
  const short = {};
  const take = (k, n) => {
    const got = Math.min(have[k] || 0, n);
    have[k] = (have[k] || 0) - got;
    let rest = n - got;
    if (!rest) return;
    const r = RECIPES[k];
    if (!r || k === 'iron_ore' || depth > 6) { short[k] = (short[k] || 0) + rest; return; }
    const batches = Math.ceil(rest / r.n);
    // a station neither near nor carried has to be made too (once)
    if (r.at && !sim.near(B[r.at]) && !(have[r.at] > 0) && !have['@' + r.at]) {
      have['@' + r.at] = 1;
      const st = shortfall(sim, r.at, 1, have, depth + 1);
      for (const [sk, sn] of Object.entries(st)) short[sk] = (short[sk] || 0) + sn;
      have[r.at] = (have[r.at] || 0) + 1;
    }
    let best = null;
    for (const bag of recipeBags(r)) {
      const trial = { ...have };
      const sub = {};
      for (const [bk, bn] of Object.entries(bag)) Object.entries(shortfall(sim, bk, bn * batches, trial, depth + 1)).forEach(([sk, sn]) => { sub[sk] = (sub[sk] || 0) + sn; });
      const miss = Object.values(sub).reduce((a, b) => a + b, 0);
      if (!best || miss < best.miss) best = { miss, sub, trial };
    }
    Object.assign(have, best.trial);
    for (const [sk, sn] of Object.entries(best.sub)) short[sk] = (short[sk] || 0) + sn;
    have[k] = (have[k] || 0) + batches * r.n - rest;
  };
  take(item, q);
  return short;
}
export const describeShort = (sh) => Object.entries(sh).map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`).join(', ');

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
    // several bags may make it (a torch from coal or charcoal): take the one
    // whose missing pieces we can actually make, fewest missing first
    const bags = recipeBags(r).map((g) => {
      const miss = Object.entries(g).filter(([k, q]) => (sim.inv[k] || 0) < q);
      // joint: the ingredients of one bag draw on the same inventory
      const trial = { ...sim.inv }, sh = {};
      for (const [k, q] of Object.entries(g)) for (const [sk, sn] of Object.entries(shortfall(sim, k, q, trial))) sh[sk] = (sh[sk] || 0) + sn;
      return { g, miss, sh, raw: Object.values(sh).reduce((a, b) => a + b, 0) };
    }).sort((a, b) => a.raw - b.raw || a.miss.length - b.miss.length);
    if (bags[0].raw > 0) return { ok: false, why: `short of ${describeShort(bags[0].sh)}` };
    const bag = bags[0].g;
    for (let pass = 0; pass < 4; pass++) {
      const missing = Object.entries(bag).filter(([k, q]) => (sim.inv[k] || 0) < q);
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
  // indoors with no safe tile: set it up outside, by the door (measured: a
  // house with no room for a table made every crafting option a trap)
  const hs = sim._house;
  if (!spot && hs && hs.interior.includes(sim.player.c)) {
    const out = new Set(hs.outside);
    const ex = yield* goTo(sim, (c) => out.has(c), 8000);
    if (ex.ok) spot = placeSpot(sim);
  }
  if (!spot) return { ok: false, why: `nowhere to put the ${name}` };
  const r = yield { op: 'place', c: spot[0], y: spot[1], item: name };
  if (!r.ok) return { ok: false, why: r.why };
  // indoors: prove the way out survived, or take the station back
  const h = sim._house;
  if (h && h.interior.includes(sim.player.c) && !sim.path(sim.player, (c) => h.outside.includes(c), 4000)) {
    yield { op: 'mine', c: spot[0], y: spot[1] };
    const out = new Set(h.outside);
    const ex = yield* goTo(sim, (c) => out.has(c), 8000);
    const again = ex.ok && placeSpot(sim);
    if (!again) return { ok: false, why: `a ${name} there would block the door` };
    const r2 = yield { op: 'place', c: again[0], y: again[1], item: name };
    return r2.ok ? { ok: true } : { ok: false, why: r2.why };
  }
  return { ok: true };
}
// an air voxel in reach with something solid under it. In a tunnel there is
// none, so carve one out of the wall first (the caller mines it).
// Inside a house, the centre and the tiles beside the door are the way out:
// never put a station there (measured: a furnace beside the door once sealed
// the player in for the rest of the run).
function keepsWayOut(sim, c) {
  const h = sim._house;
  if (!h || !h.interior.includes(c)) return true;
  return c !== h.c0 && !sim.cols[c].adj.includes(h.door);
}
function placeSpot(sim) {
  const p = sim.player;
  for (const y of [p.y, p.y + 1, p.y - 1]) for (const n of sim.cols[p.c].adj) {
    if (!keepsWayOut(sim, n)) continue;
    const here = sim.get(n, y);
    if ((here === B.air || here === B.water) && sim.solid(n, y - 1) && !sim.occupied(n, y)) return [n, y];
  }
  return null;
}
function carveSpot(sim) {
  const p = sim.player;
  for (const n of sim.cols[p.c].adj) {
    if (!keepsWayOut(sim, n)) continue;
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
      if ([p.y - 1, p.y, p.y + 1].some((y) => sim.occupied(n, y))) continue;   // a pig on the next step: go another way
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
  for (let leg = 0; leg < 10 && !enough(); leg++) {
    // ore in sight first — a cave wall, a cliff, the side of our own stair
    const want = [...((sim.inv.iron_ore || 0) + (sim.inv.iron_ingot || 0) < iron ? [B.iron_ore] : []), ...((sim.inv.coal || 0) < coal ? [B.coal_ore] : [])];
    const seen = visible(sim, want, 16);
    if (seen.length) { yield* fetchBlock(sim, ...seen[0]); continue; }
    const r = yield* staircase(sim, { floor: 9, until: () => enough() || visible(sim, want, 5).length > 0 });
    if (!r.ok && !enough()) {
      // the stair is boxed in: tunnel sideways along this layer instead
      const t0 = sim.tick, b = yield* branchMine(sim, 12);
      if (!b.ok && sim.tick === t0) return r;
    }
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
  // in short waits, so an interrupt (a zombie at your side) can cut in
  while (sim.isNight()) yield { op: 'wait', ticks: Math.min(20, DAYLEN - (sim.tick % DAYLEN)) };
  if (atHome(sim)) return { ok: true };           // in the house: just open the door in the morning
  return yield* surface(sim);
}

// Back up to open sky: the digging planner, aimed at any standing spot with
// nothing overhead. It climbs stairs it cuts itself, so it works from a
// capped shelter, a staircase, or the far end of a branch mine.
export const underwater = (sim) => sim.get(sim.player.c, sim.player.y + 1) === B.water;
// Swim up until the head is out of the water (the walking planner, allowed to
// dive for this one purpose; a body in water can rise one layer a step).
export function* swimUp(sim) {
  const p = sim.player;
  if (!underwater(sim)) return { ok: true };
  const path = sim.path(p, (c, y) => sim.get(c, y + 1) !== B.water, 6000, 2, false, true);
  if (!path) return { ok: false, why: 'no way up out of the water' };
  for (const [c] of path) { const r = yield { op: 'move', to: c }; if (!r.ok) return { ok: false, why: r.why }; }
  return underwater(sim) ? { ok: false, why: 'still under water' } : { ok: true };
}
export function* surface(sim) {
  const p = sim.player;
  if (underwater(sim)) { const s = yield* swimUp(sim); if (!s.ok) return s; }
  if (sim.skyOpen(p.c, p.y + 2)) return { ok: true };
  const go = yield* goTo(sim, (c, y) => sim.skyOpen(c, y + 2) && sim.get(c, y - 1) !== B.water, 60000);
  return go.ok ? { ok: true } : { ok: false, why: `no way up (${go.why})` };
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
  // only pigs you can see: a hunter does not know where the herd is
  const pig = () => visiblePigs(sim, 24)
    .sort((a, b) => sim.dist(a.c, sim.player.c) - sim.dist(b.c, sim.player.c))[0];
  for (let k = 0; k < 8; k++) {
    let g = pig();
    if (!g || sim.dist(g.c, sim.player.c) > 24) { yield* scout(sim, 'pig'); g = pig(); }
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
  const food = (sim.player.hp <= 12 && sim.has('moonpetal') ? ['moonpetal'] : []).concat(EAT_ORDER).find((k) => sim.has(k));
  if (!food) return { ok: false, why: 'no food' };
  const r = yield { op: 'eat', item: food };
  return r.ok ? { ok: true } : { ok: false, why: r.why };
}

// ------------------------------------------------------------ seeing -------
// Only what the player could see: a block is VISIBLE when it is in a column
// the player has seen (sim.seen) and has an open face. No x-ray — an ore
// buried in rock is found by digging, not by querying.
export function exposed(sim, c, y) {
  if (sim.passable(c, y + 1) || (y > 0 && sim.passable(c, y - 1))) return true;
  for (const n of sim.cols[c].adj) if (sim.passable(n, y)) return true;
  return false;
}
export function visible(sim, ids, radius = 24) {
  const p = sim.player, out = [], bad = sim._unreachable;
  for (let c = 0; c < sim.N; c++) {
    if (!sim.seen[c] || sim.dist(c, p.c) > radius) continue;
    for (let y = 0; y < H; y++) if (ids.includes(sim.get(c, y)) && exposed(sim, c, y) && !(bad && bad.has(c * H + y))) out.push([c, y]);
  }
  return out.sort((a, b) => sim.dist(a[0], p.c) - sim.dist(b[0], p.c) || Math.abs(a[1] - p.y) - Math.abs(b[1] - p.y));
}
export function visiblePigs(sim, radius = 24) {
  return [...sim.ents.values()].filter((e) => e.kind === 'pig' && sim.seen[e.c] && sim.dist(e.c, sim.player.c) <= radius);
}
// walk (digging if cheaper) to somewhere a specific voxel is in reach, and mine it
// (a block we could not get to is remembered, so the next look past it —
// otherwise the same unreachable ore is retried, one failed search at a time)
function* fetchBlock(sim, c, y) {
  const go = yield* goTo(sim, (pc, py) => sim.reachable(pc, py, c, y), 12000);
  if (!go.ok) { (sim._unreachable = sim._unreachable || new Set()).add(c * H + y); return { ok: false, why: go.why }; }
  const r = yield { op: 'mine', c, y };
  return r.ok ? { ok: true } : { ok: false, why: r.why };
}

// ---------------------------------------------------------------- mine -------

// Coal: take any coal in sight first (cliffs, cave mouths, our own tunnels);
// dig a staircase for it only when none is visible.
export function* mineCoal(sim, n = 4) {
  if (sim.pickTier() < 1) return { ok: false, why: 'coal needs a pickaxe' };
  for (let k = 0; k < 12 && (sim.inv.coal || 0) < n; k++) {
    const seen = visible(sim, [B.coal_ore], 20);
    if (seen.length) { yield* fetchBlock(sim, ...seen[0]); continue; }
    const r = yield* staircase(sim, { floor: 5, until: () => (sim.inv.coal || 0) >= n || visible(sim, [B.coal_ore], 6).length > 0 });
    if (!r.ok && !visible(sim, [B.coal_ore], 6).length) return (sim.inv.coal || 0) >= n ? { ok: true } : r;
  }
  return (sim.inv.coal || 0) >= n ? { ok: true } : { ok: false, why: `found ${sim.inv.coal || 0} of ${n} coal` };
}

// A straight tunnel along the current layer, taking every ore in reach and
// lighting it with a torch every six columns if we carry any. On a Penrose
// floor "straight" is the neighbour most in line with the heading.
export function* branchMine(sim, length = 16) {
  if (sim.pickTier() < 1) return { ok: false, why: 'needs a pickaxe' };
  const p = sim.player;
  // indoors: out through the door first (the walls are protected anyway)
  if (sim._house && sim._house.interior.includes(p.c)) {
    const out = new Set(sim._house.outside);
    const ex = yield* goTo(sim, (c) => out.has(c), 8000);
    if (!ex.ok) return { ok: false, why: `could not get out of the house (${ex.why})` };
  }
  // from the surface, go down into the rock first — a branch mine is a
  // tunnel through stone, not a trench through a hillside
  if (sim.skyOpen(p.c, p.y + 2)) {
    const floor = Math.max(4, Math.min(p.y - 6, 13));
    const down = yield* goTo(sim, (c, y) => y <= floor, 30000);
    if (!down.ok) return { ok: false, why: `could not get down to layer ${floor} (${down.why})` };
  }
  const a = sim.rng() * Math.PI * 2;
  const dir = [Math.cos(a), Math.sin(a)];
  const walked = new Set([p.c]);
  let since = 0, dug = 0;
  for (let k = 0; k < length; k++) {
    yield* grabOre(sim);
    const here = sim.cols[p.c];
    let best = -1, bs = -Infinity;
    for (const n of here.adj) {
      if (walked.has(n)) continue;
      if ([p.y, p.y + 1].some((y) => sim.clearCost(n, y, sim.pickTier()) === Infinity)) continue;
      if (!sim.solid(n, p.y - 1)) continue;            // no floor: a cave or a drop — do not tunnel into it
      const dx = sim.cols[n].x - here.x, dz = sim.cols[n].z - here.z, L = Math.hypot(dx, dz) || 1;
      const sc = (dx * dir[0] + dz * dir[1]) / L;
      if (sc > bs) { bs = sc; best = n; }
    }
    if (best < 0) return dug ? { ok: true, why: 'the tunnel hit water or a drop' } : { ok: false, why: 'nowhere to tunnel' };
    for (const y of [p.y + 1, p.y]) if (sim.solid(best, y)) { const r = yield { op: 'mine', c: best, y }; if (!r.ok) return { ok: false, why: r.why }; }
    const from = p.c;
    const m = yield { op: 'move', to: best };
    if (!m.ok) return { ok: false, why: m.why };
    walked.add(best); dug++;
    if (++since >= 6 && sim.has('torch') && sim.get(from, p.y) === B.air) {
      const t = yield { op: 'place', c: from, y: p.y, item: 'torch' };
      if (t.ok) since = 0;
    }
  }
  return { ok: true };
}

// -------------------------------------------------------------- explore ------

// Walk to the edge of what has been seen and look past it. Keeps a heading
// across calls, so repeated exploring sweeps outward instead of dithering.
export function* explore(sim, steps = 40) {
  const p = sim.player, before = sim.seenCount;
  if (sim._heading == null) sim._heading = sim.rng() * Math.PI * 2;
  let best = -1, bs = -Infinity;
  const here = sim.cols[p.c];
  for (let c = 0; c < sim.N; c++) {
    if (!sim.seen[c] || !sim.cols[c].adj.some((n) => !sim.seen[n])) continue;   // not on the frontier
    const top = sim.surface(c);
    if (sim.get(c, top - 1) === B.water) continue;                               // don't aim at the sea
    const dx = sim.cols[c].x - here.x, dz = sim.cols[c].z - here.z, d = Math.hypot(dx, dz);
    if (d < 4) continue;
    // along the heading, near first — but any land frontier beats none
    const sc = (dx * Math.cos(sim._heading) + dz * Math.sin(sim._heading)) / d - d / 30;
    if (sc > bs) { bs = sc; best = c; }
  }
  if (best < 0) return { ok: false, why: 'all the land in reach has been seen' };
  const walk = sim.path(p, (c) => c === best, 15000);
  if (walk) {
    for (const [c] of walk.slice(0, steps)) { const r = yield { op: 'move', to: c }; if (!r.ok) break; }
  } else {
    const go = yield* goTo(sim, (c) => c === best, 15000);
    if (!go.ok) { sim._heading += Math.PI * 0.6; return { ok: false, why: `frontier unreachable (${go.why})` }; }
  }
  return { ok: true, seen: sim.seenCount - before };
}

// Explore until something of a kind is in sight.
const SCOUT = {
  ...Object.fromEntries(SPECIES_NAMES.map((sp) => [sp, (sim) => visiblePlants(sim, sp).length > 0])),
  tree: (sim) => visible(sim, [B.log], 20).length > 0,
  pig: (sim) => visiblePigs(sim, 20).length > 0,
  coal: (sim) => visible(sim, [B.coal_ore], 20).length > 0,
  iron: (sim) => visible(sim, [B.iron_ore], 20).length > 0,
  sand: (sim) => visible(sim, [B.sand], 20).length > 0,
};
export function* scout(sim, what = 'tree') {
  const found = SCOUT[what];
  if (!found) return { ok: false, why: `nothing called ${what} to scout for` };
  for (let k = 0; k < 8; k++) {
    if (found(sim)) return { ok: true };
    yield* explore(sim, 30);
  }
  return found(sim) ? { ok: true } : { ok: false, why: `no ${what} found after eight legs` };
}

// ------------------------------------------------------------- plants -------
// Mature plants in sight that nobody planted (wild, or abandoned): what
// foraging takes. Own plots are for harvest().
export function visiblePlants(sim, sp = null, radius = 30) {
  const ids = (sp ? [sp] : SPECIES_NAMES).map((k) => B[`${k}_plant`]);
  return visible(sim, ids, radius).filter(([c, y]) => !sim.cultivated.has(c * H + y));
}
const seedsHeld = (sim) => SPECIES_NAMES.filter((sp) => sim.has(`${sp}_seeds`));
const ownPlots = (sim) => Object.entries(sim.player.plots || {}).map(([k, sp]) => ({ k: +k, c: Math.floor(k / H), y: k % H, sp }));
// a ripe plot we just failed to reach is left alone for a while (as ore is),
// or the same hopeless search runs at every decision
const unreachablePlot = (sim, q) => { const t = (sim.player.badPlots || {})[q.k]; return t != null && sim.tick - t < 1200; };
export const ripePlots = (sim) => ownPlots(sim).filter((q) => sim.get(q.c, q.y) === B[`${q.sp}_plant`] && !unreachablePlot(sim, q));
export const growingPlots = (sim) => ownPlots(sim).filter((q) => { const blk = BLOCKS[sim.get(q.c, q.y)]; return blk.plant === q.sp && blk.stage < 2; });

// Take wild plants for their seeds (and produce): the nearest in sight of
// `sp`, or of any species whose seeds are not yet carried.
export function* forage(sim, { sp = null, n = 2 } = {}) {
  let got = 0;
  for (let k = 0; k < n; k++) {
    const want = sp ? [sp] : SPECIES_NAMES.filter((x) => !sim.has(`${x}_seeds`));
    const t = want.flatMap((x) => visiblePlants(sim, x)).sort((a, b) => sim.dist(a[0], sim.player.c) - sim.dist(b[0], sim.player.c))[0];
    if (!t) break;
    const r = yield* fetchBlock(sim, t[0], t[1]);
    if (r.ok) got++;
    else if (!got && k === n - 1) return { ok: false, why: r.why };
  }
  return got ? { ok: true } : { ok: false, why: `no wild ${sp || 'plant'} in sight to take (explore to find one)` };
}

// Sites for `sp` around a centre: empty voxels whose soil, tile shape and
// cover suit it (grass and dirt count as farmland-to-be), where it will also
// actually GROW (sun species out in the open), best first: watered, then near.
export function farmSites(sim, sp, center, r = 10) {
  const [c0, y0] = center, out = [];
  for (const [c, d] of ball(sim, c0, r)) {
    if (!sim.seen[c]) continue;
    for (let y = Math.max(2, y0 - 4); y <= Math.min(H - 2, y0 + 4); y++) {
      if (habitat(sim, sp, c, y, { soilAfterTill: true })) continue;
      if (sim.protect.has(c * H + y - 1) && needsFarmland(sp) && sim.get(c, y - 1) !== B.farmland) continue;   // do not till the house floor
      if (sim.cultivated.has(c * H + y) || sim.occupied(c, y)) continue;
      // glowcaps grow under cover (habitat already demands it); wheat takes
      // sun or a torch; everything else needs open sky
      const growsHere = sp === 'glowcap' ? true : sim.skyOpen(c, y) || (sp === 'wheat' && sim.torchNear(c, 4));
      if (!growsHere) continue;
      out.push({ c, y, d, wet: needsFarmland(sp) && wet(sim, c, y) });
    }
  }
  return out.sort((a, b) => (b.wet - a.wet) || (a.d - b.d));
}
export const farmCenter = (sim) => sim.home && sim.dist(sim.home[0], sim.player.c) < 30 ? sim.home : [sim.player.c, sim.player.y];

// Till and plant up to `n` plots of `sp` near home (or here, with no home).
export function* farm(sim, { sp, n = 3 } = {}) {
  sp = sp || seedsHeld(sim)[0];
  if (!sp) return { ok: false, why: 'no seeds' };
  let planted = 0;
  const tried = new Set();
  for (let k = 0; k < n + 3 && planted < n; k++) {
    if (!sim.has(`${sp}_seeds`)) break;
    if (needsFarmland(sp) && !sim.has('wooden_hoe')) return { ok: false, why: 'needs a hoe' };
    // near home first; a species whose habitat is elsewhere (sunfruit wants a
    // beach) is planted where the player stands, if it suits
    const site = farmSites(sim, sp, farmCenter(sim)).find((q) => !tried.has(q.c * H + q.y))
      || farmSites(sim, sp, [sim.player.c, sim.player.y], 8).find((q) => !tried.has(q.c * H + q.y));
    if (!site) break;
    tried.add(site.c * H + site.y);
    const { c, y } = site;
    const go = yield* goTo(sim, (pc, py) => pc !== c && sim.reachable(pc, py, c, y) && (!needsFarmland(sp) || sim.reachable(pc, py, c, y - 1)), 12000);
    if (!go.ok) continue;
    if (needsFarmland(sp) && sim.get(c, y - 1) !== B.farmland) {
      const t = yield { op: 'till', c, y: y - 1 };
      if (!t.ok) continue;
    }
    const r = yield { op: 'plant', c, y, item: `${sp}_seeds` };
    if (r.ok) planted++;
  }
  return planted ? { ok: true, planted } : { ok: false, why: `nowhere near home or here suits a ${sp}` };
}

// Reap every ripe plot of our own, and plant it again from the seeds it gave.
export function* harvest(sim) {
  let n = 0, missed = 0;
  for (const q of ripePlots(sim).sort((a, b) => sim.dist(a.c, sim.player.c) - sim.dist(b.c, sim.player.c))) {
    if (sim.get(q.c, q.y) !== B[`${q.sp}_plant`]) continue;
    const go = yield* goTo(sim, (pc, py) => pc !== q.c && sim.reachable(pc, py, q.c, q.y), 40000);   // a beach plot can be far from home
    if (!go.ok) { (sim.player.badPlots = sim.player.badPlots || {})[q.k] = sim.tick; missed++; continue; }
    const r = yield { op: 'mine', c: q.c, y: q.y };
    if (!r.ok) continue;
    n++;
    if (sim.has(`${q.sp}_seeds`)) yield { op: 'plant', c: q.c, y: q.y, item: `${q.sp}_seeds` };
  }
  if (!n) return { ok: false, why: missed ? 'could not reach the ripe plots' : 'nothing ripe' };
  return { ok: true, harvested: n };
}

// ------------------------------------------------------------ homestead ------
export const atHome = (sim) => !!sim.home && sim.player.c === sim.home[0] && Math.abs(sim.player.y - sim.home[1]) <= 1
  || (!!sim._house && sim._house.interior.includes(sim.player.c) && sim.player.y === sim.home[1]);

export function* setHome(sim) {
  sim.home = [sim.player.c, sim.player.y];
  sim.note('home', { c: sim.player.c, y: sim.player.y });
  return { ok: true };
}
export function* goHome(sim) {
  if (!sim.home) return { ok: false, why: 'no home yet' };
  const [hc, hy] = sim.home;
  return yield* goTo(sim, (c, y) => c === hc && y === hy, 40000);
}

// graph ball: column → hop distance, out to r
export function ball(sim, c0, r) {
  const d = new Map([[c0, 0]]), q = [c0];
  while (q.length) {
    const u = q.shift();
    if (d.get(u) === r) continue;
    for (const w of sim.cols[u].adj) if (!d.has(w)) { d.set(w, d.get(u) + 1); q.push(w); }
  }
  return d;
}
const TERRAIN = new Set([B.grass, B.dirt, B.sand, B.stone, B.cobblestone, B.coal_ore, B.iron_ore, B.planks, B.bedrock]);
function groundTop(sim, c) {
  for (let y = H - 1; y > 0; y--) if (TERRAIN.has(sim.get(c, y))) return y;
  return 0;
}
const blocksHeld = (sim) => BUILDING.reduce((s, k) => s + (sim.inv[k] || 0), 0);
const nextBlock = (sim) => BUILDING.find((k) => sim.has(k));

// A house plan on the tile graph: centre c0, floor at layer g (the layer you
// stand in). Interior = the ball of radius 1, the ring at hop 2 is the wall,
// everything gets a roof at g+2 — interior height 2, the player's height,
// so every block is placeable from inside (reach is feet−1 … head+1).
export function planHouse(sim, c0) {
  const d = ball(sim, c0, 3);
  const interior = [], ring = [], outside = [];
  for (const [c, k] of d) (k <= 1 ? interior : k === 2 ? ring : outside).push(c);
  const g = groundTop(sim, c0) + 1;
  if (g + 3 >= H) return null;
  let work = 0, blocks = 0;
  const tier = sim.pickTier();
  for (const c of interior) {
    const t = groundTop(sim, c);
    if (t < g - 2 || t > g + 1) return null;                  // too deep to fill / too high to cut
    for (let y = g - 1; y <= g + 2; y++) {
      const id = sim.get(c, y);
      if (id === B.water || sim.bordersWater(c, y)) return null;
      if (id === B.crafting_table || id === B.furnace) return null;
    }
    if (t < g - 1) { work += 1; blocks++; }
    for (const y of [g, g + 1]) if (sim.solid(c, y)) { if (sim.clearCost(c, y, tier) === Infinity) return null; work += 2; }
    if (!sim.solid(c, g + 2) || sim.get(c, g + 2) === B.leaves) blocks++;
  }
  for (const c of ring) {
    if (!sim.cols[c].adj.length || sim.cols[c].nb.includes(-1)) return null;   // the world's rim
    for (let y = g; y <= g + 2; y++) {
      const id = sim.get(c, y);
      if (id === B.water || id === B.crafting_table || id === B.furnace) return null;
      if (!sim.solid(c, y) || id === B.leaves || id === B.log) blocks++;
    }
  }
  // a door: a ring column with open ground outside it at floor level
  let door = -1;
  for (const c of ring) {
    const out = sim.cols[c].adj.find((n) => d.get(n) === 3 && sim.canStand(n, g));
    if (out != null && sim.clearCost(c, g, tier) < Infinity && sim.clearCost(c, g + 1, tier) < Infinity) { door = c; break; }
  }
  if (door < 0) return null;
  return { c0, g, interior, ring, outside, door, cost: work + blocks, blocks };
}

// Is it a shelter? No MOB can walk from inside to outside.
export function sealed(sim, plan) {
  const out = new Set(plan.outside);
  const p = sim.path({ c: plan.c0, y: plan.g }, (c) => out.has(c), 4000, 2, true);
  return !p;
}

export function* buildHouse(sim) {
  const p = sim.player;
  // choose a site: the cheapest plan among seen columns near us
  // doors first: crafting them may put a table down, and that must happen
  // before the site is chosen, not in the middle of it
  if (!sim.has('door', 2)) {
    const d = yield* craft(sim, 'door', 2);
    if (!d.ok) return { ok: false, why: `no door: ${d.why}` };
  }
  const plans = [];
  for (let c = 0; c < sim.N; c++) {
    if (!sim.seen[c] || sim.dist(c, p.c) > 14) continue;
    const top = groundTop(sim, c);
    if (![B.grass, B.dirt, B.sand, B.stone].includes(sim.get(c, top))) continue;
    const pl = planHouse(sim, c);
    if (!pl) continue;
    pl.score = pl.cost + sim.dist(c, p.c) * 0.5;
    plans.push(pl);
  }
  if (!plans.length) return { ok: false, why: 'no buildable site in sight (needs fairly level, dry ground)' };
  plans.sort((a, b) => a.score - b.score);
  // the best site we can actually walk (or dig) to
  let plan = null;
  for (const pl of plans.slice(0, 4)) {
    if (sim.digPath(p, (c, y) => c === pl.c0 && y === pl.g, 30000)) { plan = pl; break; }
  }
  if (!plan) return { ok: false, why: 'no reachable buildable site' };
  const windows = sim.has('glass', 2) ? plan.ring.filter((c) => c !== plan.door).slice(0, 2) : [];
  const need = Math.ceil(plan.blocks * 1.15) + 6;
  if (blocksHeld(sim) < need) return { ok: false, why: `needs ~${need} building blocks, holding ${blocksHeld(sim)}` };
  const { c0, g, interior, ring, door } = plan;
  const inside = new Set(interior), wall = new Set(ring);
  sim.note('build', { house: c0, g, interior: interior.length, ring: ring.length });

  let lastWhy = '';
  const put = function* (c, y) {
    const id = sim.get(c, y);
    if (id === B.leaves || id === B.log) { const m = yield { op: 'mine', c, y }; if (!m.ok) { lastWhy = m.why; return false; } }
    if (sim.solid(c, y)) return true;
    const item = nextBlock(sim);
    if (!item) { lastWhy = 'out of building blocks'; return false; }
    let r = yield { op: 'place', c, y, item };
    // a pig wandered into the wall line: give it a moment to leave — and if
    // it is penned in by the walls already, it becomes dinner
    for (let w = 0; !r.ok && /entity/.test(r.why) && w < 20; w++) {
      const pig = sim.occupied(c, y);
      if (pig && pig.kind === 'pig' && sim.adjacentTo(sim.player, pig) && w >= 2) yield { op: 'attack', id: pig.id };
      else yield { op: 'wait', ticks: 4 };
      r = yield { op: 'place', c, y, item };
    }
    if (!r.ok) lastWhy = r.why;
    return r.ok;
  };
  const clear = function* (c, y) {
    if (!sim.solid(c, y) && sim.get(c, y) !== B.door) return true;
    const r = yield { op: 'mine', c, y };
    return r.ok;
  };
  // pigs on the footprint get walled in and block the work: clear them first
  const foot = new Set([...interior, ...ring]);
  for (const pig of [...sim.ents.values()].filter((e) => e.kind === 'pig' && foot.has(e.c))) {
    const near = yield* goTo(sim, (pc, py) => (sim.cols[pc].adj.includes(pig.c) || pc === pig.c) && Math.abs(py - pig.y) <= 1, 8000);
    if (near.ok) for (let k = 0; k < 12 && sim.ents.has(pig.id) && sim.adjacentTo(p, pig); k++) yield { op: 'attack', id: pig.id };
  }
  const go = yield* goTo(sim, (c, y) => c === c0 && y === g, 30000);
  if (!go.ok) return { ok: false, why: `could not reach the site (${go.why})` };

  // visit the interior in BFS order from the centre; from each column, make
  // its unvisited interior neighbours walkable, then wall and roof the ring
  const order = [c0], seen = new Set([c0]);
  for (let i = 0; i < order.length; i++) for (const n of sim.cols[order[i]].adj) if (inside.has(n) && !seen.has(n)) { seen.add(n); order.push(n); }
  const done = new Set();
  for (const c of order) {
    if (p.c !== c) {
      const g2 = yield* goTo(sim, (pc, py) => pc === c && py === g, 3000);
      if (!g2.ok) return { ok: false, why: `lost my footing inside (${g2.why})` };
    }
    for (const n of sim.cols[c].adj) {
      if (inside.has(n) && !done.has(n) && n !== c0) {
        if (!sim.solid(n, g - 1)) { const item = nextBlock(sim); if (item) yield { op: 'place', c: n, y: g - 1, item }; }
        if (!(yield* clear(n, g + 1)) || !(yield* clear(n, g))) return { ok: false, why: 'could not clear the floor' };
      }
      if (wall.has(n)) {
        if (n === door) { yield* clear(n, g + 1); yield* clear(n, g); }
        else {
          if (!(yield* put(n, g))) return { ok: false, why: `wall: ${lastWhy}` };
          if (windows.includes(n) && sim.solid(n, g + 1) && sim.get(n, g + 1) !== B.glass) yield { op: 'mine', c: n, y: g + 1 };
          if (windows.includes(n) && !sim.solid(n, g + 1)) yield { op: 'place', c: n, y: g + 1, item: 'glass' };
          else if (!(yield* put(n, g + 1))) return { ok: false, why: `wall: ${lastWhy}` };
        }
        if (!(yield* put(n, g + 2))) return { ok: false, why: `roof: ${lastWhy}` };
      }
    }
    done.add(c);
  }
  // roof over the interior, then the door, then light
  for (const c of order) {
    if (sim.solid(c, g + 2) && sim.get(c, g + 2) !== B.leaves) continue;
    if (!sim.reachable(p.c, p.y, c, g + 2)) {
      const g3 = yield* goTo(sim, (pc, py) => py === g && inside.has(pc) && sim.reachable(pc, py, c, g + 2), 3000);
      if (!g3.ok) return { ok: false, why: 'could not reach the roof' };
    }
    if (!(yield* put(c, g + 2))) return { ok: false, why: `roof: ${lastWhy}` };
  }
  const nextToDoor = interior.find((c) => sim.cols[c].adj.includes(door));
  const g4 = yield* goTo(sim, (pc, py) => pc === nextToDoor && py === g, 3000);
  if (!g4.ok) return { ok: false, why: 'could not reach the doorway' };
  // a threshold: ground under the door. A doorway over a hole lets you fall
  // out and never climb back in (measured — go_home failed with no path).
  if (!sim.solid(door, g - 1)) {
    const item = nextBlock(sim);
    if (item) { const f = yield { op: 'place', c: door, y: g - 1, item }; if (!f.ok) return { ok: false, why: `threshold: ${f.why}` }; }
  }
  for (const y of [g, g + 1]) if (sim.get(door, y) !== B.door) {
    yield* clear(door, y);
    let r = yield { op: 'place', c: door, y, item: 'door' };
    for (let w = 0; !r.ok && /entity/.test(r.why) && w < 6; w++) { yield { op: 'wait', ticks: 4 }; r = yield { op: 'place', c: door, y, item: 'door' }; }
    if (!r.ok) return { ok: false, why: `door: ${r.why}` };
  }
  if (sim.has('torch')) {
    const spot = interior.find((c) => c !== c0 && c !== nextToDoor && sim.get(c, g) === B.air && sim.reachable(p.c, p.y, c, g));
    if (spot != null) yield { op: 'place', c: spot, y: g, item: 'torch' };
  }
  if (!sealed(sim, plan)) return { ok: false, why: 'built, but a mob could still walk in' };
  // and the way back in must exist: from each open outside step, a walk to the centre
  const outSteps = sim.cols[door].adj.filter((n) => plan.outside.includes(n) && sim.canStand(n, sim.surface(n)));
  if (!outSteps.some((n) => sim.path({ c: n, y: sim.surface(n) }, (c, y) => c === c0 && y === g, 3000))) return { ok: false, why: 'built, but there is no way back in through the door' };
  sim.protect.add(door * H + g - 1);
  sim.home = [c0, g];
  sim._house = plan;
  for (const c of ring) for (let y = g; y <= g + 2; y++) sim.protect.add(c * H + y);
  for (const c of interior) { sim.protect.add(c * H + g + 2); sim.protect.add(c * H + g - 1); }
  sim.note('home', { c: c0, y: g, house: true });
  return { ok: true };
}

// Torches on open ground around home (or here): zombies do not spawn within
// five of one. Crafts them if it can.
export function* lightArea(sim, n = 4) {
  if ((sim.inv.torch || 0) < n) yield* craft(sim, 'torch', n);
  if (!sim.has('torch')) return { ok: false, why: 'no torches, and nothing to make them from' };
  // the grounds are around the house: get there first (from a mine, say)
  if (sim.home && sim.dist(sim.player.c, sim.home[0]) > 6) {
    const h = yield* goHome(sim);
    if (!h.ok) return { ok: false, why: `could not get home to light it (${h.why})` };
  }
  const [hc] = sim.home || [sim.player.c];
  const d = ball(sim, hc, 5);
  const lit = [];
  let placed = 0;
  const cands = [...d].filter(([, k]) => k >= 3).map(([c]) => c).sort((a, b) => sim.dist(a, hc) - sim.dist(b, hc));
  for (const c of cands) {
    if (placed >= n || !sim.has('torch')) break;
    if (lit.some((l) => sim.dist(l, c) < 3.5)) continue;
    const y = sim.surface(c);
    if (sim.get(c, y) !== B.air || !sim.solid(c, y - 1) || sim.get(c, y - 1) === B.leaves) continue;
    const go = yield* goTo(sim, (pc, py) => sim.reachable(pc, py, c, y) && pc !== c, 4000);
    if (!go.ok) continue;
    const r = yield { op: 'place', c, y, item: 'torch' };
    if (r.ok) { placed++; lit.push(c); }
  }
  if (placed && sim._house && sim.home && sim.dist(sim.player.c, sim.home[0]) <= 8) sim._lit = true;   // the rung is earned by doing it, whoever chose it
  return placed ? { ok: true } : { ok: false, why: 'nowhere to put a torch' };
}

// ------------------------------------------------------------- the team ----
// With more than one player: macros that act FOR someone else. `to` is the
// teammate's entity id.
const mate = (sim, id) => { const e = sim.ents.get(id); return e && e.kind === 'player' && e !== sim.player ? e : null; };
const beside = (sim, e) => (c, y) => (c === e.c || sim.cols[c].adj.includes(e.c)) && Math.abs(y - e.y) <= 1;

export function* follow(sim, to) {
  const e = mate(sim, to);
  if (!e) return { ok: false, why: 'no such teammate' };
  for (let k = 0; k < 4; k++) {                           // they may be walking too
    if (beside(sim, e)(sim.player.c, sim.player.y)) return { ok: true };
    const go = yield* goTo(sim, beside(sim, e), 20000);
    if (!go.ok && k > 1) return { ok: false, why: `could not reach them (${go.why})` };
  }
  return beside(sim, e)(sim.player.c, sim.player.y) ? { ok: true } : { ok: false, why: 'they kept moving' };
}

// Stay by a teammate for a while and fight whatever zombie comes at either of you.
export function* guard(sim, to, ticks = 160) {
  const e = mate(sim, to);
  if (!e) return { ok: false, why: 'no such teammate' };
  const until = sim.tick + ticks;
  while (sim.tick < until) {
    const z = [...sim.ents.values()].filter((q) => q.kind === 'zombie' && sim.dist(q.c, e.c) < 8)
      .sort((a, b) => sim.dist(a.c, sim.player.c) - sim.dist(b.c, sim.player.c))[0];
    if (z) {
      if (sim.adjacentTo(sim.player, z)) { yield { op: 'attack', id: z.id }; continue; }
      const go = yield* goTo(sim, (c, y) => (c === z.c || sim.cols[c].adj.includes(z.c)) && Math.abs(y - z.y) <= 1, 6000);
      if (!go.ok) yield { op: 'wait', ticks: 4 };
      continue;
    }
    if (!beside(sim, e)(sim.player.c, sim.player.y)) { const f = yield* follow(sim, to); if (!f.ok) yield { op: 'wait', ticks: 4 }; }
    else yield { op: 'wait', ticks: 4 };
  }
  return { ok: true };
}

// Walk over and hand a teammate what they asked for: wood (logs/planks) or food.
const GIFTS = { wood: ['log', 'planks'], food: ['cooked_porkchop', 'bread', 'sunfruit', 'porkchop', 'apple'], stone: ['cobblestone'], torches: ['torch'] };
export function* giveItems(sim, to, what = 'wood') {
  const e = mate(sim, to);
  if (!e) return { ok: false, why: 'no such teammate' };
  const items = (GIFTS[what] || [what]).filter((k) => sim.has(k));
  if (!items.length) return { ok: false, why: `holding no ${what}` };
  const f = yield* follow(sim, to);
  if (!f.ok) return f;
  let gave = 0;
  for (const item of items) {
    const n = Math.max(1, Math.ceil((sim.inv[item] || 0) / 2));   // share half, keep half
    const r = yield { op: 'give', to, item, n };
    if (r.ok) gave += n;
  }
  return gave ? { ok: true } : { ok: false, why: 'could not hand anything over' };
}

// ------------------------------------------------------------- palette -------
// The palette as DATA. Each entry: the mode it belongs to, one line of what it
// does, and needs(sim, args) → null when it can run now, or the reason it
// cannot. That reason is the difference between offering a model a choice and
// offering it a trap: Jev's `choice` will be built from the legal entries only.
const hasPick = (sim, t = 1) => sim.pickTier() >= t ? null : `needs a ${['', 'wooden', 'stone', 'iron'][t]} pickaxe`;
const food = (sim) => EAT_ORDER.some((k) => sim.has(k));
export const PALETTE = {
  // mine
  mine_stone:   { mode: 'mine', doc: 'staircase down for cobblestone, taking ore on the way', needs: (s) => hasPick(s), run: (s, a) => mineStone(s, a?.n) },
  mine_coal:    { mode: 'mine', doc: 'take coal in sight, or dig for it', needs: (s) => hasPick(s), run: (s, a) => mineCoal(s, a?.n) },
  mine_iron:    { mode: 'mine', doc: 'down to the iron band and along it', needs: (s) => hasPick(s, 2), run: (s, a) => mineIron(s, a) },
  branch_mine:  { mode: 'mine', doc: 'a straight tunnel on this layer, torch-lit', needs: (s) => hasPick(s), run: (s, a) => branchMine(s, a?.length) },
  surface:      { mode: 'mine', doc: 'climb (or swim) back up to open sky', needs: (s) => underwater(s) ? null : s.skyOpen(s.player.c, s.player.y + 2) ? 'already under open sky' : atHome(s) ? 'in the house — any outdoor activity walks out the door' : null, run: (s) => surface(s) },
  // explore
  explore:      { mode: 'explore', doc: 'walk to the edge of the known and look past it', needs: () => null, run: (s, a) => explore(s, a?.steps) },
  scout:        { mode: 'explore', doc: 'explore until a tree / pig / coal / iron / sand is in sight', needs: () => null, run: (s, a) => scout(s, a?.what) },
  gather_wood:  { mode: 'explore', doc: 'chop the nearest trees', needs: () => null, run: (s, a) => gatherWood(s, a?.n) },
  hunt:         { mode: 'explore', doc: 'chase down a pig in sight for meat', needs: (s) => visiblePigs(s, 24).length ? null : 'no pig in sight (scout for one)', run: (s) => hunt(s) },
  forage:       { mode: 'explore', doc: 'take a wild plant in sight for its seeds (and fruit)', needs: (s, a) => visiblePlants(s, a?.sp).filter(([c, y]) => !a?.sp ? !s.has(`${BLOCKS[s.get(c, y)].plant}_seeds`) : true).length ? null : `no wild ${a?.sp || 'plant you lack seeds for'} in sight`, run: (s, a) => forage(s, a || {}) },
  go_home:      { mode: 'explore', doc: 'walk back to the house', needs: (s) => s.home ? (atHome(s) ? 'already home' : null) : 'no home yet', run: (s) => goHome(s) },
  // homestead
  craft:        { mode: 'homestead', doc: 'make an item, and whatever it is made of', needs: (s, a) => {
    if (!RECIPES[a?.item]) return 'no such recipe';
    const sh = shortfall(s, a.item, a.n || 1);
    return Object.keys(sh).length ? `short of ${describeShort(sh)}` : null;
  }, run: (s, a) => craft(s, a.item, a.n) },
  build_house:  { mode: 'homestead', doc: 'a walled, roofed, lit house with a door, on the tile graph', needs: (s) => s.home && s._house ? 'already have a house' : blocksHeld(s) < 30 ? `needs ~30+ building blocks, holding ${blocksHeld(s)}` : null, run: (s) => buildHouse(s) },
  light_area:   { mode: 'homestead', doc: 'torches around home — nothing spawns near light', needs: (s) => s.has('torch') || s.has('coal') || s.has('charcoal') ? null : 'no torches or fuel for them', run: (s, a) => lightArea(s, a?.n) },
  farm:         { mode: 'homestead', doc: 'till and plant seeds where the species will grow, near home', needs: (s, a) => {
    const sp = a?.sp || seedsHeld(s)[0];
    if (!sp || !s.has(`${sp}_seeds`)) return a?.sp ? `no ${a.sp} seeds` : 'no seeds (forage a wild plant)';
    if (needsFarmland(sp) && !s.has('wooden_hoe')) return 'needs a hoe (craft one)';
    return null;
  }, run: (s, a) => farm(s, a || {}) },
  harvest:      { mode: 'homestead', doc: 'reap your ripe plants and replant them', needs: (s) => ripePlots(s).length ? null : growingPlots(s).length ? 'nothing ripe yet' : 'no plots planted', run: (s) => harvest(s) },
  set_home:     { mode: 'homestead', doc: 'call this spot home', needs: () => null, run: (s) => setHome(s) },
  dig_in:       { mode: 'homestead', doc: 'a one-block emergency shelter, dug straight down', needs: (s) => atHome(s) ? 'already sheltered in the house' : s.clearCost(s.player.c, s.player.y - 1, s.pickTier()) === Infinity ? 'cannot dig here (water, lava or bedrock below)' : BUILDING.some((k) => s.has(k)) ? null : 'nothing to cap the hole with', run: (s) => digIn(s) },
  sleep_until_dawn: { mode: 'homestead', doc: 'wait out the night where you are', needs: (s) => s.isNight() ? null : 'it is day', run: (s) => sleepUntilDawn(s) },
  eat:          { mode: 'homestead', doc: 'eat the best food carried', needs: (s) => !food(s) ? 'no food' : s.player.food >= 20 ? 'not hungry' : null, run: (s) => eat(s) },
  // the team (only offered when someone else is in the world)
  follow:       { mode: 'team', doc: 'go to a teammate', needs: (s, a) => mateNeeds(s, a), run: (s, a) => follow(s, a.to) },
  guard:        { mode: 'team', doc: 'stay by a teammate and fight what comes at them', needs: (s, a) => mateNeeds(s, a), run: (s, a) => guard(s, a.to, a.ticks) },
  give:         { mode: 'team', doc: 'walk over and hand a teammate wood, food, stone or torches', needs: (s, a) => mateNeeds(s, a) || ((GIFTS[a?.what || 'wood'] || []).some((k) => s.has(k)) ? null : `holding no ${a?.what || 'wood'}`), run: (s, a) => giveItems(s, a.to, a.what) },
  fight:        { mode: 'homestead', doc: 'hit whatever hostile is adjacent', needs: (s) => [...s.ents.values()].some((e) => e.kind === 'zombie' && s.adjacentTo(s.player, e)) ? null : 'nothing adjacent to fight', run: (s) => fight(s) },
};
export const MODES = ['mine', 'explore', 'homestead', 'team'];
function mateNeeds(s, a) {
  if (s.players.length < 2) return 'nobody else is here';
  if (a && a.to != null && !mate(s, a.to)) return 'no such teammate';
  return null;
}
export const legalMacros = (sim) => Object.entries(PALETTE).filter(([n, m]) => n !== 'craft' && m.mode !== 'team' && !m.needs(sim, {})).map(([n]) => n);
