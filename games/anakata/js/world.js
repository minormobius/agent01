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
   Then everything falls. So the hook is the only way through w: to a slice
   where the wall has a gap, or bringing a crate out of a slice where it's
   no use into one where it is.

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
     .  empty     G  goal      C  a crate   @  you (start)                 */
const CH = { ".": EMPTY, "#": SOLID, A: ANCHOR, P: PLATE, D: DOOR, G: GOAL, C: EMPTY, "@": EMPTY };

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
  return new World({ name: def.name, hint: def.hint || "", X, Y, Z, W, cells, start, crates });
}

export class World {
  constructor({ name, hint, X, Y, Z, W, cells, start, crates }) {
    Object.assign(this, { name, hint, X, Y, Z, W, cells });
    this.N = X * Y * Z * W;
    this.start = { p: start, crates: crates.slice().sort((a, b) => a - b) };
    this.plates = []; this.goals = [];
    for (let i = 0; i < this.N; i++) { if (cells[i] === PLATE) this.plates.push(i); if (cells[i] === GOAL) this.goals.push(i); }
    this.settle(this.start); // a start in mid-air falls
  }
  idx(x, y, z, w) { return x + this.X * (y + this.Y * (z + this.Z * w)); }
  coords(i) { const X = this.X, Y = this.Y, Z = this.Z; return [i % X, Math.floor(i / X) % Y, Math.floor(i / (X * Y)) % Z, Math.floor(i / (X * Y * Z))]; }
  /* the cell one step along d from i, or −1 off the sides and top, or −2 below the floor of the world */
  step(i, d) {
    const c = this.coords(i), x = c[0] + d[0], y = c[1] + d[1], z = c[2] + d[2], w = c[3] + d[3];
    if (z < 0) return -2;
    if (x < 0 || y < 0 || w < 0 || x >= this.X || y >= this.Y || z >= this.Z || w >= this.W) return -1;
    return this.idx(x, y, z, w);
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
    if (t === SOLID || t === ANCHOR || t === PLATE) return true;
    if (t === DOOR) return !(open || s.p === i || s.crates.includes(i));
    return s.crates.includes(i);
  }
  /* everything falls until it rests: crates bottom-up, then you. Returns false if you fell out of the world */
  settle(s) {
    for (let guard = 0; guard < 64; guard++) {
      let moved = false;
      const open = this.doorsOpen(s);
      const order = s.crates.slice().sort((a, b) => this.coords(a)[2] - this.coords(b)[2]);
      for (const c of order) {
        const below = this.step(c, [0, 0, -1, 0]);
        if (below === -2) { s.crates = s.crates.filter((x) => x !== c); moved = true; continue; }
        if (!this.blocked(s, below, open) && below !== s.p) { s.crates = s.crates.map((x) => (x === c ? below : x)); moved = true; }
      }
      const below = this.step(s.p, [0, 0, -1, 0]);
      if (below === -2) { s.dead = true; return false; }
      if (!this.blocked(s, below, open)) { s.p = below; moved = true; }
      if (!moved) break;
    }
    s.crates.sort((a, b) => a - b);
    return true;
  }

  /* one action from state s: a new state, or null if it does nothing */
  act(s, a) {
    const n = { p: s.p, crates: s.crates.slice() }, open = this.doorsOpen(s);
    if (a.kind === "walk") {
      const t = this.step(s.p, a.d);
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
  /* where the hook catches along d: { what: "anchor" | "crate" | "miss", k: cells out, cell } */
  reach(s, d) {
    const open = this.doorsOpen(s);
    let q = s.p;
    for (let k = 1; k <= RANGE; k++) {
      q = this.step(q, d);
      if (q < 0) return { what: "miss", k, cell: -1 };
      if (s.crates.includes(q)) return { what: "crate", k, cell: q };
      if (this.cells[q] === ANCHOR) return { what: "anchor", k, cell: q };
      if (this.blocked(s, q, open)) return { what: "miss", k, cell: q };
    }
    return { what: "miss", k: RANGE, cell: -1 };
  }
  /* step up onto t: the cell above it and the cell above you must both be free */
  climb(n, t, open) {
    const up = this.step(t, [0, 0, 1, 0]), head = this.step(n.p, [0, 0, 1, 0]);
    if (up < 0 || head < 0 || this.blocked(n, up, open) || this.blocked(n, head, open)) return false;
    n.p = up; return true;
  }
  won(s) { return !s.dead && this.cells[s.p] === GOAL; }
  key(s) { return s.p + ":" + s.crates.join(","); }

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
