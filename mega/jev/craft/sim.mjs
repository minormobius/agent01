// craft/sim.mjs — the rules, the tick, and the text stream.
//
// LAYER 1 of three (see ../CLAUDE.md § craft): the authoritative world. It is
// headless — nothing here draws — and deterministic: (world params, the
// sequence of player actions) → the same stream, byte for byte.
//
// Time is discrete. One tick ≈ a quarter second, the time it takes to walk
// one column. A player action costs ticks (walking 1, mining a stone block
// ~8 with a wooden pick), and the world advances under it: zombies close in
// while you dig. `act()` runs an action to completion and returns what
// happened; that makes macros ordinary sequential code.
//
// Positions are (column, layer). A body stands in a voxel with its head in
// the one above; mobs step between NEIGHBOURING columns of the tiling, so on
// a Penrose world a zombie walks Penrose.
//
// THE STREAM. Every tick that changes anything appends one JSON line:
//   {"k":tick,"e":[event…]}
// after a header line {"t":"craft",…} that names the world params, so a
// reader regenerates the world (world.mjs) and replays the deltas. Events:
//   ["b",c,y,block]        block changed          ["p",id,c,y]      moved
//   ["+",id,kind,c,y]      entity appeared        ["-",id,why]      entity gone
//   ["hp",id,hp]           health                 ["food",n]        hunger
//   ["inv",{item:n}]       whole inventory        ["do",op,…]       player action began
//   ["hit",from,to,dmg]    melee                  ["die",id]        death
//   ["air",id,n]           breath, in steps of 10 (0 = drowning)
//   ["note",kind,…]        anything a caller annotates: macro starts/ends,
//                          Jev's questions and answers (runner.mjs)
// Crops grow by 'b' events too (sprout → growing → plant), so a replay needs
// nothing new to show a farm.

import {
  B, BLOCKS, H, SEA, RECIPES, PLACEABLE, recipeBags, PICK_TIER, PICK_SPEED, SWORD_DMG, FOOD, HEAL, SEEDS,
  generateWorld, worldSignature, mulberry, hash32, blockName,
} from './world.mjs';
import { habitat, growCrops, harvestDrop, GROW_EVERY } from './plants.mjs';

export const DAY = 4800;            // ticks per day (~20 min at 4 ticks/s, as Minecraft's)
export const NIGHT_START = 3000;    // [3000, 4800) is night
export const MAX_ZOMBIES = 6;
// normal is Minecraft-ish. hard exists because at normal a scripted player
// with a house, a sword and torches does not die, and a scoreboard where
// every policy scores zero deaths cannot tell policies apart.
export const DIFFICULTY = {
  normal: { maxZombies: 6, spawn: 0.03, darkSpawn: 0.004, zombieDmg: 3, hungerEvery: 480, zombieStep: 2 },
  hard:   { maxZombies: 14, spawn: 0.1, darkSpawn: 0.012, zombieDmg: 4, hungerEvery: 240, zombieStep: 1 },
};
export const SIGHT = 10;
export const MAX_AIR = 60;          // ticks of breath with the head under water (~15 s, as Minecraft's)
export const FLOW_EVERY = 3;        // water spreads one voxel every this many ticks
// what water may flow into (and wash away): open air, torches, lanterns, plants
const floodable = (id) => id === B.air || (!BLOCKS[id].solid && !BLOCKS[id].hazard && id !== B.water && !BLOCKS[id].mobSolid);            // how far the player sees, in tile edges
export const REACH = 2.2;           // how far the player reaches, in tile edges (centre to centre)

export class Sim {
  constructor(opts = {}) {
    this.world = opts.world || generateWorld(opts);
    this.difficulty = DIFFICULTY[opts.difficulty] ? opts.difficulty : 'normal';
    this.cfg = DIFFICULTY[this.difficulty];
    const w = this.world;
    this.cols = w.tiling.cols;
    this.b = w.blocks;
    this.N = this.cols.length;
    this.tick = 0;
    this.rng = mulberry(hash32(w.seed, 0x51A));
    this.ents = new Map();
    this.nextId = 0;
    this.torches = new Set();     // every light (torches, lanterns), by voxel
    this.crops = new Set();       // voxels holding a plant that is still growing
    this.cultivated = new Map();  // voxel → { sp, by } for everything a player planted
    this.flowQ = new Set();       // voxels where water may be about to flow (only ever woken by a change)
    this.lines = [];
    this.ev = [];
    this.stats = { deaths: 0, mined: {}, crafted: {}, kills: {}, damageTaken: 0, placed: {}, planted: {}, harvested: {}, grown: {} };
    this.protect = new Set();     // voxels the planners must not dig (house walls, roof)
    this.players = [];            // every player entity; this.me is the one acting now
    this.lines.push(JSON.stringify({
      t: 'craft', v: w.version, seed: w.seed, shape: w.shape, radius: w.radius, kind: w.kind, H,
      sig: worldSignature(w), spawn: w.spawn, day: DAY, night: NIGHT_START, difficulty: this.difficulty,
    }));
    this.me = this.newPlayer(w.spawn, w.height[w.spawn] + 1);
    this.look();
    // pigs: scattered on grass, a few per hundred columns
    const pigs = Math.round(this.N / 220);
    for (let k = 0, tries = 0; k < pigs && tries < pigs * 20; tries++) {
      const c = Math.floor(this.rng() * this.N);
      const y = this.surface(c);
      if (this.get(c, y - 1) !== B.grass) continue;
      this.spawnEnt('pig', c, y, { hp: 10 });
      k++;
    }
    this.flush();
  }

