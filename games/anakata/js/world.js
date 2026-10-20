/* Anakata — the world and its rules, with no DOM, so node can solve it.

   Space is a small 4D grid of cells (x, y, z, w). z is up: gravity pulls
   along −z. You walk in x and y (and climb a step), you fall in z, and you
   never step in w. Charles Howard Hinton named the two directions of w ana
   (+w) and kata (−w).

   What you can do in w is hook. The hook flies in a straight line along any
   axis you can see (x, y, or w, once you turn your sight to show it) and
   catches on the first thing in its way, at most RANGE cells off:
     an anchor   pulls YOU to the cell before it;
     a crate     comes to YOU, to the cell next to you;
     anything else, or nothing, and it comes back empty.
   Then everything falls. So the hook is a way through w: to a slice where
   the wall has a gap, or bringing a crate out of a slice where it's no use
   into one where it is.

   The other way through w is a RAMP: a floor tilted between x (or y) and w,
   like a staircase whose steps go ana instead of up. The rule is one line:
   on a ramp, the floor continues one slice over. You walk as usual while
   there's floor ahead in your slice; when there isn't, and you're standing
   on a ramp or stepping onto one, the step carries you one slice along w
   as well, the way the ramp leans. So a run of ramp tiles is a diagonal path
   through the x-w plane, walkable both ways. Crates don't take ramps.

   A world can WRAP in w: slice W−1 and slice 0 are neighbours, the way the
   two ends of a ring are. Then a ramp can climb ana for ever (a loop of
   them round a room is a true Penrose staircase), ana three times can be
   kata once, and the hook flies round w (coming back empty if it would
   reach you). Only the neighbour table knows: everything else follows.

   A world can also have GRAVITY IN W (gravW, Anabasis's worlds): w is a
   second down, so things fall along −z and along −w (kata), and you rest
   only where you're held from below AND from kata, in a corner of the z-w
   plane. Walking into a block you climb onto it in z or ana onto it in w,
   whichever holds you. Off the kata end of the world you fall out, as off
   the bottom; round a wrapped w with nothing to land on, you fall for ever,
   which loses you the level just the same.

   Cells: empty, solid, anchor (a solid you can hook), plate (a solid you
   can press by standing on it or leaving a crate on it), door (solid until
   every plate in the world is pressed, or while something stands in it),
   goal (empty; reach it to win). Crates are movable: walk into one to push
   it (if the cell beyond is free), hook it to pull it, stand on it.
   Falling out of the bottom of the world (z < 0) loses you the level; a
   crate that falls out is gone.

   A state is where you are and where the crates are; the rest is fixed or
   follows from those (the doors), so a breadth-first search over states is
   an exact solver. */

export const EMPTY = 0, SOLID = 1, ANCHOR = 2, PLATE = 3, DOOR = 4, GOAL = 5;
/* w-ramps: floor tiles tilted between a walking axis and w. RAMPS[type] =
   { axis, s }: walking +axis off (or onto) one carries you s along w */
export const RAMP_XA = 6, RAMP_XK = 7, RAMP_YA = 8, RAMP_YK = 9;
export const RAMPS = { 6: { axis: 0, s: 1 }, 7: { axis: 0, s: -1 }, 8: { axis: 1, s: 1 }, 9: { axis: 1, s: -1 } };
export const RANGE = 6;
export const AXES = ["x", "y", "z", "w"];
/* the moves: walking ±x ±y, and the hook along ±x ±y ±w */
export const WALKS = [[1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, 0], [0, -1, 0, 0]];
export const HOOKS = [[1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, 0], [0, -1, 0, 0], [0, 0, 0, 1], [0, 0, 0, -1]];
export const ACTIONS = WALKS.map((d) => ({ kind: "walk", d })).concat(HOOKS.map((d) => ({ kind: "hook", d })));

/* ---------------------------------------------------------------- levels
   A level is written as text, one block per w-slice (w = 0 first), each block
   Y rows (y = 0 first), each row the Z layers side by side (z = 0 first),
   X cells each, separated by spaces:
     #  solid     A  anchor    P  plate     D  door
     .  empty     G  goal      C  a crate   @  you (start)
     > < v ^  ramps, the arrow pointing the way that goes ana: > (+x is
              ana), < (−x is ana), v (+y is ana), ^ (−y is ana)          */
