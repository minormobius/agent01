// chair44/tile.js — the Chair44 monotile (Tsiokos 2026), exactly as published,
// plus the finite checks its aperiodicity proof rests on.
//
// This is the ONE copy of the maths. index.html imports it with
// <script type="module">, and tile.selftest.mjs imports it unchanged.
//
// Source: I. Tsiokos, "A strongly aperiodic monotile in three dimensions",
// arXiv:2609.19214 (2026), §2 and §3. Figure 3 there is the panel recipe below;
// Table 1 is CHILDREN; Figure 7 is the 44-contact atlas the selftest compares to.
//
// Units. Every coordinate in this module is an INTEGER in eighths of a cube
// edge, so a feature offset of ±1/8 or ±1/4 is ±1 or ±2 and nothing is ever
// compared as a float. The carrier is [0,16]^3 minus [8,16]^3.

export const E = 8; // one cube edge, in eighths

// ------------------------------------------------------------------ recipe --
// [panel id, outward normal, grid column, grid row, features]
// Grid column/row are the panel's cell in the paper's 2x2 diagram: 0 = the
// square centred at 1/2 along that axis, 1 = centred at 3/2. The two in-panel
// axes are the other two coordinate axes in order (x: y,z · y: x,z · z: x,y).
// A feature is [u, v, a]: offset (u/8, v/8) from the panel centre along those
// two axes, and signed height a/10000 along the outward normal (+ bump, − dent).
// Read off Figure 3 of arXiv:2609.19214 by position, and checked against the
// paper's own worked example (panel 13: −9 at (−1/8,−1/4), +9 at (−1/4,−1/8)).
export const RECIPE = [
  [ 0, '-x', 0, 0, [[-2,-1,5], [-2,1,6], [-1,-2,1], [-1,2,2], [1,-2,3], [1,2,4], [2,-1,7], [2,1,8]]],
  [ 1, '-x', 0, 1, [[-2,-1,-6], [-2,1,-5], [-1,-2,-2], [-1,2,-1], [1,-2,-4], [1,2,-3], [2,-1,-8], [2,1,-7]]],
  [ 2, '-x', 1, 0, [[-2,-1,2], [-2,1,4], [-1,-2,6], [-1,2,8], [1,-2,5], [1,2,7], [2,-1,1], [2,1,3]]],
  [ 3, '-x', 1, 1, [[-2,-1,-9], [-2,1,-11], [-1,-2,9], [-1,2,10], [1,-2,11], [1,2,12], [2,-1,-10], [2,1,-12]]],
  [ 4, '+x', 1, 1, [[-2,-1,-5], [-2,1,-6], [-1,-2,-1], [-1,2,-2], [1,-2,-3], [1,2,-4], [2,-1,-7], [2,1,-8]]],
  [ 5, '+x', 0, 0, [[-2,-1,12], [-2,1,10], [-1,-2,-12], [-1,2,-11], [1,-2,-10], [1,2,-9], [2,-1,11], [2,1,9]]],
  [ 6, '+x', 0, 1, [[-2,-1,-3], [-2,1,-1], [-1,-2,-7], [-1,2,-5], [1,-2,-8], [1,2,-6], [2,-1,-4], [2,1,-2]]],
  [ 7, '+x', 1, 0, [[-2,-1,7], [-2,1,8], [-1,-2,3], [-1,2,4], [1,-2,1], [1,2,2], [2,-1,5], [2,1,6]]],
  [ 8, '-y', 0, 0, [[-2,-1,-5], [-2,1,-6], [-1,-2,-1], [-1,2,-2], [1,-2,-3], [1,2,-4], [2,-1,-7], [2,1,-8]]],
  [ 9, '-y', 0, 1, [[-2,-1,6], [-2,1,5], [-1,-2,2], [-1,2,1], [1,-2,4], [1,2,3], [2,-1,8], [2,1,7]]],
  [10, '+y', 0, 0, [[-2,-1,-12], [-2,1,-10], [-1,-2,12], [-1,2,11], [1,-2,10], [1,2,9], [2,-1,-11], [2,1,-9]]],
  [11, '+y', 0, 1, [[-2,-1,3], [-2,1,1], [-1,-2,7], [-1,2,5], [1,-2,8], [1,2,6], [2,-1,4], [2,1,2]]],
  [12, '-y', 1, 0, [[-2,-1,-2], [-2,1,-4], [-1,-2,-6], [-1,2,-8], [1,-2,-5], [1,2,-7], [2,-1,-1], [2,1,-3]]],
  [13, '-y', 1, 1, [[-2,-1,9], [-2,1,11], [-1,-2,-9], [-1,2,-10], [1,-2,-11], [1,2,-12], [2,-1,10], [2,1,12]]],
  [14, '+y', 1, 1, [[-2,-1,5], [-2,1,6], [-1,-2,1], [-1,2,2], [1,-2,3], [1,2,4], [2,-1,7], [2,1,8]]],
  [15, '+y', 1, 0, [[-2,-1,-7], [-2,1,-8], [-1,-2,-3], [-1,2,-4], [1,-2,-1], [1,2,-2], [2,-1,-5], [2,1,-6]]],
  [16, '-z', 0, 0, [[-2,-1,-12], [-2,1,-10], [-1,-2,12], [-1,2,11], [1,-2,10], [1,2,9], [2,-1,-11], [2,1,-9]]],
  [17, '+z', 0, 0, [[-2,-1,12], [-2,1,10], [-1,-2,-12], [-1,2,-11], [1,-2,-10], [1,2,-9], [2,-1,11], [2,1,9]]],
  [18, '-z', 0, 1, [[-2,-1,-6], [-2,1,-5], [-1,-2,-2], [-1,2,-1], [1,-2,-4], [1,2,-3], [2,-1,-8], [2,1,-7]]],
  [19, '+z', 0, 1, [[-2,-1,-3], [-2,1,-1], [-1,-2,-7], [-1,2,-5], [1,-2,-8], [1,2,-6], [2,-1,-4], [2,1,-2]]],
  [20, '-z', 1, 0, [[-2,-1,2], [-2,1,4], [-1,-2,6], [-1,2,8], [1,-2,5], [1,2,7], [2,-1,1], [2,1,3]]],
  [21, '+z', 1, 0, [[-2,-1,7], [-2,1,8], [-1,-2,3], [-1,2,4], [1,-2,1], [1,2,2], [2,-1,5], [2,1,6]]],
  [22, '-z', 1, 1, [[-2,-1,-9], [-2,1,-11], [-1,-2,9], [-1,2,10], [1,-2,11], [1,2,12], [2,-1,-10], [2,1,-12]]],
  [23, '+z', 1, 1, [[-2,-1,12], [-2,1,10], [-1,-2,-12], [-1,2,-11], [1,-2,-10], [1,2,-9], [2,-1,11], [2,1,9]]],
];

