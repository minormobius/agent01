// craft/arena.mjs — player against player: Bed Wars on a tiling.
//
// Why this exists. The solo game ran out of signal: the scripted baseline
// reaches every rung and barely dies, so what is left to compare is speed, and
// the scoreboard was written by the same hand as the script. Head to head has
// no ceiling (there is always a winner), the opponent is the benchmark (a
// brittle plan is punished, not just slow), and many short matches with the
// sides swapped turn trajectory noise into an error bar.
//
// The game. Two sides, each with a bed on a floating island, an iron and gold
// generator and a shop; a centre island with a diamond generator; nothing
// between them but a fall to the bottom of the world (world.mjs, kind
// 'arena'). While your bed stands you come back after a death. Break the
// other bed, then kill its players, and you win. Everything the generator laid
// is locked; only what players place can be mined. Resources a player dies
// with go to whoever killed them (or last hit them, if they fell).
//
// Layers, as everywhere in craft: the rules live in ArenaRules and hook the
// sim at a handful of points (death, mining, attacking, buying, the tick); the
// macros below are the palette a side plays with; the policies choose among
// them. playMatch runs one game headlessly and deterministically.

import { Sim } from './sim.mjs';
import { B, BLOCKS, H, SWORD_DMG, ARMOR, PICK_TIER, generateWorld } from './world.mjs';
import { goTo } from './macros.mjs';
import { Party } from './party.mjs';

