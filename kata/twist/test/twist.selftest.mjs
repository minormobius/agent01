/* TWIST's selftest: the page's claims. Our yarn holds its twist and the twist squeezes the core, more the more turns;
   the same yarn in four dimensions sheds every whole turn and ends exactly as if it had never been twisted; a part
   turn, which the clamped ends force, stays and squeezes less than ours; with no jiggle at all the 4D twist stands (it
   is an equilibrium, an unstable one); and untwisted, the two are the same yarn; and the cheat: round a ribbon wide enough, the 4D twist holds.   node kata/twist/test/twist.selftest.mjs   (~35 s) */
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
{ // the cheat: a core that is a ribbon
  const wide1 = run(4, 1, { tape: 0.5 }), wide2 = run(4, 2, { tape: 0.5 }), thin2 = run(4, 2, { tape: 0.1 }), rough = run(4, 2, { tape: 0.5, noise: 0.02, seed: 3 });
  ok(Math.abs(wide1.wind - 1) < 0.02 && Math.abs(wide2.wind - 2) < 0.02 && wide1.squeeze > 20 && wide2.squeeze > 5 * wide1.squeeze && Math.abs(rough.wind - 2) < 0.02, `twisted round a ribbon (±0.5 across z) the 4D yarn keeps its turns (${wide1.wind.toFixed(2)}, ${wide2.wind.toFixed(2)}) and squeezes it (${wide1.squeeze.toFixed(0)}, ${wide2.squeeze.toFixed(0)}), ten times the jiggle included`);
  ok(Math.abs(thin2.wind) < 0.02 && thin2.squeeze < 1 && thin2.out > 0.3, `a ribbon only a fibre's radius wide (±0.1) lets two turns slip round its edge (winding ${thin2.wind.toFixed(2)}, the fibres went ${thin2.out.toFixed(2)} out)`);
}
{ // what a rope lives on: grip in proportion to pull
  const { shortest } = await import(path.join(here, "../js/yarn.js")), q = (d, turns, strain, extra = {}) => settle({ d, turns, strain, ...extra });
  const a = [0.01, 0.03, 0.06].map((e) => q(3, 1, e)), r = [0.01, 0.03, 0.06].map((e) => q(4, 2, e, { tape: 0.5 })), flat = (v) => Math.max(...v.map((m) => m.hold)) / Math.min(...v.map((m) => m.hold));
  ok(flat(a) < 1.15 && flat(r) < 1.15 && a[2].pull > 1.5 * a[0].pull, `grip per pull hardly moves while the pull nearly doubles: ${a.map((m) => m.hold.toFixed(2)).join(", ")} for our yarn at one turn, ${r.map((m) => m.hold.toFixed(2)).join(", ")} for the 4D yarn on its ribbon at two: both grip in proportion to their load`);
  const p4 = q(4, 2, 0.03), s3 = shortest(q(3, 2, 0.03)), sr = shortest(r[1]);
  ok(p4.hold === 0 && !Number.isFinite(shortest(p4)) && s3 > 3 && s3 < 30 && sr > s3 && sr < 6 * s3, `the shortest fibre that holds its own tension (friction 0.3): ${s3.toFixed(0)} thicknesses in our yarn at two turns, ${sr.toFixed(0)} on the ribbon in 4D, and none at all in the plain 4D yarn`);
}
{ // the full bundle in a hose: thirteen fibres, pressed together by a wall
  const E = (o) => settle({ d: 4, pack: 13, ...o }, 30000).energy, free0 = E({ turns: 0 }), free1 = E({ turns: 1 }), h0 = E({ turns: 0, wall: 0.19 }), h1 = E({ turns: 1, wall: 0.19 }), h2 = E({ turns: 2, wall: 0.19 });
  ok(Math.abs(free1 - free0) < 0.01 * free0 && h1 > h0 + 15 && Math.abs(h2 - h0) < 10, `thirteen fibres in a tight hose keep one turn and shed two (energy ${h0.toFixed(0)} untwisted, ${h1.toFixed(0)} after one turn, ${h2.toFixed(0)} after two); with no hose they shed the one as well (${free0.toFixed(1)}, ${free1.toFixed(1)})`);
}
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
