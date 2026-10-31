/* node games/skein/tools/dict.mjs [--check]
 *
 * Writes dict/words.txt: the ENABLE word list (words/dict/enable1.txt, the
 * same list words.mino.mobi plays with), uppercased, four to fifteen
 * letters. It is what counts toward a hint. --check exits non-zero if the
 * committed file differs from what this would write; the selftest runs it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "../../../words/dict/enable1.txt"), out = path.join(here, "../dict/words.txt");
export function build() {
  return readFileSync(src, "utf8").split(/\r?\n/).map((w) => w.trim().toUpperCase())
    .filter((w) => /^[A-Z]{4,15}$/.test(w)).join("\n") + "\n";
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = build();
  if (process.argv.includes("--check")) {
    let cur = ""; try { cur = readFileSync(out, "utf8"); } catch (e) { /* missing */ }
    if (cur !== text) { console.error("dict/words.txt is stale: run node games/skein/tools/dict.mjs"); process.exit(1); }
    console.log("dict/words.txt is current");
  } else { writeFileSync(out, text); console.log(`wrote ${text.split("\n").length - 1} words, ${text.length} bytes`); }
}