  // ----------------------------------------------------------- players -----
  // Several players share one world. Everything personal — the body, the
  // inventory, the map in your head (seen), your home, your journal and the
  // macros' bookkeeping — lives ON the player entity, and `this.me` says whose
  // turn it is. The accessors below make `sim.player`, `sim.inv`, `sim.seen`,
  // `sim.home`, `sim._house`… mean "the current player's", so every macro and
  // planner written for one player works unchanged for any of them.
  newPlayer(c, y, extra = {}) {
    const e = this.spawnEnt('player', c, y, { hp: 20, food: 20, air: MAX_AIR, inv: {}, seen: new Uint8Array(this.N), seenCount: 0, home: null, ...extra });
    this.players.push(e);
    return e;
  }
  get player() { return this.me; }
  // A second (third…) player: stands on the nearest free spot next to the first.
  addPlayer(extra = {}) {
    const first = this.players[0];
    const ring = [first.c, ...this.cols[first.c].adj, ...this.cols[first.c].adj.flatMap((n) => this.cols[n].adj)];
    for (const c of ring) {
      const y = this.surface(c);
      if (this.canStand(c, y) && !this.occupied(c, y) && !this.occupied(c, y + 1)) {
        const e = this.newPlayer(c, y, extra);
        this.as(e, () => this.look());
        this.flush();
        return e;
      }
    }
    throw new Error('no room next to the first player');
  }
  // run fn as player e (and put the previous one back)
  as(e, fn) { const prev = this.me; this.me = e; try { return fn(); } finally { this.me = prev; } }
  nearestPlayer(c) {
    let best = null, bd = Infinity;
    for (const e of this.players) { const d = this.dist(e.c, c); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // ------------------------------------------------------------ voxels -----
  get(c, y) { return y < 0 ? B.bedrock : y >= H ? B.air : this.b[c * H + y]; }
  solid(c, y) { return BLOCKS[this.get(c, y)].solid; }
  // mob = true for anything that is not the player: a door stops it
  // lava is a hazard: nobody plans a step into it (it burns what falls in)
  passable(c, y, mob = false) { const k = BLOCKS[this.get(c, y)]; return !(k.solid || k.hazard || (mob && k.mobSolid)); }
  set(c, y, id) {
    const old = this.b[c * H + y];
    if (old === id) return;
    const k = c * H + y;
    if (BLOCKS[old].light) this.torches.delete(k);
    if (BLOCKS[id].light) this.torches.add(k);
    if (BLOCKS[id].plant && BLOCKS[id].stage < 2) this.crops.add(k); else this.crops.delete(k);
    if (!BLOCKS[id].plant) this.cultivated.delete(k);
    // water: standing water is at rest until something changes beside it
    if (y <= SEA && floodable(id)) this.flowQ.add(k);
    if (id === B.water) { if (y > 1) this.flowQ.add(k - 1); for (const n of this.cols[c].adj) this.flowQ.add(n * H + y); }
    this.b[c * H + y] = id;
    this.emit(['b', c, y, id]);
  }
  // lowest standable layer above the topmost solid block
  surface(c) {
    for (let y = H - 2; y > 0; y--) if (this.solid(c, y - 1) || this.get(c, y - 1) === B.water) return y;
    return 1;
  }
  // dark: rock, earth or a roof overhead — shade under leaves is not dark
  dark(c, y) {
    for (let yy = y + 2; yy < H; yy++) {
      const id = this.get(c, yy);
      if (id !== B.air && !BLOCKS[id].light && !BLOCKS[id].plant && id !== B.leaves && id !== B.log && id !== B.glass && id !== B.water) return true;
    }
    return false;
  }
  skyOpen(c, y) { for (let yy = y; yy < H; yy++) { const id = this.get(c, yy); if (id !== B.air && !BLOCKS[id].light && !BLOCKS[id].plant) return false; } return true; }
  supported(c, y) { return this.solid(c, y - 1) || this.get(c, y - 1) === B.water || this.get(c, y) === B.water; }
  canStand(c, y, tall = 2, mob = false) {
    if (y < 1 || y + tall > H) return false;
    for (let k = 0; k < tall; k++) if (!this.passable(c, y + k, mob)) return false;
    return this.supported(c, y);
  }
  // where a body at (c, y) ends up stepping into neighbour n, or null.
  // Climbs one layer (needs headroom above its own head), drops up to maxDrop.
  stepTarget(c, y, n, tall = 2, maxDrop = 3, mob = false) {
    if (this.canStand(n, y, tall, mob)) return y;
    if (this.canStand(n, y + 1, tall, mob) && this.passable(c, y + tall, mob)) return y + 1;
    for (let k = 0; k < tall; k++) if (!this.passable(n, y + k, mob)) return null;
    let yy = y;
    while (yy > 1 && !this.supported(n, yy)) yy--;
    return y - yy <= maxDrop && this.canStand(n, yy, tall, mob) ? yy : null;
  }

  // ---------------------------------------------------------- entities -----
  spawnEnt(kind, c, y, extra = {}) {
    const e = { id: this.nextId++, kind, c, y, hp: kind === 'pig' ? 10 : 20, cd: 0, ...extra };
    this.ents.set(e.id, e);
    this.emit(['+', e.id, kind, c, y]);
    return e;
  }
  removeEnt(e, why) { this.ents.delete(e.id); this.emit(['-', e.id, why]); }
  tallOf(e) { return e.kind === 'pig' ? 1 : 2; }
  occupied(c, y) {
    for (const e of this.ents.values()) if (e.c === c && y >= e.y && y < e.y + this.tallOf(e)) return e;
    return null;
  }
  moveEnt(e, c, y) {
    if (e.c === c && e.y === y) return;
    e.c = c; e.y = y;
    this.emit(['p', e.id, c, y]);
    if (e.kind === 'player') this.as(e, () => this.look());
  }
  // What the player has seen: every column within SIGHT of where it has
  // stood. Derived from positions alone, so it needs no stream events — a
  // replay recomputes it. Explore walks its frontier; perception reads it.
  look() {
    const p = this.player, here = this.cols[p.c];
    if (!this._near) this._near = new Map();
    let ring = this._near.get(p.c);
    if (!ring) {
      ring = [];
      const seen = new Set([p.c]), q = [p.c];
      while (q.length) {
        const u = q.shift();
        ring.push(u);
        for (const w of this.cols[u].adj) {
          if (seen.has(w)) continue;
          seen.add(w);
          const d = Math.hypot(this.cols[w].x - here.x, this.cols[w].z - here.z);
          if (d <= SIGHT) q.push(w);
        }
      }
      this._near.set(p.c, ring);
    }
    for (const u of ring) if (!this.seen[u]) {
      this.seen[u] = 1; this.seenCount++;
      // what grows there, noted once per species: the explore project's finds
      for (let y = 1; y < H; y++) { const blk = BLOCKS[this.b[u * H + y]]; if (blk.plant) { p.found = p.found || {}; if (!p.found[blk.plant]) p.found[blk.plant] = this.tick; } }
    }
  }
  dist(a, b) { const A = this.cols[a], Bc = this.cols[b]; return Math.hypot(A.x - Bc.x, A.z - Bc.z); }
  adjacentTo(e, t) {
    if (Math.abs(e.y - t.y) > 1) return false;
    return e.c === t.c || this.cols[e.c].adj.includes(t.c);
  }
  hurt(e, dmg, from) {
    e.hp = Math.max(0, e.hp - dmg);
    this.emit(['hit', from ? from.id : -1, e.id, dmg]);
    this.emit(['hp', e.id, e.hp]);
    if (e.kind === 'player') this.stats.damageTaken += dmg;
    if (e.hp > 0) return;
    this.emit(['die', e.id]);
    if (e.kind === 'player') {
      this.stats.deaths++;
      e.deaths = (e.deaths || 0) + 1;
      e.inv = {}; e.hp = 20; e.food = 20; e.air = MAX_AIR;
      this.emit(['inv', {}, e.id]); this.emit(['hp', e.id, 20]); this.emit(['food', 20, e.id]);
      // respawn at their own home if there is one (the house is the bed), else at spawn
      if (e.home && this.canStand(e.home[0], e.home[1])) { this.moveEnt(e, e.home[0], e.home[1]); return; }
      const s = this.world.spawn;
      let sy = this.world.height[s] + 1;
      while (sy < H - 2 && !this.canStand(s, sy)) sy++;
      this.moveEnt(e, s, sy);
      return;
    }
    this.stats.kills[e.kind] = (this.stats.kills[e.kind] || 0) + 1;
    if (e.kind === 'pig' && from && from.kind === 'player') this.giveTo(from, 'porkchop', 1 + Math.floor(this.rng() * 2));
    this.removeEnt(e, 'killed');
  }

  // ------------------------------------------------------------- player ----
  get inv() { return this.me.inv; }
  has(item, n = 1) { return (this.inv[item] || 0) >= n; }
  give(item, n) { this.giveTo(this.me, item, n); }
  giveTo(e, item, n) { e.inv[item] = (e.inv[item] || 0) + n; this.emit(['inv', { ...e.inv }, e.id]); }
  take(item, n) {
    this.inv[item] -= n;
    if (this.inv[item] <= 0) delete this.inv[item];
    this.emit(['inv', { ...this.inv }, this.me.id]);
  }
  pickTier() { let t = 0; for (const k in PICK_TIER) if (this.has(k)) t = Math.max(t, PICK_TIER[k]); return t; }
  swordDmg() { let d = SWORD_DMG.none; for (const k in SWORD_DMG) if (k !== 'none' && this.has(k)) d = Math.max(d, SWORD_DMG[k]); return d; }
  isNight(t = this.tick) { return (t % DAY) >= NIGHT_START; }

  // What a body at (c, y) can touch. REACH is a DISTANCE, not a hop count:
  // with "neighbours only", an octagon player out-reached a Penrose player by
  // a wide margin, and looking at the ground a step ahead on a rhomb floor
  // was already out of reach. Now: its own column below the feet and above
  // the head, and any column whose centre is within REACH, feet−1 … head+1 —
  // a neighbour always, a farther one only if the voxel has an open face
  // (no mining through a wall to the block behind it).
  reachCols(c) {
    if (!this._reach) this._reach = new Map();
    let r = this._reach.get(c);
    if (r) return r;
    r = [];
    const seen = new Set([c]), q = [c], here = this.cols[c];
    while (q.length) {
      const u = q.shift();
      for (const w of this.cols[u].adj) {
        if (seen.has(w)) continue;
        seen.add(w);
        if (Math.hypot(this.cols[w].x - here.x, this.cols[w].z - here.z) <= REACH) { r.push(w); q.push(w); }
      }
    }
    for (const w of here.adj) if (!r.includes(w)) r.push(w);       // a neighbour is always in reach
    this._reach.set(c, r);
    return r;
  }
  openFace(c, y) {
    if (this.passable(c, y + 1) || (y > 0 && this.passable(c, y - 1))) return true;
    for (const n of this.cols[c].adj) if (this.passable(n, y)) return true;
    return false;
  }
  reachable(c, y, tc, ty) {
    if (tc === c) return ty === y - 1 || ty === y + 2;
    if (ty < y - 1 || ty > y + 2 || ty < 0 || ty >= H) return false;
    if (this.cols[c].adj.includes(tc)) return true;
    return this.reachCols(c).includes(tc) && this.openFace(tc, ty);
  }
  reachSet(c = this.player.c, y = this.player.y) {
    const out = [[c, y - 1], [c, y + 2]];
    for (const n of this.reachCols(c)) for (let yy = y - 1; yy <= y + 2; yy++) {
      if (yy < 0 || yy >= H) continue;
      if (this.cols[c].adj.includes(n) || this.openFace(n, yy)) out.push([n, yy]);
    }
    return out.filter(([, yy]) => yy >= 0 && yy < H);
  }
  // a station block within two hops, feet−1 … head+1
  near(blockId, c = this.player.c, y = this.player.y) {
    const seen = new Set([c]); let ring = [c];
    for (let d = 0; d <= 2; d++) {
      for (const u of ring) for (let yy = y - 1; yy <= y + 2; yy++) if (this.get(u, yy) === blockId) return true;
      const next = [];
      for (const u of ring) for (const w of this.cols[u].adj) if (!seen.has(w)) { seen.add(w); next.push(w); }
      ring = next;
    }
    return false;
  }

  // One primitive action, as a PLAN: validate now (a refusal costs nothing
  // and changes nothing), `pre` applies when it starts, it lasts `ticks`, and
  // `post` applies when it completes — re-checked then, because in a shared
  // world someone else may have mined that block in the meantime. act() runs
  // a plan synchronously (one player); party.mjs runs several side by side.
  plan(a) {
    const p = this.player;
    const no = (why) => ({ ok: false, why });
    switch (a.op) {
      case 'move': {
        if (!this.cols[p.c].adj.includes(a.to)) return no('not a neighbour');
        const y = this.stepTarget(p.c, p.y, a.to, 2, 20);
        if (y == null) return no('blocked');
        if (this.occupied(a.to, y) || this.occupied(a.to, y + 1)) return no('occupied');
        return { ok: true, ticks: 1, pre: () => {
          this.emit(['do', 'move', a.to]);
          const fall = p.y - y;
          this.moveEnt(p, a.to, y);
          if (fall > 3) this.hurt(p, fall - 3, null);
        } };
      }
      case 'mine': {
        const { c, y } = a;
        if (!this.reachable(p.c, p.y, c, y)) return no('out of reach');
        const blk = BLOCKS[this.get(c, y)];
        if (blk.hard === Infinity) return no(`${blk.name} cannot be mined`);
        const tier = this.pickTier();
        if (blk.tool > tier) return no(`${blk.name} needs a ${['', 'wooden', 'stone', 'iron'][blk.tool]} pickaxe or better`);
        const speed = blk.tool ? PICK_SPEED[tier] : 1;
        const ticks = Math.max(1, Math.ceil(blk.hard / speed));
        return { ok: true, ticks, pre: () => this.emit(['do', 'mine', c, y, ticks]), post: () => {
          if (this.get(c, y) !== blk.id) return no('block changed while mining');
          const cult = this.cultivated.get(c * H + y);
          this.set(c, y, B.air);        // if it touched water, the flow fills it (and whatever it opens onto)
          this.stats.mined[blk.name] = (this.stats.mined[blk.name] || 0) + 1;
          if (blk.drop) this.give(blk.drop, 1);
          if (blk.plant) this.reap(blk, cult);
          // a plant standing on what was just mined falls with it
          if (BLOCKS[this.get(c, y + 1)].plant) this.set(c, y + 1, B.air);
          if (blk.id === B.leaves && this.rng() < 1 / 6) this.give('apple', 1);
          this.settle();
          return { ok: true };
        } };
      }
      case 'place': {
        const { c, y, item } = a;
        if (!PLACEABLE.has(item)) return no(`${item} does not place`);
        if (!this.has(item)) return no(`no ${item}`);
        if (!this.reachable(p.c, p.y, c, y)) return no('out of reach');
        const cur = this.get(c, y);
        // a plant is in the way of nothing: placing a block on it picks it first
        if (cur !== B.air && cur !== B.water && !BLOCKS[cur].plant) return no(`occupied by ${blockName(cur)}`);
        if (this.occupied(c, y)) return no('an entity is there');
        return { ok: true, ticks: 1, pre: () => {
          this.emit(['do', 'place', c, y, item]);
          const was = BLOCKS[this.get(c, y)];
          if (was.plant) this.reap(was, this.cultivated.get(c * H + y));
          this.take(item, 1);
          this.set(c, y, B[item]);
          this.stats.placed[item] = (this.stats.placed[item] || 0) + 1;
        } };
      }
      case 'till': {
        // grass or dirt under open air becomes farmland; needs a hoe
        const { c, y } = a;
        if (!this.has('wooden_hoe')) return no('needs a hoe');
        if (!this.reachable(p.c, p.y, c, y)) return no('out of reach');
        const cur = this.get(c, y);
        if (cur !== B.grass && cur !== B.dirt) return no(`cannot till ${blockName(cur)}`);
        if (this.get(c, y + 1) !== B.air) return no('something is on top of it');
        return { ok: true, ticks: 2, pre: () => this.emit(['do', 'till', c, y]), post: () => {
          if (this.get(c, y) !== cur) return no('the ground changed');
          this.set(c, y, B.farmland);
          return { ok: true };
        } };
      }
      case 'plant': {
        // seeds go into an empty voxel whose soil (and tile, and cover) suit the species
        const { c, y } = a, sp = SEEDS[a.item];
        if (!sp) return no(`${a.item} are not seeds`);
        if (!this.has(a.item)) return no(`no ${a.item}`);
        if (!this.reachable(p.c, p.y, c, y)) return no('out of reach');
        const why = habitat(this, sp, c, y);
        if (why) return no(`a ${sp} will not grow there: ${why}`);
        if (this.occupied(c, y)) return no('an entity is there');
        return { ok: true, ticks: 1, pre: () => {
          this.emit(['do', 'plant', c, y, sp]);
          this.take(a.item, 1);
          this.set(c, y, B[`${sp}_sprout`]);
          this.cultivated.set(c * H + y, { sp, by: p.id });
          (p.plots = p.plots || {})[c * H + y] = sp;
          this.stats.planted[sp] = (this.stats.planted[sp] || 0) + 1;
        } };
      }
      case 'craft': {
        const r = RECIPES[a.item];
        if (!r) return no(`no recipe for ${a.item}`);
        if (r.at && !this.near(B[r.at])) return no(`needs a ${r.at} nearby`);
        const bag = recipeBags(r).find((g) => Object.entries(g).every(([k, n]) => this.has(k, n)));
        if (!bag) {
          const [k, n] = Object.entries(r.need).find(([k2, n2]) => !this.has(k2, n2));
          return no(`needs ${n} ${k}` + (r.alt ? ' (or an alternative)' : ''));
        }
        return { ok: true, ticks: 1, pre: () => {
          this.emit(['do', 'craft', a.item]);
          for (const [k, n] of Object.entries(bag)) this.take(k, n);
          this.give(a.item, r.n);
          this.stats.crafted[a.item] = (this.stats.crafted[a.item] || 0) + r.n;
        } };
      }
      case 'eat': {
        if (!FOOD[a.item]) return no(`${a.item} is not food`);
        if (!this.has(a.item)) return no(`no ${a.item}`);
        if (p.food >= 20) return no('not hungry');
        return { ok: true, ticks: 4, pre: () => {
          this.emit(['do', 'eat', a.item]);
          this.take(a.item, 1);
          p.food = Math.min(20, p.food + FOOD[a.item]);
          this.emit(['food', p.food, p.id]);
          if (HEAL[a.item] && p.hp < 20) { p.hp = Math.min(20, p.hp + HEAL[a.item]); this.emit(['hp', p.id, p.hp]); }
        } };
      }
      case 'attack': {
        const t = this.ents.get(a.id);
        if (!t || t === p) return no('no such target');
        if (t.kind === 'player') return no('not attacking a teammate');
        if (!this.adjacentTo(p, t)) return no('not adjacent');
        return { ok: true, ticks: 2, pre: () => { this.emit(['do', 'attack', t.id]); this.hurt(t, this.swordDmg(), p); } };
      }
      case 'give': {
        // hand items to another player standing next to you
        const t = this.ents.get(a.to);
        if (!t || t.kind !== 'player' || t === p) return no('no such teammate');
        if (!this.adjacentTo(p, t)) return no('not next to them');
        const n = Math.max(1, a.n | 0 || 1);
        if (!this.has(a.item, n)) return no(`not holding ${n} ${a.item}`);
        return { ok: true, ticks: 1, pre: () => {
          this.emit(['do', 'give', a.item, n, t.id]);
          this.take(a.item, n);
          this.giveTo(t, a.item, n);
        } };
      }
      case 'wait': {
        const n = Math.max(1, Math.min(DAY, a.ticks | 0 || 1));
        return { ok: true, ticks: n };
      }
      default:
        return no(`unknown op ${a.op}`);
    }
  }

  // Run one primitive action to completion (one player; the world steps under it).
  act(a) {
    const t0 = this.tick;
    const done = (ok, why) => { this.flush(); return { ok, ticks: this.tick - t0, ...(why ? { why } : {}) }; };
    const pl = this.plan(a);
    if (!pl.ok) return done(false, pl.why);
    if (pl.pre) pl.pre();
    for (let k = 0; k < pl.ticks; k++) this.step();
    const r = pl.post ? pl.post() : null;
    if (r && !r.ok) return done(false, r.why);
    return done(true);
  }

  // harvesting: a mature plant gives produce and seeds, a young one its seed
  // back. A mature plant someone planted counts as GROWN, for its planter.
  reap(blk, cult) {
    for (const [k, n] of Object.entries(harvestDrop(this, blk))) this.give(k, n);
    if (blk.stage < 2) return;
    const sp = blk.plant;
    this.stats.harvested[sp] = (this.stats.harvested[sp] || 0) + 1;
    if (cult) {
      this.stats.grown[sp] = (this.stats.grown[sp] || 0) + 1;
      const who = this.ents.get(cult.by) || this.me;
      (who.grown = who.grown || {})[sp] = (who.grown[sp] || 0) + 1;
      this.emit(['note', 'grown', { sp, by: who.id }]);
    }
  }

  // anything no longer supported falls (the player after digging under itself)
  settle() {
    for (const e of this.ents.values()) {
      let y = e.y;
      while (y > 1 && !this.supported(e.c, y)) y--;
      if (y !== e.y) {
        const fall = e.y - y;
        this.moveEnt(e, e.c, y);
        if (fall > 3) this.hurt(e, fall - 3, null);
      }
    }
  }

  // ------------------------------------------------------------ the tick ---
  step() {
    this.tick++;
    const t = this.tick;
    // spawning is anchored to one player per tick, in turn (no RNG spent on
    // choosing, so a one-player world is unchanged by there being a list)
    const p = this.players[t % this.players.length];
    // hunger, for everyone
    for (const q of this.players) {
      if (t % this.cfg.hungerEvery === 0 && q.food > 0) { q.food--; this.emit(['food', q.food, q.id]); }
      if (t % 80 === 0) {
        if (q.food === 0) this.hurt(q, 1, null);
        else if (q.food >= 18 && q.hp < 20) { q.hp++; this.emit(['hp', q.id, q.hp]); }
      }
    }
    // breath: the head under water uses it up, then drowning hurts
    for (const q of this.players) {
      const before = q.air;
      if (this.get(q.c, q.y + 1) === B.water) {
        q.air = Math.max(0, q.air - 1);
        if (q.air === 0 && t % 8 === 0) { this.stats.drowning = (this.stats.drowning || 0) + 1; this.hurt(q, 2, null); }
      } else if (q.air < MAX_AIR) q.air = Math.min(MAX_AIR, q.air + 4);
      // in steps of 10, and always on leaving or reaching full / empty
      if (before !== q.air && (Math.ceil(before / 10) !== Math.ceil(q.air / 10) || q.air === MAX_AIR || before === MAX_AIR || q.air === 0)) this.emit(['air', q.id, q.air]);
    }
    if (t % FLOW_EVERY === 0 && this.flowQ.size) this.flow();
    if (t % GROW_EVERY === 0 && this.crops.size) growCrops(this);
    if (t % DAY === NIGHT_START) this.emit(['note', 'dusk']);
    if (t % DAY === 0) this.emit(['note', 'dawn']);
    // zombies: spawn at night on open ground, away from torches and the player
    const zs = [...this.ents.values()].filter((e) => e.kind === 'zombie');
    if (this.isNight() && zs.length < this.cfg.maxZombies && this.rng() < this.cfg.spawn) {
      const c = Math.floor(this.rng() * this.N);
      const y = this.surface(c);
      const d = this.dist(c, p.c);
      if (d >= 10 && d <= 24 && this.get(c, y - 1) !== B.water && this.skyOpen(c, y) && !this.torchNear(c, 5)
          && this.canStand(c, y) && !this.occupied(c, y)) this.spawnEnt('zombie', c, y);
    }
    // ...and in the dark, at any hour: caves and unlit tunnels near the player.
    // Candidates come from what the player can see (this._near), so the cost
    // stays local however big the world is.
    if (zs.length < this.cfg.maxZombies && this.rng() < this.cfg.darkSpawn && this._near) {
      const ring = this._near.get(p.c);
      if (ring && ring.length) {
        const c = ring[Math.floor(this.rng() * ring.length)];
        if (this.dist(c, p.c) >= 6 && !this.torchNear(c, 5)) {
          // every dark standing spot in that column (cave floors, tunnels)
          const top = this.surface(c), spots = [];
          for (let y = 1; y < top - 2; y++) if (this.canStand(c, y, 2, true) && this.dark(c, y) && !this.occupied(c, y)) spots.push(y);
          if (spots.length) this.spawnEnt('zombie', c, spots[Math.floor(this.rng() * spots.length)]);
        }
      }
    }
    // lava burns whatever is in it
    if (t % 5 === 0) for (const e of [...this.ents.values()]) {
      if (this.get(e.c, e.y) === B.lava || this.get(e.c, e.y + 1) === B.lava) this.hurt(e, 4, null);
    }
    for (const e of [...this.ents.values()]) {
      if (e.kind === 'player' || !this.ents.has(e.id)) continue;
      if (e.cd > 0) e.cd--;
      if (e.kind === 'zombie') this.zombieTick(e);
      else if (e.kind === 'pig') this.pigTick(e);
    }
    this.flush();
  }
  // Water flows: every air voxel at or below sea level that touches water
  // (beside it or above it) fills, one ring per FLOW_EVERY ticks, so breaching a
  // sea wall floods the cave behind it. All water here is sea, so nothing
  // flows above SEA. A budget per step keeps a big breach from stalling a tick.
  flow() {
    const q = this.flowQ;
    this.flowQ = new Set();
    let n = 0;
    for (const k of q) {
      if (n >= 400) { this.flowQ.add(k); continue; }
      const c = Math.floor(k / H), y = k % H;
      if (y > SEA || !floodable(this.b[k])) continue;
      if (this.get(c, y + 1) !== B.water && !this.cols[c].adj.some((m) => this.get(m, y) === B.water)) continue;
      n++;
      this.set(c, y, B.water);      // set() wakes what is below and beside it
    }
  }
  torchNear(c, r) {
    for (const k of this.torches) if (this.dist(Math.floor(k / H), c) <= r) return true;
    return false;
  }
  zombieTick(z) {
    const p = this.nearestPlayer(z.c);        // zombies go for whoever is closest
    const d = this.dist(z.c, p.c);
    if (d > 40) return this.removeEnt(z, 'despawn');
    if (!this.isNight() && this.skyOpen(z.c, z.y + 2) && this.tick % 10 === 0) this.hurt(z, 2, null);
    if (!this.ents.has(z.id)) return;
    if (this.adjacentTo(z, p)) {
      if (z.cd <= 0) { this.hurt(p, this.cfg.zombieDmg, z); z.cd = 10; }
      return;
    }
    if (this.tick % this.cfg.zombieStep || d > 20) return;   // normal: half the player's speed; loses interest past 20
    // a route, reused for up to 10 ticks: re-searching every tick for every
    // zombie was most of the cost of a night on hard
    if (!z.route || !z.route.length || this.tick - z.routeAt >= 10) {
      z.route = this.path(z, (c, y) => this.cols[c].adj.includes(p.c) && Math.abs(y - p.y) <= 1, 300, 2, true) || [];
      z.routeAt = this.tick;
    }
    const step = z.route[0];
    if (!step) return;
    const y = this.stepTarget(z.c, z.y, step[0], 2, 3, true);
    if (y === step[1] && !this.occupied(step[0], step[1]) && !this.occupied(step[0], step[1] + 1)) { this.moveEnt(z, step[0], step[1]); z.route.shift(); }
    else z.route = null;
  }
  pigTick(g) {
    if (this.tick % 6 || this.rng() < 0.5) return;
    const adj = this.cols[g.c].adj;
    if (!adj.length) return;
    const n = adj[Math.floor(this.rng() * adj.length)];
    const y = this.stepTarget(g.c, g.y, n, 1, 1, true);
    if (y != null && this.get(n, y - 1) !== B.water && !this.occupied(n, y)) this.moveEnt(g, n, y);
  }

  // ---------------------------------------------------------- pathfinding ---
  // BFS over standing states from a body, walking only (no digging). Returns
  // the path of [c, y] steps to the first state satisfying goal, or null.
  path(from, goal, maxNodes = 20000, tall = 2, mob = false, dive = false) {
    const key = (c, y) => c * H + y;
    const start = key(from.c, from.y);
    const prev = new Map([[start, -1]]);
    const q = [start];
    for (let qi = 0; qi < q.length && prev.size < maxNodes; qi++) {
      const u = q[qi], c = Math.floor(u / H), y = u % H;
      if (goal(c, y)) {
        const out = [];
        for (let v = u; v !== start; v = prev.get(v)) out.push([Math.floor(v / H), v % H]);
        return out.reverse();
      }
      for (const n of this.cols[c].adj) {
        if (!mob && !this.seen[n]) continue;              // the player plans only over ground it has seen
        const yy = this.stepTarget(c, y, n, tall, 3, mob);
        if (yy == null) continue;
        if (!mob && !dive && this.get(n, yy + tall - 1) === B.water) continue;   // a player does not plan to hold its breath
        const k = key(n, yy);
        if (!prev.has(k)) { prev.set(k, u); q.push(k); }
      }
    }
    return null;
  }
  // opening this voxel would let water (or lava) in
  bordersWater(c, y) {
    const liquid = (id) => id === B.water || id === B.lava;
    if (liquid(this.get(c, y + 1))) return true;
    for (const n of this.cols[c].adj) if (liquid(this.get(n, y))) return true;
    return false;
  }

  // Ticks to clear voxel (c, y) for walking through it: 0 if already clear,
  // Infinity if it cannot or must not be mined (bedrock, water, too hard for
  // the pick, a station we would lose).
  clearCost(c, y, tier) {
    if (y < 0 || y >= H) return Infinity;
    const id = this.get(c, y);
    const blk = BLOCKS[id];
    if (!blk.solid) return id === B.water || blk.hazard ? Infinity : 0;
    if (blk.hard === Infinity || blk.tool > tier) return Infinity;
    // stations are mineable like anything else: mining one hands it back, so
    // nothing is lost — and a furnace in a doorway must not seal a house
    if (this.protect.has(c * H + y)) return Infinity;   // a house wall: never a shortcut
    if (this.bordersWater(c, y)) return Infinity;      // opening it would flood the dig
    return Math.max(1, Math.ceil(blk.hard / (blk.tool ? PICK_SPEED[tier] : 1)));
  }

  // Dijkstra over standing states where a step may MINE its way through:
  // walk flat, climb one (clearing headroom), step down one (a stair), or dig
  // straight down. Cost is ticks — a step is 1, plus the mining it needs — so
  // it walks when walking is cheaper and tunnels when it is not. Returns
  // [{ c, y, mine: [[c, y]…] }] or null. Never digs into water.
  digPath(from, goal, maxNodes = 30000) {
    const tier = this.pickTier();
    const key = (c, y) => c * H + y;
    const start = key(from.c, from.y);
    const dist = new Map([[start, 0]]), prev = new Map(), how = new Map();
    const heap = [[0, start]];
    const push = (d, k) => {
      heap.push([d, k]);
      for (let i = heap.length - 1; i > 0;) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; }
      }
      return top;
    };
    const solidUnder = (c, y) => this.solid(c, y - 1);
    // mob bodies, once per search — checking every entity on every relax was
    // the single biggest cost in the planner
    const occ = new Set();
    for (const e of this.ents.values()) if (e !== from) for (let k = 0; k < this.tallOf(e); k++) occ.add(e.c * H + e.y + k);
    let settled = 0;
    while (heap.length && settled < maxNodes) {
      const [d, u] = pop();
      if (d > dist.get(u)) continue;
      settled++;
      const c = Math.floor(u / H), y = u % H;
      if (goal(c, y)) {
        const out = [];
        for (let v = u; v !== start; v = prev.get(v)) out.push(how.get(v));
        return out.reverse();
      }
      const relax = (nc, ny, mine, extra) => {
        let cost = 1 + extra;
        const list = [];
        for (const [mc, my] of mine) {
          const t = this.clearCost(mc, my, tier);
          if (t === Infinity) return;
          if (t > 0) { cost += t; list.push([mc, my]); }
        }
        if (occ.has(nc * H + ny) || occ.has(nc * H + ny + 1)) return;   // route around mobs, not through them
        if (!this.seen[nc]) return;                                       // fog of war: no plans through the unseen
        const k = key(nc, ny), nd = d + cost;
        if (nd < (dist.get(k) ?? Infinity)) { dist.set(k, nd); prev.set(k, u); how.set(k, { c: nc, y: ny, mine: list }); push(nd, k); }
      };
      for (const n of this.cols[c].adj) {
        // flat, possibly falling after we step in
        if (this.clearCost(n, y, tier) !== Infinity && this.clearCost(n, y + 1, tier) !== Infinity) {
          if (solidUnder(n, y) || this.get(n, y - 1) === B.water) relax(n, y, [[n, y], [n, y + 1]], 0);
          else if (this.passable(n, y) && this.passable(n, y + 1)) {
            let yy = y; while (yy > 1 && !this.supported(n, yy)) yy--;
            if (y - yy <= 3 && this.canStand(n, yy)) relax(n, yy, [], 0);
          }
        }
        // climb one
        if (y + 2 < H && solidUnder(n, y + 1)) relax(n, y + 1, [[c, y + 2], [n, y + 1], [n, y + 2]], 0);
        // stair down one
        if (y > 2 && solidUnder(n, y - 1)) relax(n, y - 1, [[n, y + 1], [n, y], [n, y - 1]], 0);
      }
      // straight down
      if (y > 2 && solidUnder(c, y - 1) && this.get(c, y - 1) !== B.bedrock) relax(c, y - 1, [[c, y - 1]], 0);
    }
    return null;
  }

