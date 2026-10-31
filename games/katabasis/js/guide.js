/* KATABASIS's tactical guide, no DOM: the page asks it in a worker (./guide-worker.js), the selftest in node.

   From where you stand (a whole-voxel place and an orientation, as the rules see you), it answers with the
   fewest flips left to the crystal, where the next flip of one such route is made (at, with up atUp) and
   which way it turns you (to, your up after it), and here: the ups you could flip to from this very spot and
   still be on a fewest-flips route. The page shows `at` as a wisp of light (a 4D point, so it can be off in w)
   and names the flip once you're somewhere a right one can be made. */
import { explore, flipsFrom, flipFrom, step, settle, supported, dimsOf, axisVec, ORIENTATIONS, FLIP_NAMES, CANON, FLIP_R } from "./cave.js";

const upOf = (o) => axisVec(ORIENTATIONS[o], 1);

export function advise(cave, c, o) {
  const goal = (s) => cave.goal(s.c, dimsOf(ORIENTATIONS[s.o]));
  const r = explore(cave, { c, o }, { trace: true, visit: goal });
  if (r.flips === null) return { flips: null, here: [] };
  const s0 = { c: settle(cave, c, CANON[o]), o: CANON[o] }, out = { flips: r.flips, here: [] };
  // the route's first flip: replay its steps to it
  let s = s0;
  for (const m of r.path) {
    if (m.startsWith("step")) { s = { c: step(cave, s.c, s.o, +m.slice(4)), o: s.o }; continue; }
    const l = flipFrom(cave, s.c, s.o, FLIP_NAMES.indexOf(m.slice(5)));
    out.at = s.c; out.atUp = upOf(s.o); out.atDims = dimsOf(ORIENTATIONS[s.o]); out.to = upOf(l.o);
    break;
  }
  // the flips from right here that leave one fewer to go
  if (r.flips > 0) for (const l of flipsFrom(cave, s0.c, s0.o)) {
    const g = explore(cave, l, { maxFlips: r.flips - 1, visit: goal });
    if (g.flips !== null && g.flips <= r.flips - 1) out.here.push(upOf(l.o));
  }
  return out;
}

/* the fairy rings: every rock voxel you could stand on (with orientation o's up) and flip from. A place is a
   flip place when the rules would let you flip there: your box clear, rock under it, a voxel of headroom to
   hop, and the ball round your centre clear. The floor under each such place is marked, so the page can show
   it glowing: you can flip wherever you stand wholly on it */
export function flipFloor(cave, o) {
  const O = ORIENTATIONS[o], d = dimsOf(O), [a, s] = O[1], [X, Y, Z, W] = cave.dims, mark = new Uint8Array(cave.v.length);
  const c = [0, 0, 0, 0];
  for (c[3] = 0; c[3] <= W - d[3]; c[3]++) for (c[2] = 0; c[2] <= Z - d[2]; c[2]++) for (c[1] = 0; c[1] <= Y - d[1]; c[1]++) for (c[0] = 0; c[0] <= X - d[0]; c[0]++) {
    if (!cave.clear(c, d) || !supported(cave, c, o)) continue;
    const h = c.slice(); h[a] += s;
    if (!cave.clear(h, d) || !cave.ballClear(h.map((v, i) => v + d[i] / 2), FLIP_R)) continue;
    const lo = c.slice(), hi = c.map((v, i) => v + d[i]), at = s > 0 ? c[a] - 1 : c[a] + d[a]; lo[a] = at; hi[a] = at + 1;
    for (let w = lo[3]; w < hi[3]; w++) for (let z = lo[2]; z < hi[2]; z++) for (let y = lo[1]; y < hi[1]; y++) for (let x = lo[0]; x < hi[0]; x++) {
      const i = x + X * (y + Y * (z + Z * w)); if (cave.v[i] === 1) mark[i] = 1;
    }
  }
  return mark;
}
/* can you flip from exactly here (whole-voxel corner c, orientation o)? The rule tryFlip asks */
export function canFlipAt(cave, c, o) { return cave.clear(c, dimsOf(ORIENTATIONS[o])) && supported(cave, c, o) && flipsFrom(cave, c, o).length > 0; }
