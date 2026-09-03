// bismuth — the worms. A second wave of agents, released INTO the crystal:
// ghosts of the masonry that tunnel from brick to brick along the bonds the
// masons made, and now and then take a brick with them. Sandworms, at the
// scale of a few bricks. They are a small effect by design — a worm bites
// with probability `bite` per move and moves `speed` sites per tick, so a
// wave of three (count × speed × bite ≈ 0.002 bricks a tick) eats an order
// of magnitude slower than a colony lays (≈ 0.02 a tick) — and
// the two together are a question the playground can ask: with `recycle`
// on, every brick a worm eats returns to the melt as one more brick of
// budget for whatever colony is still growing, so the system eats its own
// tail. It does not make growth perpetual: a colony that has begun its
// cool-down is past feeding, and a worm cannot un-cool it. But while a
// colony is live the crystal is a steady state of laying and erosion, and
// the worms hollow it from within.
//
// Deterministic like everything else: one stream, stream(seed, "worms"),
// integer choices only. A release, a move, a bite are all replays of that
// stream, so a playground with worms is still a permalink.
//
// A worm's world is the substrate's bond graph: on the cubic lattice the
// six face-neighbours, on a prism tiling the edge-neighbours and the layer
// above and below. It prefers to stay inside the crystal (any occupied
// neighbour), never reverses if it can help it, and when it finds itself
// in the void — its own bite took the floor, or another worm's did — it
// drifts along cells that touch a brick; from open void it heads for the
// crystal's centroid, and if that finds nothing (a hopper's centroid is its
// pit) it sinks into the masonry somewhere else — it is a ghost.

import { stream } from "./prng.js";
import { GRIDSIZE as G } from "./crystal.js";

export const DEFAULT_WORMS = {
  count: 3,        // worms per release
  speed: 0.04,     // sites per tick
  bite: 0.015,     // chance the site a worm leaves goes with it
  length: 7,       // segments drawn behind the head
  recycle: false,  // a bitten brick feeds the live colony one brick of budget
};

export class Worm {
  constructor(id, site) {
    this.id = id;
    this.site = site;
    this.prev = -1;
    this.acc = 0;
    this.trail = [site];
    this.eaten = 0;
    this.moves = 0;
    this.lost = 0;                                  // moves spent in open void
  }
}

export class Worms {
  constructor(growth, opts = {}, seed) {
    this.growth = growth;
    this.sub = growth.sub;
    this.opts = Object.assign({}, DEFAULT_WORMS, opts);
    this.rng = stream(seed === undefined ? growth.genome.seed : seed, "worms");
    this.worms = [];
    this.nextId = 0;
    this.eaten = 0;
    this.recycled = 0;
    this.released = 0;
    this.tick = 0;
    this._cand = new Int32Array(64);
    this._void = new Int32Array(64);
    this._all = new Int32Array(64);
    this._nall = 0;
  }

  // A wave: `n` worms at random bricks of the crystal as it stands. Returns
  // how many found a brick to start in.
  release(n = this.opts.count) {
    const br = this.growth.bricks, sub = this.sub;
    if (!br.length) return 0;
    let made = 0;
    for (let i = 0; i < n; i++) {
      const s = this.somewhere();
      if (s >= 0) { this.worms.push(new Worm(this.nextId++, s)); made++; }
    }
    this.released += made;
    return made;
  }

  // a random brick still standing, or -1
  somewhere() {
    const br = this.growth.bricks, sub = this.sub;
    for (let tries = 0; tries < 24 && br.length; tries++) {
      const b = br[Math.floor(this.rng() * br.length)];
      const s = b.tile !== undefined ? sub.siteAt({ tile: b.tile, z: b.z }) : sub.siteAt({ x: b.x, y: b.y, z: b.z });
      if (s >= 0 && sub.occ[s]) return s;
    }
    return -1;
  }

  clear() { this.worms.length = 0; }

