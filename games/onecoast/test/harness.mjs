/* Loads One Coast's engine (plain IIFEs on globalThis.COAST) into node. */
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
export async function loadCoast(files = ["geo"]) {
  for (const f of files) await import(path.join(here, `../js/${f}.js`));
  return globalThis.COAST;
}
