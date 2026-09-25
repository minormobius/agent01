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
//   ["note",kind,…]        anything a caller annotates: macro starts/ends,
//                          Jev's questions and answers (runner.mjs)

import {
  B, BLOCKS, H, SEA, RECIPES, PLACEABLE, recipeBags, PICK_TIER, PICK_SPEED, SWORD_DMG, FOOD,
  generateWorld, worldSignature, mulberry, hash32, blockName,
} from './world.mjs';

export const DAY = 4800;            // ticks per day (~20 min at 4 ticks/s, as Minecraft's)
export const NIGHT_START = 3000;    // [3000, 4800) is night
export const MAX_ZOMBIES = 6;
export const SIGHT = 10;            // how far the player sees, in tile edges

export class Sim {
  constructor(opts = {}) {
    this.world = opts.world || generateWorld(opts);
    const w = this.world;
    this.cols = w.tiling.cols;
    this.b = w.blocks;
    this.N = this.cols.length;
    this.tick = 0;
    this.rng = mulberry(hash32(w.seed, 0x51A));
    this.ents = new Map();
    this.nextId = 0;
    this.torches = new Set();
    this.lines = [];
    this.ev = [];
    this.stats = { deaths: 0, mined: {}, crafted: {}, kills: {}, damageTaken: 0, placed: {} };
    this.seen = new Uint8Array(this.cols.length);
    this.seenCount = 0;
    this.home = null;             // [c, y] once a house is built or a home is set
    this.protect = new Set();     // voxels the planners must not dig (house walls, roof)
    this.lines.push(JSON.stringify({
      t: 'craft', v: w.version, seed: w.seed, shape: w.shape, radius: w.radius, H,
      sig: worldSignature(w), spawn: w.spawn, day: DAY, night: NIGHT_START,
    }));
    this.player = this.spawnEnt('player', w.spawn, w.height[w.spawn] + 1, { hp: 20, food: 20, inv: {} });
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

  // ------------------------------------------------------------ voxels -----
  get(c, y) { return y < 0 ? B.bedrock : y >= H ? B.air : this.b[c * H + y]; }
  solid(c, y) { return BLOCKS[this.get(c, y)].solid; }
  // mob = true for anything that is not the player: a door stops it
  passable(c, y, mob = false) { const k = BLOCKS[this.get(c, y)]; return !(k.solid || (mob && k.mobSolid)); }
  set(c, y, id) {
    const old = this.b[c * H + y];
    if (old === id) return;
    if (old === B.torch) this.torches.delete(c * H + y);
    if (id === B.torch) this.torches.add(c * H + y);
    this.b[c * H + y] = id;
    this.emit(['b', c, y, id]);
  }
  // lowest standable layer above the topmost solid block
  surface(c) {
    for (let y = H - 2; y > 0; y--) if (this.solid(c, y - 1) || this.get(c, y - 1) === B.water) return y;
    return 1;
  }
  skyOpen(c, y) { for (let yy = y; yy < H; yy++) if (this.get(c, yy) !== B.air && this.get(c, yy) !== B.torch) return false; return true; }
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
    if (e === this.player) this.look();
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
    for (const u of ring) if (!this.seen[u]) { this.seen[u] = 1; this.seenCount++; }
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
    if (e === this.player) this.stats.damageTaken += dmg;
    if (e.hp > 0) return;
    this.emit(['die', e.id]);
    if (e === this.player) {
      this.stats.deaths++;
      e.inv = {}; e.hp = 20; e.food = 20;
      this.emit(['inv', {}]); this.emit(['hp', e.id, 20]); this.emit(['food', 20]);
      // respawn at home if there is one (the house is the bed), else at spawn
      if (this.home && this.canStand(this.home[0], this.home[1])) { this.moveEnt(e, this.home[0], this.home[1]); return; }
      const s = this.world.spawn;
      let sy = this.world.height[s] + 1;
      while (sy < H - 2 && !this.canStand(s, sy)) sy++;
      this.moveEnt(e, s, sy);
      return;
    }
    this.stats.kills[e.kind] = (this.stats.kills[e.kind] || 0) + 1;
    if (e.kind === 'pig' && from === this.player) this.give('porkchop', 1 + Math.floor(this.rng() * 2));
    this.removeEnt(e, 'killed');
  }