const CH = { ".": EMPTY, "#": SOLID, A: ANCHOR, P: PLATE, D: DOOR, G: GOAL, C: EMPTY, "@": EMPTY, ">": RAMP_XA, "<": RAMP_XK, v: RAMP_YA, "^": RAMP_YK };

export function parse(def) {
  const blocks = def.map.trim().split(/\n\s*\n/).map((b) => b.trim().split("\n").map((r) => r.trim().split(/\s+/)));
  const W = blocks.length, Y = blocks[0].length, Z = blocks[0][0].length, X = blocks[0][0][0].length;
  const cells = new Uint8Array(X * Y * Z * W), crates = [];
  let start = null;
  blocks.forEach((rows, w) => {
    if (rows.length !== Y) throw new Error(`${def.name}: slice w=${w} has ${rows.length} rows, not ${Y}`);
    rows.forEach((layers, y) => {
      if (layers.length !== Z) throw new Error(`${def.name}: slice w=${w} row ${y} has ${layers.length} layers, not ${Z}`);
      layers.forEach((row, z) => {
        if (row.length !== X) throw new Error(`${def.name}: slice w=${w} row ${y} layer ${z} is ${row.length} wide, not ${X}`);
        for (let x = 0; x < X; x++) {
          const c = row[x];
          if (!(c in CH)) throw new Error(`${def.name}: unknown cell '${c}'`);
          const i = x + X * (y + Y * (z + Z * w));
          cells[i] = CH[c];
          if (c === "C") crates.push(i);
          if (c === "@") { if (start != null) throw new Error(def.name + ": two starts"); start = i; }
        }
      });
    });
  });
  if (start == null) throw new Error(def.name + ": no start");
  return new World({ name: def.name, hint: def.hint || "", X, Y, Z, W, cells, start, crates, wrap: !!def.wrap, gravW: !!def.gravW });
}

export class World {
  constructor({ name, hint, X, Y, Z, W, cells, start, crates, wrap = false, gravW = false }) {
    Object.assign(this, { name, hint, X, Y, Z, W, cells, wrap: !!wrap, gravW: !!gravW });
    this.N = X * Y * Z * W;
    this.start = { p: start, crates: crates.slice().sort((a, b) => a - b) };
    this.plates = []; this.goals = [];
    for (let i = 0; i < this.N; i++) { if (cells[i] === PLATE) this.plates.push(i); if (cells[i] === GOAL) this.goals.push(i); }
    // every cell's neighbours, one step along each of ±x ±y ±z ±w (−1 off the sides and top, −2 below the floor)
    this.nb = new Int32Array(this.N * 8);
    for (let i = 0; i < this.N; i++) {
      const c = this.coords(i), lim = [X, Y, Z, W];
      for (let a = 0; a < 4; a++) for (let sgn = 0; sgn < 2; sgn++) {
        const v = c[a] + (sgn ? -1 : 1), str = [1, X, X * Y, X * Y * Z][a];
        if (a === 3 && this.wrap && (v < 0 || v >= W)) { this.nb[i * 8 + a * 2 + sgn] = i + (v < 0 ? W - 1 : 1 - W) * str; continue; } // w goes round
        this.nb[i * 8 + a * 2 + sgn] = (a === 2 || (a === 3 && this.gravW)) && v < 0 ? -2 : v < 0 || v >= lim[a] ? -1 : i + (sgn ? -1 : 1) * str; // −2: below the world, the way you fall out
      }
    }
    this.settle(this.start); // a start in mid-air falls
  }
  idx(x, y, z, w) { return x + this.X * (y + this.Y * (z + this.Z * w)); }
  coords(i) { const X = this.X, Y = this.Y, Z = this.Z; return [i % X, Math.floor(i / X) % Y, Math.floor(i / (X * Y)) % Z, Math.floor(i / (X * Y * Z))]; }
  /* the cell one step along d from i, or −1 off the sides and top, or −2 below the floor of the world */
  step(i, d) {
    const a = d[0] ? 0 : d[1] ? 1 : d[2] ? 2 : 3;
    return this.nb[i * 8 + a * 2 + (d[a] < 0 ? 1 : 0)];
  }