// The three panels inside the notch sit on the planes x=1, y=1, z=1.
export const NOTCH = [4, 14, 23];

// The seven unit cubes of the carrier, by min corner (in cube units).
export const CELLS = [];
for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++)
  if (x + y + z < 3) CELLS.push([x, y, z]);

// The paper's fixed feature geometry (true values, in cube units).
export const TRUE_BASE = 1 / 50;      // base side of every pyramid
export const TRUE_HEIGHT = 1 / 10000; // height per unit of |a|

const AXES = { x: 0, y: 1, z: 2 };
const INPANEL = [[1, 2], [0, 2], [0, 1]];

/** The 24 panels, in eighths: centre, normal, in-panel axes, 8 features. */
export const PANELS = RECIPE.map(([id, nrm, col, row, feats]) => {
  const k = AXES[nrm[1]], s = nrm[0] === '+' ? 1 : -1;
  const [i1, i2] = INPANEL[k];
  const c = [0, 0, 0];
  c[i1] = E / 2 + E * col;
  c[i2] = E / 2 + E * row;
  c[k] = NOTCH.includes(id) ? E : (s > 0 ? 2 * E : 0);
  const n = [0, 0, 0]; n[k] = s;
  const e1 = [0, 0, 0]; e1[i1] = 1;
  const e2 = [0, 0, 0]; e2[i2] = 1;
  const features = feats.map(([u, v, a]) => ({
    p: [c[0] + u * e1[0] + v * e2[0], c[1] + u * e1[1] + v * e2[1], c[2] + u * e1[2] + v * e2[2]],
    u, v, a,
  }));
  return { id, axis: k, sign: s, c, n, e1, e2, features };
});

