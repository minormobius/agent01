/* Molt — the world made from a snake's body.

   A snake is a path of cells; its body, read from tail to head, is a word of
   turns, one token per cell between the two ends. A token is a YAW, S
   (straight on), L or R, turning about the snake's own "up" (the normal of
   the surface it lay on), optionally after a PITCH, U or D, turning about its
   short axis: up or down over a fold of the world it lay on (D going over an
   outside edge, U into an inside corner). So a snake that crawled straight
   round a tube comes back as a ring, and one that went over a cap as a hook.
   Turn each cell of the body into a cube and glue consecutive cubes face to
   face. The next world is the SURFACE of that chain of cubes, every face cut
   into a C × C grid.

   Everything here is built from the word alone, never from where the cubes
   happen to sit in space: two cubes of a body that lay side by side (a
   U-turn, a coil) stay two separate walls, as two coils of a real snake do.
   So the surface is always a sphere: a capsule with a cap at the head and one
   at the tail.

   What the word decides:
     every cube shows exactly 4 faces (a corner cube shows top, bottom and both
     OUTER walls, and no inner wall at all), so the world has C²(4L + 2) cells
     whatever the body's shape: the bends only move cells from the inside of a
     turn to the outside
     every cell is a square with 4 neighbours; the curvature lives at corners:
     3 squares meet on the outside of a turn (+90° each, like a cube's
     corner), 5 on the inside (−90°), and the caps' 8 cube corners make up the
     720° a sphere needs

   Directions are global unit axes 0..5 = +x −x +y −y +z −z. The body is laid
   out in space (starting along +x with +z up, its frame turned by every
   token) only to name each cube's faces; gluing goes by those names and
   ignores where things land, so a layout that overlaps itself is fine. */

export const D_ = { C: 3, W: 0.72 };
const VEC = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const neg = (d) => d ^ 1, axis = (d) => d >> 1, positive = (d) => (d & 1) === 0;
const dirOf = (v) => VEC.findIndex((w) => w[0] === v[0] && w[1] === v[1] && w[2] === v[2]);
const crossD = (a, b) => dirOf(cross(VEC[a], VEC[b]));
/* a word as its tokens: [pitch "" | "U" | "D", yaw "S" | "L" | "R"]; a bend is any token but a plain S */
export function tokens(word) {
  const out = [], re = /([UD]?)([SLR])/gy;
  let m, at = 0;
  while (at < word.length) { re.lastIndex = at; m = re.exec(word); if (!m) throw new Error("a body is a word of turns: [U|D]?[S|L|R] per cell"); out.push([m[1], m[2]]); at = re.lastIndex; }
  return out;
}
export const bends = (word) => tokens(word).filter((t) => t[0] || t[1] !== "S").length;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const perp = (d) => [0, 1, 2, 3, 4, 5].filter((q) => axis(q) !== axis(d));

class UF {
  constructor() { this.p = new Map(); }
  find(a) { let r = a; while (this.p.has(r) && this.p.get(r) !== r) r = this.p.get(r); let x = a; while (x !== r) { const n = this.p.get(x); this.p.set(x, r); x = n; } return r; }
  union(a, b) { const x = this.find(a), y = this.find(b); if (x !== y) this.p.set(x, y); if (!this.p.has(y)) this.p.set(y, y); }
}