  /* the doors are open when every plate has someone or something on it */
  doorsOpen(s) {
    if (!this.plates.length) return false;
    const on = new Set(s.crates); on.add(s.p);
    return this.plates.every((pl) => { const a = this.step(pl, [0, 0, 1, 0]); return a >= 0 && on.has(a); });
  }
  /* is cell i in the way (for walking, falling, landing, the hook)? */
  blocked(s, i, open) {
    if (i < 0) return true;
    const t = this.cells[i];
    if (t === SOLID || t === ANCHOR || t === PLATE || t >= RAMP_XA) return true;
    if (t === DOOR) return !(open || s.p === i || s.crates.includes(i));
    return s.crates.includes(i);
  }
  /* everything falls until it rests: crates bottom-up, then you. Returns false if you fell out of the world */
  settle(s) {
    const down = this.gravW ? [[0, 0, -1, 0], [0, 0, 0, -1]] : [[0, 0, -1, 0]], seen = this.gravW ? new Set([s.p]) : null;
    for (let guard = 0; guard < 256; guard++) {
      let moved = false;
      const open = this.doorsOpen(s);
      const XY = this.X * this.Y, h = (c) => Math.floor(c / XY) % this.Z + (this.gravW ? Math.floor(c / (XY * this.Z)) : 0);
      const order = s.crates.length > 1 ? s.crates.slice().sort((a, b) => h(a) - h(b)) : s.crates;
      for (const c of order) for (const d of down) {
        const at = s.crates.includes(c) ? c : -1; if (at < 0) break;
        const b = this.step(c, d);
        if (b === -2) { s.crates = s.crates.filter((x) => x !== c); moved = true; break; }
        if (!this.blocked(s, b, open) && b !== s.p) { s.crates = s.crates.map((x) => (x === c ? b : x)); moved = true; break; }
      }
      for (const d of down) {
        const b = this.step(s.p, d);
        if (b === -2) { s.dead = true; return false; }
        if (!this.blocked(s, b, open)) {
          s.p = b; moved = true;
          if (seen) { if (seen.has(b)) { s.dead = true; return false; } seen.add(b); } // round and round a wrapped w, never landing
          break;
        }
      }
      if (!moved) break;
    }
    s.crates.sort((a, b) => a - b);
    return true;
  }
  /* held where you are: something under you, and (where w has gravity too) something kata of you */
  resting(n, c, open) {
    const b = this.step(c, [0, 0, -1, 0]); if (b < 0 || !this.blocked(n, b, open)) return false;
    if (!this.gravW) return true;
    const k = this.step(c, [0, 0, 0, -1]); return k >= 0 && this.blocked(n, k, open);
  }

