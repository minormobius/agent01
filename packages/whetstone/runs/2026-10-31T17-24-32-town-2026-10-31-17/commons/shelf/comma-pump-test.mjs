// selftest for www/comma-pump/pump.js: node shelf/comma-pump-test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL("../www/comma-pump/pump.js", import.meta.url));
new Function(readFileSync(here, "utf8"))();
const { chords, COMMA } = globalThis.CommaPump;
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log("FAIL", m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
ok(near(COMMA, 21.50628959, 1e-6), "comma is 1200·log2(81/80)");
for (const laps of [1, 2, 4, 8]) {
  const h = chords("hold", laps), last = h[h.length - 1];
  ok(near(last.root, -laps * COMMA, 1e-9), `hold: tonic sinks one comma a lap (${laps})`);
  ok(h.every(c => c.moved.every(m => near(m.by, 0, 1e-9))), "hold: no shared note ever moves");
  const f = chords("fixed", laps);
  ok(near(f[f.length - 1].root, 0), "fixed: tonic stays");
  const jumps = f.flatMap(c => c.moved.filter(m => !near(m.by, 0, 1e-9)).map(m => [c.name, m.note, m.by]));
  ok(jumps.length === laps && jumps.every(([c, n, by]) => c === "G" && n === "D" && near(by, COMMA, 1e-9)),
     "fixed: the comma lands once a lap, on D, going into G");
  const e = chords("equal", laps);
  ok(e.every(c => c.moved.every(m => near(m.by, 0))), "equal: nothing moves");
  ok(e.every(c => c.cents.every(x => near(x % 100, 0, 1e-9) || near(x % 100, -0, 1e-9))), "equal: whole semitones");
}
// equal's major third against just: 400 − 386.31 = 13.69 cents
ok(near(400 - 1200 * Math.log2(5 / 4), 13.686, 1e-3), "equal third is 13.7 cents wide");
console.log(bad ? `${bad} failed` : "ok: comma-pump");
process.exit(bad ? 1 : 0);