// ------------------------------------------------------------------ frames --
// A frame (p, s) acts by G(x)_i = s_i · x_{p_i}, exactly as in the paper.
const PERMS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
const PERM_SIGN = [1, -1, -1, 1, 1, -1];
export const FRAMES = [];
for (let pi = 0; pi < 6; pi++)
  for (let m = 0; m < 8; m++) {
    const s = [m & 4 ? -1 : 1, m & 2 ? -1 : 1, m & 1 ? -1 : 1];
    FRAMES.push({ p: PERMS[pi], s, det: PERM_SIGN[pi] * s[0] * s[1] * s[2] });
  }
export const ROTATIONS = FRAMES.filter((f) => f.det === 1);

export const frameKey = (f) => f.p.join('') + f.s.map((x) => (x > 0 ? '+' : '-')).join('');
export const frameOf = (p, s) => FRAMES.find((f) => f.p.join() === p.join() && f.s.join() === s.join());
export const IDENTITY = frameOf([0, 1, 2], [1, 1, 1]);

export const act = (f, x) => [f.s[0] * x[f.p[0]], f.s[1] * x[f.p[1]], f.s[2] * x[f.p[2]]];

/** Compose frames: (compose(g, h))(x) = g(h(x)). */
export function compose(g, h) {
  // column images of the standard basis give the matrix; read (p, s) back off it
  const img = [0, 1, 2].map((j) => act(g, act(h, j === 0 ? [1, 0, 0] : j === 1 ? [0, 1, 0] : [0, 0, 1])));
  const p = [0, 0, 0], s = [0, 0, 0];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (img[j][i]) { p[i] = j; s[i] = img[j][i]; }
  return frameOf(p, s);
}
export function inverse(g) { return FRAMES.find((h) => compose(g, h) === IDENTITY); }

// ------------------------------------------------------------------- poses --
// A pose (f, t) places a chair at x ↦ f(x) + t, with t in CUBE units.
export const pose = (f, t) => ({ f, t });
export const poseKey = (P) => frameKey(P.f) + '@' + P.t.join(',');
const ck = (a) => a.join(',');

/** Unit cells (min corners) a posed chair covers. */
export function cellsOf(P, scale = 1) {
  const out = [];
  for (const a of CELLS) {
    // centre of the scaled cell block, in half-units so it stays integer
    for (let dx = 0; dx < scale; dx++) for (let dy = 0; dy < scale; dy++) for (let dz = 0; dz < scale; dz++) {
      const c2 = [2 * (a[0] * scale + dx) + 1, 2 * (a[1] * scale + dy) + 1, 2 * (a[2] * scale + dz) + 1];
      const g = act(P.f, c2);
      out.push([(g[0] + 2 * P.t[0] - 1) / 2, (g[1] + 2 * P.t[1] - 1) / 2, (g[2] + 2 * P.t[2] - 1) / 2]);
    }
  }
  return out;
}