  /* one action from state s: a new state, or null if it does nothing */
  act(s, a) {
    const n = { p: s.p, crates: s.crates.slice() }, open = this.doorsOpen(s);
    if (a.kind === "walk") {
      const t = this.step(s.p, a.d);
      const r = this.rampsOff || (t >= 0 && this.standable(n, t, open)) ? -1 : this.rampStep(n, a.d, open);
      if (r >= 0) { n.p = r; this.settle(n); return n; }
      if (t < 0) return null;
      if (!this.blocked(n, t, open)) n.p = t;
      else if (n.crates.includes(t)) {
        const beyond = this.step(t, a.d), above = this.step(t, [0, 0, 1, 0]);
        if (beyond >= 0 && !this.blocked(n, beyond, open) && !(above >= 0 && n.crates.includes(above))) { n.crates = n.crates.map((c) => (c === t ? beyond : c)); n.p = t; }
        else if (!this.climb(n, t, open)) return null;
      } else if (!this.climb(n, t, open)) return null;
    } else {
      const r = this.reach(s, a.d);
      if (r.what === "miss" || r.k === 1) return null;
      if (r.what === "crate") n.crates = n.crates.map((c) => (c === r.cell ? this.step(s.p, a.d) : c));
      else n.p = this.step(r.cell, a.d.map((v) => -v));
    }
    this.settle(n);
    if (n.dead) return n;
    return n.p === s.p && n.crates.join() === s.crates.join() ? null : n;
  }
  /* could you stand in cell c: free, with something under it */
  standable(n, c, open) { if (c < 0 || this.blocked(n, c, open)) return false; const b = this.nb[c * 8 + 5]; return b >= 0 && this.blocked(n, b, open); }
  /* the ramp step along d, if there is one: one cell along d and one slice along w, onto somewhere you can
     stand, when the ramp under you or under where you'd land leans that way. −1 if none */
  rampStep(n, d, open) {
    const axis = d[0] ? 0 : 1, dir = d[axis], under = this.nb[n.p * 8 + 5], ru = under >= 0 ? RAMPS[this.cells[under]] : null;
    for (const sw of [1, -1]) {
      const side = this.nb[n.p * 8 + (sw > 0 ? 6 : 7)]; if (side < 0) continue;
      const q = this.step(side, d); if (q < 0 || !this.standable(n, q, open)) continue;
      const uq = this.nb[q * 8 + 5], rq = uq >= 0 ? RAMPS[this.cells[uq]] : null;
      if ((ru && ru.axis === axis && ru.s === dir * sw) || (rq && rq.axis === axis && rq.s === dir * sw)) return q;
    }
    return -1;
  }
  /* where the hook catches along d: { what: "anchor" | "crate" | "miss", k: cells out, cell } */
  reach(s, d) {
    const open = this.doorsOpen(s);
    let q = s.p;
    for (let k = 1; k <= RANGE; k++) {
      q = this.step(q, d);
      if (q < 0 || q === s.p) return { what: "miss", k, cell: -1 }; // off the world, or all the way round w back to you
      if (s.crates.includes(q)) return { what: "crate", k, cell: q };
      if (this.cells[q] === ANCHOR) return { what: "anchor", k, cell: q };
      if (this.blocked(s, q, open)) return { what: "miss", k, cell: q };
    }
    return { what: "miss", k: RANGE, cell: -1 };
  }
  /* step up onto t: the cell above it and the cell above you must both be free */
  climb(n, t, open) {
    const over = (axis) => { const u = [0, 0, 0, 0]; u[axis] = 1; const dst = this.step(t, u), head = this.step(n.p, u); return dst < 0 || head < 0 || this.blocked(n, dst, open) || this.blocked(n, head, open) ? -1 : dst; };
    const up = over(2);
    if (!this.gravW) { if (up < 0) return false; n.p = up; return true; }
    // with two downs there are two ups: onto the block in z, or ana onto it in w. Take whichever
    // holds you (z if both do); if neither does, z, then w, and fall from there
    const ana = over(3), pickd = [up, ana].find((c) => c >= 0 && this.resting(n, c, open)) ?? (up >= 0 ? up : ana);
    if (pickd < 0) return false;
    n.p = pickd; return true;
  }
  won(s) { return !s.dead && this.cells[s.p] === GOAL; }
  key(s) { let k = s.p, m = this.N; for (const c of s.crates) { k += (c + 1) * m; m *= this.N + 1; } return k; }

