/* Computes slices off the page's thread. Takes { id, species, jitter, C, F, B }; answers { id, cells, pairs, focusKey }
   with each cell as { key, q, h, inside, volume, kinds (its faces by number of sides), faces (count) } */
import { SPECIES, slice, faceKinds } from "./foam.js";

onmessage = (e) => {
  const { id, species, jitter, C, F, B } = e.data, sp = SPECIES[species];
  if (sp.kind === "random") sp.jitter = jitter;
  const S = slice(sp, { C, F, B });
  const cells = S.cells.map((c) => { const kinds = faceKinds(c); return { key: c.key, q: c.q, h: c.h, inside: c.inside, volume: c.volume, kinds, faces: Object.values(kinds).reduce((a, b) => a + b, 0), verts: new Set(c.poly.flatMap((f) => f.pts.map((p) => p.map((v) => v.toFixed(6)).join(",")))).size }; });
  postMessage({ id, cells, pairs: [...S.pairs], focusKey: S.focusKey });
};