  // the bond-graph neighbours of a site: occupied ones into `out`, empty
  // ones that touch a brick into `voids`, every in-bounds one into `all`;
  // returns nOcc·256 + nVoid (and this._nall)
  neighbours(s, out, voids) {
    const sub = this.sub, all = this._all;
    let no = 0, nv = 0, na = 0;
    const take = (q) => { all[na++] = q; if (sub.occ[q]) out[no++] = q; else if (sub.nb[q]) voids[nv++] = q; };
    if (sub.kind === "prism") {
      const n = sub.n, T = sub.T, t = s % n, z = (s - t) / n;
      if (z > 1) take(s - n);
      if (z + 1 < sub.Z - 1) take(s + n);
      for (let k = T.nbrStart[t]; k < T.nbrStart[t + 1]; k++) take(z * n + T.nbrList[k]);
    } else {
      const x = s % G, y = ((s - x) / G) % G, z = (s / (G * G)) | 0;
      if (x > 1) take(s - 1);
      if (x < G - 2) take(s + 1);
      if (y > 1) take(s - G);
      if (y < G - 2) take(s + G);
      if (z > 1) take(s - G * G);
      if (z < G - 2) take(s + G * G);
    }
    this._nall = na;
    return no * 256 + nv;
  }

  // from open void: the neighbour nearest the crystal's centre of mass
  homeward(w) {
    const sub = this.sub, n = sub.count || 1;
    const cx = sub.sx / n, cy = sub.sy / n, cz = sub.sz / n;     // prism accumulators are fixed-point x, y; describe() is in edge lengths
    const k = sub.kind === "prism" ? 1 / 1024 : 1;
    let best = -1, bd = Infinity;
    for (let i = 0; i < this._nall; i++) {
      const q = this._all[i], d = sub.describe(q);
      const dx = d.x - cx * k, dy = d.y - cy * k, dz = d.z - cz;
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < bd && q !== w.prev) { bd = dist; best = q; }
    }
    return best;
  }

  step(ticks = 1) {
    for (let k = 0; k < ticks; k++) {
      this.tick++;
      for (const w of this.worms) {
        w.acc += this.opts.speed;
        while (w.acc >= 1) { w.acc -= 1; this.move(w); }
      }
    }
  }

  move(w) {
    const packed = this.neighbours(w.site, this._cand, this._void);
    const no = packed >> 8, nv = packed & 255;
    let next = -1;
    if (no > 0) {
      let k = Math.floor(this.rng() * no);
      next = this._cand[k];
      if (no > 1 && next === w.prev) next = this._cand[(k + 1) % no];   // don't turn straight back
    } else if (nv > 0) {
      next = this._void[Math.floor(this.rng() * nv)];                   // drift along the crystal's skin
    } else if (++w.lost > 24) {
      // lost in open void: a ghost sinks into the masonry somewhere else
      const s = this.somewhere();
      if (s < 0) return;
      w.lost = 0; w.prev = -1; w.site = s; w.trail.length = 0; w.trail.push(s); w.moves++;
      return;
    } else {
      next = this.homeward(w);                                          // open void: head for the crystal
    }
    if (next < 0) return;
    if (no > 0 || nv > 0) w.lost = 0;
    // the bite: the brick it leaves goes with it, sometimes
    if (this.sub.occ[w.site] && this.rng() < this.opts.bite) {
      if (this.growth.remove(w.site)) {
        this.eaten++; w.eaten++;
        if (this.opts.recycle) this.recycle();
      }
    }
    w.prev = w.site;
    w.site = next;
    w.moves++;
    w.trail.push(next);
    while (w.trail.length > Math.max(1, this.opts.length | 0)) w.trail.shift();
  }

  // the eaten brick's matter goes back into the melt: the youngest colony
  // still growing gets one more brick before its budget is spent
  recycle() {
    const cols = this.growth.colonies;
    for (let i = cols.length - 1; i >= 0; i--) {
      const c = cols[i];
      if (!c.done && !c.cooling) { c.laid = Math.max(0, c.laid - 1); this.recycled++; return true; }
    }
    return false;
  }

  // segments for the renderer: [x, y, z, fade] per trail cell, head brightest
  positions() {
    const out = [], sub = this.sub, mo = sub.moteOffset;
    for (const w of this.worms) {
      const L = w.trail.length;
      for (let i = 0; i < L; i++) {
        const d = sub.describe(w.trail[i]);
        out.push([d.x + mo[0], d.y + mo[1], d.z + mo[2], i === L - 1 ? 1 : 0.15 + 0.7 * (i / L)]);
      }
    }
    return out;
  }

  stats() {
    return { worms: this.worms.length, eaten: this.eaten, recycled: this.recycled, released: this.released, tick: this.tick };
  }
}