/** The posed chair's panels, as a map from panel-centre key to {n, feat: Map(pointKey → a)}. */
function panelsOf(P) {
  const m = new Map();
  const t8 = P.t.map((v) => v * E);
  const tr = (x) => { const g = act(P.f, x); return [g[0] + t8[0], g[1] + t8[1], g[2] + t8[2]]; };
  for (const pn of PANELS) {
    const feat = new Map();
    for (const q of pn.features) feat.set(ck(tr(q.p)), q.a);
    m.set(ck(tr(pn.c)), { n: act(P.f, pn.n), feat, id: pn.id });
  }
  return m;
}

const cache = new WeakMap();
function panelsCached(P) { let v = cache.get(P); if (!v) { v = panelsOf(P); cache.set(P, v); } return v; }

/**
 * Compare two posed chairs across every panel they share.
 * Returns { shared, ok } — shared is the number of coincident panel pairs,
 * ok is true iff at every coincident feature a bump meets a dent of the same
 * magnitude (a_A = −a_B), which is the paper's legality condition.
 */
export function contact(A, B) {
  const pa = panelsCached(A), pb = panelsCached(B);
  let shared = 0, ok = true;
  for (const [key, x] of pa) {
    const y = pb.get(key);
    if (!y) continue;
    if (x.n[0] + y.n[0] || x.n[1] + y.n[1] || x.n[2] + y.n[2]) continue; // same side: not a contact
    shared++;
    for (const [q, a] of x.feat) if (y.feat.get(q) !== -a) { ok = false; break; }
  }
  return { shared, ok };
}

export function overlaps(A, B) {
  const s = new Set(cellsOf(A).map(ck));
  return cellsOf(B).some((c) => s.has(ck(c)));
}

// --------------------------------------------------------- the 2388 → 44 ----
/** The 22 grid cells adjacent to the identity chair across its 24 panels. */
export function shellCells() {
  const s = new Map();
  for (const pn of PANELS) {
    const c = pn.c.map((v, i) => (v + pn.n[i] * E / 2 - E / 2) / E);
    s.set(ck(c), c);
  }
  return [...s.values()];
}

/**
 * Every face-neighbour pose of the identity chair, as the paper counts them:
 * put any of the 48 signed frames on any shell cell, via any of its 7 cells,
 * and reject overlaps. Returns [{P, legal, proper}].
 */
export function neighbourPoses() {
  const Q = pose(IDENTITY, [0, 0, 0]);
  const seen = new Map();
  for (const c of shellCells())
    for (const f of FRAMES) {
      const own = cellsOf(pose(f, [0, 0, 0]));
      for (const k of own) {
        const P = pose(f, [c[0] - k[0], c[1] - k[1], c[2] - k[2]]);
        const key = poseKey(P);
        if (seen.has(key) || overlaps(Q, P)) continue;
        const { shared, ok } = contact(Q, P);
        seen.set(key, { P, shared, legal: shared > 0 && ok, proper: f.det === 1 });
      }
    }
  return [...seen.values()];
}

export const atlas = () => neighbourPoses().filter((x) => x.legal).map((x) => x.P);

// ------------------------------------------------------------ substitution --
// Table 1 of the paper: eight proper rotations of the chair whose 56 cells
// partition the doubled chair 2P. (p, s, u) with u in cube units of 2P.
export const CHILDREN = [
  ['000', [0, 1, 2], [1, 1, 1], [0, 0, 0]],
  ['001', [1, 0, 2], [1, 1, -1], [0, 0, 4]],
  ['010', [0, 2, 1], [1, -1, 1], [0, 4, 0]],
  ['011', [2, 0, 1], [1, -1, -1], [0, 4, 4]],
  ['100', [2, 1, 0], [-1, 1, 1], [4, 0, 0]],
  ['101', [1, 2, 0], [-1, 1, -1], [4, 0, 4]],
  ['110', [0, 1, 2], [-1, -1, 1], [4, 4, 0]],
  ['central', [0, 1, 2], [1, 1, 1], [1, 1, 1]],
].map(([name, p, s, u]) => ({ name, f: frameOf(p, s), u }));

