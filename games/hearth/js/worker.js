/* Hearth — the settlement's thread. The page asks for years; a year's access
   sum (every lot against every lived-in lot) takes tens of milliseconds,
   which would stutter the camera on the main thread. */
import "../../orb/js/prng.js";
import "../../orb/js/sphere.js";
import { makeOrb } from "./orb.js";
import { Settlement } from "./sim.js";
import { groundMesh, buildingMesh } from "./geometry.js";

let orb = null, town = null;
/* A year's snapshot, and its triangles built here (a hundred milliseconds late in the game, a stutter on the
   main thread), handed over without a copy. */
function year() {
  const snap = town.snapshot(), ground = groundMesh(orb, (i) => snap.kind[i]), blds = buildingMesh(orb, snap.floors, snap.kind);
  self.postMessage({ type: "year", snap, ground, blds }, [ground.buffer, blds.buffer]);
}
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === "init") {
    orb = makeOrb(m.seed); town = new Settlement(orb);
    self.postMessage({ type: "orb", orb: { seed: orb.seed, n: orb.n, P: orb.P, V: orb.V, polys: orb.polys, area: orb.area, plate: orb.plate, inr: orb.inr, port: orb.port, dPort: orb.dPort } });
    year();
  } else if (m.type === "step") {
    town.step();
    year();
  }
};
