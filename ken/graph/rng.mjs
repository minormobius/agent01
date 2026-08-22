/* ken/graph/rng.mjs — the one deterministic generator this site uses.

   Split out of lab/simulate.mjs because two unrelated things wanted it: a
   statistics simulator, which belongs beside the design calculator, and a
   force layout, which belongs beside the graph code and must be loadable
   in a browser. simulate.mjs pulls in design.mjs and packages/dataviz, so
   a layout importing it dragged the whole statistics stack into the page.

   Never Math.random anywhere on this surface. A published sampling
   distribution has to be reproducible exactly, which is what lets
   ken.selftest.mjs assert WP1's tables digit for digit. */

/** mulberry32: small, fast, and adequate for design simulation. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
