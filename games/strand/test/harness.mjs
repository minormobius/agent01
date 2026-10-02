/* Loads Strand's engine (and the Orb mesh code it borrows) into node. */
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
export async function loadStrand() {
  await import(path.join(here, "../../orb/js/prng.js"));
  await import(path.join(here, "../../orb/js/sphere.js"));
  await import(path.join(here, "../../orb/js/torus.js"));
  for (const f of ["boards", "solve"]) await import(path.join(here, `../js/${f}.js`));
  return globalThis.STRAND;
}
