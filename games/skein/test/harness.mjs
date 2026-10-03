/* Loads Skein's engine (and the One Coast spheres it borrows) into node. */
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
export async function loadSkein() {
  await import(path.join(here, "../../onecoast/js/geo.js"));
  await import(path.join(here, "../../orb/js/torus.js")); // the honeycomb tori
  for (const f of ["themes", "gen", "game"]) { try { await import(path.join(here, `../js/${f}.js`)); } catch (e) { if (e.code !== "ERR_MODULE_NOT_FOUND") throw e; } }
  return globalThis.SKEIN;
}
