/* ATOM⁴ — the shapes, darbon and Xater chapters' tiles: the six regular 4D solids, darbon, and water beside Xater
   (./tile.js draws them). */
import { polytopes, star, diamondNet } from "./polytopes.js";
import { makeTile, eye, turn, turnLocal } from "./tile.js";
import { MOLECULES } from "./molecules.js";
import { TABLE } from "./table.js";

const $ = (id) => document.getElementById(id);
const tilted = () => turn(turn(turn(eye(), 0, 3, 0.55), 1, 2, 0.35), 2, 3, 0.45);
const tilted3 = () => turn(turn(eye(), 1, 2, -0.35), 0, 2, 0.5);
/* molecules side by side in one scene: offset each one's bond indices */
function combine(...mols) {
  const out = { balls: [], bonds: [], ghost: [] };
  for (const m of mols) { const o = out.balls.length; out.balls.push(...m.balls); out.bonds.push(...m.bonds.map(([a, b]) => [a + o, b + o])); out.ghost.push(...(m.ghost || []).map(([a, b]) => [a + o, b + o])); }
  return out;
}
const moved = (m, f) => ({ ...m, balls: m.balls.map((b) => ({ ...b, p: f(b.p) })) });
const net = (d, R, el) => { const n = diamondNet(d, R); return { balls: n.nodes.map((x) => ({ p: x.p.map((v, i) => v - n.centre[i]), el, r: 0.16 })), bonds: n.bonds, size: n.nodes.length }; };

export const tiles = [];
export function buildShapes() {
  // the six
  const grid = $("solidTiles");
  if (grid) for (const p of polytopes()) {
    tiles.push(makeTile(grid, { P: p.V, lines: p.E, faces: p.F }, {
      title: `${p.name} <small>${p.sym}</small>`, start: tilted(),
      sub: `${p.V.length} vertices · ${p.E.length} edges · ${p.F.length} ${p.faceName}s · ${p.C.length} ${p.cellName} · 3D cousin: ${p.cousin}`,
    }));
  }
  buildXater();
  // darbon
  const mols = $("darbonTiles"); if (!mols) return;
  tiles.push(makeTile(mols, star(3, "C", ["H"]), { title: "CH₄, methane", sub: "four bonds to a tetrahedron's corners, 109.47° apart", start: tilted3(), spin: [0, 0.004], sliceRange: 1.3 }));
  tiles.push(makeTile(mols, star(4, "D", ["H"]), { title: "DH₅", sub: "five bonds to a 5-cell's corners, 104.48° apart", start: tilted(), sliceRange: 1.3 }));
  const chiral = (d, els) => {
    const m = star(d, d === 3 ? "C" : "D", els, { bond: 0.9 });
    return combine(moved(m, (p) => [p[0] - 1.3, p[1], p[2], p[3]]), { ...moved(m, (p) => [1.3 - p[0], p[1], p[2], p[3]]), balls: moved(m, (p) => [1.3 - p[0], p[1], p[2], p[3]]).balls.map((b) => ({ ...b, group: 1 })) });
  };
  tiles.push(makeTile(mols, chiral(3, ["H", "F", "Cl", "Br"]), {
    title: "a molecule and its mirror image", sub: "in 3D no turn makes one into the other; in 4D, half a turn through w does", R: 1.9, start: turn(eye(), 1, 2, -0.3), spin: [0, 0],
    extras: [{ label: "turn the left one through w", onClick: (T) => { const L0 = T.L[0] || eye(); T.animate(1600, (t) => { T.L[0] = turnLocal(L0, 0, 3, Math.PI * t); }); } }, { label: "reset", onClick: (T) => { T.L = {}; } }],
  }));
  tiles.push(makeTile(mols, chiral(4, ["H", "F", "Cl", "Br", "I"]), {
    title: "darbon's mirror image", sub: "five different neighbours: chiral, and no turn in four dimensions undoes it", R: 1.9, start: tilted(), spin: [0.002, 0],
  }));
  const nets = $("netTiles");
  const n2 = net(2, 2.6, "C"), n3 = net(3, 2.1, "C"), n4 = net(4, 1.9, "D");
  tiles.push(makeTile(nets, n2, { title: "2D: graphene", sub: `three bonds at 120° · ${n2.size} atoms`, R: 2.6, start: tilted3(), spin: [0, 0.004], sliceRange: 2.6 }));
  tiles.push(makeTile(nets, n3, { title: "3D: diamond", sub: `four bonds at 109.47° · ${n3.size} atoms`, R: 2.3, start: tilted3(), spin: [0, 0.004], sliceRange: 2.3 }));
  tiles.push(makeTile(nets, n4, { title: "4D: darbon's diamond", sub: `five bonds at 104.48° · ${n4.size} atoms`, R: 2.1, start: tilted(), sliceRange: 2.1 }));
}

/* water and Xater at their computed shapes, to one scale (2.8 bohr to a unit). The lone pairs: the one along the
   bisector, and the pair of p orbitals at right angles to the molecule's plane. In 3D the space at right angles to a
   plane is a line, so those make two lobes; in 4D it is a plane, they're two-fold, and any turn in that plane leaves
   the molecule as it was: a ring */
function buildXater() {
  const host = $("xaterTiles"); if (!host) return;
  const LP = "#6fe0ff", u = 1 / 2.8;
  const mol = (m, c, r) => {
    const th = (m.theta * Math.PI) / 180, R = m.R * u, h = (s) => ({ p: [R * Math.cos(th / 2), s * R * Math.sin(th / 2), 0, 0], el: "H", r: 0.13 });
    return { balls: [{ p: [0, 0, 0, 0], c, r: 0.17 }, h(1), h(-1), { p: [-r * u, 0, 0, 0], c: LP, r: 0.08 }], bonds: [[0, 1], [0, 2]], ring: r * u };
  };
  const r2p = (d, Z) => TABLE[d][Z - 1].orb.find((o) => o.s === "2p").r; // the lone pairs drawn at the 2p's mean radius
  const w = mol(MOLECULES[3].big, "#d9483b", r2p(3, 8)), y = mol(MOLECULES[4].big, "#c79bff", r2p(4, 10));
  w.balls.push({ p: [0, 0, w.ring, 0], c: LP, r: 0.08 }, { p: [0, 0, -w.ring, 0], c: LP, r: 0.08 });
  const K = 48; y.P = Array.from({ length: K }, (_, k) => [0, 0, y.ring * Math.cos((2 * Math.PI * k) / K), y.ring * Math.sin((2 * Math.PI * k) / K)]); y.lines = y.P.map((_, k) => [k, (k + 1) % K]);
  tiles.push(makeTile(host, w, { title: "our water", sub: `bent at ${MOLECULES[3].big.theta.toFixed(1)}° · its lone pair at right angles to the plane: two lobes`, R: 1.2, start: tilted3(), spin: [0, 0.004], sliceRange: 0.8 }));
  tiles.push(makeTile(host, y, { title: "Xater, H₂Px", sub: `bent at ${MOLECULES[4].big.theta.toFixed(1)}° · its two lone pairs at right angles to the plane: a ring`, R: 1.2, start: tilted(), sliceRange: 0.8 }));
}