export function buildDuct(word, C = D_.C) {
  const tk = tokens(word), L = tk.length + 2;
  // the body laid out in space, to name faces: where each cube is, which way it was entered and left.
  // The frame is (forward f, up u); a pitch turns f about the short axis, a yaw about u.
  const P = [], din = [], dout = [];
  let pos = [0, 0, 0], f = 0, u = 4;
  for (let k = 0; k < L; k++) {
    din.push(f);
    if (k > 0 && k < L - 1) {
      const [p, y] = tk[k - 1];
      if (p === "D") [f, u] = [neg(u), f]; else if (p === "U") [f, u] = [u, neg(f)];
      if (y === "L") f = crossD(u, f); else if (y === "R") f = crossD(f, u);
    }
    dout.push(f); P.push(pos.slice());
    pos = [pos[0] + VEC[f][0], pos[1] + VEC[f][1], pos[2] + VEC[f][2]];
  }
  const upEnd = u;
  const attached = (k, d) => (k > 0 && d === neg(din[k])) || (k < L - 1 && d === dout[k]);

  // the faces left showing, each with axes p, r such that p × r is its outward normal
  const faces = [], faceOf = new Map();
  for (let k = 0; k < L; k++) for (let d = 0; d < 6; d++) {
    if (attached(k, d)) continue;
    const [a, b] = perp(d).filter(positive);
    let p = a, r = b;
    if (dot(cross(VEC[p], VEC[r]), VEC[d]) < 0) r = neg(r);
    faceOf.set(k * 6 + d, faces.length);
    faces.push({ k, d, p, r });
  }

  // cube edges, named (cube, the two faces that meet there); gluing cube k's exit face to k+1's entry face names them the same
  const ekey = (k, a, b) => k * 36 + Math.min(a, b) * 6 + Math.max(a, b);
  const eu = new UF();
  for (let k = 0; k < L - 1; k++) { const e = dout[k]; for (const q of perp(e)) eu.union(ekey(k, e, q), ekey(k + 1, neg(e), q)); }
  const edgeFaces = new Map();
  faces.forEach((F, f) => { for (const q of perp(F.d)) { const r = eu.find(ekey(F.k, F.d, q)); if (!edgeFaces.has(r)) edgeFaces.set(r, []); edgeFaces.get(r).push({ f, q }); } });

  // cube corners likewise, for the curvature count and the drawing
  const ckey = (k, s) => k * 8 + s;                 // s: bit 0 x>0, bit 1 y>0, bit 2 z>0
  const sgn = (s, ax) => ((s >> ax) & 1 ? 1 : -1);
  const cu = new UF();
  for (let k = 0; k < L - 1; k++) {
    const e = dout[k], ax = axis(e), want = positive(e) ? 1 : -1;
    for (let s = 0; s < 8; s++) if (sgn(s, ax) === want) cu.union(ckey(k, s), ckey(k + 1, s ^ (1 << ax)));
  }

  // cells: face f, row i along p, column j along r
  const CC = C * C, N = faces.length * CC;
  const nb = new Int32Array(N * 4), back = new Int8Array(N * 4);
  const dirs = (F) => [F.p, F.r, neg(F.p), neg(F.r)];
  for (let f = 0; f < faces.length; f++) {
    const F = faces[f], ds = dirs(F);
    for (let i = 0; i < C; i++) for (let j = 0; j < C; j++) {
      const c = f * CC + i * C + j;
      for (let s = 0; s < 4; s++) {
        const ni = i + (s === 0) - (s === 2), nj = j + (s === 1) - (s === 3);
        if (ni >= 0 && ni < C && nj >= 0 && nj < C) { nb[c * 4 + s] = f * CC + ni * C + nj; back[c * 4 + s] = (s + 2) % 4; continue; }
        // over the edge: the same edge is named on the other face; cells line up along the global axis it runs on
        const q = ds[s], list = edgeFaces.get(eu.find(ekey(F.k, F.d, q))), o = list[0].f === f && list[0].q === q ? list[1] : list[0];
        const m = s % 2 === 0 ? F.r : F.p, along = s % 2 === 0 ? j : i, t = positive(m) ? along : C - 1 - along;
        const G = faces[o.f], s2 = dirs(G).indexOf(o.q), m2 = s2 % 2 === 0 ? G.r : G.p, a2 = positive(m2) ? t : C - 1 - t;
        let i2, j2;
        if (s2 % 2 === 0) { i2 = s2 === 0 ? C - 1 : 0; j2 = a2; } else { j2 = s2 === 1 ? C - 1 : 0; i2 = a2; }
        nb[c * 4 + s] = o.f * CC + i2 * C + j2; back[c * 4 + s] = s2;
      }
    }
  }

  // where each corner sits, for drawing: a duct W thick down the middle of each cell of the body.
  // Along a face that's glued on, a corner reaches the cell's edge (0.5), unless the corner touches the
  // other glued face too (the inside of a turn); every other corner sits on the duct's own walls (W/2).
  // Where a corner is shared, the inside of a turn wins.
  const { W } = D_;
  const cornerPos = (k, s) => {
    const ds = [0, 1, 2].map((ax) => ax * 2 + (sgn(s, ax) > 0 ? 0 : 1)), att = ds.map((d) => attached(k, d)), n = att.filter(Boolean).length;
    const out = P[k].slice();
    for (let ax = 0; ax < 3; ax++) out[ax] += sgn(s, ax) * (att[ax] && n === 1 ? 0.5 : W / 2);
    return { pos: out, inner: n === 2 };
  };
  const groups = new Map();
  for (let k = 0; k < L; k++) for (let s = 0; s < 8; s++) {
    const r = cu.find(ckey(k, s)); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(cornerPos(k, s));
  }
  const vpos = new Map();
  for (const [r, g] of groups) {
    const use = g.some((c) => c.inner) ? g.filter((c) => c.inner) : g, p = [0, 0, 0];
    for (const c of use) for (let a = 0; a < 3; a++) p[a] += c.pos[a] / use.length;
    vpos.set(r, p);
  }
  // each face's four corners, as Q[sp][sr] with sp, sr = 0 (−) or 1 (+) along its own p and r
  for (const F of faces) {
    F.Q = [[null, null], [null, null]];
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      let s = 0;
      const sig = [0, 0, 0];
      sig[axis(F.d)] = positive(F.d) ? 1 : -1;
      sig[axis(F.p)] = (a ? 1 : -1) * (positive(F.p) ? 1 : -1);
      sig[axis(F.r)] = (b ? 1 : -1) * (positive(F.r) ? 1 : -1);
      for (let ax = 0; ax < 3; ax++) if (sig[ax] > 0) s |= 1 << ax;
      F.Q[a][b] = vpos.get(cu.find(ckey(F.k, s)));
      F["v" + a + b] = cu.find(ckey(F.k, s));
    }
  }
  // face to face, for unfolding: across side s of face f lies face fn[f*4+s], entered by its side fs[f*4+s];
  // flip says whether the shared edge runs the opposite way in the two faces' own coordinates
  const fn = new Int32Array(faces.length * 4), fs = new Int8Array(faces.length * 4), flip = new Uint8Array(faces.length * 4);
  faces.forEach((F, f) => dirs(F).forEach((q, s) => {
    const list = edgeFaces.get(eu.find(ekey(F.k, F.d, q))), o = list[0].f === f && list[0].q === q ? list[1] : list[0];
    const G = faces[o.f], s2 = dirs(G).indexOf(o.q), m = s % 2 === 0 ? F.r : F.p, m2 = s2 % 2 === 0 ? G.r : G.p;
    fn[f * 4 + s] = o.f; fs[f * 4 + s] = s2; flip[f * 4 + s] = positive(m) !== positive(m2) ? 1 : 0;
  }));
  return { word, L, C, N, faces, nb, back, fn, fs, flip, P, din, dout, upEnd, edgeFaces, vertexOf: (F, a, b) => F["v" + a + b] };
}

