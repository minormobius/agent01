/* ATOM⁴ — sections 5 and 6: the six regular 4D solids, and darbon, each in its own tile (./tile.js). */
import { polytopes, star, diamondNet } from "./polytopes.js";
import { makeTile, eye, turn, turnLocal } from "./tile.js";

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
  // 5 · the six
  const grid = $("solidTiles");
  for (const p of polytopes()) {
    tiles.push(makeTile(grid, { P: p.V, lines: p.E, faces: p.F }, {
      title: `${p.name} <small>${p.sym}</small>`, start: tilted(),
      sub: `${p.V.length} vertices · ${p.E.length} edges · ${p.F.length} ${p.faceName}s · ${p.C.length} ${p.cellName} · 3D cousin: ${p.cousin}`,
    }));
  }
  // 6 · darbon
  const mols = $("darbonTiles");
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
