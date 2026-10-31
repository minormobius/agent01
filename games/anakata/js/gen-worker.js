/* Builds rooms off the page's thread: a hard room can take a couple of
   seconds of searching, and the page should keep drawing meanwhile. Takes
   { tier, seed, id }, answers { id, code, par, seed, hint } (or { id } when
   no seed in a run of six made a room). */
import { generate, encode } from "./gen.js";

onmessage = (e) => {
  const { tier, seed, id } = e.data;
  for (let k = 0; k < 6; k++) {
    const r = generate((seed + k) >>> 0, tier);
    if (r) { postMessage({ id, code: encode(r.world), par: r.par, seed: (seed + k) >>> 0, hint: r.world.hint }); return; }
  }
  postMessage({ id });
};
