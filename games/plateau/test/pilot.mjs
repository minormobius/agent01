/* A lookahead autopilot: the balance report. Every tenth of a second it tries a spread of stick inputs,
   flies each half a second ahead against the exact clearance, and takes the one that keeps furthest from
   everything. How far it gets, phase by phase, says how survivable the foam is with skill (a human sees
   further than half a second, and turns less perfectly). Not a test: a measurement.
     node games/plateau/test/pilot.mjs [runs] [max distance]   (slow: ~1 s a simulated second) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const { Foam, Craft, clearance, fieldAt, speedAt, phaseAt, autopilot, margin, R_EDGE } = await import(path.join(here, "../js/flight.js"));

export function pilotRun(seed, maxD = 1200, dt = 1 / 30) {
  const foam = new Foam(seed);
  let d = 0, c = new Craft(foam.pos([0, 0, 0, 0], fieldAt(0))), choice = [0, 0, 0], t = 0;
  while (d < maxD) {
    const v = speedAt(d);
    if (t <= 0) { choice = autopilot(foam, d, c); t = 0.1; }
    c.steer(choice[0], choice[1], choice[2], dt); c.fly(v, dt); d += v * dt; t -= dt;
    const cl = clearance(foam, fieldAt(d), c);
    if (margin(cl) < 0) return { d, phase: phaseAt(d).name, by: cl.edge < R_EDGE ? "an edge" : "a solid cell" };
  }
  return { d, phase: "survived" };
}

if (process.argv[1] && process.argv[1].endsWith("pilot.mjs")) {
  const runs = +(process.argv[2] || 6), maxD = +(process.argv[3] || 1200), out = [];
  for (let r = 0; r < runs; r++) { const t0 = Date.now(), res = pilotRun(1000 + r * 7919, maxD); out.push(res); console.log(`run ${r + 1}: ${res.d.toFixed(0)} cells, ended in ${res.phase}${res.by ? ", by " + res.by : ""} (${((Date.now() - t0) / 1000).toFixed(0)} s)`); }
  out.sort((a, b) => a.d - b.d);
  console.log("median distance", out[out.length >> 1].d.toFixed(0));
}
