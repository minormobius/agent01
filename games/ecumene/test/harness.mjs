/* Loads Ecumene into node: Orb's sphere (ORB.voronoi) for side effects, then
   the ES modules. */
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
export async function loadEcumene() {
  await import(path.join(here, "../../orb/js/sphere.js"));
  const world = await import(path.join(here, "../js/world.js"));
  const sim = await import(path.join(here, "../js/sim.js"));
  return { ...world, ...sim };
}
