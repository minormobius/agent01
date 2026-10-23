/* KATABASIS's tactical guide, no DOM: the page asks it in a worker (./guide-worker.js), the selftest in node.

   From where you stand (a whole-voxel place and an orientation, as the rules see you), it answers with the
   fewest flips left to the crystal, where the next flip of one such route is made (at, with up atUp) and
   which way it turns you (to, your up after it), and here: the ups you could flip to from this very spot and
   still be on a fewest-flips route. The page shows `at` as a wisp of light (a 4D point, so it can be off in w)
   and names the flip once you're somewhere a right one can be made. */
import { explore, flipsFrom, flipFrom, step, settle, dimsOf, axisVec, ORIENTATIONS, FLIP_NAMES, CANON } from "./cave.js";

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
