/* KATABASIS's cave generator, off the page's thread: { id, tier, seed } in, the cave's voxels (transferred)
   and its proved par out. A seed that makes no cave (rare) says so, and the page tries the next one. */
import { generate } from "./gen.js";

onmessage = (e) => {
  const { id, tier, seed } = e.data, g = generate(tier, seed);
  if (!g) { postMessage({ id, fail: true }); return; }
  postMessage({ id, dims: g.cave.dims, v: g.cave.v.buffer, start: g.start, par: g.par, needs: g.needs, line: g.line, name: g.name, tier, seed }, [g.cave.v.buffer]);
};
