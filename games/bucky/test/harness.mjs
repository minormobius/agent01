/* Loads Bucky's engine into node: plain IIFEs on globalThis. */
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
export async function loadBucky() {
  for (const f of ["ball", "logic", "par"]) await import(path.join(here, `../js/${f}.js`));
  return globalThis.BUCKY;
}
