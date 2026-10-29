/* The numbers the planets chapter's tides section quotes, as JSON for tools/pages/genstars.py: one spin, 2 in the
   orbit's plane, 1.3 in the plane completely orthogonal to it and 0.5 and −0.3 mixing them (the orbit's rate 1), under
   the lagging-bulge torque (js/tides.js spinDown) in 3D and 4D, and the spring-and-damper planet (springPlanet) in 4D;
   and the star's height over a locked planet's surface.
     node four/atom/tools/tidenumbers.mjs */
import * as T from "../js/tides.js";
const r4 = (x) => +x.toFixed(4), last = (R) => R.samples[R.samples.length - 1], first = (R) => R.samples[0];
const spin = (d) => T.turning(d, d === 4 ? [[0, 1, 2.0], [2, 3, 1.3], [0, 2, 0.5], [1, 3, -0.3]] : [[0, 1, 2.0], [0, 2, 0.5]]);
const lag3 = T.spinDown(spin(3), { T: 120, dt: 0.02 }), lag4 = T.spinDown(spin(4), { T: 120, dt: 0.02 }), spr = T.springPlanet(spin(4), { T: 400, every: 2000 });
const sum = (R, d) => ({ start: { orbit: r4(first(R).orbitPart), free: r4(first(R).freePart), mixed: r4(first(R).mixed) }, end: { orbit: r4(last(R).orbitPart), free: r4(last(R).freePart), mixed: r4(last(R).mixed), t: +last(R).t.toFixed(0) } });
const locked = T.turning(4, [[0, 1, 1], [2, 3, 1.7]]), pt = [0.6, 0.0, 0.64, 0.48], sun = T.starAngle(locked, pt, 1, 20);
console.log(JSON.stringify({ lag3: sum(lag3), lag4: sum(lag4), spring: { ...sum(spr), Lkept: +(last(spr).Lfree / first(spr).Lfree).toFixed(5), stretch: +(last(spr).I0 / first(spr).I0).toFixed(3) },
  sun: { min: +Math.min(...sun).toFixed(9), max: +Math.max(...sun).toFixed(9) } }));