  firstStep(e, goal, maxNodes) { const p = this.path(e, goal, maxNodes, this.tallOf(e), e.kind !== 'player'); return p && p.length ? p[0] : null; }

  // --------------------------------------------------------------- stream --
  emit(ev) { this.ev.push(ev); }
  note(kind, data) { this.emit(data === undefined ? ['note', kind] : ['note', kind, data]); this.flush(); }
  flush() {
    if (!this.ev.length) return;
    this.lines.push(JSON.stringify({ k: this.tick, e: this.ev }));
    this.ev = [];
  }
  drain() { const out = this.lines; this.lines = []; return out; }
}

// What belongs to a player, not to the world. Reading or writing any of
// these on the sim reaches the CURRENT player (sim.me).
export const PER_PLAYER = ['seen', 'seenCount', 'home', '_house', '_lit', '_litTried', '_journal', '_outcomes',
  '_heading', '_unreachable', '_lastMacro', '_homeTried', '_round', '_houseFails', '_swordTries', '_explored',
  '_nightAck', '_branchLeg', 'request', 'role', 'project', '_projectAt', '_airAck'];
for (const k of PER_PLAYER) {
  Object.defineProperty(Sim.prototype, k, { get() { return this.me[k]; }, set(v) { this.me[k] = v; }, configurable: true });
}

