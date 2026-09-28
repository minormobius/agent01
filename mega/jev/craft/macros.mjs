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

import { durability, B, BLOCKS, H, RECIPES, PICK_TIER, BUILDING, recipeBags, FUEL, fuelKey, SPECIES, SPECIES_NAMES, EAT_ORDER, roomFor, slotsUsed, CHEST_SLOTS, HOSTILE, blockName, BREED_FOOD } from './world.mjs';
import { habitat, needsFarmland, wet } from './plants.mjs';

const MAX_STEPS = 400;

// Tools wear out. The last pick nearly worn through is the one moment a miner
// must stop digging down and head up: a pick that breaks at the bottom of the
// world strands you there (measured: players found at bedrock with none left).
// 48 uses digs a way out from layer 1 with room to spare.
export const PICK_RESERVE = 48;
export function pickLow(sim) {
  const picks = Object.keys(PICK_TIER).filter((k) => sim.has(k));
  const count = picks.reduce((n, k) => n + sim.inv[k], 0);
  if (count !== 1) return count === 0;
  const k = picks[0];
  // (a wooden pick has 60 uses in all: its reserve is 30% of that, not 48)
  return ((sim.player.wear && sim.player.wear[k]) ?? durability(k)) < Math.min(PICK_RESERVE, Math.floor(durability(k) * 0.3));
}

// ...but only deep down: near the surface a low pick can still mine the three
// stones its replacement needs (without this, 1000 refusals in a row)
export const deepAndLow = (sim) => pickLow(sim) && !sim.skyOpen(sim.player.c, sim.player.y + 2) && sim.surface(sim.player.c) - sim.player.y > 6;

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
      } else if (st.y !== p.y && !st.mine.length) {
        const r = yield { op: 'climb', dir: st.y > p.y ? 1 : -1 };     // a ladder
        if (!r.ok) { blocked = true; break; }
      }
      if (p.c !== st.c || p.y !== st.y) { blocked = true; break; }   // the world disagreed with the plan
    }
    if (!blocked && goal(p.c, p.y)) return { ok: true };
    if (blocked) yield { op: 'wait', ticks: 3 };                     // let a mob wander off
  }
  return { ok: false, why: 'kept getting blocked' };
}

// one step of a walking path: to a neighbour, or up/down a ladder in this column
export const stepOp = (sim, c, y) => c === sim.player.c ? { op: 'climb', dir: y > sim.player.y ? 1 : -1 } : { op: 'move', to: c };

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
  yield* collectItems(sim, 6);           // what the felled crowns let fall (saplings, apples)
  return { ok: true };
}

// ------------------------------------------------------------- the ground --
// Items lying about (a decaying crown's saplings, what someone dropped), in
// sight and near: walk over and pick them up.
export const itemsInSight = (sim, r = 10) => [...sim.ents.values()].filter((e) => e.kind === 'item' && sim.seen[e.c] && sim.dist(e.c, sim.player.c) <= r)
  .sort((a, b) => sim.dist(a.c, sim.player.c) - sim.dist(b.c, sim.player.c));
