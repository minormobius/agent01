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
//   ["chest",c,y,{item:n}] a chest's whole contents (null: it is gone)
//   ["note",kind,…]        anything a caller annotates: macro starts/ends,
//                          Jev's questions and answers (runner.mjs)
// Crops grow by 'b' events too (sprout → growing → plant), so a replay needs
// nothing new to show a farm.

import {
  B, BLOCKS, H, SEA, RECIPES, PLACEABLE, recipeBags, FUEL, fuelKey, SATURATION, BREED_FOOD, ANIMALS, PICK_TIER, PICK_SPEED, SWORD_DMG, TOOLS, toolClass, durability, FOOD, HEAL, SEEDS, roomFor, ARMOR, BEACON_RADIUS,
  generateWorld, generateNether, worldSignature, mulberry, hash32, blockName, HOSTILE, NETHER_LAVA,
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
export const WOOL_REGROW = 1200;
export const ITEM_DESPAWN = 1200;
export const TREE_TICKS = 1600;
export const GROW_UP = 1200;         // ticks for a young animal to grow up
export const LOVE = 600;             // ticks an animal stays ready to breed after being fed      // a sapling in the light becomes a tree in about this many ticks   // ticks an item on the ground lasts (5 minutes, as Minecraft's)    // ticks until a shorn sheep has wool again
export const MAX_AIR = 60;          // ticks of breath with the head under water (~15 s, as Minecraft's)
export const FLOW_EVERY = 3;        // water spreads one voxel every this many ticks
// what water may flow into (and wash away): open air, torches, lanterns, plants
const floodable = (id) => id === B.air || (!BLOCKS[id].solid && !BLOCKS[id].hazard && id !== B.water && !BLOCKS[id].mobSolid);            // how far the player sees, in tile edges
export const REACH = 2.2;           // how far the player reaches, in tile edges (centre to centre)

// what each dimension has of its own (swapped by useDim)
const DIM_FIELDS = ['world', 'b', 'ents', 'torches', 'crops', 'cultivated', 'flowQ', 'still', 'beacons', 'chests', 'protect', 'portals', 'saplings', 'decayQ', 'ev'];

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
    this.still = new Set();       // water poured from a bucket: it stays put (the sea flows; a bucketful does not)
    this.beacons = new Set();     // voxels holding a beacon: nothing spawns within BEACON_RADIUS
    this.chests = new Map();      // voxel → { item: n } — the shared pool, limited by CHEST_SLOTS stacks
    this.team = { chest: null };  // the team's chest (the first one a player places), for macros to find
    this.lines = [];
    this.ev = [];
    this.stats = { deaths: 0, mined: {}, crafted: {}, kills: {}, damageTaken: 0, placed: {}, planted: {}, harvested: {}, grown: {} };
    this.protect = new Set();     // voxels the planners must not dig (house walls, roof)
    this.portals = new Set();     // lit portal voxels
    this.saplings = new Set();    // planted saplings, growing
    this.decayQ = new Set();      // leaves to check: a tree felled leaves its crown to decay
    this.dim = 'overworld';
    this.dims = { overworld: {} };
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
    // sheep: their own rng, so every world's pigs, zombies and drops are as they were
    this.rngSheep = mulberry(hash32(w.seed, 0x5EE9));
    // saplings, leaf decay, new animals, breeding: their own rng, so older sequences are as they were
    this.rngLife = mulberry(hash32(w.seed, 0x11FE));
    const sheep = Math.round(this.N / 320);
    for (let k = 0, tries = 0; k < sheep && tries < sheep * 20; tries++) {
      const c = Math.floor(this.rngSheep() * this.N);
      const y = this.surface(c);
      if (this.get(c, y - 1) !== B.grass || this.occupied(c, y)) continue;
      this.spawnEnt('sheep', c, y, { hp: 8 });
      k++;
    }
    // cows and chickens, on rngLife: every older world's sequence is as it was
    for (const [kind, per, hp] of [['cow', 300, 10], ['chicken', 260, 4]]) {
      const want = Math.round(this.N / per);
      for (let k = 0, tries = 0; k < want && tries < want * 20; tries++) {
        const c = Math.floor(this.rngLife() * this.N);
        const y = this.surface(c);
        if (this.get(c, y - 1) !== B.grass || this.occupied(c, y)) continue;
        this.spawnEnt(kind, c, y, { hp });
        k++;
      }
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
  as(e, fn) {
    const prev = this.me, prevDim = this.dim;
    this.me = e; this.useDim(e.dim || 'overworld');
    try { return fn(); } finally { this.me = prev; this.useDim(prevDim); }
  }
  nearestPlayer(c) {
    let best = null, bd = Infinity;
    for (const e of this.players) {
      if ((e.dim || 'overworld') !== this.dim) continue; const d = this.dist(e.c, c); if (d < bd) { bd = d; best = e; } }
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
    if (id === B.chest && !this.chests.has(k)) { this.chests.set(k, {}); if (this.team.chest == null && this.dim === 'overworld') this.team.chest = k; }
    if (old === B.chest && id !== B.chest) { this.chests.delete(k); if (this.team.chest === k && this.dim === 'overworld') this.team.chest = [...this.chests.keys()][0] ?? null; }
    // water: standing water is at rest until something changes beside it
    if (y <= SEA && floodable(id)) this.flowQ.add(k);
    if (id === B.water) {
      if (y > 1) this.flowQ.add(k - 1);
      for (const n of this.cols[c].adj) this.flowQ.add(n * H + y);
      // water meeting lava turns the lava to obsidian (beside it, and below)
      const hits = [[c, y - 1], ...this.cols[c].adj.map((n) => [n, y])].filter(([cc, yy]) => yy >= 0 && this.b[cc * H + yy] === B.lava);
      for (const [cc, yy] of hits) this.set(cc, yy, B.obsidian);
    }
    if (old === B.water) this.still.delete(k);
    if (id === B.beacon) this.beacons.add(k); else if (old === B.beacon) this.beacons.delete(k);
    if (id === B.portal) this.portals.add(k); else if (old === B.portal) this.portals.delete(k);
    if (id === B.sapling) this.saplings.add(k); else if (old === B.sapling) this.saplings.delete(k);
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
  // standing: on something solid, in water, on a ladder (you cling to it); a
  // mob also stands on what shuts it out (a trapdoor), the player drops through
  supported(c, y, mob = false) {
    const below = this.get(c, y - 1), here = this.get(c, y);
    return BLOCKS[below].solid || below === B.water || here === B.water || here === B.ladder || (mob && BLOCKS[below].mobSolid);
  }
  canStand(c, y, tall = 2, mob = false) {
    if (y < 1 || y + tall > H) return false;
    for (let k = 0; k < tall; k++) if (!this.passable(c, y + k, mob)) return false;
    return this.supported(c, y, mob);
  }
  // where a body at (c, y) ends up stepping into neighbour n, or null.
  // Climbs one layer (needs headroom above its own head), drops up to maxDrop.
  stepTarget(c, y, n, tall = 2, maxDrop = 3, mob = false) {
    if (this.canStand(n, y, tall, mob)) return y;
    if (this.canStand(n, y + 1, tall, mob) && this.passable(c, y + tall, mob)) return y + 1;
    for (let k = 0; k < tall; k++) if (!this.passable(n, y + k, mob)) return null;
    let yy = y;
    while (yy > 1 && !this.supported(n, yy, mob)) yy--;
    // any drop into water is safe: it breaks the fall
    return (y - yy <= maxDrop || this.wet(n, yy)) && this.canStand(n, yy, tall, mob) ? yy : null;
  }

  // ---------------------------------------------------------- entities -----
  spawnEnt(kind, c, y, extra = {}) {
    const e = { id: this.nextId++, kind, c, y, hp: kind === 'pig' ? 10 : 20, cd: 0, ...extra };
    this.ents.set(e.id, e);
    this.emit(['+', e.id, kind, c, y]);
    return e;
  }
  removeEnt(e, why) { this.ents.delete(e.id); this.emit(['-', e.id, why]); }
  // Items on the ground: an entity holding a bag of items, picked up by any
  // player who comes beside it, gone after ITEM_DESPAWN ticks (or in lava).
  dropItems(c, y, items, extra = {}) {
    const bag = Object.fromEntries(Object.entries(items).filter(([, n]) => n > 0));
    if (!Object.keys(bag).length) return null;
    const e = this.spawnEnt('item', c, y, { items: bag, until: this.tick + ITEM_DESPAWN, ...extra });
    this.emit(['note', 'drop', { id: e.id, c, y, items: bag, until: e.until }]);
    return e;
  }
  itemTick(e, t) {
    if (t >= e.until) return this.removeEnt(e, 'despawn');
    for (const q of this.players) {
      if ((q.dim || 'overworld') !== this.dim || q.hp <= 0) continue;
      if ((q.c === e.c || this.cols[q.c].adj.includes(e.c)) && Math.abs(q.y - e.y) <= 1) {
        for (const [k, n] of Object.entries(e.items)) q.inv[k] = (q.inv[k] || 0) + n;
        this.emit(['inv', { ...q.inv }, q.id]);
        this.emit(['note', 'pickup', { who: q.id, id: e.id, items: e.items }]);
        return this.removeEnt(e, 'picked');
      }
    }
  }
  tallOf(e) { return e.kind === 'item' ? 0 : e.kind === 'pig' || e.kind === 'sheep' || e.kind === 'chicken' ? 1 : 2; }   // an item on the ground blocks nobody
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
    // armor (carried is worn) takes its share of a blow from a mob
    if (e.kind === 'player' && from) { let a = 0; for (const k in ARMOR) if ((e.inv[k] || 0) > 0) a = Math.max(a, ARMOR[k]); dmg = Math.max(1, Math.round(dmg * (1 - a))); }
    e.hp = Math.max(0, e.hp - dmg);
    this.emit(['hit', from ? from.id : -1, e.id, dmg]);
    this.emit(['hp', e.id, e.hp]);
    if (e.kind === 'player') this.stats.damageTaken += dmg;
    if (e.hp > 0) return;
    this.emit(['die', e.id]);
    if (e.kind === 'player') {
      this.stats.deaths++;
      e.deaths = (e.deaths || 0) + 1;
      // everything carried falls where you died, and lasts ITEM_DESPAWN ticks: go back for it
      const drop = this.dropItems(e.c, e.y, e.inv, { owner: e.id });
      e.lastDrop = drop ? { id: drop.id, dim: this.dim, c: e.c, y: e.y, until: drop.until, n: Object.values(drop.items).reduce((a, b) => a + b, 0) } : null;
      e.wear = {};
      e.inv = {}; e.hp = 20; e.food = 20; e.air = MAX_AIR;
      // death in the nether: you wake up in the overworld
      if ((e.dim || 'overworld') !== 'overworld') {
        this.emit(['inv', {}, e.id]); this.emit(['hp', e.id, 20]); this.emit(['food', 20, e.id]);
        this.crossTo(e, 'overworld', e.home ? e.home[0] : this.dims.overworld.world.spawn);
        this.useDim('overworld');
        if (e.home && this.canStand(e.home[0], e.home[1])) this.moveEnt(e, e.home[0], e.home[1]);
        return;
      }
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
    if (e.kind === 'sheep' && from && from.kind === 'player' && !e.young) { this.giveTo(from, 'wool', 1 + Math.floor(this.rngSheep() * 2)); this.giveTo(from, 'mutton', 1); }
    if (e.kind === 'cow' && from && from.kind === 'player' && !e.young) { this.giveTo(from, 'beef', 1 + Math.floor(this.rngLife() * 3)); const l = Math.floor(this.rngLife() * 3); if (l) this.giveTo(from, 'leather', l); }
    if (e.kind === 'chicken' && from && from.kind === 'player' && !e.young) { this.giveTo(from, 'chicken', 1); const f = Math.floor(this.rngLife() * 3); if (f) this.giveTo(from, 'feather', f); }
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
  // the best held tool of a class ('pick' | 'shovel' | 'axe'), and its tier
  toolFor(kind) { let best = null, bt = 0; for (const k in TOOLS) if (TOOLS[k].kind === kind && TOOLS[k].tier > bt && this.has(k)) { best = k; bt = TOOLS[k].tier; } return best; }
  toolTier(kind) { const t = this.toolFor(kind); return t ? TOOLS[t].tier : 0; }
  // The pick a block is mined with: the CHEAPEST held that is good enough for
  // it (and not wood when better is held), so an iron pick wears only on what
  // needs iron and a diamond pick on obsidian. Tools wear out, so saving the
  // good pick is worth the slower stone (measured: iron picks broke ~10 times
  // a run when the best pick did all the digging).
  // A player may choose `pickChoice: 'best'` instead: all speed, and it wears the best pick.
  pickFor(blk) {
    const need = Math.max(blk.tool || 0, 1);
    if (this.me && this.me.pickChoice === 'best') { const k = this.toolFor('pick'); return k && PICK_TIER[k] >= need ? k : null; }
    let best = null, bt = Infinity;
    const floor = this.pickTier() >= 2 ? 2 : 1;
    for (const k in PICK_TIER) { const t = PICK_TIER[k]; if (this.has(k) && t >= Math.max(need, floor) && t < bt) { best = k; bt = t; } }
    return best;
  }
  // ticks to mine a block with what is held. `tier` caps the pick (the
  // planner asks "with what I have"); the pick used is pickFor's choice.
  mineTicks(blk, tier = this.pickTier()) {
    const kind = toolClass(blk);
    let t = 0;
    if (kind === 'pick') { const k = this.pickFor(blk); t = k ? Math.min(PICK_TIER[k], tier) : tier; }
    else if (kind) t = this.toolTier(kind);
    return Math.max(1, Math.ceil(blk.hard / (kind ? PICK_SPEED[t] : 1)));
  }
  // one use off a tool. The stack's top item wears; at zero it breaks and is gone
  wear(item, n = 1) {
    if (!item || !this.has(item)) return;
    const d = durability(item);
    if (d == null) return;
    const p = this.me, w = (p.wear ||= {});
    const left = (w[item] ?? d) - n;
    if (left <= 0) {
      delete w[item];
      this.take(item, 1);
      this.emit(['wear', p.id, item, null]);
      this.emit(['note', 'broke', { item, who: p.id }]);
      return;
    }
    w[item] = left;
    if (left % Math.ceil(d / 10) === 0 || left <= 5) this.emit(['wear', p.id, item, left]);
  }
  swordItem() { let best = null, d = 0; for (const k in SWORD_DMG) if (k !== 'none' && this.has(k) && SWORD_DMG[k] > d) { best = k; d = SWORD_DMG[k]; } return best; }
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
          if (fall > 3 && !this.wet(a.to, y)) this.hurt(p, fall - 3, null);
        } };
      }
      case 'climb': {
        const up = (a.dir ?? 1) > 0, ny = p.y + (up ? 1 : -1);
        if (!this.ladderSteps(p.c, p.y).includes(ny)) return no(up ? 'no ladder here to climb' : 'no ladder below');
        if (this.occupied(p.c, ny + (up ? 1 : 0)) && this.occupied(p.c, ny + (up ? 1 : 0)) !== p) return no('occupied');
        return { ok: true, ticks: 1, pre: () => { this.emit(['do', 'climb', up ? 1 : -1]); this.moveEnt(p, p.c, ny); } };
      }
      case 'mine': {
        const { c, y } = a;
        if (!this.reachable(p.c, p.y, c, y)) return no('out of reach');
        const blk = BLOCKS[this.get(c, y)];
        if (blk.hard === Infinity) return no(`${blk.name} cannot be mined`);
        const tier = this.pickTier();
        if (blk.tool > tier) return no(`${blk.name} needs a ${['', 'wooden', 'stone', 'iron', 'diamond'][blk.tool]} pickaxe or better`);
        const ticks = this.mineTicks(blk, tier);
        const used = toolClass(blk) === 'pick' ? this.pickFor(blk) : toolClass(blk) && this.toolFor(toolClass(blk));
        return { ok: true, ticks, pre: () => this.emit(['do', 'mine', c, y, ticks]), post: () => {
          if (this.get(c, y) !== blk.id) return no('block changed while mining');
          const cult = this.cultivated.get(c * H + y);
          const stash = blk.id === B.chest ? { ...(this.chests.get(c * H + y) || {}) } : null;
          this.set(c, y, B.air);        // if it touched water, the flow fills it (and whatever it opens onto)
          this.stats.mined[blk.name] = (this.stats.mined[blk.name] || 0) + 1;
          this.wear(used);
          if (blk.drop) this.give(blk.drop, blk.dropN || 1);
          if (blk.plant) this.reap(blk, cult);
          if (stash) { this.give('chest', 1); for (const [k2, n2] of Object.entries(stash)) this.give(k2, n2); this.emit(['chest', c, y, null]); }
          // a plant standing on what was just mined falls with it
          if (BLOCKS[this.get(c, y + 1)].plant) this.set(c, y + 1, B.air);
          if (blk.id === B.leaves && this.rng() < 1 / 6) this.give('apple', 1);
          if (blk.id === B.leaves && this.rngLife() < 1 / 10) this.give('sapling', 1);
          if (blk.id === B.log) this.queueDecay(c, y);
          this.settle();
          return { ok: true };
        } };
      }
      case 'place': {
        const { c, y, item } = a;
        if (!PLACEABLE.has(item)) return no(`${item} does not place`);
        if (!this.has(item)) return no(`no ${item}`);
        // (a ladder also goes in your own column, at your feet or head: that is how a shaft gets its rungs)
        if (!this.reachable(p.c, p.y, c, y) && !(item === 'ladder' && c === p.c && (y === p.y || y === p.y + 1))) return no('out of reach');
        const cur = this.get(c, y);
        // a plant is in the way of nothing: placing a block on it picks it first
        if (cur !== B.air && cur !== B.water && !BLOCKS[cur].plant) return no(`occupied by ${blockName(cur)}`);
        if (this.occupied(c, y) && !(item === 'ladder' && this.occupied(c, y) === p)) return no('an entity is there');   // a ladder goes where you stand
        if (item === 'sapling' && ![B.grass, B.dirt].includes(this.get(c, y - 1))) return no('a sapling needs grass or dirt under it');
        return { ok: true, ticks: 1, pre: () => {
          this.emit(['do', 'place', c, y, item]);
          const was = BLOCKS[this.get(c, y)];
          if (was.plant) this.reap(was, this.cultivated.get(c * H + y));
          this.take(item, 1);
          this.set(c, y, B[item]);
          this.stats.placed[item] = (this.stats.placed[item] || 0) + 1;
          if (item === 'glowstone') p.glowPlaced = true;
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
          this.wear('wooden_hoe');
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
      case 'fill': {
        // a bucket takes up a water voxel: the sea gives without end, a
        // poured bucketful goes back into the bucket
        const { c, y } = a;
        if (!this.has('bucket')) return no('no empty bucket');
        if (this.get(c, y) !== B.water) return no('no water there');
        if (!(p.c === c && Math.abs(p.y - y) <= 1) && !this.reachable(p.c, p.y, c, y)) return no('out of reach');
        return { ok: true, ticks: 1, pre: () => {
          this.emit(['do', 'fill', c, y]);
          if (this.still.has(c * H + y)) this.set(c, y, B.air);
          this.take('bucket', 1); this.give('water_bucket', 1);
        } };
      }
      case 'pour': {
        // empty a water bucket into an empty voxel: still water, which does
        // not flow, but turns any lava beside or below it to obsidian
        const { c, y } = a;
        if (!this.has('water_bucket')) return no('no water in a bucket');
        if (this.dim === 'nether') return no('water boils away in the nether');
        if (!this.reachable(p.c, p.y, c, y)) return no('out of reach');
        if (this.get(c, y) !== B.air) return no(`occupied by ${blockName(this.get(c, y))}`);
        if (this.occupied(c, y)) return no('an entity is there');
        return { ok: true, ticks: 1, pre: () => {
          this.emit(['do', 'pour', c, y]);
          this.take('water_bucket', 1); this.give('bucket', 1);
          this.still.add(c * H + y);
          this.set(c, y, B.water);
        } };
      }
      case 'light': {
        // light a finished frame with a torch: the portal opens
        const { c, y } = a;
        if (!this.has('torch')) return no('needs a torch to light it');
        if (!this.reachable(p.c, p.y, c, y) && !(p.c !== c && this.cols[p.c].adj.includes(c))) return no('out of reach');
        if (this.get(c, y) !== B.air || this.get(c, y + 1) !== B.air) return no('the doorway is not empty');
        if (!this.portalFrameOk(c, y)) return no('the frame is not finished (obsidian under, over, and two layers up on two sides)');
        return { ok: true, ticks: 2, pre: () => {
          this.emit(['do', 'light', c, y]);
          this.take('torch', 1);
          this.set(c, y, B.portal); this.set(c, y + 1, B.portal);
          this.emit(['note', 'portal', { c, y, dim: this.dim, by: p.id }]);
        } };
      }
      case 'travel': {
        // stand in a lit portal a moment, and cross to the other side
        const here = this.get(p.c, p.y) === B.portal;
        if (!here) return no('not standing in a portal');
        const to = this.dim === 'nether' ? 'overworld' : 'nether';
        return { ok: true, ticks: 16, pre: () => this.emit(['do', 'travel', to]), post: () => {
          if (this.get(p.c, p.y) !== B.portal || p.hp <= 0) return no('stepped out of the portal');
          this.crossTo(p, to, p.c);
          return { ok: true };
        } };
      }
      case 'store':
      case 'take': {
        // put items in a chest, or take them out: the team's shared pool
        const { c, y, item } = a;
        if (this.get(c, y) !== B.chest) return no('no chest there');
        if (!this.reachable(p.c, p.y, c, y)) return no('out of reach');
        const box = this.chests.get(c * H + y);
        const want = Math.max(1, a.n | 0 || 1);
        const n = a.op === 'store' ? Math.min(want, this.inv[item] || 0, roomFor(box, item)) : Math.min(want, box[item] || 0);
        if (n <= 0) return no(a.op === 'store' ? (this.has(item) ? 'the chest is full' : `no ${item} to store`) : `the chest has no ${item}`);
        return { ok: true, ticks: 1, moved: n, pre: () => {
          this.emit(['do', a.op, c, y, item, n]);
          if (a.op === 'store') { this.take(item, n); box[item] = (box[item] || 0) + n; }
          else { box[item] -= n; if (!box[item]) delete box[item]; this.give(item, n); }
          this.emit(['chest', c, y, { ...box }]);
        } };
      }
      case 'sleep': {
        // lie in a bed at night. The night passes only when every player is asleep.
        const { c, y } = a;
        if (this.dim === 'nether') return no('beds do not work in the nether');
        if (this.get(c, y) !== B.bed) return no('no bed there');
        if (!this.isNight()) return no('you can only sleep at night');
        if (!(p.c === c && p.y === y) && !this.reachable(p.c, p.y, c, y)) return no('out of reach');
        if ([...this.ents.values()].some((e) => HOSTILE.has(e.kind) && this.dist(e.c, p.c) < 6)) return no('you may not rest, there are zombies nearby');
        return { ok: true, ticks: 20, pre: () => { if (!p.asleep) this.emit(['do', 'sleep', c, y]); p.asleep = true; p.home = [c, y]; }, post: () => { p.asleep = false; return { ok: true }; } };
      }
      case 'craft': {
        const r = RECIPES[a.item];
        if (!r) return no(`no recipe for ${a.item}`);
        if (r.at && !this.near(B[r.at])) return no(`needs a ${r.at} nearby`);
        // a furnace's fuel may come from what is still burning (p.fuel)
        const bag = recipeBags(r).find((g) => { const fk = fuelKey(r, g); return Object.entries(g).every(([k, n]) => (k === fk && (p.fuel || 0) > 0) || this.has(k, n)); });
        if (!bag) {
          const [k, n] = Object.entries(r.need).find(([k2, n2]) => !this.has(k2, n2));
          return no(`needs ${n} ${k}` + (r.alt ? ' (or an alternative)' : ''));
        }
        return { ok: true, ticks: 1, pre: () => {
          this.emit(['do', 'craft', a.item]);
          const fk = fuelKey(r, bag);
          for (const [k, n] of Object.entries(bag)) {
            if (k === fk) {
              if ((p.fuel || 0) > 0) { p.fuel--; continue; }
              this.take(k, 1); p.fuel = FUEL[k] - 1;
              if (k === 'lava_bucket') this.give('bucket', 1);
              continue;
            }
            this.take(k, n);
          }
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
          p.sat = Math.min(p.food, (p.sat || 0) + (SATURATION[a.item] || 0));
          this.emit(['food', p.food, p.id]);
          if (HEAL[a.item] && p.hp < 20) { p.hp = Math.min(20, p.hp + HEAL[a.item]); this.emit(['hp', p.id, p.hp]); }
        } };
      }
      case 'attack': {
        const t = this.ents.get(a.id);
        if (!t || t === p) return no('no such target');
        if (t.kind === 'player') return no('not attacking a teammate');
        if (!this.adjacentTo(p, t)) return no('not adjacent');
        return { ok: true, ticks: 2, pre: () => { this.emit(['do', 'attack', t.id]); const sw = this.swordItem(); this.hurt(t, this.swordDmg(), p); this.wear(sw); } };
      }
      case 'feed': {
        // an animal's food, by hand: it is ready to breed for LOVE ticks
        const t = this.ents.get(a.id);
        if (!t || !BREED_FOOD[t.kind]) return no('not an animal that breeds');
        const food = BREED_FOOD[t.kind];
        if (!this.has(food)) return no(`needs ${food} to feed a ${t.kind}`);
        if (!this.adjacentTo(p, t)) return no('not adjacent');
        if (t.young) return no('too young to breed');
        if (t.love) return no('already fed');
        if (t.breedAt && this.tick < t.breedAt) return no('it bred not long ago');
        return { ok: true, ticks: 2, pre: () => this.emit(['do', 'feed', t.id]), post: () => {
          if (!this.ents.has(t.id)) return no('it got away');
          this.take(food, 1);
          t.love = this.tick + LOVE;
          return { ok: true };
        } };
      }
      case 'shear': {
        // shears on a sheep beside you: 1-3 wool, and the sheep lives; it grows back
        const t = this.ents.get(a.id);
        if (!this.has('shears')) return no('needs shears (2 iron ingots)');
        if (!t || t.kind !== 'sheep') return no('no such sheep');
        if (!this.adjacentTo(p, t)) return no('not adjacent');
        if (t.shorn) return no('already shorn: the wool grows back');
        return { ok: true, ticks: 2, pre: () => this.emit(['do', 'shear', t.id]), post: () => {
          if (!this.ents.has(t.id) || t.shorn) return no('the sheep got away');
          this.give('wool', 1 + Math.floor(this.rngSheep() * 3));
          t.shorn = this.tick + WOOL_REGROW;
          this.emit(['shorn', t.id, 1]);
          this.wear('shears');
          return { ok: true };
        } };
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
      while (y > 1 && !this.supported(e.c, y, e.kind !== 'player')) y--;   // a mob stands on a trapdoor, the player drops through
      if (y !== e.y) {
        const fall = e.y - y;
        this.moveEnt(e, e.c, y);
        if (fall > 3 && !this.wet(e.c, y)) this.hurt(e, fall - 3, null);
      }
    }
  }

  // ------------------------------------------------------------ the tick ---
  step() {
    // the world ticks as one clock; each dimension that has a player in it
    // (and the overworld always) runs its own mobs, water, crops and spawns
    const back = this.dim;
    this.useDim('overworld');
    this.tick++;
    // everyone asleep in a bed at night: the night passes (and the zombies with it)
    if (this.isNight() && this.players.length && this.players.every((q) => q.asleep)) {
      this.tick = Math.ceil(this.tick / DAY) * DAY;
      this.emit(['note', 'slept', { players: this.players.length }]);
      for (const z of [...this.ents.values()]) if (z.kind === 'zombie') this.removeEnt(z, 'dawn');
      for (const q of this.players) q.asleep = false;
    }
    const t = this.tick;
    // hunger, for everyone, wherever they are
    for (const q of this.players) {
      // hunger drains saturation first, then the food bar
      if (t % this.cfg.hungerEvery === 0 && q.food > 0) { if ((q.sat || 0) > 0) q.sat--; else { q.food--; this.emit(['food', q.food, q.id]); } }
      if (t % 80 === 0) {
        if (q.food === 0) this.as(q, () => this.hurt(q, 1, null));
        else if (q.food >= 18 && q.hp < 20) { q.hp++; this.emit(['hp', q.id, q.hp]); }
      }
    }
    for (const d of Object.keys(this.dims)) {
      if (d !== 'overworld' && !this.players.some((q) => (q.dim || 'overworld') === d)) continue;
      this.useDim(d);
      this.stepDim(t);
    }
    this.useDim('overworld');
    if (t % DAY === NIGHT_START) this.emit(['note', 'dusk']);
    if (t % DAY === 0) this.emit(['note', 'dawn']);
    // back to the acting player's world, which is where it WAS unless the tick
    // moved it (dying in the nether wakes you in the overworld)
    this.useDim(this.me && this.me.dim ? this.me.dim : back);
    this.flush();
  }
  // one dimension's share of a tick (this.dim is set)
  stepDim(t) {
    const here = this.players.filter((q) => (q.dim || 'overworld') === this.dim);
    // spawning is anchored to one player per tick, in turn (no RNG spent on
    // choosing, so a one-player world is unchanged by there being a list)
    const p = here.length ? here[t % here.length] : null;
    // breath: the head under water uses it up, then drowning hurts
    for (const q of here) {
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
    if (t % GROW_EVERY === 0 && this.saplings.size) this.growSaplings();
    if (t % 10 === 0 && this.decayQ.size) this.decayLeaves();
    const zs = [...this.ents.values()].filter((e) => HOSTILE.has(e.kind));
    if (this.dim === 'nether') {
      // the nether is always dark: blazes come out of it near whoever is there
      if (p && zs.length < this.cfg.maxZombies && this.rng() < this.cfg.spawn * 0.6 && this._near) {
        const ring = this._near.get(p.c);
        if (ring && ring.length) {
          const c = ring[Math.floor(this.rng() * ring.length)];
          if (this.dist(c, p.c) >= 6 && !this.torchNear(c, 5) && !this.beaconNear(c)) {
            const spots = [];
            for (let y = 2; y < H - 3; y++) if (this.canStand(c, y, 2, true) && !this.occupied(c, y) && this.get(c, y - 1) !== B.lava) spots.push(y);
            if (spots.length) this.spawnEnt('blaze', c, spots[Math.floor(this.rng() * spots.length)]);
          }
        }
      }
    } else if (p) {
      // zombies: spawn at night on open ground, away from torches and the player
      if (this.isNight() && zs.length < this.cfg.maxZombies && this.rng() < this.cfg.spawn) {
        const c = Math.floor(this.rng() * this.N);
        const y = this.surface(c);
        const d = this.dist(c, p.c);
        if (d >= 10 && d <= 24 && this.get(c, y - 1) !== B.water && this.skyOpen(c, y) && !this.torchNear(c, 5) && !this.beaconNear(c)
            && this.canStand(c, y) && !this.occupied(c, y)) this.spawnEnt('zombie', c, y);
      }
      // ...and in the dark, at any hour: caves and unlit tunnels near the player.
      // Candidates come from what the player can see (this._near), so the cost
      // stays local however big the world is.
      if (zs.length < this.cfg.maxZombies && this.rng() < this.cfg.darkSpawn && this._near) {
        const ring = this._near.get(p.c);
        if (ring && ring.length) {
          const c = ring[Math.floor(this.rng() * ring.length)];
          if (this.dist(c, p.c) >= 6 && !this.torchNear(c, 5) && !this.beaconNear(c)) {
            // every dark standing spot in that column (cave floors, tunnels)
            const top = this.surface(c), spots = [];
            for (let y = 1; y < top - 2; y++) if (this.canStand(c, y, 2, true) && this.dark(c, y) && !this.occupied(c, y)) spots.push(y);
            if (spots.length) this.spawnEnt('zombie', c, spots[Math.floor(this.rng() * spots.length)]);
          }
        }
      }
    }
    // lava burns whatever is in it
    if (t % 5 === 0) for (const e of [...this.ents.values()]) {
      if (this.get(e.c, e.y) === B.lava || this.get(e.c, e.y + 1) === B.lava) { if (e.kind === 'item') this.removeEnt(e, 'burnt'); else this.hurt(e, 4, null); }
    }
    for (const e of [...this.ents.values()]) {
      if (e.kind === 'player' || !this.ents.has(e.id)) continue;
      if (e.kind === 'item') { this.itemTick(e, t); continue; }
      if (e.cd > 0) e.cd--;
      if (HOSTILE.has(e.kind)) this.zombieTick(e);
      else if (e.kind === 'pig') this.animalTick(e, this.rng);
      else if (e.kind === 'sheep') { if (e.shorn && t >= e.shorn) { e.shorn = 0; this.emit(['shorn', e.id, 0]); } this.animalTick(e, this.rngSheep); }
      else if (e.kind === 'cow' || e.kind === 'chicken') this.animalTick(e, this.rngLife);
    }
  }

  // ----------------------------------------------------------- dimensions ---
  // The overworld and the nether share one tiling (so tile c here is tile c
  // there) and nothing else: each has its own blocks, mobs, lights, water,
  // chests and portals. Switching is a swap of these fields, as sim.as() swaps
  // the player; every player carries its `dim`.
  useDim(name) {
    if (name === this.dim) return;
    const cur = this.dims[this.dim];
    for (const f of DIM_FIELDS) cur[f] = this[f];
    if (!this.dims[name]) this.dims[name] = this.makeDim(name);
    const nd = this.dims[name];
    for (const f of DIM_FIELDS) this[f] = nd[f];
    this.dim = name;
  }
  // a field of the overworld, live, from whichever dimension is current (the
  // team's chest, its beacons and home all live there)
  ow(f) { return this.dim === 'overworld' ? this[f] : this.dims.overworld[f]; }
  makeDim(name) {
    if (name !== 'nether') throw new Error(`no dimension ${name}`);
    const ow = this.dims.overworld.world || this.world;
    const w = generateNether({ seed: ow.seed, shape: ow.shape, tiling: ow.tiling, radius: ow.radius, version: ow.version });
    const d = { world: w, b: w.blocks, ents: new Map(), torches: new Set(), crops: new Set(), cultivated: new Map(), flowQ: new Set(), still: new Set(),
      beacons: new Set(), chests: new Map(), protect: new Set(), portals: new Set(), saplings: new Set(), decayQ: new Set(), ev: [] };
    for (let k = 0; k < w.blocks.length; k++) if (BLOCKS[w.blocks[k]].light) d.torches.add(k);
    // announced in the overworld's stream, with its fingerprint, so a replay can build and check it
    this.dims.overworld.ev.push(['note', 'dim', { name, sig: worldSignature(w) }]);
    return d;
  }
  // a lit portal's frame on a tile graph: obsidian under and over the portal
  // column, and obsidian both layers up in at least two neighbouring columns
  portalFrameOk(c, y) {
    if (this.get(c, y - 1) !== B.obsidian || this.get(c, y + 2) !== B.obsidian) return false;
    return this.cols[c].adj.filter((n) => this.get(n, y) === B.obsidian && this.get(n, y + 1) === B.obsidian).length >= 2;
  }
  // Move a player to another dimension, arriving at column c's portal there (or
  // building one, as Minecraft does, on the nearest spot that can take it).
  crossTo(e, to, c) {
    const from = e.dim || 'overworld';
    this.useDim(from);
    this.ents.delete(e.id);
    this.emit(['-', e.id, 'portal']);
    this.useDim(to);
    let at = this.findPortal(c) || this.buildPortalNear(c);
    e.dim = to;
    this.ents.set(e.id, e);
    e.c = at[0]; e.y = at[1];
    this.emit(['+', e.id, 'player', e.c, e.y]);
    // what a player has seen is per dimension
    e.seenDims = e.seenDims || {};
    e.seenDims[from] = { seen: e.seen, seenCount: e.seenCount };
    const sd = e.seenDims[to] || { seen: new Uint8Array(this.N), seenCount: 0 };
    e.seen = sd.seen; e.seenCount = sd.seenCount;
    if (to === 'nether') e.visitedNether = true;
    this.as(e, () => this.look());
    this.emit(['note', 'dim_enter', { who: e.id, dim: to, c: e.c, y: e.y }]);
  }
  findPortal(c) {
    let best = null, bd = 7;
    for (const k of this.portals) {
      const pc = Math.floor(k / H), py = k % H;
      if (this.get(pc, py - 1) === B.portal) continue;          // the lower portal voxel is the standing one
      const d = this.dist(pc, c);
      if (d < bd) { bd = d; best = [pc, py]; }
    }
    return best;
  }
  // the nearest column (from c outward) where a portal and its frame fit
  buildPortalNear(c) {
    return this.portalSpot(c, true) || this.portalSpot(c, false);
  }
  // strict: on dry floor with room to walk off it (a ledge over the lava sea is
  // a trap: the planners never step beside lava); loose: anywhere it fits
  portalSpot(c, strict) {
    const order = [c], seenC = new Set([c]);
    for (let i = 0; i < order.length && order.length < 600; i++) for (const n of this.cols[order[i]].adj) if (!seenC.has(n)) { seenC.add(n); order.push(n); }
    const hard = (cc, y) => { const id = this.get(cc, y); return id === B.bedrock || id === B.lava || id === B.water || id === B.portal; };
    const stand = (cc, y) => this.solid(cc, y - 1) && !hard(cc, y - 1) && !this.solid(cc, y) && !this.solid(cc, y + 1) && !hard(cc, y) && !this.cols[cc].adj.some((m) => this.get(m, y) === B.lava || this.get(m, y - 1) === B.lava);
    for (const pc of order) {
      if (this.cols[pc].nb.includes(-1)) continue;
      const flanks = this.cols[pc].adj.slice(0, 2);
      if (flanks.length < 2) continue;
      const front = this.cols[pc].adj.find((n) => !flanks.includes(n));
      if (front == null) continue;
      for (let y = 3; y < H - 4; y++) {
        const vox = [[pc, y - 1], [pc, y], [pc, y + 1], [pc, y + 2], ...flanks.flatMap((f) => [[f, y], [f, y + 1]]), [front, y], [front, y + 1], [front, y - 1]];
        if (vox.some(([cc, yy]) => hard(cc, yy))) continue;
        // prefer a spot with air already (a cave floor): no more than 4 solid voxels to clear
        if ([[pc, y], [pc, y + 1], [front, y], [front, y + 1]].filter(([cc, yy]) => this.solid(cc, yy)).length > 2) continue;
        if (strict && ((this.dim === 'nether' && y <= NETHER_LAVA + 1) || !stand(front, y) || this.cols[front].adj.filter((m) => m !== pc && stand(m, y)).length < 2)) continue;
        this.set(pc, y - 1, B.obsidian); this.set(pc, y + 2, B.obsidian);
        for (const f of flanks) { this.set(f, y, B.obsidian); this.set(f, y + 1, B.obsidian); }
        this.set(front, y, B.air); this.set(front, y + 1, B.air);
        if (!this.solid(front, y - 1)) this.set(front, y - 1, B.obsidian);
        this.set(pc, y, B.portal); this.set(pc, y + 1, B.portal);
        return [pc, y];
      }
    }
    if (strict) return null;
    throw new Error('nowhere to put a portal');
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
      const src = (cc, yy) => this.get(cc, yy) === B.water && !this.still.has(cc * H + yy);
      if (!src(c, y + 1) && !this.cols[c].adj.some((m) => src(m, y))) continue;
      n++;
      this.set(c, y, B.water);      // set() wakes what is below and beside it
    }
  }
  // --------------------------------------------------------- trees renew ---
  // A sapling in the light grows into a tree like the generator's: a trunk of
  // 4-5 logs and a crown that is a ball in the tile graph. Expected ~1600 ticks.
  growSaplings() {
    for (const k of [...this.saplings]) {
      const c = Math.floor(k / H), y = k % H;
      if (this.get(c, y) !== B.sapling) { this.saplings.delete(k); continue; }
      if (!this.skyOpen(c, y + 1) && !this.torchNear(c, 3)) continue;
      if (this.rngLife() >= GROW_EVERY / TREE_TICKS) continue;
      this.growTree(c, y);
    }
  }
  ballCols(c, r) {
    const d = new Map([[c, 0]]), q = [c];
    while (q.length) { const u = q.shift(); if (d.get(u) === r) continue; for (const w of this.cols[u].adj) if (!d.has(w)) { d.set(w, d.get(u) + 1); q.push(w); } }
    return d;
  }
  growTree(c, y) {
    const tall = 4 + (this.rngLife() < 0.5 ? 1 : 0);
    if (y + tall + 2 >= H) return false;
    for (let yy = y + 1; yy <= y + tall + 1; yy++) if (this.get(c, yy) !== B.air && this.get(c, yy) !== B.leaves) return false;   // no room
    for (let yy = y; yy < y + tall; yy++) this.set(c, yy, B.log);
    for (const [u, d] of this.ballCols(c, 2)) for (let yy = y + tall - 2; yy <= y + tall; yy++) {
      if (yy === y + tall && d > 1) continue;
      if (this.get(u, yy) === B.air) this.set(u, yy, B.leaves);
    }
    if (this.get(c, y + tall) === B.air) this.set(c, y + tall, B.leaves);
    this.emit(['note', 'tree', { c, y }]);
    return true;
  }
  // a log is gone: the leaves around it check whether any log still holds them
  queueDecay(c, y) {
    for (const [u] of this.ballCols(c, 3)) for (let yy = Math.max(1, y - 3); yy <= Math.min(H - 1, y + 5); yy++) if (this.get(u, yy) === B.leaves) this.decayQ.add(u * H + yy);
  }
  decayLeaves() {
    let n = 0;
    for (const k of [...this.decayQ]) {
      if (n++ >= 12) break;
      this.decayQ.delete(k);
      const c = Math.floor(k / H), y = k % H;
      if (this.get(c, y) !== B.leaves) continue;
      let held = false;
      for (const [u] of this.ballCols(c, 2)) { for (let yy = Math.max(1, y - 4); yy <= Math.min(H - 1, y + 1) && !held; yy++) if (this.get(u, yy) === B.log) held = true; if (held) break; }
      if (held) continue;
      this.set(c, y, B.air);
      // what a decaying leaf lets fall, to the ground below it
      const roll = this.rngLife();
      if (roll < 1 / 12 || roll > 1 - 1 / 30) {
        let g = y; while (g > 1 && !this.supported(c, g)) g--;
        this.dropItems(c, g, roll < 1 / 12 ? { sapling: 1 } : { apple: 1 });
      }
    }
  }
  beaconNear(c) {
    for (const k of this.beacons) if (this.dist(Math.floor(k / H), c) <= BEACON_RADIUS) return true;
    return false;
  }
  torchNear(c, r) {
    for (const k of this.torches) if (this.dist(Math.floor(k / H), c) <= r) return true;
    return false;
  }
  zombieTick(z) {
    const p = this.nearestPlayer(z.c);        // zombies go for whoever is closest
    if (!p) return;
    const d = this.dist(z.c, p.c);
    if (d > 40) return this.removeEnt(z, 'despawn');
    if (z.kind === 'zombie' && this.dim === 'overworld' && !this.isNight() && this.skyOpen(z.c, z.y + 2) && this.tick % 10 === 0) this.hurt(z, 2, null);
    if (!this.ents.has(z.id)) return;
    if (this.adjacentTo(z, p)) {
      if (z.cd <= 0) { this.hurt(p, this.cfg.zombieDmg + (z.kind === 'blaze' ? 2 : 0), z); z.cd = 10; }
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
  // Animals: grow up, breed when two nearby are fed, follow a player holding
  // their food (as Minecraft's do), otherwise wander as before.
  animalTick(g, rng) {
    const t = this.tick;
    if (g.young && t >= g.young) { g.young = 0; this.emit(['grown', g.id]); }
    if (g.love && t >= g.love) g.love = 0;
    if (g.love) {
      const mate = [...this.ents.values()].find((o) => o !== g && o.kind === g.kind && o.love && !o.young && this.dist(o.c, g.c) <= 2);
      if (mate) {
        g.love = 0; mate.love = 0; g.breedAt = mate.breedAt = t + GROW_UP;
        const baby = this.spawnEnt(g.kind, g.c, g.y, { hp: g.kind === 'chicken' ? 4 : 8, young: t + GROW_UP });
        this.emit(['young', baby.id]);
        this.stats.bred = (this.stats.bred || 0) + 1;
        this.emit(['note', 'bred', { kind: g.kind, id: baby.id }]);
        return;
      }
    }
    // lured: a player within 6 holding out what this animal eats
    const food = BREED_FOOD[g.kind];
    // (only while the player is breeding: carrying wheat about is not holding it out)
    const lure = t % 3 === 0 && this.players.find((q) => q.luring && (q.dim || 'overworld') === this.dim && q.inv[food] && this.dist(q.c, g.c) <= 6 && this.dist(q.c, g.c) > 1.5);
    if (lure) {
      const n = this.cols[g.c].adj.filter((m) => this.dist(m, lure.c) < this.dist(g.c, lure.c)).sort((a, b) => this.dist(a, lure.c) - this.dist(b, lure.c))[0];
      if (n != null) { const y = this.stepTarget(g.c, g.y, n, this.tallOf(g), 1, true); if (y != null && this.get(n, y - 1) !== B.water && !this.occupied(n, y)) { this.moveEnt(g, n, y); return; } }
    }
    return this.pigTick(g, rng);
  }
  pigTick(g, rng = this.rng) {
    if (this.tick % 6 || rng() < 0.5) return;
    const adj = this.cols[g.c].adj;
    if (!adj.length) return;
    const n = adj[Math.floor(rng() * adj.length)];
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
      // up or down a ladder, a layer a step
      if (!mob) for (const ny of this.ladderSteps(c, y, tall)) { const k = key(c, ny); if (!prev.has(k)) { prev.set(k, u); q.push(k); } }
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
    if (id === B.chest) return Infinity;                 // nor the team's pool: digging through it empties it into one pocket
    if (id === B.beacon) return Infinity;                // nor a lit beacon (it guards everyone at home)
    if (this.bordersWater(c, y)) return Infinity;      // opening it would flood the dig
    return this.mineTicks(blk, tier);
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
            if ((y - yy <= 3 || this.wet(n, yy)) && this.canStand(n, yy)) relax(n, yy, [], 0);
          }
        }
        // climb one
        if (y + 2 < H && solidUnder(n, y + 1)) relax(n, y + 1, [[c, y + 2], [n, y + 1], [n, y + 2]], 0);
        // stair down one
        if (y > 2 && solidUnder(n, y - 1)) relax(n, y - 1, [[n, y + 1], [n, y], [n, y - 1]], 0);
      }
      // straight down
      if (y > 2 && solidUnder(c, y - 1) && this.get(c, y - 1) !== B.bedrock) relax(c, y - 1, [[c, y - 1]], 0);
      // a ladder: up or down it, a layer a step, nothing to mine
      for (const ny of this.ladderSteps(c, y)) relax(c, ny, [], 0);
    }
    return null;
  }

  // a fall that ends here lands in water (in it, or on it): no damage
  wet(c, y) { return this.get(c, y) === B.water || this.get(c, y - 1) === B.water; }
  // where a body at (c, y) can climb to in its own column: up from a ladder
  // (with headroom), down onto a ladder below
  ladderSteps(c, y, tall = 2) {
    const out = [];
    if (this.get(c, y) === B.ladder && y + tall < H && this.passable(c, y + tall) && this.passable(c, y + 1)) out.push(y + 1);
    if (y > 1 && this.get(c, y - 1) === B.ladder) out.push(y - 1);
    return out;
  }
  firstStep(e, goal, maxNodes) { const p = this.path(e, goal, maxNodes, this.tallOf(e), e.kind !== 'player'); return p && p.length ? p[0] : null; }

  // --------------------------------------------------------------- stream --
  // with more than one player, an action names who took it (a trailing
  // {by}); one-player streams are unchanged
  emit(ev) { if (ev[0] === 'do' && this.players && this.players.length > 1 && this.me) ev.push({ by: this.me.id }); this.ev.push(ev); }
  note(kind, data) { this.emit(data === undefined ? ['note', kind] : ['note', kind, data]); this.flush(); }
  // one stream line per dimension that changed; nether lines carry "d"
  flush() {
    this.dims[this.dim].ev = this.ev;
    for (const [name, d] of Object.entries(this.dims)) {
      if (!d.ev || !d.ev.length) continue;
      this.lines.push(JSON.stringify(name === 'overworld' ? { k: this.tick, e: d.ev } : { k: this.tick, d: name, e: d.ev }));
      d.ev = [];
    }
    this.ev = this.dims[this.dim].ev;
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
// Replay a stream onto freshly generated worlds: the viewer's model, and the
// selftest's proof that the stream carries everything a renderer needs. Each
// dimension has its own blocks, entities and chests; `view` picks which one the
// b / world / ents / chests getters show (the viewer follows its player).
export class Replay {
  constructor(header) {
    const h = typeof header === 'string' ? JSON.parse(header) : header;
    this.header = h;
    const world = generateWorld({ seed: h.seed, shape: h.shape, radius: h.radius, kind: h.kind || 'island', version: h.v || 1 });
    if (worldSignature(world) !== h.sig) throw new Error(`world signature mismatch: stream ${h.sig}, regenerated ${worldSignature(world)} — generator version drift`);
    this.dims = { overworld: { world, b: world.blocks, ents: new Map(), chests: new Map() } };
    this.view = 'overworld';
    this.tick = 0; this.notes = [];
    this.people = new Map();      // player id → { hp, food, inv } (players carry these across dimensions)
    this.focus = 0;               // whose health / food / inventory the HUD shows
  }
  dimState(name) {
    if (!this.dims[name]) {
      const ow = this.dims.overworld.world, h = this.header;
      const world = generateNether({ seed: h.seed, shape: h.shape, tiling: ow.tiling, radius: h.radius, version: h.v || 1 });
      const want = this.notes.find((n) => n.kind === 'dim' && n.data?.name === name)?.data?.sig;
      if (want && worldSignature(world) !== want) throw new Error(`${name} signature mismatch: stream ${want}, regenerated ${worldSignature(world)}`);
      this.dims[name] = { world, b: world.blocks, ents: new Map(), chests: new Map() };
    }
    return this.dims[name];
  }
  get world() { return this.dims[this.view].world; }
  get b() { return this.dims[this.view].b; }
  get ents() { return this.dims[this.view].ents; }
  get chests() { return this.dims[this.view].chests; }
  // which dimension an entity is in (null: none)
  dimOf(id) { for (const [n, d] of Object.entries(this.dims)) if (d.ents.has(id)) return n; return null; }
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
    const D = this.dimState(L.d || 'overworld');
    for (const ev of L.e) {
      switch (ev[0]) {
        case 'b': D.b[ev[1] * H + ev[2]] = ev[3]; break;
        case '+': D.ents.set(ev[1], { id: ev[1], kind: ev[2], c: ev[3], y: ev[4] }); break;
        case '-': D.ents.delete(ev[1]); break;
        case 'p': { const e = D.ents.get(ev[1]); if (e) { e.c = ev[2]; e.y = ev[3]; } break; }
        case 'hp': this.person(ev[1]).hp = ev[2]; break;
        case 'food': this.person(ev[2] ?? 0).food = ev[1]; break;
        case 'air': this.person(ev[1]).air = ev[2]; break;
        case 'wear': { const w = (this.person(ev[1]).wear ||= {}); if (ev[3] == null) delete w[ev[2]]; else w[ev[2]] = ev[3]; break; }
        case 'shorn': { const e = D.ents.get(ev[1]); if (e) e.shorn = !!ev[2]; break; }
        case 'young': { const e = D.ents.get(ev[1]); if (e) e.young = true; break; }
        case 'grown': { const e = D.ents.get(ev[1]); if (e) e.young = false; break; }
        case 'chest': if (ev[3]) D.chests.set(ev[1] * H + ev[2], ev[3]); else D.chests.delete(ev[1] * H + ev[2]); break;
        case 'inv': this.person(ev[2] ?? 0).inv = ev[1]; break;
        case 'note': this.notes.push({ k: L.k, kind: ev[1], data: ev[2], d: L.d || 'overworld' }); break;
      }
    }
    return L.e;
  }
}
