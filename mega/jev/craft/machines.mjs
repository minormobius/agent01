// craft/machines.mjs — what runs without a player: furnaces and hoppers that
// hold items, redstone power along the tile graph, pistons, observers, sugar
// cane that grows, and minecarts on rails.
//
// Installed onto Sim.prototype (sim.mjs), so `this` is the sim, in whichever
// dimension is current. Everything here is deterministic: power is recomputed
// from the blocks alone, and timed changes (a repeater's delay, a button's
// press, an observer's pulse) go through `this.sched`, keyed by tick.
//
// POWER ON A GRAPH. Minecraft's dust runs along a square grid and loses one
// level a block. Here it runs along the tiling: a wire at (c, y) connects to
// wire in any neighbouring column at y, y+1 or y-1, and loses one level a hop,
// so a Penrose circuit's reach is 15 hops of Penrose. A source (a lever
// thrown, a button pressed, a plate stood on, a redstone torch, a block of
// redstone) powers the wire and the parts beside it: its own column above and
// below, and every neighbouring column at its layer. A part (a lamp, a piston,
// a powered rail, a hopper) is powered when anything beside it is a source or
// a live wire. Repeaters and observers are directional: a repeater takes power
// from the voxel behind it and gives full power to the voxel it faces, a tick
// later; an observer watches the voxel it faces and pulses the one behind it.
// "Behind", on a tiling, is the neighbour most nearly opposite the face.

import { B, BLOCKS, H, SMELT, FURNACES, smeltsIn, FUEL, XP_SMELT, roomFor, stackSize, slotsUsed } from './world.mjs';

export const HOPPER_SLOTS = 5;
export const HOPPER_EVERY = 2;     // a hopper moves an item every 2 ticks (Minecraft's 8 game ticks)
export const CANE_TICKS = 1200;    // sugar cane grows a piece in about this many ticks
export const CANE_MAX = 3;
export const BUTTON_TICKS = 10;
export const PUSH_LIMIT = 12;
export const MOMENTUM = 32;        // tiles a cart coasts from a powered rail on the flat (a climb costs 4)
export const CART_SPEED = 2;       // tiles a tick: twice walking pace, as Minecraft's cart is to a walk
// momentum a rail tile costs: a climb 4, the flat 1, a drop nothing (a cart gathers speed going down)
export const railCost = (dy) => dy > 0 ? 4 : dy < 0 ? 0 : 1;

const FURNACE_IDS = new Set([B.furnace, B.smoker, B.blast_furnace]);
// what a piston can never move
const IMMOVABLE = new Set([B.bedrock, B.obsidian, B.portal, B.beacon, B.chest, B.furnace, B.smoker, B.blast_furnace, B.hopper, B.anvil, B.enchanting_table,
  B.piston, B.piston_on, B.piston_head, B.observer, B.observer_on, B.lava, B.bed]);
// what a piston breaks instead of pushing (it drops, as Minecraft's does)
const breaksWhenPushed = (id) => { const k = BLOCKS[id]; return !k.solid && !k.hazard && id !== B.water && id !== B.air && id !== B.portal; };

