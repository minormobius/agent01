/* VOLLEY's selftest: the bow (the arc lands where it is aimed, in 4D); the bicycle laps the track on its autopilot and
   crosses their world twice a lap; the page's claims: an arrow loosed from ana arrives inside a closed bunker, and the
   same shot from inside their slice is stopped by the wall; they never shoot while you are out of their slice, their
   arrows never leave w = 0, and an arrow of theirs through your (x, y, z) misses you unless you are in their slice; a
   bot that rides and turns its slice onto them finds and clears a wave.   node kata/volley/test/volley.selftest.mjs   (~2 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), V = await import(path.join(here, "../js/game.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("ok   " + msg); };
{
  let worst = 0;
  for (const Q of [[20, 1, 5, -9], [-30, 0.5, 10, 4], [5, 3, -25, 0]]) { const P = [0, 1.5, 0, 6], a = V.arc(P, Q, V.V_ARROW), t = a.tof, at = P.map((x, k) => x + a.vel[k] * t - (k === 1 ? 0.5 * V.G * t * t : 0)); worst = Math.max(worst, Math.hypot(...at.map((x, k) => x - Q[k]))); }
  ok(worst < 1e-9 && V.arc([0, 1, 0, 0], [200, 1, 0, 0], V.V_ARROW) === null, `the bow's arc lands on its mark, w and all (worst ${worst.toExponential(1)} m), and there is no arc past its range`);
}
{
  // at the start their world is beside you, parallel to your slice: none of the many is in it
  const g = V.makeGame(1, 2), none = g.enemies.every((e) => Math.abs(V.offSlice(g, e)) > V.BODY);
  ok(none && Math.abs(g.w - 10) < 0.5 && Math.abs(g.frame.N[3]) > 0.99, `you start ${g.w.toFixed(1)} m ana of their world with your slice parallel to it: none of the ${g.total} is in your slice`);
  // the stick's second axis turns your heading, and with it your slice, into the direction you couldn't see
  g.enemies.forEach((e) => (e.cool = 1e9)); g.stick = [0, -1]; let turned = 0; while (g.t < 4) { V.step(g, 1 / 60); turned = Math.max(turned, Math.abs(g.frame.F[3])); }
  ok(turned > 0.5 && Math.abs(g.frame.N[3]) < 0.9, `the stick's ↕ turns you into the unseen: after 4 s your heading is ${(turned * 100).toFixed(0)}% along w, your slice ${(Math.acos(Math.min(1, Math.abs(g.frame.N[3]))) * 180 / Math.PI).toFixed(0)}° off theirs`);
  // and the rim holds whatever you ask
  g.stick = [0.3, 1]; let far = 0; while (g.t < 60) { V.step(g, 1 / 60); far = Math.max(far, g.edge); }
  ok(far <= 0.9301, `held hard over for a minute, you never pass the rim (furthest ${far.toFixed(2)} of the basin)`);
}
{
  // a bunker at the origin, one of them inside; you at w = 8, 12 m off: the arrow arrives. From w = 0 it hits the wall
  const mk = (w) => { const g = V.makeGame(1, 1); g.bunkers = [{ x: 0, z: 0, h: 2.2, H: 2.6 }]; g.enemies = [{ x: 0, z: 0, vx: 0, vz: 0, kind: "bunker", alive: true, cool: 0, turn: 9 }]; g.total = 1; g.kills = 0;
    const T = V.WALL_T, W = V.WALL_W, h = 2.2, H = 2.6; g.slabs = [[[-h, 0, -h, -W], [-h + T, H, h, W]], [[h - T, 0, -h, -W], [h, H, h, W]], [[-h, 0, -h, -W], [h, H, -h + T, W]], [[-h, 0, h - T, -W], [h, H, h, W]], [[-h, H - T, -h, -W], [h, H, h, W]]].map(([lo, hi]) => ({ lo, hi }));
    g.shoulder = [12, 1.5, 0, w]; return g; };
  const fly = (g) => { const a = V.arc(g.shoulder, [0, 1, 0, 0], V.V_ARROW); g.arrows.push({ p: g.shoulder.slice(), v: a.vel, mine: true, age: 0 }); let wall = false; for (let k = 0; k < 200 && g.state === "playing" && g.arrows.some((x) => !x.stuck); k++) { V.step(g, 1 / 120); if (g.events.some((e) => e.kind === "wall")) wall = true; } return { killed: g.kills === 1, wall }; };
  const out = mk(8), inn = mk(0), pOut = V.preview(out, 0), pIn = V.preview(inn, 0), a = fly(out), b = fly(inn);
  ok(a.killed && !a.wall && pOut === "ok", `an arrow loosed from 8 m ana arrives inside a closed bunker: it never touches the walls`);
  ok(!b.killed && b.wall && pIn === "wall", `the same shot from inside their slice is stopped by the wall (and the ring says so)`);
}
{
  const g = V.makeGame(1, 2); let unseen = 0, seenShots = 0, offSlice = 0;
  while (g.state === "playing" && g.t < 120) { const n0 = g.arrows.length; V.bot(g); V.step(g, 1 / 60); for (const a of g.arrows.slice(n0)) if (!a.mine) { if (Math.abs(g.w) >= V.SEE) unseen++; else seenShots++; } for (const a of g.arrows) if (!a.mine && (a.p[3] !== 0 || a.v[3] !== 0)) offSlice++; }
  ok(unseen === 0 && seenShots > 0 && offSlice === 0, `while a bot hunts them they loose ${seenShots} arrows, every one while it is in their slice, and none ever leaves w = 0`);
  ok(g.state === "won" && g.kills === g.total, `the bot, riding and turning its slice onto them, finds and clears wave 2: ${g.total} of them, ${g.bunkers.length} in bunkers, in ${g.t.toFixed(0)} s with ${g.loosed} arrows, ${g.hits} hits taken`);
}
{
  const hit = (w) => { const g = V.makeGame(1, 1); g.enemies.forEach((e) => (e.cool = 1e9)); V.step(g, 1 / 60); const r = g.rider.slice(); r[3] = 0; g.rider[3] = w; const from = [r[0] - 6, r[1], r[2], 0]; g.arrows.push({ p: from, v: [30, 0.3, 0, 0], mine: false, age: 0 });
    for (let k = 0; k < 30; k++) { const keep = g.rider.slice(); V.step(g, 1 / 120); g.rider = keep; } return g.hp; };
  ok(hit(5) === V.HP, `an arrow of theirs through your (x, y, z) while you are 5 m ana passes you by`);
}
console.log(`${checks - fails}/${checks} checks`); process.exit(fails ? 1 : 0);
