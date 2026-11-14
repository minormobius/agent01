#!/usr/bin/env node
/* PULL's press study: where the squeeze comes from, three ways (js/skin.js), and what the bench makes of each.
     skin      a taut net on the real bundle against the round-vessel formula the bench uses
     sharing   how the skin's force on a fibre divides among its contacts when fibres are not quite equal
     helix     the law a wound or braided strand presses by (tension × curvature), against TWIST's bead yarn
     bench     the hose rope re-pulled with the skin's measured force and with the sharing at its extremes
   node kata/pull/press.mjs [N=60]   (~6 min) */
import fs from "node:fs";
import { band, skin, sharing, HULL } from "./js/skin.js";
import { test, stats, sheath } from "./js/bench.js";
import { settle } from "../twist/js/yarn.js";
const N = +process.argv[2] || 60, t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0) + "s", out = { n: N };
/* 1. the skin */
out.band = [0.05, 0.1, 0.2].map((shrink) => ({ shrink, ...band({ shrink }) }));
out.skin = [[4, 0.1], [4, 0.12], [4, 0.2], [4, 0.3], [5, 0.12]].map(([level, shrink]) => { const k = skin({ level, shrink, iters: level === 5 ? 20000 : 8000 }); return { level, shrink, perTension: k.perTension / 0.5, spread: k.spread, sideways: k.sideways, peak: k.peak, area: k.area, touching: k.touching, nodes: k.nodes }; });
out.sphere = 2 * Math.PI; out.hull = HULL;
for (const b of out.band) console.error("band, shrink", b.shrink, "force per tension", b.perTension.toFixed(4), "(exact 1, round vessel", b.sphere.toFixed(3) + ")");
for (const k of out.skin) console.error("skin, level", k.level, "shrink", k.shrink, "force per tension·radius", k.perTension.toFixed(3), "(round vessel 6.283, hull", HULL.toFixed(3) + ")", "tightest/mean", k.peak.toFixed(2), sec());
/* 2. the sharing */
out.sharing = [0, 1, 2, 5, 10].map((sd) => sharing({ sd, trials: 200 }));
for (const s of out.sharing) console.error("sharing, diameters ±", s.sd, "overlaps: centre contact", s.centre.mean.toFixed(3), "±", s.centre.sd.toFixed(3), "ring", s.ring.mean.toFixed(3), "±", s.ring.sd.toFixed(3), "open", (s.openCentre * 100).toFixed(0) + "%", (s.openRing * 100).toFixed(0) + "%", "all on an outer fibre", s.onOuter.mean.toFixed(2), "±", s.onOuter.sd.toFixed(2), "on the centre", s.onCentre.mean.toFixed(2), "±", s.onCentre.sd.toFixed(2), sec());
/* 3. the helix law against the bead yarn. A fibre at tension T on a helix of radius ρ at angle θ to the axis is
   pushed inward by T sin²θ / ρ per length of fibre, so T sin²θ / (ρ cosθ) per length of yarn. In the yarn it rests
   on the core (N_c) and on two neighbours 60° off the inward line (N_o each), so N_c + N_o should equal that. */
out.helix = [0.5, 1, 1.5, 2].map((turns) => { const m = settle({ d: 3, turns }), Y = m.Y, d = Y.d, top = Y.L * (1 + Y.strain); let rho = 0, cnt = 0; for (let f = 1; f < 7; f++) for (let i = 4; i < Y.n - 4; i++) { const p = (f * Y.n + i) * d; rho += Math.hypot(Y.X[p], Y.X[p + 1]); cnt++; } rho /= cnt;
  const th = Math.atan((2 * Math.PI * turns * rho) / top), law = Math.sin(th) ** 2 / (rho * Math.cos(th)), Nc = m.squeeze / 6, No = (m.grip - Nc) / 2, inward = (Nc + No) / m.pull;
  return { turns, angle: (th * 180) / Math.PI, rho, law, measured: inward, ratio: inward / law, hold: m.hold, core: Nc / m.pull, neighbour: No / m.pull, wound: m.wind }; });
for (const h of out.helix) console.error("helix,", h.turns, "turns:", h.angle.toFixed(1) + "°", "law", h.law.toFixed(3), "measured", h.measured.toFixed(3), "ratio", h.ratio.toFixed(2), "(core", h.core.toFixed(3), "each neighbour", h.neighbour.toFixed(3) + ")", sec());
/* 4. what the bench makes of it: thirteen filaments in a hose τ = 0.1 */
const RUN = { steps: 110, strain: 0.045 }, REF = stats(Array.from({ length: 400 }, (_, i) => test({ section: "one", seed: i + 1 }, RUN).peak)).mean, sh = sheath(4, 0.1), W = 13 + sh.material;
const hose = (name, wall, by) => { const v = []; let left = 0; for (let s = 1; s <= N; s++) { const r = test({ section: "fcc13s", press: { kind: "hoop", p: sh.press * wall, wall: sh.wall * wall, by }, ribbon: { k: sh.material, strength: sh.material }, seed: s }, RUN); v.push(r.peak / REF); left = Math.max(left, r.R.left || 0); } const st = stats(v); console.error("bench:", name.padEnd(46), "per weight", (st.mean / W).toFixed(3), "5th", (st.p5 / W).toFixed(3), left > 1.001 ? "UNCONVERGED" : "", sec()); return { name, specific: st.mean / W, specific5: st.p5 / W, cv: st.cv, left }; };
/* (tracks: 0 the hose, 1 the middle fibre, 2–13 the outer twelve; a pair's share of the wall's force is ⅓ as built) */
const f = out.skin.find((k) => k.level === 5).perTension / out.sphere;
out.bench = [hose("as built: round vessel, equal sharing", 1), hose(`the taut skin's force (${f.toFixed(2)} of the vessel's)`, f), hose("the skin's force, limited by its tightest part", f / out.skin.find((k) => k.level === 5).peak * 2),
  hose("middle fibre loose: all through neighbours", 1, (i) => (i === 0 ? 1 : i === 1 ? 0 : 1.5)), hose("all through the middle fibre", 1, (i) => (i === 0 ? 1 : i === 1 ? 3 : 0))];
out.factor = f;
fs.writeFileSync(new URL("./data/press.json", import.meta.url), JSON.stringify(out));
