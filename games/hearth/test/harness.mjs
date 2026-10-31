/* Loads Hearth into node: Orb's prng and sphere (ORB.buildMesh) for side effects, then the modules. */
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
export async function loadHearth() {
  await import(path.join(here, "../../orb/js/prng.js"));
  await import(path.join(here, "../../orb/js/sphere.js"));
  const orb = await import(path.join(here, "../js/orb.js"));
  const sim = await import(path.join(here, "../js/sim.js"));
  return { ...orb, ...sim };
}
