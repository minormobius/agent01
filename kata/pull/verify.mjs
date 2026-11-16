#!/usr/bin/env node
/* PULL: re-pull every REPORTED row of the closure and map studies (seeds 31–90 at the chosen thickness and tightness),
   check it gives the stored figure, and write into each file how those pulls converged. The studies' own `status`
   covers their tuning grids too, where some cells that were not chosen did not converge; this is the record for the
   numbers the paper uses.   node kata/pull/verify.mjs closure-5 [closure-10 map-3 …]   (~3 min a file) */
import fs from "node:fs";
import { test, stats } from "./js/bench.js";
import { hoseRope } from "./js/hose.js";
const RUN = { steps: 110, strain: 0.045 }, V = { "baseline": {}, "axial criterion: von Mises": { crit: "mises" }, "axial criterion: linear interaction": { crit: "linear" }, "skin evenly stressed (no peak)": { peak: 1 }, "a split runs the whole rope": { run: Infinity }, "no size effect": { size: false }, "hoops: no axial member": { member: false } };
const again = (m, ref, v) => { const p = []; let bad = 0, worst = 0; for (let s = 31; s <= 90; s++) { const h = hoseRope({ m, ...v }, s), t = test(h.opts, RUN); p.push(t.peak / ref / h.material); if (t.R.left > 1.001) bad++; worst = Math.max(worst, t.R.left || 0); } return { mean: stats(p).mean, unconverged: bad, worstLeft: worst }; };
let fail = 0;
for (const name of process.argv.slice(2)) { const url = new URL(`./data/${name}.json`, import.meta.url), d = JSON.parse(fs.readFileSync(url, "utf8")), rec = { pulls: 0, unconverged: 0, worstLeft: 0, mismatched: 0 };
  const take = (stored, r) => { rec.pulls += 60; rec.unconverged += r.unconverged; rec.worstLeft = Math.max(rec.worstLeft, r.worstLeft); if (Math.abs(r.mean - stored) > 1e-9 * (1 + stored)) rec.mismatched++; };
  if (name.startsWith("closure")) for (const r of d.rows) take(r.mean, again(d.m, d.ref, { ...V[r.name], tau: r.tau, hoop: r.hoop }));
  else { const ref = stats(Array.from({ length: 400 }, (_, i) => test({ section: "one", m: d.m, seed: i + 1 }, RUN).peak)).mean; for (const c of d.cells) { take(c.hose.mean, again(d.m, ref, { mu: c.mu, tau: c.hose.tau, hoop: c.hose.hoop })); take(c.hoops.mean, again(d.m, ref, { mu: c.mu, member: false, tau: c.hoops.tau, hoop: c.hoops.hoop })); } }
  d.reported = rec; fs.writeFileSync(url, JSON.stringify(d)); if (rec.unconverged || rec.mismatched) fail = 1; console.error(name, JSON.stringify(rec)); }
process.exit(fail);
