// The SUBSTRATE axis — the space the game lives on. This is the deepest knob of
// the meta-generator: topology. Every substrate exposes the same tiny interface,
// so the engine, the solver, and the renderer never know which one they're on.
//
//   step(cell, dir) -> { cell, dir } | null
//       Move one cell in direction `dir`. Returns the cell reached AND the
//       OUTGOING direction — which can differ from `dir` on a Möbius/Klein
//       seam, where the local frame flips. That direction-transport is what
//       makes a slide on a Möbius band curl back on itself: it is the topology
//       leaking into the gameplay. Returns null at an open boundary.
//   ncells, dirs                — counts
//   dirName(d)                  — label, for UI
//   layout(cell) -> {x,y, ...}  — render coordinates (logical, 0..W / 0..H)
//   seam(cell, dir)             — true if step crosses a wrap seam (render hint)
//
// Square family directions: 0=N 1=E 2=S 3=W. Hex: 6 axial directions.

const SQ_DX = [0, 1, 0, -1], SQ_DY = [-1, 0, 1, 0];
const SQ_NAMES = ['N', 'E', 'S', 'W'];
const flipNS = (d) => (d === 0 ? 2 : d === 2 ? 0 : d);   // flip vertical heading
const flipEW = (d) => (d === 1 ? 3 : d === 3 ? 1 : d);

function squareFamily(id, name, W, H, wrapX, wrapY, mobiusX, mobiusY) {
  return {
    id, name, family: 'square', W, H, ncells: W * H, dirs: 4,
    dirName: (d) => SQ_NAMES[d],
    idx: (x, y) => y * W + x,
    xy: (c) => [c % W, (c / W) | 0],
    step(cell, dir) {
      let x = cell % W, y = (cell / W) | 0;
      let nx = x + SQ_DX[dir], ny = y + SQ_DY[dir], nd = dir;
      // X boundary
      if (nx < 0 || nx >= W) {
        if (!wrapX) return null;
        nx = (nx + W) % W;
        if (mobiusX) { ny = H - 1 - ny; nd = flipNS(nd); }   // Möbius seam in X: flip vertical
      }
      // Y boundary
      if (ny < 0 || ny >= H) {
        if (!wrapY) return null;
        ny = (ny + H) % H;
        if (mobiusY) { nx = W - 1 - nx; nd = flipEW(nd); }
      }
      return { cell: ny * W + nx, dir: nd };
    },
    seam(cell, dir) {
      const x = cell % W, y = (cell / W) | 0;
      const nx = x + SQ_DX[dir], ny = y + SQ_DY[dir];
      return nx < 0 || nx >= W || ny < 0 || ny >= H;
    },
    layout(cell) { return { x: cell % W, y: (cell / W) | 0 }; },
  };
}

// Pointy-top hex on an axial grid stored as a W×H rectangle of (col,row).
// 6 directions; non-wrapping (a distinct *shape* of adjacency, the simplest way
// to make square intuitions fail).
const HEX_DIRS = [
  // even-row offsets vs odd-row offsets for "offset" coords (row parity)
  // E, W, NE, NW, SE, SW
  { name: 'E', dx: [1, 1], dy: [0, 0] },
  { name: 'W', dx: [-1, -1], dy: [0, 0] },
  { name: 'NE', dx: [0, 1], dy: [-1, -1] },
  { name: 'NW', dx: [-1, 0], dy: [-1, -1] },
  { name: 'SE', dx: [0, 1], dy: [1, 1] },
  { name: 'SW', dx: [-1, 0], dy: [1, 1] },
];
function hexFamily(W, H) {
  return {
    id: 'hex', name: 'Hex', family: 'hex', W, H, ncells: W * H, dirs: 6,
    dirName: (d) => HEX_DIRS[d].name,
    idx: (x, y) => y * W + x,
    xy: (c) => [c % W, (c / W) | 0],
    step(cell, dir) {
      const x = cell % W, y = (cell / W) | 0;
      const par = y & 1;
      const nx = x + HEX_DIRS[dir].dx[par], ny = y + HEX_DIRS[dir].dy[par];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) return null;
      return { cell: ny * W + nx, dir };
    },
    seam() { return false; },
    layout(cell) { const x = cell % W, y = (cell / W) | 0; return { x: x + (y & 1) * 0.5, y: y * 0.866 }; },
  };
}

export const SUBSTRATES = {
  grid: (W, H) => squareFamily('grid', 'Grid', W, H, false, false, false, false),
  cylinder: (W, H) => squareFamily('cylinder', 'Cylinder', W, H, true, false, false, false),
  torus: (W, H) => squareFamily('torus', 'Torus', W, H, true, true, false, false),
  mobius: (W, H) => squareFamily('mobius', 'Möbius', W, H, true, false, true, false),
  klein: (W, H) => squareFamily('klein', 'Klein', W, H, true, true, true, false),
  hex: (W, H) => hexFamily(W, H),
};

export const SUBSTRATE_IDS = Object.keys(SUBSTRATES);

export function makeSubstrate(id, W, H) {
  const f = SUBSTRATES[id];
  if (!f) throw new Error('unknown substrate ' + id);
  return f(W, H);
}