export const Machines = {
  // ------------------------------------------------------------- geometry ---
  // the neighbour of `cur` most nearly straight on from `prev` → `cur`
  straightOn(prev, cur) {
    const P = this.cols[prev], C = this.cols[cur];
    const dx = C.x - P.x, dz = C.z - P.z, L = Math.hypot(dx, dz) || 1;
    let best = null, bd = -Infinity;
    for (const n of C.adj) {
      if (n === prev) continue;
      const N = this.cols[n], ex = N.x - C.x, ez = N.z - C.z, M = Math.hypot(ex, ez) || 1;
      const d = (dx * ex + dz * ez) / (L * M);
      if (d > bd) { bd = d; best = n; }
    }
    return bd > 0.3 ? best : null;
  },
  // the neighbour of `c` most nearly opposite `n`
  oppositeOf(c, n) {
    const C = this.cols[c], F = this.cols[n], dx = F.x - C.x, dz = F.z - C.z, L = Math.hypot(dx, dz) || 1;
    let best = null, bd = Infinity;
    for (const m of C.adj) {
      if (m === n) continue;
      const M = this.cols[m], ex = M.x - C.x, ez = M.z - C.z, K = Math.hypot(ex, ez) || 1;
      const d = (dx * ex + dz * ez) / (L * K);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  },
  // the voxel behind a part at k that faces voxel f (same column: the other side)
  backOf(k, f) {
    const c = Math.floor(k / H), y = k % H, fc = Math.floor(f / H), fy = f % H;
    if (fc === c) { const by = 2 * y - fy; return by >= 0 && by < H ? c * H + by : null; }
    const b = this.oppositeOf(c, fc);
    return b == null ? null : b * H + y;
  },
  // the next voxel along the line from k through f (a piston's push)
  onFrom(k, f) {
    const c = Math.floor(k / H), y = k % H, fc = Math.floor(f / H), fy = f % H;
    if (fc === c) { const ny = 2 * fy - y; return ny >= 0 && ny < H ? c * H + ny : null; }
    const n = this.straightOn(c, fc);
    return n == null ? null : n * H + fy;
  },
  // a valid face for a part at (c, y): a neighbour at its layer, or its own column above or below
  faceOk(c, y, fc, fy, item) {
    if (fc === c) return (fy === y - 1 || fy === y + 1) && item !== 'repeater' && !(item === 'hopper' && fy === y + 1);
    return fy === y && this.cols[c].adj.includes(fc);
  },
  // the six-ish voxels beside k: its column above and below, each neighbouring column at its layer
  besides(k) {
    const c = Math.floor(k / H), y = k % H, out = [];
    if (y > 0) out.push(k - 1);
    if (y < H - 1) out.push(k + 1);
    for (const n of this.cols[c].adj) out.push(n * H + y);
    return out;
  },
  // wire joins wire in a neighbouring column one layer up or down, too
  wireLinks(k) {
    const c = Math.floor(k / H), y = k % H, out = [];
    for (const n of this.cols[c].adj) for (const yy of [y, y + 1, y - 1]) if (yy >= 0 && yy < H) out.push(n * H + yy);
    return out;
  },

  // ---------------------------------------------------------------- power ---
  isSourceOn(k) { const b = BLOCKS[this.b[k]]; return b.redstone === 'source' && !!b.on; },
  recomputePower() {
    const R = this.redstone;
    const out = new Map();      // voxel → power pushed into it by a repeater's front or an observer's back
    for (const k of R) {
      const id = this.b[k];
      if ((id === B.repeater_on || id === B.observer_on) && this.facing.has(k)) {
        const f = this.facing.get(k), t = id === B.repeater_on ? f : this.backOf(k, f);
        if (t != null) out.set(t, 15);
      }
    }
    const lvl = new Map(), buckets = Array.from({ length: 16 }, () => []);
    for (const k of R) {
      if (this.b[k] !== B.wire) continue;
      let L = out.get(k) || 0;
      if (!L) for (const m of this.besides(k)) if (this.isSourceOn(m)) { L = 15; break; }
      if (L) { lvl.set(k, L); buckets[L].push(k); }
    }
    for (let L = 15; L > 1; L--) for (const k of buckets[L]) {
      if (lvl.get(k) !== L) continue;
      for (const m of this.wireLinks(k)) if (this.b[m] === B.wire && (lvl.get(m) || 0) < L - 1) { lvl.set(m, L - 1); buckets[L - 1].push(m); }
    }
    this.power = lvl;
    const poweredAt = (k) => (out.get(k) || 0) > 0 || this.besides(k).some((m) => this.isSourceOn(m) || (lvl.get(m) || 0) > 0);
    const changes = [];
    for (const k of R) {
      const id = this.b[k], c = Math.floor(k / H), y = k % H;
      if (id === B.redstone_lamp || id === B.redstone_lamp_on) { const on = poweredAt(k); if (on !== (id === B.redstone_lamp_on)) changes.push([c, y, on ? B.redstone_lamp_on : B.redstone_lamp]); }
      else if (id === B.powered_rail || id === B.powered_rail_on) { const on = poweredAt(k); if (on !== (id === B.powered_rail_on)) changes.push([c, y, on ? B.powered_rail_on : B.powered_rail]); }
      else if (id === B.hopper) { const on = poweredAt(k); if (on) this.locked.add(k); else this.locked.delete(k); }
      else if (id === B.piston || id === B.piston_on) {
        const on = poweredAt(k);
        if (on && id === B.piston) changes.push(['extend', k]);
        else if (!on && id === B.piston_on) changes.push(['retract', k]);
      } else if (id === B.repeater || id === B.repeater_on) {
        const f = this.facing.get(k), back = f != null ? this.backOf(k, f) : null;
        const on = (out.get(k) || 0) > 0 || (back != null && (this.isSourceOn(back) || (lvl.get(back) || 0) > 0 || this.b[back] === B.redstone_block));
        if (on !== (id === B.repeater_on)) this.schedule(1, k, on ? B.repeater_on : B.repeater, id);
      }
    }
    for (const ch of changes) {
      if (ch[0] === 'extend') this.extendPiston(ch[1]);
      else if (ch[0] === 'retract') this.retractPiston(ch[1]);
      else this.set(ch[0], ch[1], ch[2]);
    }
  },
  // a timed change: at tick+dt, voxel k becomes `id` if it is still `expect`
  schedule(dt, k, id, expect) {
    const t = this.tick + dt;
    if (this.sched.some((s) => s.t === t && s.k === k && s.id === id)) return;
    this.sched.push({ t, k, id, expect });
  },
  runSchedule(t) {
    if (!this.sched.length) return;
    const due = this.sched.filter((s) => s.t <= t);
    if (!due.length) return;
    this.sched = this.sched.filter((s) => s.t > t);
    for (const s of due) if (this.b[s.k] === s.expect) this.set(Math.floor(s.k / H), s.k % H, s.id);
  },
  // pressure plates: on while anything (not an item) stands on one
  platesTick() {
    for (const k of this.redstone) {
      const id = this.b[k];
      if (id !== B.plate && id !== B.plate_on) continue;
      const c = Math.floor(k / H), y = k % H;
      const on = !!this.occupied(c, y);
      if (on !== (id === B.plate_on)) this.set(c, y, on ? B.plate_on : B.plate);
    }
  },
  redstoneTick(t) {
    this.runSchedule(t);
    if (this.redstone.size) this.platesTick();
    for (let pass = 0; pass < 4 && this.rsDirty; pass++) { this.rsDirty = false; this.recomputePower(); }
  },

  // -------------------------------------------------------------- pistons ---
  extendPiston(k) {
    const f = this.facing.get(k);
    if (f == null) return false;
    const chain = [];
    let X = f, prev = k, breakAt = null;
    for (let i = 0; i <= PUSH_LIMIT; i++) {
      if (X == null) return false;
      const id = this.b[X], xc = Math.floor(X / H), xy = X % H;
      if (this.occupied(xc, xy)) return false;             // bodies are not pushed: the head will not go into one
      if (id === B.air || id === B.water) break;
      if (breaksWhenPushed(id)) { breakAt = X; break; }
      if (IMMOVABLE.has(id) || BLOCKS[id].hard === Infinity || i === PUSH_LIMIT) return false;
      chain.push(X);
      const nx = this.onFrom(prev, X);
      prev = X; X = nx;
    }
    // what it breaks is knocked on past it (a line on a tiling: the tile most nearly straight on)
    if (breakAt != null) {
      const past = this.onFrom(prev, breakAt), side = past != null && this.passable(Math.floor(past / H), past % H) ? past : breakAt;
      this._knockTo = side;                 // cane above it, falling now, lands on the same side
      this.breakDrop(breakAt, side);
      this._knockTo = null;
    }
    // move the chain one along, far end first
    let dst = breakAt ?? X, last = chain.length ? chain[chain.length - 1] : k;
    for (let i = chain.length - 1; i >= 0; i--) {
      const src = chain[i], to = i === chain.length - 1 ? dst : chain[i + 1];
      this.set(Math.floor(to / H), to % H, this.b[src]);
      void last;
    }
    this.set(Math.floor(f / H), f % H, B.piston_head);
    this.set(Math.floor(k / H), k % H, B.piston_on);
    this.stats.pushes = (this.stats.pushes || 0) + 1;
    return true;
  },
  retractPiston(k) {
    const f = this.facing.get(k);
    if (f != null && this.b[f] === B.piston_head) this.set(Math.floor(f / H), f % H, B.air);
    if (this.b[k] === B.piston_on) this.set(Math.floor(k / H), k % H, B.piston);
  },
  // a block broken by the world, not a player: what it drops falls to the
  // ground below `at` (where it was, or — pushed by a piston — the tile past it)
  breakDrop(k, at = k) {
    const c = Math.floor(k / H), y = k % H, blk = BLOCKS[this.b[k]];
    this.set(c, y, B.air);
    if (blk.drop) {
      const dc = Math.floor(at / H);
      let g = at % H;
      if (!this.passable(dc, g)) g = y;
      while (g > 1 && this.passable(dc, g - 1) && !this.supported(dc, g)) g--;
      this.dropItems(dc, g, { [blk.drop]: blk.dropN || 1 });
    }
    if (blk.id === B.sugar_cane) this.stats.caneBroken = (this.stats.caneBroken || 0) + 1;
  },

  // ---------------------------------------------------------- sugar cane ---
  canePlaceable(c, y) {
    const below = this.get(c, y - 1);
    if (below === B.sugar_cane) return true;
    if (![B.sand, B.grass, B.dirt].includes(below)) return false;
    return this.cols[c].adj.some((n) => this.get(n, y - 1) === B.water);
  },
  caneTick() {
    for (const k of [...this.canes]) {
      if (this.b[k] !== B.sugar_cane) { this.canes.delete(k); continue; }
      const c = Math.floor(k / H), y0 = k % H;
      let top = y0;
      while (top + 1 < H && this.b[c * H + top + 1] === B.sugar_cane) top++;
      if (top - y0 + 1 >= CANE_MAX || top + 1 >= H || this.b[c * H + top + 1] !== B.air || this.occupied(c, top + 1)) continue;
      if (this.rngMech() >= 20 / CANE_TICKS) continue;
      this.set(c, top + 1, B.sugar_cane);
    }
  },
  // cane that has lost what held it up breaks, and so does all of it above
  caneFall(c, y, at = null) {
    while (y < H && this.b[c * H + y] === B.sugar_cane && !this.canePlaceable(c, y)) { this.breakDrop(c * H + y, at != null ? Math.floor(at / H) * H + y : c * H + y); y++; }
  },

  // ----------------------------------------------------------- containers ---
  furnaceState(k) { return this.furnaces.get(k); },
  emitFurnace(k) {
    const f = this.furnaces.get(k);
    this.emit(['furnace', Math.floor(k / H), k % H, f ? { in: f.in, fuel: f.fuel, out: f.out, lit: f.burn > 0 && !!f.in } : null]);
  },
  // put one or more of `item` into a container at k (chest, hopper, furnace).
  // `slot` is for a furnace: 'in' or 'fuel'. Returns how many went in.
  insert(k, item, n, slot = null) {
    const id = this.b[k];
    if (id === B.chest || id === B.hopper) {
      const box = id === B.chest ? this.chests.get(k) : this.hoppers.get(k);
      if (!box) return 0;
      const room = id === B.chest ? roomFor(box, item) : hopperRoom(box, item);
      const m = Math.min(n, room);
      if (m > 0) { box[item] = (box[item] || 0) + m; this.emit(['chest', Math.floor(k / H), k % H, { ...box }]); }
      return m;
    }
    if (FURNACE_IDS.has(id)) {
      const f = this.furnaces.get(k), kind = BLOCKS[id].name;
      const s = slot || (FUEL[item] && !SMELT[item] ? 'fuel' : 'in');
      if (s === 'in' && !smeltsIn(kind, item)) return 0;
      if (s === 'fuel' && (!FUEL[item] || item === 'lava_bucket')) return 0;
      const cur = f[s];
      if (cur && cur[0] !== item) return 0;
      const m = Math.min(n, 64 - (cur ? cur[1] : 0));
      if (m > 0) { f[s] = [item, (cur ? cur[1] : 0) + m]; this.emitFurnace(k); }
      return m;
    }
    return 0;
  },
  // take from a container: a chest or hopper gives what is asked; a furnace only its output
  extract(k, item, n) {
    const id = this.b[k];
    if (id === B.chest || id === B.hopper) {
      const box = id === B.chest ? this.chests.get(k) : this.hoppers.get(k);
      const m = Math.min(n, (box && box[item]) || 0);
      if (m > 0) { box[item] -= m; if (!box[item]) delete box[item]; this.emit(['chest', Math.floor(k / H), k % H, { ...box }]); }
      return m;
    }
    if (FURNACE_IDS.has(id)) {
      const f = this.furnaces.get(k);
      if (!f.out || f.out[0] !== item) return 0;
      const m = Math.min(n, f.out[1]);
      f.out = f.out[1] - m ? [item, f.out[1] - m] : null;
      this.emitFurnace(k);
      return m;
    }
    return 0;
  },
  contents(k) {
    const id = this.b[k];
    if (id === B.chest) return this.chests.get(k) || {};
    if (id === B.hopper) return this.hoppers.get(k) || {};
    if (FURNACE_IDS.has(id)) { const f = this.furnaces.get(k); return f && f.out ? { [f.out[0]]: f.out[1] } : {}; }
    return null;
  },
  furnaceTick() {
    for (const [k, f] of this.furnaces) {
      if (!f.in) { f.prog = 0; continue; }
      const kind = BLOCKS[this.b[k]].name, input = f.in[0], output = SMELT[input];
      if (!smeltsIn(kind, input)) continue;
      if (f.out && (f.out[0] !== output || f.out[1] >= 64)) continue;
      if (f.burn <= 0) {
        if (!f.fuel) continue;
        f.burn += FUEL[f.fuel[0]];
        f.fuel = f.fuel[1] > 1 ? [f.fuel[0], f.fuel[1] - 1] : null;
        this.emitFurnace(k);
      }
      if (++f.prog < FURNACES[kind].ticks) continue;
      f.prog = 0; f.burn--;
      f.in = f.in[1] > 1 ? [input, f.in[1] - 1] : null;
      f.out = [output, (f.out ? f.out[1] : 0) + 1];
      f.xp += XP_SMELT[output] || 0;
      this.stats.smelted = this.stats.smelted || {};
      this.stats.smelted[output] = (this.stats.smelted[output] || 0) + 1;
      this.emitFurnace(k);
    }
  },
  hopperTick() {
    for (const [k, box] of this.hoppers) {
      if (this.locked.has(k)) continue;
      const c = Math.floor(k / H), y = k % H;
      // push one item into what it faces
      const t = this.facing.has(k) ? this.facing.get(k) : k - 1;
      if (this.contents(t) != null) {
        const slot = FURNACE_IDS.has(this.b[t]) ? (t === k - 1 ? 'in' : 'fuel') : null;
        for (const item of Object.keys(box).sort()) {
          if (this.insert(t, item, 1, slot)) {
            box[item]--; if (!box[item]) delete box[item];
            this.emit(['chest', c, y, { ...box }]);
            break;
          }
        }
      }
      // pull one from the container above (a furnace gives only its output)
      const up = k + 1;
      if (y + 1 < H && this.contents(up) != null && this.b[up] !== B.hopper) {
        const have = this.contents(up);
        for (const item of Object.keys(have).sort()) {
          if (hopperRoom(box, item) <= 0) continue;
          if (this.extract(up, item, 1)) { box[item] = (box[item] || 0) + 1; this.emit(['chest', c, y, { ...box }]); break; }
        }
      }
      // and what lies on top of it
      for (const e of [...this.ents.values()]) {
        if (e.kind !== 'item' || e.c !== c || e.y !== y + 1) continue;
        let moved = false;
        for (const [item, n] of Object.entries(e.items)) {
          const m = Math.min(n, hopperRoom(box, item));
          if (m <= 0) continue;
          box[item] = (box[item] || 0) + m; e.items[item] -= m; if (!e.items[item]) delete e.items[item];
          moved = true;
        }
        if (moved) {
          this.emit(['chest', c, y, { ...box }]);
          if (!Object.keys(e.items).length) this.removeEnt(e, 'hopper');
        }
      }
    }
  },

  // ---------------------------------------------------------------- rails ---
  // the rail voxels a cart at (c, y) can move to next, not back to `from`
  railLinks(c, y, fromC = -1) {
    const out = [];
    for (const n of this.cols[c].adj) {
      if (n === fromC) continue;
      for (const yy of [y, y + 1, y - 1]) if (yy > 0 && yy < H && BLOCKS[this.get(n, yy)].rail) { out.push([n, yy]); break; }
    }
    return out;
  },
  // the line of rails from (c, y), heading first to column `toward`: at a
  // fork, the one most nearly straight on
  railLine(c, y, toward, max = 400) {
    const first = this.railLinks(c, y).find(([n]) => n === toward);
    if (!first) return [];
    const line = [first];
    let prevC = c;
    while (line.length < max) {
      const [lc, ly] = line[line.length - 1];
      const next = this.railLinks(lc, ly, prevC);
      if (!next.length) break;
      const straight = this.straightOn(prevC, lc);
      const pick = next.find(([n]) => n === straight) || (next.length === 1 ? next[0] : null);
      if (!pick) break;
      if (line.some(([a, b]) => a === pick[0] && b === pick[1])) break;   // a loop: once round
      prevC = lc;
      line.push(pick);
    }
    return line;
  },
};

// a hopper holds HOPPER_SLOTS stacks
function hopperRoom(box, item) {
  const ss = stackSize(item), have = box[item] || 0;
  const partial = have % ss ? ss - (have % ss) : 0;
  return partial + Math.max(0, HOPPER_SLOTS - slotsUsed(box)) * ss;
}
export { hopperRoom };
