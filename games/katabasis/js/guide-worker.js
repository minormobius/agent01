/* KATABASIS's tactical guide, off the page's thread: the cave once ({ cave: { dims, v } }), then questions
   ({ id, gen, c, o }) answered with ./guide.js's advice. */
import { Cave } from "./cave.js";
import { advise } from "./guide.js";

let cave = null;
onmessage = (e) => {
  const m = e.data;
  if (m.cave) { cave = new Cave(...m.cave.dims); cave.v = new Uint8Array(m.cave.v); return; }
  if (cave) postMessage({ id: m.id, gen: m.gen, ...advise(cave, m.c, m.o) });
};
