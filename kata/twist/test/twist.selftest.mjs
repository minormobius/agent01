/* TWIST's selftest: the page's claims. Our yarn holds its twist and the twist squeezes the core, more the more turns;
   the same yarn in four dimensions sheds every whole turn and ends exactly as if it had never been twisted; a part
   turn, which the clamped ends force, stays and squeezes less than ours; with no jiggle at all the 4D twist stands (it
   is an equilibrium, an unstable one); and untwisted, the two are the same yarn.   node kata/twist/test/twist.selftest.mjs   (~15 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), { settle } = await import(path.join(here, "../js/yarn.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const run = (d, turns, extra = {}) => settle({ d, turns, ...extra });
{
  const a3 = run(3, 0), a4 = run(4, 0);
  ok(a3.squeeze === 0 && a4.squeeze === 0 && Math.abs(a3.energy - a4.energy) < 1e-6 && a3.tension > 5, `untwisted, the yarn is the same in both: no squeeze, tension ${a3.tension.toFixed(1)} a fibre, energy ${a3.energy.toFixed(2)}`);
  const b1 = run(3, 1), b2 = run(3, 2);
  ok(Math.abs(b1.wind - 1) < 0.02 && Math.abs(b2.wind - 2) < 0.02 && b1.squeeze > 10 && b2.squeeze > 3 * b1.squeeze, `in 3D the twist stays (${b1.wind.toFixed(2)} and ${b2.wind.toFixed(2)} turns) and squeezes the core: ${b1.squeeze.toFixed(1)} at one turn, ${b2.squeeze.toFixed(1)} at two`);
  const c1 = run(4, 1), c2 = run(4, 2);
  ok(Math.abs(c1.wind) < 0.02 && Math.abs(c2.wind) < 0.02 && c1.squeeze === 0 && c2.squeeze === 0 && Math.abs(c2.energy - a4.energy) < 1e-3 && c2.out > 0.1, `in 4D it sheds every whole turn: winding ${c2.wind.toFixed(2)}, squeeze ${c2.squeeze.toFixed(2)}, energy back to the untwisted ${c2.energy.toFixed(2)}; the fibres went ${c2.out.toFixed(2)} out of the twisting plane to do it`);
  let same = true; for (const seed of [2, 3]) { const r = run(4, 2, { seed }); if (Math.abs(r.wind) > 0.02 || r.squeeze !== 0) same = false; }
  ok(same, "and does so whatever the jiggle (two more seeds)");
  const h3 = run(3, 0.5), h4 = run(4, 0.5), o4 = run(4, 1.5);
  ok(Math.abs(h4.wind - 0.5) < 0.02 && h4.squeeze > 0.5 && h4.squeeze < 0.6 * h3.squeeze && Math.abs(o4.wind - 0.5) < 0.02 && Math.abs(o4.energy - h4.energy) < 1e-2, `a half turn is forced by the clamps and stays in both, squeezing ${h4.squeeze.toFixed(2)} in 4D against ${h3.squeeze.toFixed(2)} in 3D; one and a half turns in 4D relaxes to exactly the half-turn state`);
  const still = run(4, 1, { noise: 0 });
  ok(Math.abs(still.wind - 1) < 0.02 && Math.abs(still.squeeze - b1.squeeze) < 0.5, `with no jiggle at all the 4D twist stands, squeezing ${still.squeeze.toFixed(1)} like ours: it is an equilibrium, and an unstable one`);
}
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
