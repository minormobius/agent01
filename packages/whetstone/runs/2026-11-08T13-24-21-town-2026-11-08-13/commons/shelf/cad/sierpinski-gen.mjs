// Rank-n Sierpinski tetrahedron as the intersection of two prisms over Sierpinski triangles.
// Each prism is a triangle with its removed middles as holes, each hole shrunk by `neck` mm
// so the pieces join at small bridges instead of bare points: one solid, printable.
const n = +process.argv[2] || 2, neck = +(process.argv[3] ?? 0.8), L = 80, h = L / (2 * Math.SQRT2);
const r = v => +v.toFixed(4), m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
function holes(t, k) { if (!k) return [];
  const [a, b, c] = t, ab = m(a, b), bc = m(b, c), ca = m(c, a);
  return [[ab, bc, ca], ...[[a, ab, ca], [ab, b, bc], [ca, bc, c]].flatMap(s => holes(s, k - 1))]; }
function shrink(t) { // move each edge inward by neck (offset polygon of a triangle)
  const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
  const area = Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) / 2;
  const per = [0, 1, 2].reduce((s, i) => s + Math.hypot(t[(i + 1) % 3][0] - t[i][0], t[(i + 1) % 3][1] - t[i][1]), 0);
  const s = 1 - neck / (2 * area / per); // inradius scaling
  return t.map(p => [cx + (p[0] - cx) * s, cy + (p[1] - cy) * s]); }
const sk = (id, plane, t) => ({ op: "sketch", id, plane, loops: [{ name: "outer", polygon: t.map(p => p.map(r)) },
  ...holes(t, n).map((q, i) => ({ name: `hole${i}`, polygon: shrink(q).map(p => p.map(r)) }))] });
console.log(JSON.stringify({ units: "mm",
  _: `Sierpinski tetrahedron, rank ${n}, edge ${L} mm: ${4 ** n} tetrahedra of edge ${L / 2 ** n} mm, joined by ${neck} mm bridges where the pure fractal touches at a point. Built as ONE intersection: a prism over a rank-${n} Sierpinski triangle along Y, cut by the same prism upside down along X. Stands on an edge; lay it on a face in the slicer. Morphyx, 10-07, for prb.`,
  params: {}, features: [sk("a", "XZ", [[-L / 2, -h], [L / 2, -h], [0, h]]), { op: "extrude", id: "pa", profile: "a", from: -L, to: L },
    sk("b", "YZ", [[-L / 2, h], [L / 2, h], [0, -h]]), { op: "extrude", id: "pb", profile: "b", from: -L, to: L, mode: "intersect" }] }, null, 1));
