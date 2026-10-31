/* The filling diagram, both worlds: subshells in a grid of n (down) by l (across), filled along the diagonals of
   n + l, each from its highest l down to its s (Madelung's rule). The diagonals are the same in 3D and 4D; what
   changes is how much each subshell holds, 2(2l + 1) in ours and 2(l + 1)² in 4D, so the same order closes its rows
   at 2, 10, 18, 36, 54 in ours and at 2, 12, 22, 50, 78 in 4D. ATOM⁴'s solver finds this order for every 4D element
   it solved, to 78 (5p full). Past that the 4D boxes are the rule's, not computed, and drawn dashed. */
const L = "spdf", NMAX = 7;
export const capacity = (l, d) => (d === 3 ? 2 * (2 * l + 1) : 2 * (l + 1) ** 2);

/* the subshells in filling order, each with the elements that fill it */
export function order(d) {
  const out = []; let Z = 0;
  for (let k = 1; k <= NMAX + 1; k++) for (let l = Math.min(k - 1, 3); l >= 0; l--) {
    const n = k - l; if (n < 1 || n > NMAX || l > n - 1) continue;
    const c = capacity(l, d); out.push({ n, l, k, name: `${n}${L[l]}`, cap: c, from: Z + 1, to: Z + c }); Z += c;
  }
  return out;
}
// the 4D solver went as far as element 78; ours is known (and measured) all the way
const COMPUTED_TO = { 3: Infinity, 4: 78 };

/* our elements' real configurations to 54, as occupancies: Madelung's order with its known exceptions */
const OUR_EXCEPT = { 24: ["3d", 1], 29: ["3d", 1], 41: ["4d", 1], 42: ["4d", 1], 44: ["4d", 1], 45: ["4d", 1], 46: ["4d", 2], 47: ["4d", 1] };
export function ourOccupancy(Z) {
  const occ = new Map(); let left = Z;
  for (const s of order(3)) { if (!left) break; const k = Math.min(left, s.cap); occ.set(s.name, k); left -= k; }
  const ex = OUR_EXCEPT[Z]; if (ex) { const sName = `${+ex[0][0] + 1}s`; occ.set(ex[0], occ.get(ex[0]) + ex[1]); occ.set(sName, occ.get(sName) - ex[1]); }
  return occ;
}
export const parseConfig = (cfg) => new Map(cfg.split(" ").map((t) => [t.match(/^\d+[spdf]/)[0], +t.replace(/^\d+[spdf]/, "")]));

/* one diagram as SVG: occ is the selected element's occupancy (a Map), top its outermost subshell, colour its world's */
export function svg(d, occ, top, colour) {
  const cw = 54, ch = 40, gx = 5, gy = 5, x0 = 18, y0 = 16, W = x0 + 4 * (cw + gx), H = y0 + NMAX * (ch + gy) + 2;
  const at = (n, l) => [x0 + l * (cw + gx), y0 + (n - 1) * (ch + gy)], subs = order(d), lim = COMPUTED_TO[d];
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Filling order in ${d}D">`;
  for (let l = 0; l < 4; l++) s += `<text x="${at(1, l)[0] + cw / 2}" y="11" class="fl-h">${L[l]}</text>`;
  for (let n = 1; n <= NMAX; n++) s += `<text x="${x0 - 6}" y="${at(n, 0)[1] + ch / 2 + 4}" class="fl-h" text-anchor="end">${n}</text>`;
  // the diagonals first, under the boxes: from each one's highest l down to its s, an arrow at the s end
  for (let k = 1; k <= NMAX; k++) {
    const on = subs.filter((q) => q.k === k); if (on.length < 2) continue;
    const a = on[0], b = on.at(-1), [xa, ya] = at(a.n, a.l), [xb, yb] = at(b.n, b.l);
    const p = [xa + cw * 0.78, ya + ch * 0.32], q = [xb + cw * 0.3, yb + ch * 0.7], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    s += `<path d="M${p[0]},${p[1]}L${q[0]},${q[1]}M${q[0]},${q[1]}l${(-ux * 6 + uy * 3.5).toFixed(1)},${(-uy * 6 - ux * 3.5).toFixed(1)}M${q[0]},${q[1]}l${(-ux * 6 - uy * 3.5).toFixed(1)},${(-uy * 6 + ux * 3.5).toFixed(1)}" class="fl-arrow"/>`;
  }
  for (const sh of subs) {
    const [x, y] = at(sh.n, sh.l), o = occ?.get(sh.name) ?? 0, f = o / sh.cap, ruled = sh.from > lim;
    s += `<g class="fl-c${ruled ? " ruled" : ""}${sh.name === top ? " top" : ""}"><rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="4"/>`;
    if (f > 0) s += `<rect x="${x}" y="${y + ch * (1 - f)}" width="${cw}" height="${ch * f}" rx="${f > 0.9 ? 4 : 1}" fill="${colour}" fill-opacity="0.35"/>`;
    s += `<text x="${x + 5}" y="${y + 14}" class="fl-n">${sh.name}</text><text x="${x + cw - 4}" y="${y + 13}" class="fl-cap${o && o < sh.cap ? " part" : ""}" text-anchor="end">${o && o < sh.cap ? `${o}/` : ""}${sh.cap}</text>`;
    s += `<text x="${x + cw / 2}" y="${y + ch - 5}" class="fl-z">${sh.from}–${sh.to}</text></g>`;
  }
  return s + "</svg>";
}

/* where the rows close: the running total at each p subshell (and 1s), the noble gases */
export function nobles(d, upTo = 6) {
  return order(d).filter((q) => q.name === "1s" || (q.l === 1 && q.n <= upTo)).map((q) => q.to);
}