/* a point of a cell, (u, v) ∈ [0,1]² across it, on the drawn surface */
export function cellPoint(M, c, u, v) {
  const CC = M.C * M.C, F = M.faces[(c / CC) | 0], i = ((c % CC) / M.C) | 0, j = c % M.C;
  const s = (i + u) / M.C, t = (j + v) / M.C, Q = F.Q, out = [0, 0, 0];
  for (let a = 0; a < 3; a++) out[a] = (1 - s) * (1 - t) * Q[0][0][a] + s * (1 - t) * Q[1][0][a] + (1 - s) * t * Q[0][1][a] + s * t * Q[1][1][a];
  return out;
}
export const faceOfCell = (M, c) => M.faces[(c / (M.C * M.C)) | 0];
export function faceNormal(F) {
  const Q = F.Q, a = [0, 1, 2].map((k) => Q[1][1][k] - Q[0][0][k]), b = [0, 1, 2].map((k) => Q[0][1][k] - Q[1][0][k]);
  const n = cross(a, b), m = Math.hypot(...n) || 1;
  return n.map((v) => v / m);
}

/* the curvature count: how many faces meet at each corner of the surface */
export function census(M) {
  const val = new Map();
  for (const F of M.faces) for (const a of [0, 1]) for (const b of [0, 1]) { const v = M.vertexOf(F, a, b); val.set(v, (val.get(v) || 0) + 1); }
  let E = 0, two = true;
  for (const list of M.edgeFaces.values()) { if (list.length === 2) E++; else if (list.length) two = false; }
  const V = val.size, Fc = M.faces.length, hist = {};
  let defect = 0;
  for (const n of val.values()) { hist[n] = (hist[n] || 0) + 1; defect += 4 - n; }
  return { V, E, F: Fc, chi: V - E + Fc, defect, hist, manifold: two };
}

/* a snake's body, head first, read back as the word of turns that builds the next world.
   Yaw from the cell itself (which side it was entered by, which left by); pitch from the fold between two
   cells, measured on the world as it's drawn (the duct): flat, an outside edge (D: the body bends down over
   it) or an inside corner (U). A zero-width slot between two coils is a fold of 180°: two pitches, and a
   cube turns at most 90°, so the second rides on to the next cell. */