// Replay a stream onto a freshly generated world: the viewer's model, and the
// selftest's proof that the stream carries everything a renderer needs.
export class Replay {
  constructor(header) {
    const h = typeof header === 'string' ? JSON.parse(header) : header;
    this.header = h;
    this.world = generateWorld({ seed: h.seed, shape: h.shape, radius: h.radius, kind: h.kind || 'island', version: h.v || 1 });
    if (worldSignature(this.world) !== h.sig) throw new Error(`world signature mismatch: stream ${h.sig}, regenerated ${worldSignature(this.world)} — generator version drift`);
    this.b = this.world.blocks;
    this.ents = new Map();
    this.tick = 0; this.notes = [];
    this.people = new Map();      // player id → { hp, food, inv }
    this.focus = 0;               // whose health / food / inventory the HUD shows
  }
  person(id) {
    if (!this.people.has(id)) this.people.set(id, { hp: 20, food: 20, air: MAX_AIR, inv: {} });
    return this.people.get(id);
  }
  get hp() { return this.person(this.focus).hp; }
  get food() { return this.person(this.focus).food; }
  get air() { return this.person(this.focus).air; }
  get inv() { return this.person(this.focus).inv; }
  apply(line) {
    const L = typeof line === 'string' ? JSON.parse(line) : line;
    if (L.t) return [];
    this.tick = L.k;
    for (const ev of L.e) {
      switch (ev[0]) {
        case 'b': this.b[ev[1] * H + ev[2]] = ev[3]; break;
        case '+': this.ents.set(ev[1], { id: ev[1], kind: ev[2], c: ev[3], y: ev[4] }); break;
        case '-': this.ents.delete(ev[1]); break;
        case 'p': { const e = this.ents.get(ev[1]); if (e) { e.c = ev[2]; e.y = ev[3]; } break; }
        case 'hp': this.person(ev[1]).hp = ev[2]; break;
        case 'food': this.person(ev[2] ?? 0).food = ev[1]; break;
        case 'air': this.person(ev[1]).air = ev[2]; break;
        case 'inv': this.person(ev[2] ?? 0).inv = ev[1]; break;
        case 'note': this.notes.push({ k: L.k, kind: ev[1], data: ev[2] }); break;
      }
    }
    return L.e;
  }
}