  // ------------------------------------------------------------- player ----
  get inv() { return this.player.inv; }
  has(item, n = 1) { return (this.inv[item] || 0) >= n; }
  give(item, n) { this.inv[item] = (this.inv[item] || 0) + n; this.emit(['inv', { ...this.inv }]); }
  take(item, n) {
    this.inv[item] -= n;
    if (this.inv[item] <= 0) delete this.inv[item];
    this.emit(['inv', { ...this.inv }]);
  }
  pickTier() { let t = 0; for (const k in PICK_TIER) if (this.has(k)) t = Math.max(t, PICK_TIER[k]); return t; }
  swordDmg() { let d = SWORD_DMG.none; for (const k in SWORD_DMG) if (k !== 'none' && this.has(k)) d = Math.max(d, SWORD_DMG[k]); return d; }
  isNight(t = this.tick) { return (t % DAY) >= NIGHT_START; }

  // voxels a body at (c, y) can touch: below its feet and above its head in
  // its own column, and four layers (feet−1 … head+1) in every neighbour.
  reachable(c, y, tc, ty) {
    if (tc === c) return ty === y - 1 || ty === y + 2;
    return this.cols[c].adj.includes(tc) && ty >= y - 1 && ty <= y + 2;
  }
  reachSet(c = this.player.c, y = this.player.y) {
    const out = [[c, y - 1], [c, y + 2]];
    for (const n of this.cols[c].adj) for (let yy = y - 1; yy <= y + 2; yy++) out.push([n, yy]);
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

  // Run one primitive action to completion. Returns { ok, ticks, why? }.
  // Refusals cost nothing and change nothing — the answer says why.
  act(a) {
    const p = this.player, t0 = this.tick;
    const done = (ok, why) => { this.flush(); return { ok, ticks: this.tick - t0, ...(why ? { why } : {}) }; };
    switch (a.op) {
      case 'move': {
        if (!this.cols[p.c].adj.includes(a.to)) return done(false, 'not a neighbour');
        const y = this.stepTarget(p.c, p.y, a.to, 2, 20);
        if (y == null) return done(false, 'blocked');
        if (this.occupied(a.to, y) || this.occupied(a.to, y + 1)) return done(false, 'occupied');
        this.emit(['do', 'move', a.to]);
        const fall = p.y - y;
        this.moveEnt(p, a.to, y);
        if (fall > 3) this.hurt(p, fall - 3, null);
        this.step();
        return done(true);
      }
      case 'mine': {
        const { c, y } = a;
        if (!this.reachable(p.c, p.y, c, y)) return done(false, 'out of reach');
        const blk = BLOCKS[this.get(c, y)];
        if (blk.hard === Infinity) return done(false, `${blk.name} cannot be mined`);
        const tier = this.pickTier();
        if (blk.tool > tier) return done(false, `${blk.name} needs a ${['', 'wooden', 'stone', 'iron'][blk.tool]} pickaxe or better`);
        const speed = blk.tool ? PICK_SPEED[tier] : 1;
        const ticks = Math.max(1, Math.ceil(blk.hard / speed));
        this.emit(['do', 'mine', c, y, ticks]);
        for (let k = 0; k < ticks; k++) this.step();
        if (this.get(c, y) !== blk.id) return done(false, 'block changed while mining');
        this.set(c, y, this.get(c, y + 1) === B.water || this.cols[c].adj.some((n) => this.get(n, y) === B.water) && y <= SEA ? B.water : B.air);
        this.stats.mined[blk.name] = (this.stats.mined[blk.name] || 0) + 1;
        if (blk.drop) this.give(blk.drop, 1);
        if (blk.id === B.leaves && this.rng() < 1 / 6) this.give('apple', 1);
        this.settle();
        return done(true);
      }
      case 'place': {
        const { c, y, item } = a;
        if (!PLACEABLE.has(item)) return done(false, `${item} does not place`);
        if (!this.has(item)) return done(false, `no ${item}`);
        if (!this.reachable(p.c, p.y, c, y)) return done(false, 'out of reach');
        const cur = this.get(c, y);
        if (cur !== B.air && cur !== B.water) return done(false, `occupied by ${blockName(cur)}`);
        if (this.occupied(c, y)) return done(false, 'an entity is there');
        this.emit(['do', 'place', c, y, item]);
        this.take(item, 1);
        this.set(c, y, B[item]);
        this.stats.placed[item] = (this.stats.placed[item] || 0) + 1;
        this.step();
        return done(true);
      }
      case 'craft': {
        const r = RECIPES[a.item];
        if (!r) return done(false, `no recipe for ${a.item}`);
        if (r.at && !this.near(B[r.at])) return done(false, `needs a ${r.at} nearby`);
        const bag = recipeBags(r).find((g) => Object.entries(g).every(([k, n]) => this.has(k, n)));
        if (!bag) {
          const [k, n] = Object.entries(r.need).find(([k2, n2]) => !this.has(k2, n2));
          return done(false, `needs ${n} ${k}` + (r.alt ? ' (or an alternative)' : ''));
        }
        this.emit(['do', 'craft', a.item]);
        for (const [k, n] of Object.entries(bag)) this.take(k, n);
        this.give(a.item, r.n);
        this.stats.crafted[a.item] = (this.stats.crafted[a.item] || 0) + r.n;
        this.step();
        return done(true);
      }
      case 'eat': {
        if (!FOOD[a.item]) return done(false, `${a.item} is not food`);
        if (!this.has(a.item)) return done(false, `no ${a.item}`);
        if (p.food >= 20) return done(false, 'not hungry');
        this.emit(['do', 'eat', a.item]);
        this.take(a.item, 1);
        p.food = Math.min(20, p.food + FOOD[a.item]);
        this.emit(['food', p.food]);
        for (let k = 0; k < 4; k++) this.step();
        return done(true);
      }
      case 'attack': {
        const t = this.ents.get(a.id);
        if (!t || t === p) return done(false, 'no such target');
        if (!this.adjacentTo(p, t)) return done(false, 'not adjacent');
        this.emit(['do', 'attack', t.id]);
        this.hurt(t, this.swordDmg(), p);
        this.step(); this.step();
        return done(true);
      }
      case 'wait': {
        const n = Math.max(1, Math.min(DAY, a.ticks | 0 || 1));
        for (let k = 0; k < n; k++) this.step();
        return done(true);
      }
      default:
        return done(false, `unknown op ${a.op}`);
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
    const p = this.player, t = this.tick;
    // hunger
    if (t % 480 === 0 && p.food > 0) { p.food--; this.emit(['food', p.food]); }
    if (t % 80 === 0) {
      if (p.food === 0) this.hurt(p, 1, null);
      else if (p.food >= 18 && p.hp < 20) { p.hp++; this.emit(['hp', p.id, p.hp]); }
    }
    if (t % DAY === NIGHT_START) this.emit(['note', 'dusk']);
    if (t % DAY === 0) this.emit(['note', 'dawn']);
    // zombies: spawn at night on open ground, away from torches and the player
    const zs = [...this.ents.values()].filter((e) => e.kind === 'zombie');
    if (this.isNight() && zs.length < MAX_ZOMBIES && this.rng() < 0.03) {
      const c = Math.floor(this.rng() * this.N);
      const y = this.surface(c);
      const d = this.dist(c, p.c);
      if (d >= 10 && d <= 24 && this.get(c, y - 1) !== B.water && this.skyOpen(c, y) && !this.torchNear(c, 5)
          && this.canStand(c, y) && !this.occupied(c, y)) this.spawnEnt('zombie', c, y);
    }
    for (const e of [...this.ents.values()]) {
      if (e === p || !this.ents.has(e.id)) continue;
      if (e.cd > 0) e.cd--;
      if (e.kind === 'zombie') this.zombieTick(e);
      else if (e.kind === 'pig') this.pigTick(e);
    }
    this.flush();
  }
  torchNear(c, r) {
    for (const k of this.torches) if (this.dist(Math.floor(k / H), c) <= r) return true;
    return false;
  }
  zombieTick(z) {
    const p = this.player;
    const d = this.dist(z.c, p.c);
    if (d > 40) return this.removeEnt(z, 'despawn');
    if (!this.isNight() && this.skyOpen(z.c, z.y + 2) && this.tick % 10 === 0) this.hurt(z, 2, null);
    if (!this.ents.has(z.id)) return;
    if (this.adjacentTo(z, p)) {
      if (z.cd <= 0) { this.hurt(p, 3, z); z.cd = 10; }
      return;
    }
    if (this.tick % 2 || d > 20) return;           // half the player's speed; loses interest past 20
    const step = this.firstStep(z, (c, y) => this.cols[c].adj.includes(p.c) && Math.abs(y - p.y) <= 1, 300);
    if (step && !this.occupied(step[0], step[1]) && !this.occupied(step[0], step[1] + 1)) this.moveEnt(z, step[0], step[1]);
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
  path(from, goal, maxNodes = 20000, tall = 2, mob = false) {
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
        const yy = this.stepTarget(c, y, n, tall, 3, mob);
        if (yy == null) continue;
        const k = key(n, yy);
        if (!prev.has(k)) { prev.set(k, u); q.push(k); }
      }
    }
    return null;
  }
  bordersWater(c, y) {
    if (this.get(c, y + 1) === B.water) return true;
    for (const n of this.cols[c].adj) if (this.get(n, y) === B.water) return true;
    return false;
  }

  // Ticks to clear voxel (c, y) for walking through it: 0 if already clear,
  // Infinity if it cannot or must not be mined (bedrock, water, too hard for
  // the pick, a station we would lose).
  clearCost(c, y, tier) {
    if (y < 0 || y >= H) return Infinity;
    const id = this.get(c, y);
    const blk = BLOCKS[id];
    if (!blk.solid) return id === B.water ? Infinity : 0;
    if (blk.hard === Infinity || blk.tool > tier) return Infinity;
    if (id === B.crafting_table || id === B.furnace) return Infinity;
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
        const occ = this.occupied(nc, ny) || this.occupied(nc, ny + 1);
        if (occ && occ !== from) return;                 // route around mobs, not through them
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

// Replay a stream onto a freshly generated world: the viewer's model, and the
// selftest's proof that the stream carries everything a renderer needs.
export class Replay {
  constructor(header) {
    const h = typeof header === 'string' ? JSON.parse(header) : header;
    this.header = h;
    this.world = generateWorld({ seed: h.seed, shape: h.shape, radius: h.radius });
    if (worldSignature(this.world) !== h.sig) throw new Error(`world signature mismatch: stream ${h.sig}, regenerated ${worldSignature(this.world)} — generator version drift`);
    this.b = this.world.blocks;
    this.ents = new Map();
    this.tick = 0; this.hp = 20; this.food = 20; this.inv = {}; this.notes = [];
  }
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
        case 'hp': if (ev[1] === 0) this.hp = ev[2]; break;
        case 'food': this.food = ev[1]; break;
        case 'inv': this.inv = ev[1]; break;
        case 'note': this.notes.push({ k: L.k, kind: ev[1], data: ev[2] }); break;
      }
    }
    return L.e;
  }
}