export function sideTo(M, a, b) { for (let s = 0; s < 4; s++) if (M.nb[a * 4 + s] === b) return s; return -1; }
export function fold(M, a, b) {
  const CC = M.C * M.C, Fa = M.faces[(a / CC) | 0], Fb = M.faces[(b / CC) | 0];
  if (Fa.d === Fb.d) return 0;
  const na = VEC[Fa.d], ca = cellPoint(M, a, 0.5, 0.5), cb = cellPoint(M, b, 0.5, 0.5);
  const inside = dot([cb[0] - ca[0], cb[1] - ca[1], cb[2] - ca[2]], na) > 0;
  const n = Fa.d === neg(Fb.d) ? 2 : 1;
  return inside ? -n : n;   // + down over an outside edge, − up into an inside corner
}
export function wordOf(M, body) {
  let w = "", carry = 0;
  for (let k = body.length - 2; k >= 1; k--) {      // tail end to head end: cell k, entered from k+1, left for k-1
    const cell = body[k], sIn = sideTo(M, cell, body[k + 1]), sOut = sideTo(M, cell, body[k - 1]), d = (sOut - sIn + 4) % 4;
    let p = carry + fold(M, body[k + 1], cell);
    const now = Math.sign(p); carry = p - now;
    w += (now > 0 ? "D" : now < 0 ? "U" : "") + (d === 2 ? "S" : d === 3 ? "L" : "R");
  }
  return w;
}

/* ---- the rounded tube, for drawing.
   The body's centreline runs through the cells it crossed: straight through a
   straight cell, a quarter circle (radius 1/2, round the cell's inside corner)
   through a turning one, and stopping at the middle of the two end cells. Every
   point of the blocky surface is pushed out to radius R round its nearest point
   on that line, so square cross-sections become circles, corners become bends
   and the caps become hemispheres. Only the drawing changes: the cells, their
   neighbours and every count above stay exactly what they were. */
export function centreline(M) {
  const out = [], add = (a, b, t) => [a[0] + b[0] * t, a[1] + b[1] * t, a[2] + b[2] * t];
  for (let k = 0; k < M.L; k++) {
    const P = M.P[k], di = VEC[M.din[k]], dO = VEC[M.dout[k]], E = add(P, di, -0.5), X = add(P, dO, 0.5);
    if (k === 0) out.push({ k, a: P.slice(), b: X });
    else if (k === M.L - 1) out.push({ k, a: E, b: P.slice() });
    else if (M.din[k] === M.dout[k]) out.push({ k, a: E, b: X });
    // a quarter circle round the cell's inside corner, from the entry face's middle (−dout from the centre O) to the exit's (+din)
    else out.push({ k, O: add(add(P, di, -0.5), dO, 0.5), ea: dO.map((v) => -v), eb: di.slice() });
  }
  return out;
}
export function linePoint(pc, t) {   // t ∈ [0, 1] along a piece of the centreline
  if (pc.O) { const a = t * Math.PI / 2, c = 0.5 * Math.cos(a), s = 0.5 * Math.sin(a); return [0, 1, 2].map((i) => pc.O[i] + c * pc.ea[i] + s * pc.eb[i]); }
  return [0, 1, 2].map((i) => pc.a[i] + (pc.b[i] - pc.a[i]) * t);
}
function nearestOn(piece, x) {
  if (piece.O) {
    const v = [x[0] - piece.O[0], x[1] - piece.O[1], x[2] - piece.O[2]];
    const a = Math.max(0, Math.min(Math.PI / 2, Math.atan2(dot(v, piece.eb), dot(v, piece.ea))));
    return linePoint(piece, a / (Math.PI / 2));
  }
  const { a, b } = piece, d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = dot(d, d);
  const u = L2 ? Math.max(0, Math.min(1, dot([x[0] - a[0], x[1] - a[1], x[2] - a[2]], d) / L2)) : 0;
  return [a[0] + u * d[0], a[1] + u * d[1], a[2] + u * d[2]];
}
/* a point of the blocky surface (on a face of cube k) pushed out onto the tube: [position, outward normal] */
export function roundPoint(line, k, x, R) {
  let best = null, bd = Infinity;
  for (let j = Math.max(0, k - 2); j <= Math.min(line.length - 1, k + 2); j++) {
    const c = nearestOn(line[j], x), d = (x[0] - c[0]) ** 2 + (x[1] - c[1]) ** 2 + (x[2] - c[2]) ** 2;
    if (d < bd - 1e-12) { bd = d; best = c; }
  }
  const v = [x[0] - best[0], x[1] - best[1], x[2] - best[2]], m = Math.hypot(v[0], v[1], v[2]) || 1, n = [v[0] / m, v[1] / m, v[2] / m];
  return [[best[0] + R * n[0], best[1] + R * n[1], best[2] + R * n[2]], n];
}