export function* collectItems(sim, r = 10, max = 8) {
  let n = 0;
  for (let k = 0; k < max; k++) {
    const e = itemsInSight(sim, r)[0];
    if (!e) break;
    const go = yield* goTo(sim, (c, y) => (c === e.c || sim.cols[c].adj.includes(e.c)) && Math.abs(y - e.y) <= 1, 4000);
    if (!go.ok) break;
    yield { op: 'wait', ticks: 1 };
    if (!sim.ents.has(e.id)) n++; else break;
  }
  return { ok: n > 0, got: n, ...(n ? {} : { why: 'nothing picked up' }) };
}
// Plant saplings near home: renewable wood. Spots on grass under open sky,
// kept clear of the house, and far enough apart for crowns to fit.
export function treeSpots(sim, c0, r = 9) {
  const h = sim._house, keep = new Set(h ? [...h.interior, ...h.ring, ...h.outside] : []);
  const out = [];
  for (const [c, d] of ball(sim, c0, r)) {
    if (d < 2 || keep.has(c) || !sim.seen[c] || sim.cols[c].nb.includes(-1)) continue;
    const y = groundTop(sim, c) + 1;
    if (![B.grass, B.dirt].includes(sim.get(c, y - 1)) || !sim.skyOpen(c, y) || y + 7 >= H) continue;
    if ([...ball(sim, c, 2).keys()].some((u) => [0, 1, 2, 3, 4, 5, 6].some((dy) => [B.log, B.sapling].includes(sim.get(u, y + dy - 1))))) continue;
    out.push([c, y]);
  }
  return out;
}
export function* plantTrees(sim, n = 3) {
  if (!sim.has('sapling')) return { ok: false, why: 'no saplings' };
  let planted = 0;
  const c0 = sim.home ? sim.home[0] : sim.player.c;
  for (let k = 0; k < n * 2 && planted < n && sim.has('sapling'); k++) {
    const spot = treeSpots(sim, c0)[0];
    if (!spot) break;
    const [c, y] = spot;
    const go = yield* goTo(sim, (pc, py) => pc !== c && sim.reachable(pc, py, c, y), 12000);
    if (!go.ok) break;
    const r = yield { op: 'place', c, y, item: 'sapling' };
    if (r.ok) planted++;
  }
  return planted ? { ok: true, planted } : { ok: false, why: 'nowhere to plant a tree near home' };
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
      const fk = fuelKey(r, bag);
      for (const [bk, bn] of Object.entries(bag)) {
        let need = bn * batches;
        if (bk === fk) {
          // fuel: what is still burning first, then items at FUEL[bk] smelts each
          const credit = trial['@fuel'] ?? (sim.player.fuel || 0);
          const units = Math.max(0, batches - credit);
          trial['@fuel'] = Math.max(0, credit - batches) + (units ? Math.ceil(units / FUEL[bk]) * FUEL[bk] - units : 0);
          need = Math.ceil(units / FUEL[bk]);
          if (!need) continue;
        }
        Object.entries(shortfall(sim, bk, need, trial, depth + 1)).forEach(([sk, sn]) => { sub[sk] = (sub[sk] || 0) + sn; });
      }
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
    // (a furnace's fuel is not needed while something is still burning)
    const burning = (sim.player.fuel || 0) > 0;
    const need = (g) => Object.entries(g).filter(([k]) => !(burning && k === fuelKey(r, g)));
    const bags = recipeBags(r).map((g) => {
      const miss = need(g).filter(([k, q]) => (sim.inv[k] || 0) < q);
      // joint: the ingredients of one bag draw on the same inventory
      const trial = { ...sim.inv }, sh = {};
      for (const [k, q] of need(g)) for (const [sk, sn] of Object.entries(shortfall(sim, k, q, trial))) sh[sk] = (sh[sk] || 0) + sn;
      return { g, miss, sh, raw: Object.values(sh).reduce((a, b) => a + b, 0) };
    }).sort((a, b) => a.raw - b.raw || a.miss.length - b.miss.length);
    if (bags[0].raw > 0) return { ok: false, why: `short of ${describeShort(bags[0].sh)}` };
    const bag = bags[0].g;
    for (let pass = 0; pass < 4; pass++) {
      const missing = need(bag).filter(([k, q]) => (sim.inv[k] || 0) < q);
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
    if (deepAndLow(sim)) return { ok: false, why: 'the last pick is nearly worn out: time to head up' };
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
  if (deepAndLow(sim)) return 0;
  const ids = [B.coal_ore, B.stone];
  if (sim.pickTier() >= 2) ids.push(B.iron_ore);
  const ores = sim.reachSet().filter(([c, y]) => [B.coal_ore, B.iron_ore, ...(sim.pickTier() >= 3 ? [B.diamond_ore] : [])].includes(sim.get(c, y)));
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
    if (deepAndLow(sim)) break;                           // the last pick: stop here, and head up
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

// Diamonds sit in the bottom five layers and need an iron pick: diamonds in
// sight first, else a staircase to layer 4 and a tunnel along it.
export function* mineDiamond(sim, n = 3) {
  if (sim.pickTier() < 3) return { ok: false, why: 'diamond needs an iron pickaxe' };
  const want = (sim.inv.diamond || 0) + n;
  for (let leg = 0; leg < 10 && (sim.inv.diamond || 0) < want; leg++) {
    if (deepAndLow(sim)) break;                           // the last pick: stop here, and head up
    const seen = visible(sim, [B.diamond_ore], 16);
    if (seen.length) { yield* fetchBlock(sim, ...seen[0]); continue; }
    const r = yield* staircase(sim, { floor: 4, until: () => (sim.inv.diamond || 0) >= want || visible(sim, [B.diamond_ore], 5).length > 0 });
    if ((sim.inv.diamond || 0) >= want) break;
    const t0 = sim.tick, b = yield* branchMine(sim, 16);
    if (!r.ok && !b.ok && sim.tick === t0) return { ok: false, why: `no way down to the diamond layers (${r.why})` };
  }
  return (sim.inv.diamond || 0) >= want ? { ok: true } : (sim.inv.diamond || 0) > want - n ? { ok: true, partial: true } : { ok: false, why: 'no diamonds found' };
}

// Obsidian: carry water to lava. Fill a bucket at the sea, pour it on (or
// beside) lava in sight, take the water back, and mine the obsidian that
// formed. Only a diamond pick can mine it.
export function* fillBucket(sim) {
  if (sim.has('water_bucket')) return { ok: true };
  if (!sim.has('bucket')) return { ok: false, why: 'no bucket (3 iron ingots)' };
  const w = visible(sim, [B.water], 40).filter(([c, y]) => !sim.still.has(c * H + y));
  if (!w.length) return { ok: false, why: 'no water in sight' };
  const [c, y] = w[0];
  const go = yield* goTo(sim, (pc, py) => sim.reachable(pc, py, c, y), 30000);
  if (!go.ok) return { ok: false, why: `could not reach the water (${go.why})` };
  const r = yield { op: 'fill', c, y };
  return r.ok ? { ok: true } : { ok: false, why: r.why };
}
export function* makeObsidian(sim, n = 3) {
  if (sim.pickTier() < 4) return { ok: false, why: 'obsidian can only be mined with a diamond pickaxe' };
  const want = (sim.inv.obsidian || 0) + n;
  for (let k = 0; k < n * 3 && (sim.inv.obsidian || 0) < want; k++) {
    const f = yield* fillBucket(sim);
    if (!f.ok) return (sim.inv.obsidian || 0) ? { ok: true, partial: true } : f;
    // lava in sight, with an empty voxel above it or beside it to pour into
    const lava = visible(sim, [B.lava], 40);
    let spot = null;
    for (const [lc, ly] of lava) {
      const cands = [[lc, ly + 1], ...sim.cols[lc].adj.map((m) => [m, ly])].filter(([c, y]) => sim.get(c, y) === B.air);
      if (cands.length) { spot = { lc, ly, at: cands[0] }; break; }
    }
    if (!spot) return (sim.inv.obsidian || 0) ? { ok: true, partial: true } : { ok: false, why: 'no lava in sight to pour onto' };
    const [pc, py] = spot.at;
    const go = yield* goTo(sim, (c, y) => c !== pc && sim.reachable(c, y, pc, py) && sim.reachable(c, y, spot.lc, spot.ly), 60000);   // lava pockets are deep and far
    if (!go.ok) { (sim._unreachable = sim._unreachable || new Set()).add(spot.lc * H + spot.ly); continue; }
    const r = yield { op: 'pour', c: pc, y: py };
    if (!r.ok) continue;
    yield { op: 'fill', c: pc, y: py };                                  // the water back into the bucket
    if (sim.get(spot.lc, spot.ly) === B.obsidian) yield { op: 'mine', c: spot.lc, y: spot.ly };
  }
  return (sim.inv.obsidian || 0) >= want ? { ok: true } : (sim.inv.obsidian || 0) ? { ok: true, partial: true } : { ok: false, why: 'no obsidian made' };
}
// Sand (for glass): take sand in sight until holding n.
export function* digSand(sim, n = 5) {
  const want = n;
  for (let k = 0; k < n * 2 && (sim.inv.sand || 0) < want; k++) {
    let seen = visible(sim, [B.sand], 30);
    if (!seen.length) { const sc = yield* scout(sim, 'sand'); if (!sc.ok) return { ok: false, why: sc.why }; seen = visible(sim, [B.sand], 30); if (!seen.length) break; }
    yield* fetchBlock(sim, ...seen[0]);
  }
  return (sim.inv.sand || 0) >= want ? { ok: true } : { ok: false, why: 'could not dig enough sand' };
}
// A beacon at home: nothing spawns within 16 of it.
export function* placeBeacon(sim) {
  if (!sim.has('beacon')) { const c = yield* craft(sim, 'beacon', 1); if (!c.ok) return c; }
  // at home if we can get there; if not, here: a beacon guards wherever it stands
  if (sim.home && sim.dist(sim.player.c, sim.home[0]) > 3) yield* goHome(sim);
  if (!sim.skyOpen(sim.player.c, sim.player.y + 2)) yield* surface(sim);
  const r = yield* placeStation(sim, 'beacon');
  if (r.ok) sim.note('beacon', { by: sim.player.id });
  return r;
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
  for (const [c, y] of path) { const r = yield stepOp(sim, c, y); if (!r.ok) return { ok: false, why: r.why }; }
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
// (not a creeper: stepping away is the answer to one. A skeleton that is
// shooting from a few tiles off is charged: closing in stops the arrows)
export function* fight(sim, kind = null) {
  for (let k = 0; k < 20; k++) {
    const t = [...sim.ents.values()].find((e) => (kind ? e.kind === kind : HOSTILE.has(e.kind) && e.kind !== 'creeper') && sim.adjacentTo(sim.player, e));
    if (!t) {
      const sk = !kind && [...sim.ents.values()].find((e) => e.kind === 'skeleton' && sim.dist(e.c, sim.player.c) <= 7 && sim.los(sim.player, e));
      if (!sk) return { ok: true };
      const go = yield* goTo(sim, (c, y) => sim.cols[c].adj.includes(sk.c) && Math.abs(y - sk.y) <= 1, 3000);
      if (!go.ok) return { ok: false, why: `could not close in on the skeleton (${go.why})` };
      continue;
    }
    const r = yield { op: 'attack', id: t.id };
    if (!r.ok) return { ok: false, why: r.why };
  }
  return { ok: false, why: 'fight dragged on' };
}
// Step away from a creeper (or whatever is nearest and hostile) until 4 tiles off.
export const creeperNear = (sim) => [...sim.ents.values()].find((e) => e.kind === 'creeper' && sim.dist(e.c, sim.player.c) <= 3);
export function* flee(sim) {
  const p = sim.player;
  const t = creeperNear(sim) || [...sim.ents.values()].filter((e) => HOSTILE.has(e.kind)).sort((a, b) => sim.dist(a.c, p.c) - sim.dist(b.c, p.c))[0];
  if (!t) return { ok: true };
  const go = yield* goTo(sim, (c) => sim.dist(c, t.c) >= 4, 3000);
  return go.ok ? { ok: true } : { ok: false, why: `nowhere to run (${go.why})` };
}
// Shoot the nearest hostile in sight and in range until it falls or the arrows run out.
export const targetsInSight = (sim) => [...sim.ents.values()].filter((e) => HOSTILE.has(e.kind) && sim.dist(e.c, sim.player.c) <= 8 && sim.los(sim.player, e))
  .sort((a, b) => sim.dist(a.c, sim.player.c) - sim.dist(b.c, sim.player.c));
export function* shootAt(sim) {
  for (let k = 0; k < 10; k++) {
    const t = targetsInSight(sim)[0];
    if (!t) return k ? { ok: true } : { ok: false, why: 'nothing hostile in sight and range' };
    const r = yield { op: 'shoot', id: t.id };
    if (!r.ok) return { ok: false, why: r.why };
  }
  return { ok: true };
}
// A house a creeper has blown open: every wall, roof and floor voxel of its
// plan put back (and the door), then protected and proven sealed again.
export function houseHoles(sim) {
  const h = sim._house;
  if (!h) return [];
  const out = [];
  for (const c of h.ring) for (const y of [h.g, h.g + 1, h.g + 2]) {
    if (c === h.door && y < h.g + 2) { if (sim.get(c, y) !== B.door) out.push([c, y, 'door']); }
    else if (!sim.solid(c, y)) out.push([c, y, 'block']);
  }
  for (const c of h.interior) { if (!sim.solid(c, h.g + 2)) out.push([c, h.g + 2, 'block']); if (!sim.solid(c, h.g - 1)) out.push([c, h.g - 1, 'block']); }
  return out;
}
// the ground a blast took from beside the house: what you stand on to reach the wall
function craterAround(sim, h) {
  const out = [];
  for (const c of h.outside) for (const y of [h.g - 2, h.g - 1]) if (!sim.solid(c, y) && sim.get(c, y) !== B.water && !sim.cols[c].nb.includes(-1)) out.push([c, y, 'block']);
  return out;
}
export function* repairHouse(sim) {
  const h = sim._house;
  if (!h) return { ok: false, why: 'no house' };
  let holes = houseHoles(sim);
  if (!holes.length) return { ok: false, why: 'the house is whole' };
  // ground first (somewhere to stand), then bottom-up
  const todo = () => [...craterAround(sim, h), ...houseHoles(sim)].sort((a, b) => a[1] - b[1]);
  holes = todo();
  if (holes.some(([, , k]) => k === 'door') && !sim.has('door')) { const d = yield* craft(sim, 'door', 1); if (!d.ok) return { ok: false, why: `no door: ${d.why}` }; }
  for (let k = 0; k < 40 && holes.length; k++) {
    const [c, y, kind] = holes[0];
    const item = kind === 'door' ? 'door' : nextBlock(sim);
    if (!item) return { ok: false, why: `out of blocks with ${holes.length} holes left` };
    if (!sim.reachable(sim.player.c, sim.player.y, c, y)) {
      const go = yield* goTo(sim, (pc, py) => pc !== c && sim.reachable(pc, py, c, y), 6000);
      if (!go.ok) return { ok: false, why: `could not reach a hole (${go.why})` };
    }
    const r = yield { op: 'place', c, y, item };
    if (!r.ok && !/occupied/.test(r.why)) return { ok: false, why: r.why };
    holes = todo();
  }
  holes = houseHoles(sim);
  for (const c of h.ring) for (let yy = h.g; yy <= h.g + 2; yy++) sim.protect.add(c * H + yy);
  for (const c of h.interior) { sim.protect.add(c * H + h.g + 2); sim.protect.add(c * H + h.g - 1); }
  return holes.length ? { ok: false, why: `${holes.length} holes left` } : sealed(sim, h) ? { ok: true } : { ok: false, why: 'patched, but a mob could still walk in' };
}

// Go back for what you dropped when you died: it lies where you fell for
// ITEM_DESPAWN ticks, and anyone who walks beside it picks it up.
export const lostThings = (sim) => {
  const d = sim.player.lastDrop;
  if (!d || sim.tick >= d.until || d.dim !== sim.dim) return null;
  const e = sim.ents.get(d.id);
  return e && e.kind === 'item' ? { ...d, c: e.c, y: e.y, items: e.items, left: d.until - sim.tick } : null;
};
export function* recover(sim) {
  const d = lostThings(sim);
  if (!d) return { ok: false, why: 'nothing left to go back for' };
  const go = yield* goTo(sim, (c, y) => (c === d.c || sim.cols[c].adj.includes(d.c)) && Math.abs(y - d.y) <= 1, 60000);
  if (!go.ok) return { ok: false, why: `could not get back to it (${go.why})` };
  yield { op: 'wait', ticks: 1 };                                  // picked up on the next tick
  if (sim.ents.has(d.id)) return { ok: false, why: 'it was not there' };
  sim.player.lastDrop = null;
  return { ok: true };
}

// Breed two animals of a kind in sight: feed each its food, and a young one appears.
export function* breed(sim, kind = 'cow') {
  const food = BREED_FOOD[kind];
  if (!sim.has(food, 2)) return { ok: false, why: `needs 2 ${food.replace(/_/g, ' ')} to breed ${kind}s` };
  const ready = () => visiblePigs(sim, 24, kind).filter((e) => !e.young && !e.love && !(e.breedAt && sim.tick < e.breedAt));
  // a pair close together (they have to find each other), nearest first
  const r = ready();
  let pair = null;
  for (const a of r) for (const b of r) if (a !== b && sim.dist(a.c, b.c) <= 3) { const d = sim.dist(a.c, sim.player.c); if (!pair || d < pair.d) pair = { a, b, d }; }
  if (!pair) return { ok: false, why: `no two ${kind}s ready to breed close together` };
  sim.player.luring = true;                          // they follow the food held out
  let fed = 0;
  try {
    for (const e of [pair.a, pair.b]) {
      if (!sim.ents.has(e.id)) continue;
      if (!sim.adjacentTo(sim.player, e)) { const go = yield* goTo(sim, (c, y) => sim.cols[c].adj.includes(e.c) && Math.abs(y - e.y) <= 1, 8000); if (!go.ok) continue; }
      if (!sim.adjacentTo(sim.player, e)) continue;
      const res = yield { op: 'feed', id: e.id };
      if (res.ok) fed++;
    }
    if (fed === 2) yield { op: 'wait', ticks: 12 };   // they find each other
  } finally { sim.player.luring = false; }
  return fed === 2 ? { ok: true } : { ok: false, why: fed ? `fed one ${kind}; the other got away` : `could not reach the ${kind}s` };
}

// Shear a sheep in sight: wool, and the sheep lives (it grows back).
export function* shear(sim, n = 3) {
  if (!sim.has('shears')) return { ok: false, why: 'needs shears (2 iron ingots)' };
  const want = (sim.inv.wool || 0) + n;
  for (let k = 0; k < 8 && (sim.inv.wool || 0) < want && sim.has('shears'); k++) {
    const s = visiblePigs(sim, 24, 'sheep').filter((e) => !e.shorn).sort((a, b) => sim.dist(a.c, sim.player.c) - sim.dist(b.c, sim.player.c))[0];
    if (!s) return (sim.inv.wool || 0) > want - n ? { ok: true, partial: true } : { ok: false, why: 'no sheep with wool in sight' };
    if (!sim.adjacentTo(sim.player, s)) { const go = yield* goTo(sim, (c, y) => sim.cols[c].adj.includes(s.c) && Math.abs(y - s.y) <= 1, 8000); if (!go.ok) continue; }
    if (sim.adjacentTo(sim.player, s)) yield { op: 'shear', id: s.id };
  }
  return (sim.inv.wool || 0) >= want ? { ok: true } : { ok: false, why: 'could not shear enough' };
}

// Chase down the nearest pig for food.
export function* hunt(sim, kind = 'pig') {
  // only animals you can see: a hunter does not know where the herd is
  const pig = () => visiblePigs(sim, 24, kind)
    .sort((a, b) => sim.dist(a.c, sim.player.c) - sim.dist(b.c, sim.player.c))[0];
  for (let k = 0; k < 8; k++) {
    let g = pig();
    if (!g || sim.dist(g.c, sim.player.c) > 24) { yield* scout(sim, kind); g = pig(); }
    if (!g) return { ok: false, why: `no ${kind}s` };
    if (sim.adjacentTo(sim.player, g)) {
      yield* fight(sim, kind);
      if (!sim.ents.has(g.id)) return { ok: true };
      continue;
    }
    const go = yield* goTo(sim, (c, y) => (sim.cols[c].adj.includes(g.c) || c === g.c) && Math.abs(y - g.y) <= 1, 8000);
    if (!go.ok) return { ok: false, why: `could not reach a ${kind}` };
  }
  return { ok: false, why: `the ${kind} kept moving` };
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
export function visiblePigs(sim, radius = 24, kind = 'pig') {
  return [...sim.ents.values()].filter((e) => e.kind === kind && sim.seen[e.c] && sim.dist(e.c, sim.player.c) <= radius);
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
  return yield* tunnelAlong(sim, [Math.cos(a), Math.sin(a)], length);
}
// A straight torch-lit tunnel on this layer, along a heading: each step to the
// unwalked neighbour best aligned with it. Stops at water, lava, drops and
// anything else it may not open. Returns how far it got and where it ended.
export function* tunnelAlong(sim, dir, length, { torchEvery = 6 } = {}) {
  const p = sim.player;
  const walked = new Set([p.c]);
  let since = 0, dug = 0;
  for (let k = 0; k < length; k++) {
    if (deepAndLow(sim)) return { ok: dug > 0, dug, blocked: true, why: 'the last pick is nearly worn out' };
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
    if (best < 0) return dug ? { ok: true, dug, blocked: true, why: 'the tunnel hit water or a drop' } : { ok: false, dug, blocked: true, why: 'nowhere to tunnel' };
    for (const y of [p.y + 1, p.y]) if (sim.solid(best, y)) { const r = yield { op: 'mine', c: best, y }; if (!r.ok) return { ok: false, dug, why: r.why }; }
    const from = p.c;
    const m = yield { op: 'move', to: best };
    if (!m.ok) return { ok: false, dug, why: m.why };
    walked.add(best); dug++;
    if (++since >= torchEvery && sim.has('torch') && sim.get(from, p.y) === B.air) {
      const t = yield { op: 'place', c: from, y: p.y, item: 'torch' };
      if (t.ok) since = 0;
    }
  }
  return { ok: true, dug };
}

// ------------------------------------------------------------ the home mine --
// Every other mining macro starts a new dig from wherever the player stands:
// a staircase down, a tunnel out, paid for in full every trip. A strategist
// digs ONE mine near home instead: a staircase to the ore layer, a lit hub,
// and branches that radiate from it (golden-angle headings, so no two reveal
// the same rock). Each later trip is a walk down known, lit tunnels to the end
// of the newest branch, then more tunnel. Shared by the team (sim.team.mines,
// one per layer) and entirely made of blocks, so the planner walks it for free.
export const MINE_LEVEL = { iron: 7, coal: 9, diamond: 5 };   // diamond above the lava pockets at 3–4; its walls see down to 4
const MINE_ORE = { iron: ['iron_ore', B.iron_ore, 2], coal: ['coal', B.coal_ore, 1], diamond: ['diamond', B.diamond_ore, 3] };
const BRANCH_LEN = 36, LEG = 10;
export const homeMineAt = (sim, ore = 'iron') => (sim.team.mines || {})[MINE_LEVEL[ore]] || null;
export function* homeMine(sim, { ore = 'iron', n = 3 } = {}) {
  const [item, oreId, tier] = MINE_ORE[ore] || MINE_ORE.iron;
  if (sim.pickTier() < tier) return { ok: false, why: `${ore} needs a ${['', 'wooden', 'stone', 'iron'][tier]} pickaxe` };
  if (sim.dim !== 'overworld') return { ok: false, why: 'the mine is in the overworld' };
  const p = sim.player, level = MINE_LEVEL[ore];
  const want = (sim.inv[item] || 0) + n, enough = () => (sim.inv[item] || 0) >= want;
  const mines = (sim.team.mines ||= {});
  let mine = mines[level];
  // a mine that cannot be got back into (flooded, cut off) or whose hub opens
  // nowhere is abandoned, and a new one dug
  if (mine && mine.branches.length >= 3 && mine.branches.every((b) => b.done && b.len === 0)) { mine.abandoned = true; mine = null; }
  if (mine) {
    const go = yield* goTo(sim, (c, y) => c === mine.hub[0] && y === mine.hub[1], 60000);
    if (!go.ok) { mine.abandoned = true; mine = null; }
  }
  if (!mine) {
    // the entrance: just outside the house door (or here), then a staircase to the layer
    if (sim._house) { const out = new Set(sim._house.outside); const ex = yield* goTo(sim, (c) => out.has(c) && sim.dist(c, sim._house.door) <= 2, 20000); if (!ex.ok) return { ok: false, why: `could not get out to dig (${ex.why})` }; }
    const entry = [p.c, p.y];
    const st = yield* staircase(sim, { floor: level, until: () => p.y <= level });
    if (p.y > level) return { ok: false, why: `could not dig down to layer ${level} (${st.why || 'boxed in'})` };
    mine = mines[level] = { entry, hub: [p.c, p.y], branches: [], trips: 0, dug: 0 };
    if (sim.has('torch')) { const at = sim.cols[p.c].adj.find((c) => sim.get(c, p.y) === B.air); if (at != null) yield { op: 'place', c: at, y: p.y, item: 'torch' }; }
    sim.note('mine', { level, at: mine.hub, by: p.id });
  }
  mine.trips++;
  for (let leg = 0; leg < 8 && !enough(); leg++) {
    if (deepAndLow(sim)) break;                           // the last pick: stop here, and head up
    // ore showing on the tunnel walls first (the mine keeps revealing it)
    const seen = visible(sim, [oreId], 16).filter(([c, y]) => !(sim._unreachable && sim._unreachable.has(c * H + y)));
    if (seen.length) { yield* fetchBlock(sim, ...seen[0]); continue; }
    // the newest open branch, or a new one on the next golden-angle heading
    let br = mine.branches.find((b) => !b.done);
    if (!br) { const a = mine.branches.length * 2.39996; br = { dir: [Math.cos(a), Math.sin(a)], end: [...mine.hub], len: 0, done: false }; mine.branches.push(br); }
    if (p.c !== br.end[0] || p.y !== br.end[1]) {
      const go = yield* goTo(sim, (c, y) => c === br.end[0] && y === br.end[1], 60000);
      if (!go.ok) { br.done = true; continue; }
    }
    const t = yield* tunnelAlong(sim, br.dir, LEG, { torchEvery: 5 });
    br.end = [p.c, p.y]; br.len += t.dug || 0; mine.dug += t.dug || 0;
    if (t.blocked || !t.ok || br.len >= BRANCH_LEN) br.done = true;
    if (mine.branches.length > 12 && mine.branches.every((b) => b.done)) break;
  }
  return enough() ? { ok: true } : (sim.inv[item] || 0) > want - n ? { ok: true, partial: true } : { ok: false, why: `the mine turned up no ${ore}` };
}

// ------------------------------------------------------------- the grid mine --
// A mine laid out to SEE EVERY STONE. Minecraft's answer on a square grid is
// a tunnel every third block; on a tiling the same idea is a set of tunnel
// tiles that is connected (you can walk all of it) and dominating (every tile
// on the layer is a tunnel or next to one, so every stone's face is shown
// once). That is a connected dominating set on the tile graph, planned
// greedily here: grow from the hub, always adding the tile that newly exposes
// the most. A permanent staircase makes the descent free after the first trip,
// and the layout is dug in the order that keeps it connected, nearest first.
// `returnDig`: the trip home digs a new tunnel back towards the shaft instead
// of walking an old one, so the return also reveals rock.
export function gridPlan(sim, hub, level, R) {
  const tier = Math.max(1, sim.pickTier());
  const okCol = (c) => !sim.cols[c].nb.includes(-1) && sim.solid(c, level - 1)
    && [level, level + 1].every((y) => !sim.solid(c, y) || sim.clearCost(c, y, tier) < Infinity) && !sim.bordersWater(c, level);
  const hops = ball(sim, hub, R);
  const ok = new Set([...hops.keys()].filter(okCol));
  ok.add(hub);
  const plan = new Set([hub]), dom = new Set([hub, ...sim.cols[hub].adj.filter((n) => ok.has(n))]);
  const gain = (c) => [c, ...sim.cols[c].adj].filter((n) => ok.has(n) && !dom.has(n)).length;
  for (;;) {
    let best = -1, bg = 0;
    for (const p of plan) for (const c of sim.cols[p].adj) {
      if (!ok.has(c) || plan.has(c)) continue;
      const g = gain(c);
      if (g > bg || (g === bg && g > 0 && hops.get(c) < hops.get(best))) { bg = g; best = c; }
    }
    if (best < 0 || bg === 0) break;
    plan.add(best);
    for (const n of [best, ...sim.cols[best].adj]) if (ok.has(n)) dom.add(n);
  }
  // hop distance to the hub through the plan (the way home underground)
  const home = new Map([[hub, 0]]), q = [hub];
  while (q.length) { const u = q.shift(); for (const w of sim.cols[u].adj) if (plan.has(w) && !home.has(w)) { home.set(w, home.get(u) + 1); q.push(w); } }
  return { plan, home, covers: dom.size, ok: ok.size };
}
// Layers in the order they are opened: each tunnel shows the band from a layer
// below it to a layer above, so these four between them show layers 0–12, all
// of the iron band (and the diamonds, from layer 1).
export const GRID_LEVELS = { iron: [7, 4, 10, 1], coal: [9, 12, 6, 3], diamond: [4, 1] };
export function* gridMine(sim, { ore = 'iron', n = 3, returnDig = false, R = 18 } = {}) {
  const [item, oreId, tier] = MINE_ORE[ore] || MINE_ORE.iron;
  if (sim.pickTier() < tier) return { ok: false, why: `${ore} needs a ${['', 'wooden', 'stone', 'iron'][tier]} pickaxe` };
  if (sim.dim !== 'overworld') return { ok: false, why: 'the mine is in the overworld' };
  const p = sim.player;
  const want = (sim.inv[item] || 0) + n, enough = () => (sim.inv[item] || 0) >= want;
  const grids = (sim.team.grids ||= {});
  // the current layer: the first in the order whose layout is not all dug
  const levels = GRID_LEVELS[ore] || GRID_LEVELS.iron;
  const level = levels.find((l) => !(grids[l] && (grids[l].done || grids[l].abandoned)));
  if (level == null) return { ok: false, why: 'every layer of the mine is dug out' };
  const prev = levels.slice(0, levels.indexOf(level)).map((l) => grids[l]).filter((x) => x && !x.abandoned).pop();
  let g = grids[level];
  if (g) { const go = yield* goTo(sim, (c, y) => c === g.hub[0] && y === g.hub[1], 60000); if (!go.ok) { g.abandoned = true; return { ok: false, why: `could not get back into the mine (${go.why})` }; } }
  if (!g) {
    if (prev) {
      // a new layer: from the last hub, stairs up or down to it
      const go = yield* goTo(sim, (c, y) => c === prev.hub[0] && y === prev.hub[1], 60000);
      if (go.ok) yield* goTo(sim, (c, y) => y === level && sim.dist(c, prev.hub[0]) <= 4, 30000);
    } else if (sim.team.access && sim.team.access.level === level) {
      // shafts beside the house reach this layer: the mine starts at their foot
      const acc = sim.team.access;
      yield* goTo(sim, (c, y) => c === acc.ladder[0] && y === level, 30000);
    } else {
      if (sim._house) { const out = new Set(sim._house.outside); const ex = yield* goTo(sim, (c) => out.has(c) && sim.dist(c, sim._house.door) <= 2, 20000); if (!ex.ok) return { ok: false, why: `could not get out to dig (${ex.why})` }; }
      yield* staircase(sim, { floor: level, until: () => p.y <= level });
    }
    if (p.y !== level) { grids[level] = { abandoned: true }; return { ok: false, why: `could not reach layer ${level}` }; }
    const { plan, home, covers, ok } = gridPlan(sim, p.c, level, R);
    g = grids[level] = { hub: [p.c, p.y], plan, home, dug: new Set([p.c]), covers, ok, trips: 0, tiles: 0 };
    sim.note('mine', { level, at: g.hub, by: p.id, layout: plan.size, covers, of: ok });
  }
  g.trips++;
  let since = 0;
  const digInto = function* (t) {
    for (const y of [level + 1, level]) if (sim.solid(t, y)) { const r = yield { op: 'mine', c: t, y }; if (!r.ok) return false; }
    const from = p.c, m = yield { op: 'move', to: t };
    if (!m.ok || p.c !== t) return false;
    g.dug.add(t); g.tiles++;
    if (++since >= 5 && sim.has('torch') && sim.get(from, level) === B.air) { const r = yield { op: 'place', c: from, y: level, item: 'torch' }; if (r.ok) since = 0; }
    return true;
  };
  for (let k = 0; k < 120 && !enough(); k++) {
    if (deepAndLow(sim)) break;
    const seen = visible(sim, [oreId], 8).filter(([c, y]) => Math.abs(y - level) <= 3 && !(sim._unreachable && sim._unreachable.has(c * H + y)));
    if (seen.length) { yield* fetchBlock(sim, ...seen[0]); continue; }
    // the next tile of the layout: undug, beside the dug network, nearest to
    // here. Digging a loop, go DEEP first (the tile beside us farthest from the
    // hub), so the tiles alongside the corridor are left for the way back
    let t = -1, td = Infinity;
    if (returnDig && p.y === level) {
      const deeper = sim.cols[p.c].adj.filter((c) => g.plan.has(c) && !g.dug.has(c) && (g.home.get(c) ?? 0) > (g.home.get(p.c) ?? 0));
      if (deeper.length) t = deeper.sort((a2, b2) => g.home.get(b2) - g.home.get(a2))[0];
    }
    if (t < 0) for (const c of g.plan) {
      if (g.dug.has(c) || !sim.cols[c].adj.some((n) => g.dug.has(n))) continue;
      const d = sim.dist(c, p.c);
      if (d < td) { td = d; t = c; }
    }
    if (t < 0) { g.done = true; break; }
    const from = sim.cols[t].adj.filter((n) => g.dug.has(n)).sort((a, b) => sim.dist(a, p.c) - sim.dist(b, p.c))[0];
    if (p.c !== from || p.y !== level) { const go = yield* goTo(sim, (c, y) => c === from && y === level, 30000); if (!go.ok) { g.plan.delete(t); continue; } }
    if (!(yield* digInto(t))) g.plan.delete(t);
  }
  // home: dig a new way back through the layout, or walk the one there is
  if (returnDig) {
    // back onto the layer first if an ore fetch took us off it
    if (p.y !== level) yield* goTo(sim, (c, y) => y === level && g.dug.has(c), 8000);
    for (let k = 0; k < 60 && p.y === level && p.c !== g.hub[0]; k++) {
      const here = g.home.get(p.c) ?? Infinity;
      const next = sim.cols[p.c].adj.filter((c) => g.plan.has(c) && !g.dug.has(c) && (g.home.get(c) ?? Infinity) < here)[0];
      if (next == null || !(yield* digInto(next))) break;
    }
  }
  return enough() ? { ok: true } : (sim.inv[item] || 0) > want - n ? { ok: true, partial: true } : { ok: false, why: g.done ? 'the layout is all dug' : `the mine turned up no ${ore}` };
}

// ----------------------------------------------------------- the mine's access --
// How people shorten the trip to a mine: a shaft straight down to a pool deep
// enough to break the fall (a bucket of water in a sump), with a trapdoor
// over it (a door in the floor: you drop through, mobs walk over), and a
// ladder shaft beside it for the way back up. Built beside the house, joined
// to the mine by a tunnel at its layer. After that nothing special happens:
// the planners know that a fall into water is safe and that ladders climb, so
// they take the shafts whenever the shafts are cheaper.
const shaftOk = (sim, c, lo, hi) => {
  const tier = Math.max(1, sim.pickTier());
  for (let y = lo; y <= hi; y++) {
    const id = sim.get(c, y);
    if (id === B.air) continue;
    if (sim.protect.has(c * H + y) || sim.clearCost(c, y, tier) === Infinity) return false;
  }
  return true;
};
export function accessSite(sim, level) {
  const h = sim._house;
  if (!h) return null;
  const keep = new Set([...h.interior, ...h.ring]);
  let best = null;
  for (const [L, hop] of ball(sim, h.door, 6)) {
    if (keep.has(L) || hop < 2 || !sim.seen[L] || sim.cols[L].nb.includes(-1)) continue;
    const gL = groundTop(sim, L) + 1;
    if (gL - level < 4 || !shaftOk(sim, L, level, gL - 1) || !sim.solid(L, level - 1)) continue;
    for (const D of sim.cols[L].adj) {
      if (keep.has(D) || !sim.seen[D] || sim.cols[D].nb.includes(-1)) continue;
      const gD = groundTop(sim, D) + 1;
      if (Math.abs(gD - gL) > 1 || !shaftOk(sim, D, level - 1, gD - 1) || !sim.solid(D, level - 2)) continue;
      const cost = hop + (gL - level);
      if (!best || cost < best.cost) best = { L, gL, D, gD, cost };
    }
  }
  return best;
}
export function* buildAccess(sim, { ore = 'iron' } = {}) {
  const p = sim.player;
  if (sim.team.access) return { ok: false, why: 'the mine already has its shafts' };
  const g = Object.values(sim.team.grids || {}).find((x) => x.plan && !x.abandoned);
  const level = g ? g.hub[1] : MINE_LEVEL[ore];
  if (!sim._house) return { ok: false, why: 'needs a house to build beside' };
  const site = accessSite(sim, level);
  if (!site) return { ok: false, why: 'nowhere beside the house for the shafts' };
  const { L, gL, D, gD } = site;
  // what it takes: a rung per layer, a trapdoor, and water
  const rungs = gL - level;
  if ((sim.inv.ladder || 0) < rungs) { const c = yield* craft(sim, 'ladder', rungs); if (!c.ok) return { ok: false, why: `short of ladders (${c.why})` }; }
  if ((sim.inv.trapdoor || 0) < 2) { const c = yield* craft(sim, 'trapdoor', 2); if (!c.ok) return { ok: false, why: `short of trapdoors (${c.why})` }; }
  if (!sim.has('water_bucket')) { const f = yield* fillBucket(sim); if (!f.ok) return { ok: false, why: `needs a bucket of water (${f.why})` }; }
  // 1. the ladder shaft, dug from the top: mine below, drop a layer, set the rung above
  const top = yield* goTo(sim, (c, y) => c === L && y === gL, 20000);
  if (!top.ok) return { ok: false, why: `could not reach the site (${top.why})` };
  for (let k = 0; k < H && p.y > level; k++) {
    const y0 = p.y;
    const r = yield { op: 'mine', c: L, y: p.y - 1 };
    if (!r.ok || p.y !== y0 - 1) return { ok: false, why: `the ladder shaft stopped at layer ${p.y} (${r.why || 'did not drop'})` };
    const pl = yield { op: 'place', c: L, y: p.y + 1, item: 'ladder' };
    if (!pl.ok) return { ok: false, why: `could not set a rung (${pl.why})` };
  }
  yield { op: 'place', c: L, y: p.y, item: 'ladder' };
  // a light at the foot: dark shafts spawn zombies
  if (sim.has('torch')) { const at = sim.cols[L].adj.find((c) => c !== D && sim.get(c, level) === B.air && sim.solid(c, level - 1)); if (at != null) yield { op: 'place', c: at, y: level, item: 'torch' }; }
  // 2. the sump beside it, and the water in it
  for (const y of [level + 1, level, level - 1]) if (sim.solid(D, y)) { const r = yield { op: 'mine', c: D, y }; if (!r.ok) return { ok: false, why: `could not dig the sump (${r.why})` }; }
  const w = yield { op: 'pour', c: D, y: level - 1 };
  if (!w.ok) return { ok: false, why: `could not pour the water (${w.why})` };
  // 3. join the bottom to the mine (a tunnel at its layer), if there is one
  if (g) { const j = yield* goTo(sim, (c, y) => c === g.hub[0] && y === g.hub[1], 40000); if (!j.ok) return { ok: false, why: `could not join the shafts to the mine (${j.why})` }; }
  // 4. back up the ladder, and the drop shaft dug from the top: the last block
  // drops you into your own sump (the first test of it)
  const up = yield* goTo(sim, (c, y) => c === D ? false : sim.cols[c].adj.includes(D) && y === gD, 40000);
  if (!up.ok) return { ok: false, why: `could not climb out (${up.why})` };
  const hp0 = p.hp;
  const e = yield { op: 'move', to: D };
  if (!e.ok) return { ok: false, why: e.why };
  for (let k = 0; k < H && p.y > level - 1; k++) {
    const y0 = p.y;
    if (!sim.solid(D, p.y - 1)) break;                                   // open below: we already fell
    const r = yield { op: 'mine', c: D, y: p.y - 1 };
    if (!r.ok) return { ok: false, why: `the drop shaft stopped at layer ${p.y} (${r.why})` };
    if (p.y === y0) break;
  }
  if (p.y > level || p.hp < hp0) return { ok: false, why: `the drop did not land in the water (layer ${p.y}, health ${hp0} → ${p.hp})` };
  // 5. up the ladder again, and the trapdoor over the drop
  const out = yield* goTo(sim, (c, y) => sim.cols[c].adj.includes(D) && y === gD, 40000);
  if (!out.ok) return { ok: false, why: `could not climb out (${out.why})` };
  const t = yield { op: 'place', c: D, y: gD - 1, item: 'trapdoor' };
  if (!t.ok) return { ok: false, why: `could not set the trapdoor (${t.why})` };
  // and one at the ladder's head, in place of its top rung: a wall to a mob at
  // ground level (without it the shaft was an open hole at night), and the
  // player climbs from the last rung straight through it
  const lt = yield* goTo(sim, (c, y) => sim.cols[c].adj.includes(L) && y === gL, 20000);
  if (lt.ok) {
    if (sim.get(L, gL) === B.ladder) yield { op: 'mine', c: L, y: gL };
    yield { op: 'place', c: L, y: gL, item: 'trapdoor' };
  }
  sim.team.access = { drop: [D, gD], ladder: [L, gL], level, rungs };
  sim.note('access', { drop: D, ladder: L, level, by: p.id });
  return { ok: true };
}

// -------------------------------------------------------------- explore ------

// Walk to the edge of what has been seen and look past it. Keeps a heading
// across calls, so repeated exploring sweeps outward instead of dithering.
export function* explore(sim, steps = 40) {
  const p = sim.player, before = sim.seenCount, start = p.c;
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
    for (const [c, y] of walk.slice(0, steps)) {
      const r = yield stepOp(sim, c, y);
      // refused (a mob in the way: the walking planner does not see mobs):
      // hand over to the digging planner, which routes around them
      if (!r.ok) { yield* goTo(sim, (cc) => cc === best, 15000); break; }
    }
  } else {
    const go = yield* goTo(sim, (c) => c === best, 15000);
    if (!go.ok) { sim._heading += Math.PI * 0.6; return { ok: false, why: `frontier unreachable (${go.why})` }; }
  }
  if (sim.seenCount === before && p.c === start) return { ok: false, why: 'could not get anywhere new' };
  return { ok: true, seen: sim.seenCount - before };
}

// Explore until something of a kind is in sight.
const SCOUT = {
  ...Object.fromEntries(SPECIES_NAMES.map((sp) => [sp, (sim) => visiblePlants(sim, sp).length > 0])),
  tree: (sim) => visible(sim, [B.log], 20).length > 0,
  pig: (sim) => visiblePigs(sim, 20).length > 0,
  sheep: (sim) => visiblePigs(sim, 20, 'sheep').length > 0,
  cow: (sim) => visiblePigs(sim, 20, 'cow').length > 0,
  chicken: (sim) => visiblePigs(sim, 20, 'chicken').length > 0,
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
  // home is in the overworld: from the nether, the way home is the portal
  if (inNether(sim)) { const u = yield* usePortal(sim); if (!u.ok) return { ok: false, why: `no way back (${u.why})` }; }
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
// R is the interior radius: 1 for one player, larger for a team. A house
// sleeps one player per HOUSE_TILES_PER_PLAYER floor tiles.
export const HOUSE_TILES_PER_PLAYER = 4;
export const houseCapacity = (plan) => Math.max(1, Math.floor(plan.interior.length / HOUSE_TILES_PER_PLAYER));
export function planHouse(sim, c0, R = 1) {
  const d = ball(sim, c0, R + 2);
  const interior = [], ring = [], outside = [];
  for (const [c, k] of d) (k <= R ? interior : k === R + 1 ? ring : outside).push(c);
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
    const out = sim.cols[c].adj.find((n) => d.get(n) === R + 2 && sim.canStand(n, g));
    if (out != null && sim.clearCost(c, g, tier) < Infinity && sim.clearCost(c, g + 1, tier) < Infinity) { door = c; break; }
  }
  if (door < 0) return null;
  return { c0, g, R, interior, ring, outside, door, cost: work + blocks, blocks };
}

// Is it a shelter? No MOB can walk from inside to outside.
export function sealed(sim, plan) {
  const out = new Set(plan.outside);
  const p = sim.path({ c: plan.c0, y: plan.g }, (c) => out.has(c), 4000, 2, true);
  return !p;
}

export function* buildHouse(sim) {
  // one builder at a time: a second house for the same team is wasted stone
  if (sim.team.builder != null && sim.team.builder !== sim.player.id) return { ok: false, why: 'a teammate is already building the house' };
  sim.team.builder = sim.player.id;
  try { return yield* buildHouseInner(sim); } finally { if (sim.team.builder === sim.player.id) sim.team.builder = null; }
}
function* buildHouseInner(sim) {
  const p = sim.player;
  // choose a site: the cheapest plan among seen columns near us
  // doors first: crafting them may put a table down, and that must happen
  // before the site is chosen, not in the middle of it
  if (!sim.has('door', 2)) {
    const d = yield* craft(sim, 'door', 2);
    if (!d.ok) return { ok: false, why: `no door: ${d.why}` };
  }
  // big enough for the whole team: the smallest radius that sleeps everyone
  const team = sim.players.length;
  const plans = [];
  for (let c = 0; c < sim.N; c++) {
    if (!sim.seen[c] || sim.dist(c, p.c) > (team > 1 ? 18 : 14)) continue;
    const top = groundTop(sim, c);
    if (![B.grass, B.dirt, B.sand, B.stone].includes(sim.get(c, top))) continue;
    let pl = null;
    for (let R = 1; R <= 3 && !pl; R++) { const q = planHouse(sim, c, R); if (q && houseCapacity(q) >= team) pl = q; else if (!q && R > 1) break; }
    if (!pl) continue;
    // not on top of a teammate: a wall cannot go where someone is standing
    if (sim.players.some((e) => e !== p && (pl.ring.includes(e.c) || pl.interior.includes(e.c)))) continue;
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
  // short? the team's chest is the pool: take building blocks from it first
  if (blocksHeld(sim) < need && sim.team.chest != null) {
    const got = yield* takeFromChest(sim, BUILDING, need - blocksHeld(sim));
    if (!got.ok && blocksHeld(sim) < need) return { ok: false, why: `needs ~${need} building blocks, holding ${blocksHeld(sim)} (${got.why})` };
  }
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
      if (pig && (pig.kind === 'pig' || pig.kind === 'sheep') && sim.adjacentTo(sim.player, pig) && w >= 2) yield { op: 'attack', id: pig.id };
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
  for (const pig of [...sim.ents.values()].filter((e) => (e.kind === 'pig' || e.kind === 'sheep') && foot.has(e.c))) {
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
  // the house is the TEAM's: everyone's home and respawn point
  for (const e of sim.players) { e.home = [c0, g]; e._house = plan; }
  sim.team.house = plan;
  for (const c of ring) for (let y = g; y <= g + 2; y++) sim.protect.add(c * H + y);
  for (const c of interior) { sim.protect.add(c * H + g + 2); sim.protect.add(c * H + g - 1); }
  sim.note('home', { c: c0, y: g, house: true, sleeps: houseCapacity(plan), team });
  return { ok: true };
}

// ---------------------------------------------------------------- the team --
// A chest is the team's shared pool. The first one placed becomes THE team
// chest (sim.team.chest); anyone can put into it or take from it, limited only
// by its 27 stacks.
export const chestAt = (sim) => sim.team.chest == null ? null : [Math.floor(sim.team.chest / H), sim.team.chest % H];
export const chestItems = (sim) => sim.team.chest == null ? {} : sim.ow('chests').get(sim.team.chest) || {};
function* toChest(sim) {
  const at = chestAt(sim);
  if (!at) return { ok: false, why: 'no team chest' };
  const go = yield* goTo(sim, (pc, py) => sim.reachable(pc, py, at[0], at[1]), 40000);
  return go.ok ? { ok: true, at } : { ok: false, why: `could not reach the chest (${go.why})` };
}
// Make a chest and put it at home (inside the house if there is room), or here.
export function* setUpChest(sim) {
  if (sim.team.chest != null) return { ok: false, why: 'the team already has a chest' };
  if (sim.home && sim.dist(sim.player.c, sim.home[0]) > 3) { const h = yield* goHome(sim); if (!h.ok) return { ok: false, why: `could not get home (${h.why})` }; }
  const r = yield* placeStation(sim, 'chest');
  if (!r.ok) return r;
  sim.note('chest', { at: sim.team.chest, by: sim.player.id });
  return { ok: true };
}
// What is surplus, and so belongs in the pool: everything but the tools,
// a few blocks to cap a hole with, some food, some torches, the seeds for the
// next planting.
const KEEP = { cobblestone: 8, dirt: 0, sand: 0, planks: 4, log: 2, torch: 4, stick: 2, coal: 2 };
export function surplus(sim) {
  const out = {};
  for (const [k, n] of Object.entries(sim.inv)) {
    // tools, armor (worn by carrying it) and buckets stay with their owner
    if (/_(pickaxe|shovel|axe|sword|hoe|armor)$/.test(k) || k === 'shears' || ['door', 'bed', 'chest', 'crafting_table', 'furnace', 'bucket', 'water_bucket', 'beacon', 'glowstone'].includes(k)) continue;
    let keep = KEEP[k] ?? 0;
    if (EAT_ORDER.includes(k)) keep = 3;
    if (k.endsWith('_seeds')) keep = 2;
    if (k === 'obsidian' && !sim.ow('portals').size) keep = PORTAL_OBSIDIAN;          // a portal frame's worth
    if (k === 'glowstone_dust' && !sim.has('glowstone')) keep = 4;
    if ((k === 'wool' || k === 'planks') && !sim.has('bed') && !(sim.player.bedAt && sim.get(sim.player.bedAt[0], sim.player.bedAt[1]) === B.bed)) keep = Math.max(keep, 3);   // still owed a bed
    if (n > keep) out[k] = n - keep;
  }
  return out;
}
export function* storeSurplus(sim) {
  const s0 = surplus(sim);
  if (!Object.keys(s0).length) return { ok: false, why: 'nothing surplus to store' };
  const go = yield* toChest(sim);
  if (!go.ok) return go;
  let moved = 0, full = false;
  for (const [item, n] of Object.entries(surplus(sim))) {
    const before = sim.inv[item] || 0;
    const r = yield { op: 'store', c: go.at[0], y: go.at[1], item, n };
    if (!r.ok) { if (/full/.test(r.why)) full = true; continue; }
    moved += before - (sim.inv[item] || 0);
  }
  if (!moved) return { ok: false, why: full ? 'the chest is full (27 stacks)' : 'nothing stored' };
  return { ok: true, stored: moved, ...(full ? { note: 'chest full' } : {}) };
}
// Take up to n of the first of `items` the chest holds.
export function* takeFromChest(sim, items, n = 64) {
  items = Array.isArray(items) ? items : [items];
  const have = chestItems(sim);
  if (!items.some((k) => have[k])) return { ok: false, why: `the chest has no ${items.join(' or ')}` };
  const go = yield* toChest(sim);
  if (!go.ok) return go;
  let got = 0;
  for (const item of items) {
    if (got >= n) break;
    const avail = chestItems(sim)[item] || 0;
    if (!avail) continue;
    const before = sim.inv[item] || 0;
    const r = yield { op: 'take', c: go.at[0], y: go.at[1], item, n: Math.min(avail, n - got) };
    if (r.ok) got += (sim.inv[item] || 0) - before;
  }
  return got ? { ok: true, took: got } : { ok: false, why: 'took nothing' };
}
// Sleep in your bed (placing it first, at home). The night passes only when
// every player is asleep at once, so this waits in bed until dawn either way.
export function* sleepInBed(sim) {
  const p = sim.player;
  if (!sim.isNight()) return { ok: false, why: 'it is day' };
  let bed = p.bedAt && sim.get(p.bedAt[0], p.bedAt[1]) === B.bed ? p.bedAt : null;
  if (!bed) {
    if (!sim.has('bed')) return { ok: false, why: 'no bed (3 wool + 3 planks)' };
    if (sim.home && sim.dist(p.c, sim.home[0]) > 3) { const h = yield* goHome(sim); if (!h.ok) return { ok: false, why: `could not get home (${h.why})` }; }
    // anywhere on the house floor that is free (a bed does not block the way:
    // you walk over it), else beside us
    let spot = null;
    const hs = sim._house;
    if (hs) {
      const taken = new Set(sim.players.filter((e) => e.bedAt).map((e) => e.bedAt[0]));
      const free = hs.interior.filter((c) => c !== hs.door && !taken.has(c) && sim.get(c, hs.g) === B.air && sim.solid(c, hs.g - 1) && !sim.occupied(c, hs.g))
        .sort((a, b) => (a === hs.c0) - (b === hs.c0) || sim.dist(a, p.c) - sim.dist(b, p.c));
      for (const c of free) {
        const go = yield* goTo(sim, (pc, py) => pc !== c && sim.reachable(pc, py, c, hs.g), 4000);
        if (go.ok) { spot = [c, hs.g]; break; }
      }
    }
    spot = spot || placeSpot(sim);
    if (!spot) return { ok: false, why: 'nowhere to put the bed' };
    const r = yield { op: 'place', c: spot[0], y: spot[1], item: 'bed' };
    if (!r.ok) return { ok: false, why: r.why };
    bed = p.bedAt = spot;
  }
  if (!(p.c === bed[0] && p.y === bed[1])) {
    const go = yield* goTo(sim, (c, y) => c === bed[0] && y === bed[1], 40000);
    if (!go.ok) return { ok: false, why: `could not reach the bed (${go.why})` };
  }
  for (let k = 0; k < 200 && sim.isNight(); k++) {
    const r = yield { op: 'sleep', c: bed[0], y: bed[1] };
    if (!r.ok) {
      if (/zombies/.test(r.why)) { yield* fight(sim); yield { op: 'wait', ticks: 10 }; continue; }
      return { ok: false, why: r.why };
    }
  }
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
    const z = [...sim.ents.values()].filter((q) => HOSTILE.has(q.kind) && sim.dist(q.c, e.c) < 8)
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

// -------------------------------------------------------------- the nether --
// A portal is a frame on the tile graph (sim.portalFrameOk): the doorway
// column with obsidian under and over it, and two of its neighbours obsidian
// two layers up — 6 obsidian on any tiling, lit with a torch. Tile c in the
// nether is tile c here, so a portal leads to the same tile on the other side
// (the far side is built on arrival if there is none, as in Minecraft).
export const inNether = (sim) => sim.dim === 'nether';
export const PORTAL_OBSIDIAN = 6;
const FRAME_BAD = new Set([B.water, B.lava, B.bedrock, B.chest, B.bed, B.portal, B.beacon, B.door]);
// the lit portals of this dimension (the standing voxel of each)
export function portalsHere(sim) {
  const out = [];
  for (const k of sim.portals) { const c = Math.floor(k / H), y = k % H; if (sim.get(c, y - 1) !== B.portal) out.push([c, y]); }
  return out.sort((a, b) => sim.dist(a[0], sim.player.c) - sim.dist(b[0], sim.player.c));
}
// Where a frame fits near c0: a doorway whose two flanks and front all stand on
// the doorway's floor. Cheapest (fewest blocks to clear, then nearest) first.
export function portalSite(sim, c0, r = 10) {
  let best = null;
  const tier = sim.pickTier();
  // never on the house or its doorstep: the frame is obsidian and protected,
  // so a portal across the way in would seal the house for good
  const h = sim._house, keep = new Set();
  if (h) { for (const c of ball(sim, h.c0, h.R + 2).keys()) keep.add(c); for (const c of ball(sim, h.door, 2).keys()) keep.add(c); }
  for (const [pc, hop] of ball(sim, c0, r)) {
    if (!sim.seen[pc] || sim.cols[pc].nb.includes(-1) || keep.has(pc)) continue;
    const g = groundTop(sim, pc) + 1;
    if (g < 3 || g > H - 4) continue;
    const under = sim.get(pc, g - 1);
    if (FRAME_BAD.has(under) || sim.protect.has(pc * H + g - 1) || sim.clearCost(pc, g - 1, tier) === Infinity) continue;
    if (![g, g + 1, g + 2].every((y) => sim.get(pc, y) === B.air || BLOCKS[sim.get(pc, y)].plant)) continue;
    const adj = sim.cols[pc].adj;
    const front = adj.find((n) => groundTop(sim, n) + 1 === g && sim.passable(n, g) && sim.passable(n, g + 1) && !sim.cols[n].nb.includes(-1));
    if (front == null) continue;
    const flanks = adj.filter((n) => n !== front && !keep.has(n) && ![g, g + 1].some((y) => FRAME_BAD.has(sim.get(n, y)) || sim.protect.has(n * H + y) || (sim.solid(n, y) && sim.clearCost(n, y, tier) === Infinity)));
    if (flanks.length < 2) continue;
    const f2 = flanks.sort((a, b) => [g, g + 1].filter((y) => sim.solid(a, y)).length - [g, g + 1].filter((y) => sim.solid(b, y)).length).slice(0, 2);
    const cost = f2.reduce((n, f) => n + [g, g + 1].filter((y) => sim.solid(f, y)).length, 0) + hop;
    if (!best || cost < best.cost) best = { pc, g, front, flanks: f2, cost };
  }
  return best;
}
// get within reach of (c, y) without standing in the frame, then make it obsidian
function* setObsidian(sim, c, y, frameCols) {
  if (sim.get(c, y) === B.obsidian) return { ok: true };
  if (!sim.reachable(sim.player.c, sim.player.y, c, y)) {
    const go = yield* goTo(sim, (pc, py) => !frameCols.has(pc) && sim.reachable(pc, py, c, y), 8000);
    if (!go.ok) return { ok: false, why: `could not reach the frame (${go.why})` };
  }
  if (sim.solid(c, y)) { const m = yield { op: 'mine', c, y }; if (!m.ok) return { ok: false, why: m.why }; }
  const r = yield { op: 'place', c, y, item: 'obsidian' };
  return r.ok ? { ok: true } : { ok: false, why: r.why };
}
// Build a portal frame of 6 obsidian near home and light it with a torch.
export function* buildPortal(sim) {
  if (inNether(sim)) return { ok: false, why: 'already in the nether' };
  if ((sim.inv.obsidian || 0) < PORTAL_OBSIDIAN) return { ok: false, why: `a frame takes ${PORTAL_OBSIDIAN} obsidian, holding ${sim.inv.obsidian || 0}` };
  if (!sim.has('torch')) { const t = yield* craft(sim, 'torch', 1); if (!t.ok) return { ok: false, why: `needs a torch to light it (${t.why})` }; }
  const c0 = sim.home && sim.dist(sim.home[0], sim.player.c) < 40 ? sim.home[0] : sim.player.c;
  const site = portalSite(sim, c0) || portalSite(sim, sim.player.c, 6);
  if (!site) return { ok: false, why: 'nowhere flat enough for a frame' };
  const { pc, g, front, flanks } = site;
  const frameCols = new Set([pc, ...flanks]);
  const go = yield* goTo(sim, (c, y) => c === front && y === g, 40000);
  if (!go.ok) return { ok: false, why: `could not get to the site (${go.why})` };
  for (const [c, y] of [[pc, g - 1], ...flanks.flatMap((f) => [[f, g], [f, g + 1]]), [pc, g + 2]]) {
    const r = yield* setObsidian(sim, c, y, frameCols);
    if (!r.ok) return r;
  }
  if (!sim.reachable(sim.player.c, sim.player.y, pc, g)) { const b = yield* goTo(sim, (c, y) => c === front && y === g, 8000); if (!b.ok) return { ok: false, why: b.why }; }
  const l = yield { op: 'light', c: pc, y: g };
  if (!l.ok) return { ok: false, why: l.why };
  // nobody mines through a portal's frame by accident
  for (const [c, y] of [[pc, g - 1], [pc, g + 2], ...flanks.flatMap((f) => [[f, g], [f, g + 1]])]) sim.protect.add(c * H + y);
  sim.team.portal = [pc, g];
  return { ok: true };
}
// Walk into the nearest lit portal and cross.
export function* usePortal(sim) {
  const ps = portalsHere(sim).filter(([c]) => sim.seen[c]);
  if (!ps.length) return { ok: false, why: 'no lit portal known here' };
  const [pc, py] = ps[0];
  const go = yield* goTo(sim, (c, y) => c === pc && y === py, 60000);
  if (!go.ok) return { ok: false, why: `could not reach the portal (${go.why})` };
  const r = yield { op: 'travel' };
  return r.ok ? { ok: true } : { ok: false, why: r.why };
}
// Nether mining: glowstone (dust, 2 a block: 4 make a lamp) and quartz, in
// sight first, else walk the cavern until some comes into view.
function* mineSight(sim, id, item, n) {
  const want = (sim.inv[item] || 0) + n;
  for (let leg = 0; leg < n * 3 && (sim.inv[item] || 0) < want; leg++) {
    if (deepAndLow(sim)) break;                           // the last pick: stop here, and head up
    const seen = visible(sim, [id], 30).filter(([c, y]) => !(sim._unreachable && sim._unreachable.has(c * H + y)));
    if (seen.length) { yield* fetchBlock(sim, ...seen[0]); continue; }
    const t0 = sim.tick, e = yield* explore(sim);
    if (!e.ok && sim.tick === t0) break;
  }
  return (sim.inv[item] || 0) >= want ? { ok: true } : (sim.inv[item] || 0) > want - n ? { ok: true, partial: true } : { ok: false, why: `no ${blockName(id)} found` };
}
export const mineGlowstone = (sim, n = 4) => mineSight(sim, B.glowstone, 'glowstone_dust', n);
export const mineQuartz = (sim, n = 4) => mineSight(sim, B.quartz_ore, 'quartz', n);


// ------------------------------------------------------------- palette -------
// The palette as DATA. Each entry: the mode it belongs to, one line of what it
// does, and needs(sim, args) → null when it can run now, or the reason it
// cannot. That reason is the difference between offering a model a choice and
// offering it a trap: Jev's `choice` will be built from the legal entries only.
const hasPick = (sim, t = 1) => sim.pickTier() >= t ? null : `needs a ${['', 'wooden', 'stone', 'iron', 'diamond'][t]} pickaxe`;
const food = (sim) => EAT_ORDER.some((k) => sim.has(k));
export const PALETTE = {
  // mine
  mine_stone:   { mode: 'mine', doc: 'staircase down for cobblestone, taking ore on the way', needs: (s) => hasPick(s), run: (s, a) => mineStone(s, a?.n) },
  mine_coal:    { mode: 'mine', doc: 'take coal in sight, or dig for it', needs: (s) => hasPick(s), run: (s, a) => mineCoal(s, a?.n) },
  mine_iron:    { mode: 'mine', doc: 'down to the iron band and along it', needs: (s) => hasPick(s, 2), run: (s, a) => mineIron(s, a) },
  mine_home:    { mode: 'mine', doc: 'the team\'s mine near home: dig it once (a staircase to the ore layer, a lit hub), then walk down it and extend a branch', needs: (s, a) => hasPick(s, MINE_ORE[a?.ore || 'iron']?.[2] || 2), run: (s, a) => homeMine(s, a || {}) },
  build_access: { mode: 'homestead', doc: 'shafts beside the house to the mine: a trapdoor over a drop into water, and a ladder back up', needs: (s) => s.team.access ? 'the mine already has its shafts' : !s._house ? 'needs a house' : !s.has('bucket') && !s.has('water_bucket') ? 'needs a bucket (3 iron ingots)' : null, run: (s, a) => buildAccess(s, a || {}) },
  mine_grid:    { mode: 'mine', doc: 'a mine laid out to see every stone: tunnels every other tile on the layer, from a permanent staircase', needs: (s, a) => hasPick(s, MINE_ORE[a?.ore || 'iron']?.[2] || 2), run: (s, a) => gridMine(s, a || {}) },
  branch_mine:  { mode: 'mine', doc: 'a straight tunnel on this layer, torch-lit', needs: (s) => hasPick(s), run: (s, a) => branchMine(s, a?.length) },
  surface:      { mode: 'mine', doc: 'climb (or swim) back up to open sky', needs: (s) => underwater(s) ? null : s.skyOpen(s.player.c, s.player.y + 2) ? 'already under open sky' : atHome(s) ? 'in the house — any outdoor activity walks out the door' : null, run: (s) => surface(s) },
  // explore
  explore:      { mode: 'explore', doc: 'walk to the edge of the known and look past it', needs: () => null, run: (s, a) => explore(s, a?.steps) },
  scout:        { mode: 'explore', doc: 'explore until a tree / pig / coal / iron / sand is in sight', needs: () => null, run: (s, a) => scout(s, a?.what) },
  gather_wood:  { mode: 'explore', doc: 'chop the nearest trees', needs: () => null, run: (s, a) => gatherWood(s, a?.n) },
  hunt:         { mode: 'explore', doc: 'chase down a pig (meat) or a sheep (wool, mutton) in sight', needs: (s, a) => visiblePigs(s, 24, a?.kind || 'pig').length ? null : `no ${a?.kind || 'pig'} in sight (scout for one)`, run: (s, a) => hunt(s, a?.kind || 'pig') },
  collect:      { mode: 'explore', doc: 'pick up the items lying on the ground nearby (saplings, apples, drops)', needs: (s) => itemsInSight(s).length ? null : 'nothing lying about', run: (s) => collectItems(s) },
  plant_trees:  { mode: 'homestead', doc: 'plant saplings near home: a tree grows in about 1600 ticks (renewable wood)', needs: (s) => !s.has('sapling') ? 'no saplings (leaves drop them)' : null, run: (s, a) => plantTrees(s, a?.n) },
  recover:      { mode: 'explore', doc: 'go back to where you died and pick up everything you dropped (it lasts 5 minutes)', needs: (s) => lostThings(s) ? null : 'nothing dropped to go back for', run: (s) => recover(s) },
  breed:        { mode: 'homestead', doc: 'feed two animals of a kind their food: a young one appears (cows, sheep: wheat; chickens: seeds; pigs: apples)', needs: (s, a) => { const k = a?.kind || 'cow', f = BREED_FOOD[k]; return !s.has(f, 2) ? `needs 2 ${f.replace(/_/g, ' ')}` : visiblePigs(s, 24, k).filter((e) => !e.young).length < 2 ? `fewer than two ${k}s in sight` : null; }, run: (s, a) => breed(s, a?.kind || 'cow') },
  shear:        { mode: 'explore', doc: 'shear a sheep in sight: wool without killing it, and it grows back', needs: (s) => !s.has('shears') ? 'needs shears (2 iron ingots)' : visiblePigs(s, 24, 'sheep').some((e) => !e.shorn) ? null : 'no sheep with wool in sight', run: (s, a) => shear(s, a?.n) },
  forage:       { mode: 'explore', doc: 'take a wild plant in sight for its seeds (and fruit)', needs: (s, a) => visiblePlants(s, a?.sp).filter(([c, y]) => !a?.sp ? !s.has(`${BLOCKS[s.get(c, y)].plant}_seeds`) : true).length ? null : `no wild ${a?.sp || 'plant you lack seeds for'} in sight`, run: (s, a) => forage(s, a || {}) },
  go_home:      { mode: 'explore', doc: 'walk back to the house', needs: (s) => s.home ? (atHome(s) ? 'already home' : null) : 'no home yet', run: (s) => goHome(s) },
  // homestead
  craft:        { mode: 'homestead', doc: 'make an item, and whatever it is made of', needs: (s, a) => {
    if (!RECIPES[a?.item]) return 'no such recipe';
    const sh = shortfall(s, a.item, a.n || 1);
    return Object.keys(sh).length ? `short of ${describeShort(sh)}` : null;
  }, run: (s, a) => craft(s, a.item, a.n) },
  build_house:  { mode: 'homestead', doc: 'a walled, roofed, lit house with a door, on the tile graph', needs: (s) => { if (s.home && s._house) return 'already have a house'; if (s.team.builder != null && s.team.builder !== s.player.id) return 'a teammate is building it'; const pool = blocksHeld(s) + BUILDING.reduce((n, k) => n + (chestItems(s)[k] || 0), 0); return pool < 30 * Math.min(3, s.players.length) ? `needs ~${30 * Math.min(3, s.players.length)}+ building blocks, holding ${blocksHeld(s)}${s.team.chest != null ? ` (+${pool - blocksHeld(s)} in the chest)` : ''}` : null; }, run: (s) => buildHouse(s) },
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
  // the diamond age
  mine_diamond: { mode: 'mine', doc: 'down to the bottom layers for diamonds (needs an iron pick)', needs: (s) => hasPick(s, 3), run: (s, a) => mineDiamond(s, a?.n) },
  make_obsidian:{ mode: 'mine', doc: 'carry water in a bucket to lava; mine the obsidian (diamond pick)', needs: (s) => s.pickTier() < 4 ? 'needs a diamond pickaxe' : !s.has('bucket') && !s.has('water_bucket') ? 'needs a bucket (3 iron ingots)' : !visible(s, [B.lava], 40).length ? 'no lava in sight' : null, run: (s, a) => makeObsidian(s, a?.n) },
  dig_sand:     { mode: 'explore', doc: 'dig sand (for glass)', needs: () => null, run: (s, a) => digSand(s, a?.n || (s.inv.sand || 0) + 5) },
  place_beacon: { mode: 'homestead', doc: 'a beacon at home: nothing spawns within 16', needs: (s) => s.ow('beacons').size ? 'a beacon is already lit' : s.has('beacon') ? null : Object.keys(shortfall(s, 'beacon', 1)).length ? `short of ${describeShort(shortfall(s, 'beacon', 1))}` : null, run: (s) => placeBeacon(s) },
  // the nether
  build_portal: { mode: 'homestead', doc: 'a frame of 6 obsidian near home, lit with a torch: a door to the nether', needs: (s) => portalsHere(s).length ? 'a portal is already lit' : (s.inv.obsidian || 0) < PORTAL_OBSIDIAN ? `a frame takes ${PORTAL_OBSIDIAN} obsidian, holding ${s.inv.obsidian || 0}` : !s.has('torch') && Object.keys(shortfall(s, 'torch', 1)).length ? 'needs a torch to light it' : null, run: (s) => buildPortal(s) },
  use_portal:   { mode: 'explore', doc: 'walk into the lit portal and cross to the other side', needs: (s) => portalsHere(s).some(([c]) => s.seen[c]) ? null : inNether(s) ? 'no portal known here (the one you came through?)' : 'no lit portal yet', run: (s) => usePortal(s) },
  mine_glowstone: { mode: 'mine', doc: 'glowstone in sight (2 dust a block; 4 dust make a lamp), else walk the cavern for it', needs: () => null, run: (s, a) => mineGlowstone(s, a?.n) },
  mine_quartz:  { mode: 'mine', doc: 'quartz ore in the netherrack, in sight or found by walking', needs: (s) => hasPick(s), run: (s, a) => mineQuartz(s, a?.n) },
  // the pool and the beds
  set_up_chest: { mode: 'homestead', doc: 'make a chest and put it at home: the team\'s shared store', needs: (s) => s.team.chest != null ? 'the team already has a chest' : Object.keys(shortfall(s, 'chest', 1)).length && !s.has('chest') ? `short of ${describeShort(shortfall(s, 'chest', 1))}` : null, run: (s) => setUpChest(s) },
  store:        { mode: 'homestead', doc: 'put your surplus in the team chest (27 stacks of 64)', needs: (s) => s.team.chest == null ? 'no team chest yet' : !Object.keys(surplus(s)).length ? 'nothing surplus to store' : slotsUsed(chestItems(s)) >= CHEST_SLOTS && !Object.keys(surplus(s)).some((k) => roomFor(chestItems(s), k) > 0) ? 'the chest is full' : null, run: (s) => storeSurplus(s) },
  take:         { mode: 'homestead', doc: 'take something from the team chest', needs: (s, a) => s.team.chest == null ? 'no team chest yet' : a?.item && !chestItems(s)[a.item] ? `the chest has no ${a.item}` : !Object.keys(chestItems(s)).length ? 'the chest is empty' : null, run: (s, a) => takeFromChest(s, a?.item ? [a.item] : Object.keys(chestItems(s)), a?.n || 64) },
  sleep_in_bed: { mode: 'homestead', doc: 'sleep in your bed; the night passes when every player is asleep', needs: (s) => !s.isNight() ? 'it is day' : s.player.bedAt && s.get(s.player.bedAt[0], s.player.bedAt[1]) === B.bed ? null : s.has('bed') ? null : 'no bed (3 wool + 3 planks)', run: (s) => sleepInBed(s) },
  // the team (only offered when someone else is in the world)
  follow:       { mode: 'team', doc: 'go to a teammate', needs: (s, a) => mateNeeds(s, a), run: (s, a) => follow(s, a.to) },
  guard:        { mode: 'team', doc: 'stay by a teammate and fight what comes at them', needs: (s, a) => mateNeeds(s, a), run: (s, a) => guard(s, a.to, a.ticks) },
  give:         { mode: 'team', doc: 'walk over and hand a teammate wood, food, stone or torches', needs: (s, a) => mateNeeds(s, a) || ((GIFTS[a?.what || 'wood'] || []).some((k) => s.has(k)) ? null : `holding no ${a?.what || 'wood'}`), run: (s, a) => giveItems(s, a.to, a.what) },
  flee:         { mode: 'explore', doc: 'get away from a creeper (it blows up beside you) or whatever is closest', needs: (s) => creeperNear(s) || [...s.ents.values()].some((e) => HOSTILE.has(e.kind) && s.dist(e.c, s.player.c) <= 3) ? null : 'nothing to run from', run: (s) => flee(s) },
  shoot:        { mode: 'homestead', doc: 'shoot the nearest hostile in sight with the bow (6 damage, up to 8 tiles)', needs: (s) => !s.has('bow') ? 'no bow (3 sticks, 3 string)' : !s.has('arrow') ? 'no arrows' : targetsInSight(s).length ? null : 'nothing in sight and range', run: (s) => shootAt(s) },
  repair_house: { mode: 'homestead', doc: 'put back the walls, roof and door a blast took out', needs: (s) => !s._house ? 'no house' : !houseHoles(s).length ? 'the house is whole' : null, run: (s) => repairHouse(s) },
  fight:        { mode: 'homestead', doc: 'hit whatever hostile is adjacent (and charge a skeleton shooting at you)', needs: (s) => [...s.ents.values()].some((e) => HOSTILE.has(e.kind) && e.kind !== 'creeper' && s.adjacentTo(s.player, e)) || [...s.ents.values()].some((e) => e.kind === 'skeleton' && s.dist(e.c, s.player.c) <= 7 && s.los(s.player, e)) ? null : 'nothing to fight', run: (s) => fight(s) },
};
export const MODES = ['mine', 'explore', 'homestead', 'team'];
// Which world each macro works in. The overworld's are about its sky, soil,
// sea, ore bands, the house and the chest; the nether has none of those.
const OVERWORLD_ONLY = new Set(['mine_home', 'mine_grid', 'shear', 'build_access', 'plant_trees', 'breed', 'mine_stone', 'mine_coal', 'mine_iron', 'surface', 'scout', 'gather_wood', 'hunt', 'forage', 'build_house', 'light_area',
  'farm', 'harvest', 'set_home', 'sleep_until_dawn', 'mine_diamond', 'make_obsidian', 'dig_sand', 'place_beacon', 'build_portal', 'set_up_chest', 'store', 'take', 'sleep_in_bed']);
const NETHER_ONLY = new Set(['mine_glowstone', 'mine_quartz']);
for (const [name, m] of Object.entries(PALETTE)) {
  const need = m.needs;
  m.needs = (s, a) => inNether(s) ? (OVERWORLD_ONLY.has(name) ? 'not in the nether' : need(s, a)) : NETHER_ONLY.has(name) ? 'only in the nether' : need(s, a);
}
function mateNeeds(s, a) {
  if (s.players.length < 2) return 'nobody else is here';
  if (a && a.to != null && !mate(s, a.to)) return 'no such teammate';
  return null;
}
export const legalMacros = (sim) => Object.entries(PALETTE).filter(([n, m]) => n !== 'craft' && m.mode !== 'team' && !m.needs(sim, {})).map(([n]) => n);
