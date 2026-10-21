// The top widget on other lattices (Morphyx, 10-14). It uses the kit's own lattice code, so the picture is
// the grid the selftest checked. The paper's square grid still runs through perc.js (Modulo's, twin-checked).
import { lattice, rng } from './kit/clone.mjs';

export function picture(G, ord, p) { // 0 empty, 1 filled, 2 in a cluster joining top and bottom
  const n = G.N, m = Math.round(p * n), TOP = n, BOT = n + 1, par = new Int32Array(n + 2), occ = new Uint8Array(n);
  for (let i = 0; i < n + 2; i++) par[i] = i;
  const find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  for (let k = 0; k < m; k++) { const s = ord[k]; occ[s] = 1; if (G.top[s]) uni(s, TOP); if (G.bot[s]) uni(s, BOT);
    for (let e = G.off[s]; e < G.off[s + 1]; e++) if (occ[G.nb[e]]) uni(s, G.nb[e]); }
  const spans = find(TOP) === find(BOT), root = find(TOP), out = new Uint8Array(n);
  for (let s = 0; s < n; s++) out[s] = !occ[s] ? 0 : spans && find(s) === root ? 2 : 1;
  return { cells: out, spans };
}

export function makeGraph(name, L, seed) { return lattice(name, L, false, rng(seed)); }

// Shapes to draw, in a W×H box: squares, hexagons (pointy-top, axial, unrolled cylinder), or Voronoi polygons.
export function shapes(name, G, W) {
  const L = G.L, out = new Array(G.N);
  if (name === 'vor') { const k = W / L; for (let i = 0; i < G.N; i++) out[i] = G.polys[i].map(([x, y]) => [x * k, y * k]); return { out, H: W }; }
  if (name === 'hex6c') {
    const w = W / L, sz = w / Math.sqrt(3), H = (1.5 * (L - 1) + 2) * sz;
    for (let i = 0; i < G.N; i++) { const r = (i / L) | 0, c = i % L;
      let cx = ((c + r / 2) % L) * w + w / 2; const cy = sz + 1.5 * r * sz, P = [];
      for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); P.push([cx + sz * Math.cos(a), cy + sz * Math.sin(a)]); }
      out[i] = P; }
    return { out, H, wrapW: W };
  }
  const k = W / L; for (let i = 0; i < G.N; i++) { const r = (i / L) | 0, c = i % L; out[i] = [[c * k, r * k], [(c + 1) * k, r * k], [(c + 1) * k, (r + 1) * k], [c * k, (r + 1) * k]]; }
  return { out, H: W };
}

export function draw(cx, sh, cells, pal) {
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, cx.canvas.width, cx.canvas.height);
  const poly = (P, dx) => { cx.beginPath(); cx.moveTo(P[0][0] + dx, P[0][1]); for (let k = 1; k < P.length; k++) cx.lineTo(P[k][0] + dx, P[k][1]); cx.closePath(); cx.fill(); cx.stroke(); };
  for (let i = 0; i < sh.out.length; i++) { cx.fillStyle = pal[cells[i]]; cx.strokeStyle = cells[i] ? pal[cells[i]] : '#e4e4dc';
    poly(sh.out[i], 0); if (sh.wrapW) { poly(sh.out[i], -sh.wrapW); } } // a hex cut by the right edge shows again on the left
}