/** Refine: (G, t) ↦ {(GH, 2t + G u)}. Returns [{P, child}] with the child slot. */
export function refine(P) {
  return CHILDREN.map((ch, i) => {
    const gu = act(P.f, ch.u);
    return { P: pose(compose(P.f, ch.f), [2 * P.t[0] + gu[0], 2 * P.t[1] + gu[1], 2 * P.t[2] + gu[2]]), child: i };
  });
}

/**
 * The level-n patch: 8^n chairs partitioning 2^n P. Each entry carries its
 * pose and its path of child slots from the top (path[0] = the level-1 parent).
 */
export function patch(level) {
  let tiles = [{ P: pose(IDENTITY, [0, 0, 0]), path: [] }];
  for (let l = 0; l < level; l++)
    tiles = tiles.flatMap((T) => refine(T.P).map((r) => ({ P: r.P, path: [...T.path, r.child] })));
  return tiles;
}

/** Every pair of chairs in a tile list that share a panel, and whether it is legal. */
export function contactsWithin(tiles) {
  // bucket by cell so the check is linear, not quadratic
  const owner = new Map();
  tiles.forEach((T, i) => { for (const c of cellsOf(T.P)) owner.set(ck(c), i); });
  const pairs = new Set();
  const out = [];
  const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (const [key, i] of owner) {
    const c = key.split(',').map(Number);
    for (const d of dirs) {
      const j = owner.get(ck([c[0] + d[0], c[1] + d[1], c[2] + d[2]]));
      if (j === undefined || j === i) continue;
      const pk = i < j ? i + ':' + j : j + ':' + i;
      if (pairs.has(pk)) continue;
      pairs.add(pk);
      const r = contact(tiles[i].P, tiles[j].P);
      out.push({ i, j, ...r });
    }
  }
  return out;
}

/**
 * Every way to cut 2P into eight chairs in proper poses. First the exact covers
 * of its 56 cells by bare chairs; then, because the bare chair has a 3-fold
 * rotation (three proper poses cover the same seven cells), every choice of
 * pose for every piece, each tagged with whether all its internal contacts are
 * legal. The bare shape cannot tell those apart; the pyramids can.
 */
export function dissections() {
  const inside = (c) => c.every((v) => v >= 0 && v < 4) && !(c[0] >= 2 && c[1] >= 2 && c[2] >= 2);
  const byCells = new Map();
  for (const f of ROTATIONS)
    for (let x = -4; x <= 4; x++) for (let y = -4; y <= 4; y++) for (let z = -4; z <= 4; z++) {
      const P = pose(f, [x, y, z]);
      const cs = cellsOf(P);
      if (!cs.every(inside)) continue;
      const key = cs.map(ck).sort().join('|');
      if (!byCells.has(key)) byCells.set(key, { cells: new Set(cs.map(ck)), poses: [] });
      byCells.get(key).poses.push(P);
    }
  const placements = [...byCells.values()];
  const all = [];
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++)
    if (inside([x, y, z])) all.push(ck([x, y, z]));
  const covers = [];
  const used = new Set();
  const chosen = [];
  (function go() {
    const target = all.find((c) => !used.has(c));
    if (!target) { covers.push([...chosen]); return; }
    for (const pl of placements) {
      if (!pl.cells.has(target)) continue;
      let clash = false;
      for (const c of pl.cells) if (used.has(c)) { clash = true; break; }
      if (clash) continue;
      for (const c of pl.cells) used.add(c);
      chosen.push(pl);
      go();
      chosen.pop();
      for (const c of pl.cells) used.delete(c);
    }
  })();
  const decorated = [];
  for (const cover of covers) {
    const pick = [];
    (function go(i) {
      if (i === cover.length) {
        const cs = contactsWithin(pick.map((P) => ({ P })));
        decorated.push({ poses: [...pick], legal: cs.every((c) => c.ok) });
        return;
      }
      for (const P of cover[i].poses) { pick.push(P); go(i + 1); pick.pop(); }
    })(0);
  }
  return { covers: covers.length, posesPerPiece: placements.map((p) => p.poses.length), decorated };
}

