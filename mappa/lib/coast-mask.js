// coast-mask.js — a One Coast world (games.mino.mobi/onecoast/) as a land/sea
// mask for generateWorld({ landmask }).
//
// The token is One Coast's share format: a buckyball name and its land/sea
// bits (e.g. "c240.…", ~80 chars). lib/onecoast/ holds byte-identical copies
// of One Coast's geo.js and world.js (games/onecoast's selftest checks they
// stay identical), so this rebuilds the very same sphere and decodes the very
// same bits. field(p) ∈ [-1, 1] votes land (>0) or sea at any unit vector p;
// `land` is the land fraction of the sphere, which sets sea level.
import './onecoast/geo.js';
import './onecoast/world.js';

const C = globalThis.COAST;

export function coastMask(token) {
  const { sphere, world } = C.decode(String(token));
  const field = C.field(sphere, world);
  // land fraction by area: Fibonacci points are equal-area
  const M = 6000, ga = Math.PI * (3 - Math.sqrt(5));
  let land = 0;
  for (let i = 0; i < M; i++) {
    const z = 1 - (2 * i + 1) / M, r = Math.sqrt(1 - z * z), t = ga * i;
    if (field([r * Math.cos(t), r * Math.sin(t), z]) > 0) land++;
  }
  return { token: String(token), sphere: sphere.name, field, land: land / M };
}
