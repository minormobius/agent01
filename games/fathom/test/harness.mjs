/* Loads Fathom (and the Orb engine it plays with) into node. */
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
export async function loadFathom() {
  for (const f of ["prng", "sphere", "rules", "solve"]) await import(path.join(here, `../../orb/js/${f}.js`));
  await import(path.join(here, "../js/onion.js"));
  return { O: globalThis.ORB, F: globalThis.FATHOM };
}