// ------------------------------------------------------------- the rules ---
export const RESPAWN_TICKS = 20;          // ~5 s out of the game after a death, while your bed stands
export const MAX_TICKS = 6000;            // a match that nobody has won by then is a draw
export const GENS = {                     // what spawns where, every n ticks, up to a pile of cap
  iron: { item: 'iron_ingot', every: 6, cap: 48 },
  gold: { item: 'gold_ingot', every: 32, cap: 12 },
  diamond: { item: 'diamond', every: 120, cap: 4 },
};
export const RESOURCES = ['iron_ingot', 'gold_ingot', 'diamond'];
// Bed Wars' shop, in this game's items. Blocks trade cost against how long
// they take to break (wool 3 ticks by hand, planks 6, cobblestone needs a
// pick, obsidian a diamond pick).
export const SHOP = {
  wool:            { n: 16, cost: { iron_ingot: 4 } },
  planks:          { n: 16, cost: { iron_ingot: 12 } },
  cobblestone:     { n: 12, cost: { iron_ingot: 24 } },
  obsidian:        { n: 4,  cost: { diamond: 4 } },
  stone_sword:     { n: 1,  cost: { iron_ingot: 10 } },
  iron_sword:      { n: 1,  cost: { gold_ingot: 7 } },
  diamond_sword:   { n: 1,  cost: { diamond: 4 } },
  iron_armor:      { n: 1,  cost: { gold_ingot: 12 } },
  diamond_armor:   { n: 1,  cost: { diamond: 6 } },
  wooden_pickaxe:  { n: 1,  cost: { iron_ingot: 10 } },
  iron_pickaxe:    { n: 1,  cost: { gold_ingot: 6 } },
  diamond_pickaxe: { n: 1,  cost: { diamond: 3 } },
  wooden_axe:      { n: 1,  cost: { iron_ingot: 10 } },
  bow:             { n: 1,  cost: { gold_ingot: 12 } },
  arrow:           { n: 8,  cost: { gold_ingot: 2 } },
  golden_apple:    { n: 1,  cost: { gold_ingot: 3 } },
};
export const START_KIT = { wooden_sword: 1 };
export const BRIDGE_TICKS = 3;            // a block laid out over the void: crouched at the edge, slower than building on ground
export const WARN_RANGE = 7;              // an enemy this near your bed is coming for it
// what a death keeps: armor and tools stay yours (Bed Wars' rule); blocks,
// resources, arrows and the bow are lost; the sword goes back to wood
const KEEPS = new Set(['iron_armor', 'diamond_armor', 'wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'wooden_axe', 'stone_axe', 'shield']);
export const BLOCK_ITEMS = ['wool', 'planks', 'cobblestone', 'obsidian'];
const costText = (cost) => Object.entries(cost).map(([k, n]) => `${n} ${k.replace(/_ingot$/, '').replace(/_/g, ' ')}`).join(' + ');

export class ArenaRules {
  constructor(sim) {
    this.sim = sim;
    const a = sim.world.arena;
    this.a = a; this.g = a.g; this.L = a.g + 1;     // L: the layer players stand on
    this.sides = a.bases.map((b, i) => ({ id: i, ...b, bedAlive: true, players: [], guard: new Set(), kills: 0 }));
    // everything the generator laid is locked
    this.locked = new Set();
    for (let k = 0; k < sim.b.length; k++) if (sim.b[k] !== B.air && sim.b[k] !== B.bed) this.locked.add(k);
    for (const k of this.locked) sim.protect.add(k);
    this.gens = [
      ...this.sides.flatMap((s) => [{ ...GENS.iron, c: s.gen, side: s.id }, { ...GENS.gold, c: s.gen, side: s.id }]),
      ...(a.mids || [a.mid]).map((c) => ({ ...GENS.diamond, c, side: -1 })),
    ];
    this.piles = new Map();                        // generator column → the item entity lying on it
    this.result = null;
    this.events = [];                              // bed breaks, kills, eliminations: the match's own log
  }
  foes(p, t) { return p.side !== t.side; }
  // a player's reach, player to player: the next tile, two layers up or down
  // (a defender could not hit someone standing on its own bed cover, digging down)
  canHit(p, t) { return (p.c === t.c || this.sim.cols[p.c].adj.includes(t.c)) && Math.abs(p.y - t.y) <= 2; }
  placeTicks(c, y) { return y <= this.g && !this.sim.solid(c, y - 1) ? BRIDGE_TICKS : 1; }
  foesOf(p) { return this.sim.players.filter((q) => q.side !== p.side); }
  mates(p) { return this.sim.players.filter((q) => q.side === p.side && q !== p); }
  sideOf(p) { return this.sides[p.side]; }
  foeSide(p) { return this.sides[1 - p.side]; }
  guards(p, k) { return !!p && p.side != null && this.sides[p.side].guard.has(k); }
  bedAt(c, y) { return this.sides.find((s) => s.bed[0] === c && s.bed[1] === y); }
  canMine(p, c, y) {
    if (this.locked.has(c * H + y)) return 'the arena itself cannot be mined';
    const s = this.bedAt(c, y);
    if (s && s.id === p.side) return 'that is your own bed';
    return null;
  }
  bedBroken(p, c, y) {
    const s = this.bedAt(c, y);
    if (!s || !s.bedAlive) return;
    s.bedAlive = false;
    this.events.push({ t: this.sim.tick, what: 'bed', side: s.id, by: p.id });
    this.sim.note('bed', { side: s.id, by: p.id });
    this.checkEnd();
  }
  // a player died (sim.hurt calls this in place of respawning at home)
  death(e, from) {
    const sim = this.sim, t = sim.tick;
    let killer = from && from.kind === 'player' ? from : null;
    // a knock into the void is the knocker's kill, if the blow was recent
    if (!killer && e.lastHit && t - e.lastHit.t < 200) killer = sim.players.find((q) => q.id === e.lastHit.by) || null;
    if (killer && killer.side === e.side) killer = null;
    const kept = {}, loot = {};
    for (const [k, n] of Object.entries(e.inv)) {
      if (KEEPS.has(k)) kept[k] = n;
      else if (RESOURCES.includes(k)) loot[k] = n;
    }
    kept.wooden_sword = 1;
    if (killer && Object.keys(loot).length) {
      for (const [k, n] of Object.entries(loot)) killer.inv[k] = (killer.inv[k] || 0) + n;
      sim.emit(['inv', { ...killer.inv }, killer.id]);
    }
    const wear = {};
    for (const k of Object.keys(kept)) if ((e.wear || {})[k] != null) wear[k] = e.wear[k];
    e.inv = kept; e.wear = wear; e.ench = {}; e.hp = 0; e.lastHit = null;
    sim.emit(['inv', { ...e.inv }, e.id]);
    const s = this.sides[e.side];
    const final = !s.bedAlive;
    if (killer) { this.sides[killer.side].kills++; killer.kills = (killer.kills || 0) + 1; }
    e.deathsHere = (e.deathsHere || 0) + 1;
    this.events.push({ t, what: final ? 'final kill' : 'kill', who: e.id, by: killer ? killer.id : -1 });
    sim.note('kill', { who: e.id, by: killer ? killer.id : -1, final });
    e.out = final ? Infinity : t + RESPAWN_TICKS;
    if (final) { e.eliminated = true; sim.note('eliminated', { who: e.id, side: e.side }); }
    sim.removeEnt(e, final ? 'eliminated' : 'died');
    this.checkEnd();
  }
  respawn(e) {
    const sim = this.sim, s = this.sides[e.side];
    const spots = [s.spawn[0], ...s.island.filter((c) => c !== s.spawn[0])];
    let at = null;
    for (const c of spots) if (sim.canStand(c, this.L) && !sim.occupied(c, this.L) && !sim.occupied(c, this.L + 1)) { at = c; break; }
    if (at == null) at = s.spawn[0];
    e.out = 0; e.hp = 20; e.food = 20;
    e.c = at; e.y = this.L;
    sim.ents.set(e.id, e);
    sim.emit(['+', e.id, 'player', at, this.L]);
    sim.emit(['hp', e.id, 20]);
    sim.as(e, () => sim.look());
  }
  tick() {
    const sim = this.sim, t = sim.tick;
    if (this.result) return;
    // generators: the pile on each pad grows until someone stands beside it
    for (const gn of this.gens) {
      if (t % gn.every) continue;
      let pile = this.piles.get(gn.c + ':' + gn.item);
      if (pile && !sim.ents.has(pile.id)) pile = null;
      if (pile) { if ((pile.items[gn.item] || 0) < gn.cap) pile.items[gn.item] = (pile.items[gn.item] || 0) + 1; }
      else {
        pile = sim.dropItems(gn.c, this.L, { [gn.item]: 1 }, { gen: true });
        pile.until = Infinity;
        this.piles.set(gn.c + ':' + gn.item, pile);
      }
    }
    for (const e of sim.players) {
      if (e.out) { if (e.out !== Infinity && t >= e.out) this.respawn(e); continue; }
      // the fall: anyone well below the islands is gone
      if (e.y < this.g - 3) sim.as(e, () => sim.hurt(e, 999, null));
    }
  }
  checkEnd() {
    if (this.result) return;
    const alive = this.sides.filter((s) => s.bedAlive || this.sim.players.some((q) => q.side === s.id && !q.eliminated));
    if (alive.length <= 1) this.finish(alive.length ? alive[0].id : null, 'elimination');
  }
  finish(winner, reason) {
    this.result = { winner, reason, tick: this.sim.tick, beds: this.sides.map((s) => s.bedAlive), kills: this.sides.map((s) => s.kills) };
    this.sim.note('match', this.result);
  }
  buy(p, a, no) {
    const offer = SHOP[a.item];
    if (!offer) return no(`the shop does not sell ${a.item}`);
    const sim = this.sim, s = this.sides[p.side], [sc, sy] = s.shop;
    if (!(p.c === sc || sim.cols[p.c].adj.includes(sc)) || Math.abs(p.y - sy) > 1) return no('not at your shop');
    for (const [k, n] of Object.entries(offer.cost)) if ((p.inv[k] || 0) < n) return no(`${a.item.replace(/_/g, ' ')} costs ${costText(offer.cost)}`);
    return { ok: true, ticks: 1, pre: () => {
      sim.emit(['do', 'buy', a.item]);
      for (const [k, n] of Object.entries(offer.cost)) sim.take(k, n);
      sim.give(a.item, offer.n);
    } };
  }
  interrupt(running) {
    const sim = this.sim, p = sim.player;
    if (p.out) return null;
    const onMe = this.foesOf(p).some((q) => !q.out && this.canHit(q, p));
    if (onMe && !['fight', 'defend'].includes(running)) return 'an enemy is on you';
    const s = this.sides[p.side];
    if (s.bedAlive) {
      const near = this.foesOf(p).some((q) => !q.out && sim.dist(q.c, s.bed[0]) <= WARN_RANGE);
      if (near && !p._bedAck && !['defend', 'fight'].includes(running)) { p._bedAck = true; return 'an enemy is coming for your bed'; }
      if (!near) p._bedAck = false;
    } else if (!p._bedGoneAck) { p._bedGoneAck = true; return 'your bed is gone'; }
    return null;
  }
}

// A new match: the arena world, the rules, and perSide players on each side.
export function newArena({ seed = 1, shape = 'hex', perSide = 1, radius } = {}) {
  const world = generateWorld({ seed, shape, kind: 'arena', ...(radius ? { radius } : {}) });
  const sim = new Sim({ world, difficulty: 'arena' });
  const rules = sim.arena = new ArenaRules(sim);
  sim.palette = ARENA_PALETTE;
  const place = (e, side) => {
    e.side = side; rules.sides[side].players.push(e);
    e.inv = { ...START_KIT }; e.seen.fill(1); e.seenCount = sim.N;
    e.home = rules.sides[side].spawn.slice();
    sim.emit(['inv', { ...e.inv }, e.id]);
  };
  place(sim.players[0], 0);
  for (let side = 0; side < 2; side++) {
    for (let k = side === 0 ? 1 : 0; k < perSide; k++) {
      const s = rules.sides[side];
      const c = [s.spawn[0], ...s.island].find((u) => sim.canStand(u, rules.L) && !sim.occupied(u, rules.L) && !sim.occupied(u, rules.L + 1));
      const e = sim.newPlayer(c, rules.L);
      place(e, side);
    }
  }
  sim.note('arena', { sides: rules.sides.map((s) => ({ id: s.id, bed: s.bed, gen: s.gen, shop: s.shop, players: s.players.map((e) => e.id) })), mid: rules.a.mid, symmetry: rules.a.symmetry, exact: rules.a.exact });
  sim.flush();
  return sim;
}

// ------------------------------------------------------------ the macros ---
const A = (sim) => sim.arena;
const me = (sim) => sim.player;
const L = (sim) => sim.arena.L;
const held = (sim, k) => sim.inv[k] || 0;
export const blocksHeld = (sim) => BLOCK_ITEMS.reduce((n, k) => n + held(sim, k), 0);
const cheapBlock = (sim) => BLOCK_ITEMS.find((k) => held(sim, k) > 0) || null;          // bridges: the cheapest first
const hardBlock = (sim) => [...BLOCK_ITEMS].reverse().find((k) => held(sim, k) > 0) || null;   // a bed's cover: the hardest first
const liveFoes = (sim) => A(sim).foesOf(me(sim)).filter((q) => !q.out);
export const nearestFoe = (sim) => liveFoes(sim).sort((a, b) => sim.dist(a.c, me(sim).c) - sim.dist(b.c, me(sim).c))[0] || null;
const onIsland = (sim, cols) => cols.includes(me(sim).c) && me(sim).y === L(sim);
const standable = (sim, c) => sim.canStand(c, L(sim)) && !sim.occupied(c, L(sim)) && !sim.occupied(c, L(sim) + 1);
// the voxels that cover a side's bed: the top, and every neighbour three high.
// Two high was one block deep: an attacker mined the upper one, stood on the
// lower, and reached down to the bed (3 ticks through wool). Three high means
// any way in goes through at least two blocks.
export function coverOf(sim, side) {
  const [b, y] = side.bed;
  return [[b, y + 1], ...sim.cols[b].adj.flatMap((n) => [[n, y], [n, y + 1], [n, y + 2]])].filter(([c, yy]) => !A(sim).locked.has(c * H + yy));
}
// any cover voxel still open that some standable island tile can place without trapping itself
export function coverSpot(sim, side) {
  const Ly = L(sim), b = side.bed[0];
  for (const [c, y] of coverOf(sim, side)) {
    if (sim.get(c, y) !== B.air || sim.occupied(c, y)) continue;
    for (const s of side.island) if (s !== b && s !== c && sim.canStand(s, Ly) && sim.reachable(s, Ly, c, y) && !wouldTrap(sim, side, s, c, y)) return [c, y, s];
  }
  return null;
}
// the pick tier a side's bed cover demands (0: breakable by hand)
export const coverNeeds = (sim, side) => coverOf(sim, side).reduce((t, [c, y]) => Math.max(t, BLOCKS[sim.get(c, y)].tool || 0), 0);
export const coverLeft = (sim, side) => coverOf(sim, side).filter(([c, y]) => sim.get(c, y) === B.air).length;

// Would covering (c, y) wall the player in, from `from`? Walking needs a floor
// and two clear layers; after the block goes in, can `from` still walk to the
// generator? (On a small island the first fortify walled its builder into a
// pocket beside the bed, and its own planner, rightly, won't dig its own cover.)
export function wouldTrap(sim, side, from, c, y) {
  const g = A(sim).g, Ly = L(sim);
  const open = (n) => sim.solid(n, g) && !(n === c && (y === Ly || y === Ly + 1)) && !sim.solid(n, Ly) && !sim.solid(n, Ly + 1) && !(n === side.bed[0] && (sim.solid(n, Ly + 1) || (c === n && y === Ly + 1)));
  if (from === side.gen) return false;
  const seen = new Set([from]), q = [from];
  for (let i = 0; i < q.length; i++) for (const n of sim.cols[q[i]].adj) {
    if (seen.has(n) || !open(n)) continue;
    if (n === side.gen) return false;
    seen.add(n); q.push(n);
  }
  return true;
}
function* waitFor(sim, ticks) { for (let k = 0; k < ticks; k += 10) yield { op: 'wait', ticks: Math.min(10, ticks - k) }; }

// Walk and, where there is nothing to walk on, bridge: a route over the tile
// graph at the standing layer, placing a block under each empty tile and
// mining whatever someone put in the way. The cost of a tile is what it takes
// to cross it, so routes use bridges already built.
export function bridgeRoute(sim, from, targets) {
  const g = A(sim).g, Ly = L(sim), goal = new Set(targets);
  const cost = (n) => {
    if (A(sim).locked.has(n * H + Ly) || A(sim).locked.has(n * H + Ly + 1)) return Infinity;   // the shop
    if (A(sim).guards(me(sim), n * H + Ly) || A(sim).guards(me(sim), n * H + Ly + 1)) return Infinity;   // your own bed's cover
    let c = 1;
    if (!sim.solid(n, g)) c += 4;                                    // a block to place
    for (const y of [Ly, Ly + 1]) if (sim.solid(n, y)) c += 3 + sim.mineTicks(BLOCKS[sim.get(n, y)]);   // one to mine
    if (A(sim).bedAt(n, Ly)) c += 50;                                 // not through a bed
    return c;
  };
  const dist = new Map([[from, 0]]), prev = new Map(), open = [[0, from]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [d, u] = open.shift();
    if (d > dist.get(u)) continue;
    if (goal.has(u)) { const out = []; for (let v = u; v !== from; v = prev.get(v)) out.push(v); return out.reverse(); }
    for (const n of sim.cols[u].adj) {
      const w = cost(n);
      if (w === Infinity) continue;
      if (d + w < (dist.get(n) ?? Infinity)) { dist.set(n, d + w); prev.set(n, u); open.push([d + w, n]); }
    }
  }
  return null;
}
export function* bridgeTo(sim, targets) {
  const p = me(sim), g = A(sim).g, Ly = L(sim);
  if (targets.includes(p.c) && p.y === Ly) return { ok: true };
  // get onto the standing layer first (off a bed's cover, out of a hole)
  if (p.y !== Ly) { const r = yield* goTo(sim, (c, y) => y === Ly && sim.solid(c, g), 6000); if (!r.ok) return { ok: false, why: `could not get back to the floor (${r.why})` }; }
  const route = bridgeRoute(sim, p.c, targets);
  if (!route) return { ok: false, why: 'no way across' };
  for (const n of route) {
    for (const y of [Ly + 1, Ly]) if (sim.solid(n, y)) { const r = yield { op: 'mine', c: n, y }; if (!r.ok) return { ok: false, why: `could not clear the way (${r.why})` }; }
    if (!sim.solid(n, g)) {
      const blk = cheapBlock(sim);
      if (!blk) return { ok: false, why: 'out of blocks to bridge with', out: true };
      const r = yield { op: 'place', c: n, y: g, item: blk };
      if (!r.ok) return { ok: false, why: `could not bridge (${r.why})` };
    }
    let r = yield { op: 'move', to: n };
    // someone on the bridge: hit them if they're an enemy, else give them a moment
    for (let k = 0; !r.ok && k < 6; k++) {
      const foe = liveFoes(sim).find((q) => q.c === n);
      if (foe) yield { op: 'attack', id: foe.id }; else yield { op: 'wait', ticks: 2 };
      if (sim.solid(n, g) && !sim.solid(n, Ly)) r = yield { op: 'move', to: n };
    }
    if (!r.ok) return { ok: false, why: `blocked on the way (${r.why})` };
    if (p.c !== n || p.y !== Ly) return { ok: false, why: 'knocked off the route' };
  }
  return { ok: true };
}
const toIsland = (sim, cols) => (onIsland(sim, cols) ? (function* () { return { ok: true }; })() : bridgeTo(sim, cols));

// fight whoever is nearest (or a given id): close in, strike, repeat
function* fightFoe(sim, id = null, rounds = 24, reach = 8) {
  const p = me(sim);
  for (let k = 0; k < rounds; k++) {
    const t = id != null ? sim.players.find((q) => q.id === id) : nearestFoe(sim);
    if (!t || t.out) return { ok: true, won: true };
    if (A(sim).canHit(p, t)) { const r = yield { op: 'attack', id: t.id }; if (!r.ok && !/adjacent/.test(r.why)) return { ok: false, why: r.why }; continue; }
    if (sim.dist(t.c, p.c) > reach) return { ok: false, why: 'they got away' };
    const r = yield* goTo(sim, (c, y) => (c === t.c || sim.cols[c].adj.includes(t.c)) && Math.abs(y - t.y) <= 2, 3000);
    if (!r.ok) {
      // no way to them on the ground: a step up can open one (their route
      // often lands on your own bed's cover, which your planner won't dig)
      const up = sim.cols[p.c].adj.find((n) => sim.canStand(n, p.y + 1) && !sim.occupied(n, p.y + 1) && sim.dist(n, t.c) < sim.dist(p.c, t.c));
      if (up != null) { const m = yield { op: 'move', to: up }; if (m.ok) continue; }
      return { ok: false, why: `could not reach them (${r.why})` };
    }
  }
  return { ok: true };
}

const ARENA = (doc, needs, run) => ({ mode: 'arena', doc, needs: (s, a) => (!s.arena ? 'only in the arena' : me(s).out ? 'out of the game' : needs(s, a || {})), run });
export const ARENA_PALETTE = {
  gather: ARENA('stand on your generator until the iron (or gold) piles up', (s, a) => null, function* (sim, a = {}) {
    const side = A(sim).sideOf(me(sim)), res = a.res === 'gold' ? 'gold_ingot' : 'iron_ingot';
    const want = held(sim, res) + (a.n || (res === 'gold_ingot' ? 3 : 12));
    const r = yield* goTo(sim, (c, y) => c === side.gen && y === L(sim), 6000);
    if (!r.ok) { const b = yield* bridgeTo(sim, [side.gen]); if (!b.ok) return b; }
    for (let t = 0; t < 160 && held(sim, res) < want; t += 10) yield { op: 'wait', ticks: 10 };
    return { ok: true, got: held(sim, res) };
  }),
  buy: ARENA('go to your shop and buy something', (s, a) => {
    const o = SHOP[a.item];
    if (!o) return a.item ? `the shop does not sell ${a.item}` : 'buy what?';
    for (const [k, n] of Object.entries(o.cost)) if (held(s, k) < n) return `${a.item.replace(/_/g, ' ')} costs ${costText(o.cost)}`;
    return null;
  }, function* (sim, a) {
    const side = A(sim).sideOf(me(sim)), [sc] = side.shop;
    const r = yield* goTo(sim, (c, y) => sim.cols[c].adj.includes(sc) && Math.abs(y - side.shop[1]) <= 1, 6000);
    if (!r.ok) { const b = yield* bridgeTo(sim, sim.cols[sc].adj.filter((n) => side.island.includes(n))); if (!b.ok) return b; }
    const q = yield { op: 'buy', item: a.item };
    return q.ok ? { ok: true } : { ok: false, why: q.why };
  }),
  fortify: ARENA('cover your bed with blocks, the hardest you carry first', (s) => {
    const side = A(s).sideOf(me(s));
    if (!side.bedAlive) return 'your bed is gone';
    if (!coverLeft(s, side)) return 'your bed is already covered';
    if (!blocksHeld(s)) return 'no blocks to build with';
    if (!coverSpot(s, side)) return 'nowhere left to put a block without walling yourself in';
    return null;
  }, function* (sim) {
    const side = A(sim).sideOf(me(sim)), p = me(sim), Ly = L(sim);
    const [b] = side.bed;
    const ring = new Set(sim.cols[b].adj);
    let placed = 0;
    for (let guard = 0; guard < 30; guard++) {
      const left = coverOf(sim, side).filter(([c, y]) => sim.get(c, y) === B.air)
        .sort((u, v) => (u[0] === b ? -1 : v[0] === b ? 1 : 0));      // the top first, while it can still be reached
      if (!left.length) break;
      const blk = hardBlock(sim);
      if (!blk) return placed ? { ok: true, partial: true, why: 'ran out of blocks' } : { ok: false, why: 'no blocks' };
      // a spot to place it from: on your island, not a tile being covered if avoidable
      let done = false;
      for (const [c, y] of left) {
        const spots = side.island.filter((s) => s !== b && sim.canStand(s, Ly) && (s === p.c || !sim.occupied(s, Ly)) && sim.reachable(s, Ly, c, y) && s !== c && !wouldTrap(sim, side, s, c, y))
          .sort((u, v) => ((ring.has(u) ? 1 : 0) - (ring.has(v) ? 1 : 0)) || (sim.dist(u, p.c) - sim.dist(v, p.c)));
        if (!spots.length) continue;
        const s = spots[0];
        if (p.c !== s || p.y !== Ly) { const r = yield* goTo(sim, (cc, yy) => cc === s && yy === Ly, 4000); if (!r.ok || p.c !== s) continue; }
        const r = yield { op: 'place', c, y, item: blk };
        if (r.ok) { side.guard.add(c * H + y); placed++; done = true; break; }
      }
      if (!done) break;
    }
    return placed ? { ok: true, placed, left: coverLeft(sim, side) } : { ok: false, why: 'could not reach anywhere to cover' };
  }),
  rush: ARENA('bridge to the enemy base and break their bed', (s) => {
    const foe = A(s).foeSide(me(s));
    if (!foe.bedAlive) return 'their bed is already gone';
    const hard = coverNeeds(s, foe);
    if (hard > s.pickTier()) return `their bed is covered in ${hard >= 4 ? 'obsidian: needs a diamond pickaxe' : 'stone: needs a pickaxe'}`;
    if (!blocksHeld(s) && !onIsland(s, foe.island)) return 'no blocks to bridge with';
    return null;
  }, function* (sim) {
    const foe = A(sim).foeSide(me(sim)), [b, by] = foe.bed;
    const on = yield* toIsland(sim, foe.island);
    if (!on.ok) return on;
    const r = yield* goTo(sim, (c, y) => sim.reachable(c, y, b, by) || (sim.cols[b].adj.includes(c) && y === by), 8000);
    if (!r.ok) return { ok: false, why: `could not dig through to the bed (${r.why})` };
    if (!foe.bedAlive) return { ok: true };
    const m = yield { op: 'mine', c: b, y: by };
    return m.ok ? { ok: true, broke: true } : { ok: false, why: m.why };
  }),
  bridge_mid: ARENA('bridge to the centre island (the diamonds)', (s) => (onIsland(s, A(s).a.midIsland) ? 'already there' : null), function* (sim) {
    return yield* toIsland(sim, A(sim).a.midIsland);
  }),
  gather_mid: ARENA('stand on the centre generator for diamonds', (s) => null, function* (sim, a = {}) {
    const mids = A(sim).a.mids || [A(sim).a.mid], want = held(sim, 'diamond') + (a.n || 1);
    const on = yield* toIsland(sim, A(sim).a.midIsland);
    if (!on.ok) return on;
    const r = yield* goTo(sim, (c, y) => mids.includes(c) && y === L(sim), 3000);
    if (!r.ok) return r;
    for (let t = 0; t < 240 && held(sim, 'diamond') < want; t += 10) yield { op: 'wait', ticks: 10 };
    return { ok: true, got: held(sim, 'diamond') };
  }),
  go_base: ARENA('go back to your own base', (s) => (onIsland(s, A(s).sideOf(me(s)).island) ? 'already home' : null), function* (sim) {
    return yield* toIsland(sim, A(sim).sideOf(me(sim)).island);
  }),
  fight: ARENA('close in on the nearest enemy and fight', (s) => (nearestFoe(s) ? null : 'no enemy in the game'), function* (sim) {
    return yield* fightFoe(sim);
  }),
  hunt: ARENA('go after the nearest enemy player, bridging if you must', (s) => (nearestFoe(s) ? null : 'no enemy in the game'), function* (sim) {
    const f = nearestFoe(sim);
    if (!sim.path(me(sim), (c) => c === f.c || sim.cols[c].adj.includes(f.c), 6000)) {
      const a = A(sim), isl = [a.foeSide(me(sim)).island, a.a.midIsland, a.sideOf(me(sim)).island].find((I) => I.includes(f.c)) || sim.cols[f.c].adj;
      const b = yield* bridgeTo(sim, isl);
      if (!b.ok) return b;
    }
    return yield* fightFoe(sim, f.id, 30, 30);
  }),
  defend: ARENA('stand by your bed and fight whoever comes for it', (s) => (A(s).sideOf(me(s)).bedAlive ? null : 'your bed is gone'), function* (sim) {
    const side = A(sim).sideOf(me(sim)), [b] = side.bed;
    const home = yield* toIsland(sim, side.island);
    if (!home.ok) return home;
    // stand guard while someone is coming; once nobody has been near for a
    // little while, hand back (the time is better spent re-covering and arming)
    for (let t = 0, quiet = 0; t < 80 && quiet < 15; t += 5) {
      const foe = liveFoes(sim).find((q) => sim.dist(q.c, b) <= WARN_RANGE && Math.abs(q.y - L(sim)) <= 3);
      if (foe) { quiet = 0; const r = yield* fightFoe(sim, foe.id, 24, WARN_RANGE + 6); if (!r.ok) return r; continue; }
      quiet += 5;
      yield { op: 'wait', ticks: 5 };
    }
    return { ok: true };
  }),
  shoot: ARENA('shoot the nearest enemy you can see', (s) => {
    if (!held(s, 'bow')) return 'no bow';
    if (!held(s, 'arrow')) return 'no arrows';
    const f = nearestFoe(s);
    if (!f || s.dist(f.c, me(s).c) > 8 || !s.los(me(s), f)) return 'no enemy in sight and range';
    return null;
  }, function* (sim) {
    for (let k = 0; k < 6; k++) {
      const f = nearestFoe(sim);
      if (!f || sim.dist(f.c, me(sim).c) > 8 || !sim.los(me(sim), f) || !held(sim, 'arrow')) break;
      const r = yield { op: 'shoot', id: f.id };
      if (!r.ok) return { ok: false, why: r.why };
    }
    return { ok: true };
  }),
  heal: ARENA('eat a golden apple (10 health)', (s) => (!held(s, 'golden_apple') ? 'no golden apple' : me(s).hp >= 20 ? 'at full health' : null), function* (sim) {
    const r = yield { op: 'eat', item: 'golden_apple' };
    return r.ok ? { ok: true } : { ok: false, why: r.why };
  }),
};
// The arena's own palette: its fight, hunt and shoot are not the island
// game's (merging it into PALETTE once overwrote those three for every world),
// so a sim carries it (sim.palette) and Party and Driver look there first.
export const ARENA_MACROS = Object.keys(ARENA_PALETTE);

// ------------------------------------------------------------- policies ----
// Each takes the sim (inside sim.as(player)) and returns { name, args }.
// They are deliberately different styles, so ratings have something to
// separate: a balanced script, a rusher, a turtle, and random.
const legal = (sim, name, args) => !ARENA_PALETTE[name].needs(sim, args);
const pick = (sim, name, args) => (legal(sim, name, args) ? { name, ...(args ? { args } : {}) } : null);
const sword = (sim) => ['diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword'].find((k) => held(sim, k));
const armor = (sim) => Object.keys(ARMOR).find((k) => held(sim, k));
function upgrades(sim) {
  const s = sword(sim);
  if (s === 'wooden_sword' || !s) { const b = pick(sim, 'buy', { item: 'stone_sword' }); if (b) return b; }
  if (!armor(sim)) { const b = pick(sim, 'buy', { item: 'iron_armor' }); if (b) return b; }
  if (s !== 'iron_sword' && s !== 'diamond_sword') { const b = pick(sim, 'buy', { item: 'iron_sword' }); if (b) return b; }
  if (!held(sim, 'golden_apple')) { const b = pick(sim, 'buy', { item: 'golden_apple' }); if (b) return b; }
  return null;
}
function reflexes(sim) {
  const p = me(sim);
  if (p.hp <= 8) { const h = pick(sim, 'heal'); if (h) return h; }
  if (liveFoes(sim).some((q) => A(sim).canHit(p, q))) return { name: 'fight' };
  const side = A(sim).sideOf(p);
  if (side.bedAlive && liveFoes(sim).some((q) => sim.dist(q.c, side.bed[0]) <= WARN_RANGE)) return { name: 'defend' };
  return null;
}
// The window: every enemy is dead and waiting to respawn, and their bed
// stands. How long it stays open, and whether it can be crossed in time, are
// computed facts: the ticks until the first of them is back, and the cost of
// the way across (a bridge already built costs a tick a tile).
export function window(sim) {
  const foes = A(sim).foesOf(me(sim)), foe = A(sim).foeSide(me(sim));
  if (!foe.bedAlive || !foes.length || !foes.every((q) => q.out)) return null;
  const back = Math.min(...foes.map((q) => (q.out === Infinity ? Infinity : q.out - sim.tick)));
  const route = bridgeRoute(sim, me(sim).c, foe.island);
  if (!route) return null;
  const gaps = route.filter((n) => !sim.solid(n, A(sim).g)).length;
  return { back, tiles: route.length, gaps, eta: route.length + gaps * BRIDGE_TICKS };
}
// once their bed is gone, hunt their players down
function endgame(sim) {
  if (A(sim).foeSide(me(sim)).bedAlive) return null;
  if (!liveFoes(sim).length) return { name: 'gather' };
  const f = nearestFoe(sim);
  if (blocksHeld(sim) >= 8 || sim.path(me(sim), (c) => sim.cols[c].adj.includes(f.c) || c === f.c, 4000)) return { name: 'hunt' };
  return pick(sim, 'buy', { item: 'wool' }) || { name: 'gather' };
}
function blocksFor(sim, n, item = 'wool') {
  if (blocksHeld(sim) >= n) return null;
  return pick(sim, 'buy', { item }) || { name: 'gather', args: { n: SHOP[item].cost.iron_ingot || 8 } };
}
// a pick good enough for their cover, if it needs one
function pickFor(sim) {
  const need = coverNeeds(sim, A(sim).foeSide(me(sim)));
  if (need <= sim.pickTier()) return null;
  const item = need >= 4 ? 'diamond_pickaxe' : need >= 3 ? 'iron_pickaxe' : 'wooden_pickaxe';
  return pick(sim, 'buy', { item }) || { name: need >= 4 ? 'gather_mid' : 'gather', args: need >= 4 ? { n: 3 } : { res: need >= 3 ? 'gold' : 'iron', n: need >= 3 ? 6 : 10 } };
}
// the balanced script: cover the bed, get a sword, then go for theirs; defend
// when they come, and go for theirs the moment they are all dead
export function baselineArena(sim) {
  const p = me(sim), side = A(sim).sideOf(p);
  const r = reflexes(sim); if (r) return r;
  const e = endgame(sim); if (e) return e;
  const w = window(sim);
  if (w && w.gaps <= blocksHeld(sim) && !ARENA_PALETTE.rush.needs(sim, {})) return { name: 'rush' };
  if (side.bedAlive && coverSpot(sim, side)) {
    const need = blocksFor(sim, coverLeft(sim, side), held(sim, 'iron_ingot') >= 12 ? 'planks' : 'wool'); if (need) return need;
    return { name: 'fortify' };
  }
  const u = upgrades(sim); if (u) return u;
  if (sword(sim) === 'wooden_sword') return { name: 'gather', args: { n: 10 } };
  const b = blocksFor(sim, 24); if (b) return b;
  const pk = pickFor(sim); if (pk) return pk;
  return { name: 'rush' };
}
// the rusher: sixteen wool and go, every time
export function rusherArena(sim) {
  const r = reflexes(sim); if (r && r.name !== 'defend') return r;
  const e = endgame(sim); if (e) return e;
  if (sword(sim) === 'wooden_sword' && held(sim, 'iron_ingot') >= 10) return pick(sim, 'buy', { item: 'stone_sword' });
  const b = blocksFor(sim, 20); if (b) return b;
  const pk = pickFor(sim); if (pk) return pk;
  return { name: 'rush' };
}
// the turtle: the hardest cover it can buy, armor, and it waits (it goes out only late)
export function turtleArena(sim) {
  const p = me(sim), side = A(sim).sideOf(p);
  const r = reflexes(sim); if (r) return r;
  const e = endgame(sim); if (e) return e;
  if (side.bedAlive && coverSpot(sim, side)) {
    // wool first (it is up in 24 ticks), stone when it can afford it
    const need = blocksFor(sim, coverLeft(sim, side), held(sim, 'iron_ingot') >= 24 ? 'cobblestone' : 'wool'); if (need) return need;
    return { name: 'fortify' };
  }
  const u = upgrades(sim); if (u) return u;
  if (sim.tick < 2500) return held(sim, 'gold_ingot') < 12 ? { name: 'gather', args: { res: 'gold', n: 4 } } : { name: 'defend' };
  const b = blocksFor(sim, 24); if (b) return b;
  const pk = pickFor(sim); if (pk) return pk;
  return { name: 'rush' };
}
// the counter: cover the bed in wool, then go at once, racing a rusher to an
// uncovered bed; home to defend when someone comes, back out in the window
export function counterArena(sim) {
  const p = me(sim), side = A(sim).sideOf(p);
  const r = reflexes(sim); if (r) return r;
  const e = endgame(sim); if (e) return e;
  const w = window(sim);
  if (w && w.gaps <= blocksHeld(sim) && !ARENA_PALETTE.rush.needs(sim, {})) return { name: 'rush' };
  if (side.bedAlive && coverSpot(sim, side)) {
    const need = blocksFor(sim, coverLeft(sim, side), 'wool'); if (need) return need;
    return { name: 'fortify' };
  }
  const b = blocksFor(sim, 20); if (b) return b;
  const pk = pickFor(sim); if (pk) return pk;
  return { name: 'rush' };
}
// random: any legal macro, with random arguments where it takes them
export function randomArena(sim) {
  const rng = sim.arenaRng || (sim.arenaRng = mulberry32(sim.world.seed * 7919 + 17));
  const opts = [];
  for (const name of ARENA_MACROS) {
    if (name === 'buy') { for (const item of Object.keys(SHOP)) if (legal(sim, 'buy', { item })) opts.push({ name, args: { item } }); continue; }
    if (name === 'gather') { opts.push({ name, args: { res: 'iron' } }, { name, args: { res: 'gold' } }); continue; }
    if (legal(sim, name)) opts.push({ name });
  }
  return opts[Math.floor(rng() * opts.length)] || { name: 'gather' };
}
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const ARENA_POLICIES = { baseline: baselineArena, rusher: rusherArena, turtle: turtleArena, counter: counterArena, random: randomArena };

// ------------------------------------------------------------ the match ----
// One game, headless and deterministic. `policies` is [side 0, side 1]: a
// name from ARENA_POLICIES or a function. A decision that ended at once with
// the same failure is not asked again straight away (the anti-stuck rule every
// runner here needs): the member waits a few ticks first.
// The match loop, written once: a generator that yields each decision it
// needs and takes the answer back. playMatch answers synchronously (the
// scripts); playMatchAsync awaits (Jev), with the world paused meanwhile, so
// a live match is as reproducible as the model is.
function* matchLoop({ seed = 1, shape = 'hex', perSide = 1, maxTicks = MAX_TICKS, maxDecisions = Infinity, onDecision } = {}) {
  const sim = newArena({ seed, shape, perSide });
  const party = new Party(sim);
  const members = sim.players.map((e) => party.join(e, 'mind'));
  const decisions = [0, 0], fails = {};
  for (const m of members) m.onEnded = (out) => { if (!out.ok) { const k = `${out.name}: ${(out.why || '').slice(0, 60)}`; fails[k] = (fails[k] || 0) + 1; } };
  // maxDecisions caps a side's decisions in one match: a live decider pays per
  // decision, and a stalemate of quick failures (two players who cannot reach
  // each other) made one live match run 700 calls before it was stopped
  while (!sim.arena.result && sim.tick < maxTicks && Math.max(...decisions) < maxDecisions) {
    // who acts first alternates, tick by tick: serving side 0 first every tick
    // handed it every race (a mirror match was always won by side 0)
    party.members.reverse();
    const need = party.tick();
    for (const m of members) if (m.e.out && (m.gen || m.pending)) { m.pending = null; if (m.gen) party.endMacro(m, { ok: false, why: 'died' }); }
    for (const m of need) {
      if (m.e.out) continue;
      if (m.restUntil && sim.tick < m.restUntil) continue;
      const d = yield { sim, m };
      if (!d || !ARENA_PALETTE[d.name]) continue;
      const why = sim.as(m.e, () => ARENA_PALETTE[d.name].needs(sim, d.args || {}));
      decisions[m.e.side]++;
      if (onDecision) onDecision(m, d, why);
      if (why) { m.restUntil = sim.tick + 5; continue; }
      m.wantsDecision = false;
      const before = m.lastEnded;
      party.startMacro(m, d.name, d.args);
      const last = m.lastEnded;
      if (last !== before && !m.gen && !last.ok && last.ticks === 0) m.restUntil = sim.tick + 5;
    }
  }
  if (!sim.arena.result) {
    // time: a draw, unless exactly one bed still stands
    const beds = sim.arena.sides.map((s) => s.bedAlive);
    sim.arena.finish(beds[0] !== beds[1] ? (beds[0] ? 0 : 1) : null, sim.tick >= maxTicks ? 'time' : 'cut: decision budget');
  }
  sim.flush();
  return { sim, result: sim.arena.result, decisions, fails, events: sim.arena.events };
}
const policyFns = (policies) => policies.map((p) => (typeof p === 'function' ? p : ARENA_POLICIES[p]));
export function playMatch(opts = {}) {
  const pol = policyFns(opts.policies || ['baseline', 'baseline']);
  const it = matchLoop(opts);
  let r = it.next();
  while (!r.done) { const { sim, m } = r.value; r = it.next(sim.as(m.e, () => pol[m.e.side](sim, m))); }
  return r.value;
}
export async function playMatchAsync(opts = {}) {
  const pol = policyFns(opts.policies || ['baseline', 'baseline']);
  const it = matchLoop(opts);
  let r = it.next();
  while (!r.done) {
    const { sim, m } = r.value;
    const f = pol[m.e.side];
    const d = f.length >= 2 && f.constructor.name === 'AsyncFunction' ? await f(sim, m) : await Promise.resolve(sim.as(m.e, () => f(sim, m)));
    r = it.next(d);
  }
  return r.value;
}