  /* Could you reach the goal under looser rules? A search over where you
     stand alone, with every door open and the crates gone, but with
     everything a crate might do for you granted for free (it could be under
     you anywhere, so you never have to fall, and can always step up).  Anything the real
     rules allow, these allow, so false here is a proof of no solution, and
     costs a few hundred states, not tens of thousands. */
  relaxedReach(allowW = true) {
    if (this.gravW) return true; // not written for two gravities yet: "maybe" is always sound
    const helped = this.start.crates.length > 0, seen = new Uint8Array(this.N), queue = [this.start.p];
    const solid = (i) => i < 0 || (this.cells[i] !== EMPTY && this.cells[i] !== GOAL && this.cells[i] !== DOOR);
    const land = (i) => { // fall from i to where you'd stop; −1 if out of the world
      for (let g = 0; g < this.Z + 1; g++) { const b = this.nb[i * 8 + 5]; if (b === -2) return helped ? i : -1; if (solid(b)) return i; if (helped && this.nb[b * 8 + 5] === -2) return i; i = b; }
      return i;
    };
    seen[this.start.p] = 1;
    for (let h = 0; h < queue.length; h++) {
      const p = queue[h];
      if (this.cells[p] === GOAL) return true;
      const next = [];
      for (let a = 0; a < 4; a++) { // walk ±x ±y, climbing one (or two, if a crate could help)
        const t = this.nb[p * 8 + a]; if (t < 0) continue;
        if (!solid(t)) { next.push(t); continue; }
        const up = this.nb[t * 8 + 4], head = this.nb[p * 8 + 4];
        if (up >= 0 && head >= 0 && !solid(up) && !solid(head)) { next.push(up); continue; }
        if (helped && up >= 0 && head >= 0 && !solid(head)) { const up2 = this.nb[up * 8 + 4], head2 = this.nb[head * 8 + 4]; if (up2 >= 0 && head2 >= 0 && !solid(up2) && !solid(head2)) next.push(up2); }
      }
      if (allowW) for (let a = 0; a < 4; a++) for (const wd of [6, 7]) { // ramps (any lean: looser is fine)
        const side = this.nb[p * 8 + wd]; if (side < 0) continue;
        const q = this.nb[side * 8 + a]; if (q < 0 || solid(q)) continue;
        const up = this.nb[p * 8 + 5], uq = this.nb[q * 8 + 5];
        if ((up >= 0 && RAMPS[this.cells[up]] && RAMPS[this.cells[up]].axis === a >> 1) || (uq >= 0 && RAMPS[this.cells[uq]] && RAMPS[this.cells[uq]].axis === a >> 1)) next.push(q);
      }
      for (let a = 0; a < 8; a++) { // the hook, to anchors
        if (a === 4 || a === 5 || (!allowW && a >= 6)) continue;
        let q = p, prev = p;
        for (let k = 1; k <= RANGE; k++) { prev = q; q = this.nb[q * 8 + a]; if (q < 0) break; if (this.cells[q] === ANCHOR) { if (k > 1) next.push(prev); break; } if (solid(q)) break; }
      }
      if (helped) { const head = this.nb[p * 8 + 4]; if (head >= 0 && !solid(head)) next.push(head); } // a crate could lift you anywhere
      for (const t of next) {
        const l = land(t);
        if (l >= 0 && !seen[l]) { seen[l] = 1; queue.push(l); }
        if (helped && !seen[t]) { seen[t] = 1; queue.push(t); } // or hold you up where you are
      }
    }
    return false;
  }

  /* this world with w made ends again, or round again: for proving a room needs its wrap */
  withWrap(wrap) { return new World({ name: this.name, hint: this.hint, X: this.X, Y: this.Y, Z: this.Z, W: this.W, cells: this.cells, start: this.start.p, crates: this.start.crates, wrap, gravW: this.gravW }); }
  /* the same search with no way through w at all: no hooking along it, and the ramps just floor */
  solveFlat(limit) { this.rampsOff = true; try { return this.solve((a) => !isW(a), limit); } finally { this.rampsOff = false; } }

  /* the shortest solution, by breadth-first search over states. `allow`
     filters actions (e.g. no hooks along w, to prove a level needs w) */
  solve(allow = () => true, limit = 400000) {
    const start = { p: this.start.p, crates: this.start.crates.slice() };
    if (this.won(start)) return { moves: [], states: 1 };
    const seen = new Map([[this.key(start), null]]), queue = [start];
    for (let h = 0; h < queue.length && seen.size < limit; h++) {
      const s = queue[h];
      for (let ai = 0; ai < ACTIONS.length; ai++) {
        const a = ACTIONS[ai];
        if (!allow(a)) continue;
        const n = this.act(s, a);
        if (!n || n.dead) continue;
        const k = this.key(n);
        if (seen.has(k)) continue;
        seen.set(k, { from: this.key(s), ai });
        if (this.won(n)) {
          const moves = []; let cur = k;
          while (seen.get(cur)) { const e = seen.get(cur); moves.unshift(e.ai); cur = e.from; }
          return { moves, states: seen.size };
        }
        queue.push(n);
      }
    }
    return { moves: null, states: seen.size };
  }
}

export const isW = (a) => a.d[3] !== 0;
export const describe = (ai) => { const a = ACTIONS[ai], ax = a.d.findIndex((v) => v !== 0), name = ax === 3 ? (a.d[3] > 0 ? "ana" : "kata") : (a.d[ax] > 0 ? "+" : "−") + AXES[ax]; return (a.kind === "hook" ? "hook " : "") + name; };