// ------------------------------------------------- the parent-atlas identity --
/**
 * §3.2 of the paper: take a legal fine contact and a choice of child slot for
 * each side; that fixes the relative pose of the two parents. Dedupe, keep the
 * disjoint ones, keep those whose every fine contact is legal. The paper's
 * counts are 697 → 116 → 44 (697 excludes the pairs whose two chairs share a
 * parent, which fix the identity rather than a contact; sameParent counts them), and the 44 divided by two are exactly the atlas.
 * Parent poses here are in FINE units: a parent (G, T) carries 2P by x ↦ Gx + T.
 */
export function parentAtlas(A = atlas()) {
  const kids = (G, T) => CHILDREN.map((ch) => {
    const gu = act(G, ch.u);
    return pose(compose(G, ch.f), [T[0] + gu[0], T[1] + gu[1], T[2] + gu[2]]);
  });
  // parent of a fine pose F that sits in slot i: G = F Hᵢ⁻¹, T = f − G uᵢ
  const parentOf = (F, i) => {
    const G = compose(F.f, inverse(CHILDREN[i].f));
    const gu = act(G, CHILDREN[i].u);
    return { G, T: [F.t[0] - gu[0], F.t[1] - gu[1], F.t[2] - gu[2]] };
  };
  const cand = new Map();
  let sameParent = 0;
  const Q = pose(IDENTITY, [0, 0, 0]);
  for (const C of A)
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        const pa = parentOf(Q, i), pb = parentOf(C, j);
        const gi = inverse(pa.G);
        const G = compose(gi, pb.G);
        const d = act(gi, [pb.T[0] - pa.T[0], pb.T[1] - pa.T[1], pb.T[2] - pa.T[2]]);
        const R = pose(G, d);
        // G = id, d = 0 means both chairs sit in the SAME parent: that is not a
        // parent contact at all, and the paper's 697 does not count it.
        if (G === IDENTITY && !d[0] && !d[1] && !d[2]) { sameParent++; continue; }
        cand.set(poseKey(R), R);
      }
  const Q2 = kids(IDENTITY, [0, 0, 0]);
  const cellsQ2 = new Set(Q2.flatMap((P) => cellsOf(P)).map(ck));
  let disjoint = 0;
  const legal = [];
  for (const R of cand.values()) {
    const K = kids(R.f, R.t);
    if (K.flatMap((P) => cellsOf(P)).some((c) => cellsQ2.has(ck(c)))) continue;
    disjoint++;
    let ok = true, touch = 0;
    for (const a of Q2) for (const b of K) {
      const r = contact(a, b);
      if (r.shared) { touch++; if (!r.ok) { ok = false; break; } }
      if (!ok) break;
    }
    if (ok && touch) legal.push(R);
  }
  return { candidates: cand.size, sameParent, disjoint, legal };
}

// --------------------------------------------------------------- symmetry --
/** Isometries of the grid that carry the decorated chair onto itself. */
export function selfSymmetries({ decorated = true } = {}) {
  const Q = pose(IDENTITY, [0, 0, 0]);
  const base = new Set(cellsOf(Q).map(ck));
  const deco = (P) => {
    const s = new Set();
    for (const [, pn] of panelsCached(P)) for (const [q, a] of pn.feat) s.add(q + '|' + pn.n.map((v) => v * a).join(','));
    return s;
  };
  const d0 = deco(Q);
  const out = [];
  for (const f of FRAMES)
    for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) for (let z = -2; z <= 2; z++) {
      const P = pose(f, [x, y, z]);
      const cs = cellsOf(P);
      if (!cs.every((c) => base.has(ck(c)))) continue;
      if (!decorated) { out.push(P); continue; }
      const d = deco(P);
      let same = d.size === d0.size;
      if (same) for (const k of d) if (!d0.has(k)) { same = false; break; }
      if (same) out.push(P);
    }
  return out;
}

