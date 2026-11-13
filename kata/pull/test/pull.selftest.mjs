/* PULL's selftest. The bench against a closed form (one strand breaks at its weakest link) and its own solver (every
   equilibrium converged); the published samples against a fresh run of the same seeds; and the page's claims, which
   are about distributions: a ribbon alone is two strands with a strand's spread; a twisted 4D yarn has no strength
   and a 3D one has, more with harder twist and longer fibres; round a ribbon the 4D yarn holds, but per material it
   is worth less than the ribbon alone; a loose bundle is worth less than its count and a gripped one more; and
   bundling narrows the spread, so the strength you can count on rises faster than the mean.
   node kata/pull/test/pull.selftest.mjs   (~40 s) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), { test, SPECIES, stats } = await import(path.join(here, "../js/bench.js")), DATA = JSON.parse(fs.readFileSync(path.join(here, "../data/samples.json"), "utf8"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
const sp = Object.fromEntries(SPECIES.map((s) => [s.id, s])), ST = Object.fromEntries(SPECIES.map((s) => [s.id, stats(DATA.peaks[s.id])])), ref = ST.strand.mean, u = (id) => ST[id].mean / ref, spec = (id) => u(id) / sp[id].material, p5 = (id) => ST[id].p5 / ref / sp[id].material, pc = (v) => (v * 100).toFixed(0) + "%";
{
  const exact = 0.02 * 95 ** (-1 / 5) * 0.9181687, cvW = 0.2290;
  ok(Math.abs(ref / exact - 1) < 0.05 && Math.abs(ST.strand.cv - cvW) < 0.035 && Math.abs(ST.strand.weibull - 5) < 0.8, `one strand breaks at its weakest link: mean ${ref.toFixed(5)} over ${DATA.n} against ${exact.toFixed(5)}, spread ${pc(ST.strand.cv)} against Weibull's ${pc(cvW)}, and the modulus read back from the spread is ${ST.strand.weibull.toFixed(1)} (5 went in)`);
  // the published samples are this bench's: the first three seeds of every species, pulled again, and every solve converged
  let same = true, worstLeft = 0, slow = 0; for (const s of SPECIES) for (let seed = 1; seed <= 3; seed++) { const r = test({ ...s.opts, seed }, DATA.run); if (Math.abs(r.peak - DATA.peaks[s.id][seed - 1]) > 1e-6 * (1 + r.peak)) same = false; worstLeft = Math.max(worstLeft, r.R.left); slow = Math.max(slow, r.R.sweeps / r.R.relaxes); }
  ok(same && worstLeft <= 1.001 && slow < 60, `the published samples are reproduced seed for seed, and every equilibrium on the way converged (worst residual ${worstLeft.toFixed(2)} of the tolerance, at most ${slow.toFixed(0)} Newton steps a solve on average)`);
  ok(Math.abs(u("ribbon") - 2) < 0.02 && Math.abs(ST.ribbon.cv - ST.strand.cv) < 1e-3 && Math.abs(spec("ribbon") - 1) < 0.02, `a ribbon alone: ${u("ribbon").toFixed(2)} strands from two strands' worth of material, so ${spec("ribbon").toFixed(2)} per material, with a strand's spread (${pc(ST.ribbon.cv)})`);
  const short = stats([1, 2, 3, 4, 5, 6].map((seed) => test({ ...sp.y3hard.opts, staple: 20, seed }, DATA.run).peak)).mean / ref, long = stats([1, 2, 3, 4, 5, 6].map((seed) => test({ ...sp.y3hard.opts, staple: 80, seed }, DATA.run).peak)).mean / ref;
  ok(u("y4") < 0.005 && u("y3hard") > 3 && u("y3hard") > 8 * u("y3soft") && long > u("y3hard") * 0.95 && u("y3hard") > short * 1.5, `twisted yarn of short fibres: none in 4D (${u("y4").toFixed(3)} strands); in 3D ${u("y3soft").toFixed(2)} soft and ${u("y3hard").toFixed(2)} hard, and ${short.toFixed(2)}, ${u("y3hard").toFixed(2)}, ${long.toFixed(2)} as the fibres go from 20 to 40 to 80 diameters`);
  ok(u("rib4hard") > 3.5 && u("rib4hard") > u("rib4soft") + 1 && spec("rib4hard") < 0.75 * spec("ribbon") && spec("rib4hard") < spec("y3hard") + 0.15, `round a ribbon the 4D yarn holds (${u("rib4soft").toFixed(2)} soft, ${u("rib4hard").toFixed(2)} hard), but per material it is ${spec("rib4hard").toFixed(2)} against the ribbon alone's ${spec("ribbon").toFixed(2)}: the short fibres add strength and add more weight (ours, hard, is ${spec("y3hard").toFixed(2)})`);
  ok(spec("fil4") < 0.8 && spec("fil4") > 0.55 && spec("rope4") > 1.15 && spec("hoop4tight") > 1.05 && spec("hoop4slack") < 0.8, `per fibre: a loose bundle of 13 filaments ${spec("fil4").toFixed(2)}, sheathed ${spec("rope4").toFixed(2)}; 13 short fibres hooped slack ${spec("hoop4slack").toFixed(2)}, tight ${spec("hoop4tight").toFixed(2)}. Loose is under one, gripped is over`);
  ok(ST.fil4.cv < 0.6 * ST.strand.cv && ST.rope4.cv < 0.3 * ST.strand.cv && ST.rope4.cv < ST.fil4.cv && p5("rope4") / p5("strand") > 1.8 && Math.abs(ST.y3hard.cv - ST.strand.cv) < 0.06, `the spread: a strand ${pc(ST.strand.cv)}, a loose bundle ${pc(ST.fil4.cv)}, the sheathed rope ${pc(ST.rope4.cv)}. So what you can count on (the 5th percentile, per material) goes ${p5("strand").toFixed(2)}, ${p5("fil4").toFixed(2)}, ${p5("rope4").toFixed(2)}: the rope is ${(p5("rope4") / p5("strand")).toFixed(1)}× a strand there, ${(spec("rope4") / spec("strand")).toFixed(2)}× on the mean. The hard twisted yarn keeps a strand's spread (${pc(ST.y3hard.cv)})`);
}
{ // braids: strands laid at an angle
  const { laid } = await import(path.join(here, "../js/bench.js")), B = JSON.parse(fs.readFileSync(path.join(here, "../data/braid.json"), "utf8")), row = (n, th) => B.rows.find((r) => r.name === n && r.theta === th), a0 = laid(0);
  const flat = test({ section: "plait3", press: { kind: "none" }, seed: 2 }, { steps: 110, strain: 0.07 }).peak, flat2 = test({ section: "plait3", press: { kind: "none" }, tracks: [a0, a0, a0], seed: 2 }, { steps: 110, strain: 0.07 }).peak;
  const a = laid(30), again = [1, 2, 3].map((seed) => test({ section: "may7", press: { kind: "twist", q: a.q }, tracks: [{ k: 1, strength: 1 }, ...Array(6).fill({ k: a.k, strength: a.strength })], seed }, { steps: 110, strain: 0.07 })), conv = Math.max(...again.map((r) => r.R.left));
  ok(flat === flat2 && conv <= 1.001 && B.rows.every((r) => r.left <= 1.001), `a strand laid at 0° is a straight strand, and every solve behind the braid table converged (a maypole at 30° re-pulled: ${conv.toFixed(2)} of the tolerance)`);
  const m = row("maypole", 30), l = row("loose 7", 0), sv = row("served", 30);
  ok(m.mean > l.mean * 1.05 && m.specific < l.specific + 0.03 && m.cv < 0.75 * l.cv && m.specific5 > l.specific5 && sv.mean < m.mean && row("maypole", 40).specific < 0.9 * l.specific, `braiding buys reliability, not strength per weight: seven loose hoses ${l.specific.toFixed(2)} per weight (spread ${pc(l.cv)}), a maypole at 30° ${m.specific.toFixed(2)} (${pc(m.cv)}), its 5th percentile ${m.specific5.toFixed(2)} against ${l.specific5.toFixed(2)}; served with ribbons ${sv.specific.toFixed(2)}; at 40° the angle has cost more than the grip gave (${row("maypole", 40).specific.toFixed(2)})`);
}
console.log(`\n${checks - fails}/${checks} checks`);
process.exit(fails ? 1 : 0);