// ------------------------------------------------------------------- mesh ---
/**
 * Triangulate a decorated chair, in cube units.
 *   base   — pyramid base side (true value 1/50)
 *   height — height per unit of |a| (true value 1/10000)
 * Each panel is cut on a grid through every feature's base edges, so the flat
 * part leaves square holes exactly where the pyramids stand. Returns
 * { pos: Float32Array, nrm: Float32Array, tag: Int16Array } — tag is the
 * signed coefficient for pyramid facets and 0 for flat panel.
 * With features off it is simply 48 triangles.
 */
export function mesh({ base = TRUE_BASE, height = TRUE_HEIGHT, features = true } = {}) {
  const pos = [], nrm = [], tag = [];
  const h = base / 2;
  const tri = (a, b, c, n, t) => { pos.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) { nrm.push(...n); tag.push(t); } };
  for (const pn of PANELS) {
    const c = pn.c.map((v) => v / E), n = pn.n, e1 = pn.e1, e2 = pn.e2;
    const at = (u, v, w = 0) => [0, 1, 2].map((i) => c[i] + u * e1[i] + v * e2[i] + w * n[i]);
    // orient every triangle so it faces outward along n
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const flip = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] < 0;
    const quad = (u0, v0, u1, v1, t) => {
      const A = at(u0, v0), B = at(u1, v0), C = at(u1, v1), D = at(u0, v1);
      if (flip) { tri(A, C, B, n, t); tri(A, D, C, n, t); } else { tri(A, B, C, n, t); tri(A, C, D, n, t); }
    };
    if (!features) { quad(-0.5, -0.5, 0.5, 0.5, 0); continue; }
    const fs = pn.features.map((q) => ({ u: q.u / E, v: q.v / E, a: q.a }));
    const us = new Set([-0.5, 0.5]), vs = new Set([-0.5, 0.5]);
    for (const q of fs) { us.add(q.u - h); us.add(q.u + h); vs.add(q.v - h); vs.add(q.v + h); }
    const U = [...us].sort((a, b) => a - b), V = [...vs].sort((a, b) => a - b);
    for (let i = 0; i + 1 < U.length; i++)
      for (let j = 0; j + 1 < V.length; j++) {
        const mu = (U[i] + U[i + 1]) / 2, mv = (V[j] + V[j + 1]) / 2;
        if (fs.some((q) => Math.abs(mu - q.u) < h && Math.abs(mv - q.v) < h)) continue;
        quad(U[i], V[j], U[i + 1], V[j + 1], 0);
      }
    for (const q of fs) {
      const apex = at(q.u, q.v, q.a * height);
      const corners = [at(q.u - h, q.v - h), at(q.u + h, q.v - h), at(q.u + h, q.v + h), at(q.u - h, q.v + h)];
      for (let k = 0; k < 4; k++) {
        let a = corners[k], b = corners[(k + 1) % 4];
        if (flip) [a, b] = [b, a];
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [apex[0] - a[0], apex[1] - a[1], apex[2] - a[2]];
        const fn = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const L = Math.hypot(...fn) || 1;
        tri(a, b, apex, fn.map((x) => x / L), q.a);
      }
    }
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), tag: new Int16Array(tag) };
}

/** Signed volume of a triangle soup (divergence theorem). */
export function volume(pos) {
  let v = 0;
  for (let i = 0; i < pos.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = pos.subarray ? pos.subarray(i, i + 9) : pos.slice(i, i + 9);
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}

/** Apply a pose to a point in cube units. */
export function place(P, x) {
  const g = act(P.f, x);
  return [g[0] + P.t[0], g[1] + P.t[1], g[2] + P.t[2]];
}
