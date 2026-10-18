/* Ouroboros's laws and findings: the world is your body, live, and every
   step reshapes it. What must always hold (the body a path, the world a
   sphere as long as you, every cell of a reshaped world landing somewhere
   distinct), and what the lab measured about each rule (see js/ouro.js), so
   a change that moves a finding shows up here.
     node games/molt/test/ouro.selftest.mjs   (~10 s) */
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const D = await import(path.join(here, "../js/duct.js"));
const { Ouro, namesOf, lay, autopilot, DEFAULTS } = await import(path.join(here, "../js/ouro.js"));
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };
let seed = 13;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const randWord = (n, pitch) => Array.from({ length: n }, () => (pitch && rnd() < 0.3 ? (rnd() < 0.5 ? "U" : "D") : "") + "SLR"[(rnd() * 3) | 0]).join("");

/* ---- a world laid out from any frame is the same world */
{
  let same = true;
  for (let t = 0; t < 40; t++) {
    const w = randWord(3 + (t % 9), t % 2), a = D.buildDuct(w), b = D.buildDuct(w, 3, { pos: [5, -2, 7], f: [2, 5, 1, 4][t % 4], u: [4, 0, 5, 2][t % 4] }), ca = D.census(a), cb = D.census(b);
    if (a.N !== b.N || ca.chi !== cb.chi || ca.defect !== cb.defect || JSON.stringify(ca.hist) !== JSON.stringify(cb.hist)) same = false;
    for (let k = 1; k < b.L; k++) if (Math.abs(b.P[k][0] - b.P[k - 1][0]) + Math.abs(b.P[k][1] - b.P[k - 1][1]) + Math.abs(b.P[k][2] - b.P[k - 1][2]) !== 1) same = false;
  }
  ok(same, "a body laid out from any start (place, way, up) builds the same world: same cells, same curvature, cubes still a chain");
}

/* ---- the skin's names: every cell of a world named once, and every world of the same length has the same names */
{
  let unique = true, sameSet = true, space = true;
  for (let t = 0; t < 60; t++) {
    const n = 2 + (t % 10), w1 = randWord(n, t % 2), w2 = randWord(n, (t + 1) % 2);
    const a = D.buildDuct(w1), b = D.buildDuct(w2), na = namesOf(a, "skin"), nb = namesOf(b, "skin");
    if (na.at.size !== a.N || nb.at.size !== b.N) unique = false;
    if ([...na.at.keys()].some((k) => !nb.at.has(k))) sameSet = false;
    if (namesOf(a, "space").at.size !== a.N) space = false;
  }
  ok(unique && space, "every cell of a world gets a name of its own, on the skin and in space");
  ok(sameSet, "on the skin, two worlds as long as each other have exactly the same names, however they bend: so a step, which keeps the length, carries every cell to a cell of its own and loses none");
}

/* ---- a body laid down by its own turns */
{
  let same = true, tried = 0;
  for (let t = 0; t < 40; t++) {
    const W = D.buildDuct(randWord(6, t % 2));
    // a random self-avoiding walk, head first
    const body = [Math.floor(rnd() * W.N)];
    for (let i = 0; i < 12; i++) { const free = [0, 1, 2, 3].map((s) => W.nb[body[body.length - 1] * 4 + s]).filter((c) => !body.includes(c)); if (!free.length) break; body.push(free[(rnd() * free.length) | 0]); }
    if (body.length < 4) continue;
    tried++;
    const joints = [];
    for (let i = 1; i < body.length - 1; i++) joints.push((D.sideTo(W, body[i], body[i - 1]) - D.sideTo(W, body[i], body[i + 1]) + 4) % 4);
    const r = lay(W, body[0], D.sideTo(W, body[0], body[1]), joints, body.length);
    if (r.cut !== -1 || r.body.join() !== body.join()) same = false;
  }
  ok(same && tried > 30, "on a world that hasn't changed, a body laid back down by its own turns is the very same cells (" + tried + " walks, flat and 3D)");
}

/* ---- play under every rule: what must always hold */
const RULESETS = [
  { ground: "skin", body: "retrace", shrink: "keep", bite: "cut" },
  { ground: "skin", body: "retrace", shrink: "body", bite: "die" },
  { ground: "skin", body: "carry", shrink: "keep", bite: "cut" },
  { ground: "skin", body: "carry", shrink: "body", bite: "cut" },
  { ground: "space", body: "retrace", shrink: "keep", bite: "cut" },
  { ground: "skin", body: "retrace", shrink: "keep", bite: "cut", C: 2 },
  { ground: "skin", body: "retrace", shrink: "keep", bite: "cut", C: 1 },
];
const stats = {};
{
  let path = true, sized = true, sphere = true, fed = true, neck = true, ticks = 0;
  for (const rules of RULESETS) {
    const key = JSON.stringify(rules), st = (stats[key] = { ticks: 0, cuts: 0, falls: 0, runs: 0, lenSum: 0, deathAt: [] });
    for (let s = 1; s <= 5; s++) {
      const g = new Ouro(s * 7919, rules);
      let cuts = 0; const lose = g.lose.bind(g); g.lose = (cells, why, text) => { if (why !== "bite") cuts++; return lose(cells, why, text); };
      for (let t = 0; t < 500 && g.alive; t++) {
        autopilot(g, rnd); g.tick(); ticks++;
        if (!g.alive) break;
        const W = g.world, B = g.body;
        st.lenSum += B.length;
        if (new Set(B).size !== B.length) path = false;
        for (let k = 0; k + 1 < B.length; k++) if (D.sideTo(W, B[k], B[k + 1]) < 0) path = false;
        if (B.length > 1 && W.nb[B[0] * 4 + g.inSide] !== B[1]) neck = false;
        if (rules.shrink === "body" ? W.L !== Math.max(2, B.length) : W.L < B.length) sized = false;
        if (B.some((c) => g.food.has(c))) fed = false;
        if (t % 50 === 0) { const c = D.census(W); if (c.chi !== 2 || c.defect !== 8 || !c.manifold || W.N !== W.C * W.C * (4 * W.L + 2)) sphere = false; }
      }
      st.ticks += g.ticks; st.cuts += cuts; st.runs++; if (g.cause === "fell") { st.falls++; st.deathAt.push(g.ticks); }
    }
  }
  ok(path && neck, ticks + " steps under " + RULESETS.length + " rule sets: the body is always a path of distinct cells, each joint a shared edge, and the head always knows which side its neck is on");
  ok(sized, "the world always has a cube for each cell of you (when cut, the world shrinks with you, or keeps its length and is never shorter than you)");
  ok(sphere, "every world along the way, at every grain (3, 2 and 1 cells a side), is a sphere of squares with 720° of curvature and C²(4L + 2) cells");
  ok(fed, "food never lies under the body (a body laid over food presses it flat)");
}

/* ---- what the lab found, kept honest */
{
  const S = (r) => stats[JSON.stringify(r)], per100 = (s) => (100 * s.cuts) / s.ticks, mean = (s) => s.lenSum / s.ticks;
  const space = S(RULESETS[4]), carry = S(RULESETS[2]), retrace = S(RULESETS[0]), shrink = S(RULESETS[3]);
  ok(space.falls === space.runs && Math.max(...space.deathAt) <= 20, "space as the ground: the world leaves a cube a step and you walk a third of one, so every run falls off its own tail, within " + Math.max(...space.deathAt) + " steps");
  ok(per100(carry) >= 8, "carrying each cell of you over by name: a bend sweeping under a joint breaks it, " + per100(carry).toFixed(1) + " cuts per 100 steps (a bent cube's inside lane has 1 cell where a straight one has 3: no naming keeps every joint)");
  ok(per100(retrace) <= 4 && mean(retrace) >= 2 * mean(carry), "laying your body back down by its own turns: " + per100(retrace).toFixed(1) + " cuts per 100 steps, and the snake averages " + mean(retrace).toFixed(1) + " long against " + mean(carry).toFixed(1));
  ok(retrace.falls === 0 && shrink.falls === shrink.runs, "with the world keeping its length nobody falls; shrinking it with you drops the ground from under a snake that crawls at the world's tail end (" + shrink.falls + " of " + shrink.runs + ")");
  const g2 = S(RULESETS[5]), g1 = S(RULESETS[6]);
  ok(per100(g1) > per100(g2) && per100(g2) > per100(retrace), "a coarser grain is a tighter world: " + [retrace, g2, g1].map((x) => per100(x).toFixed(1)).join(", ") + " cuts per 100 steps at 3, 2 and 1 cells a side");
  ok(DEFAULTS.ground === "skin" && DEFAULTS.body === "retrace" && DEFAULTS.shrink === "keep", "the lab opens on the rules that measured best: skin, retrace, keep");
}

/* ---- bites, and the same game twice */
{
  // a snake that turns the same way every step runs round a tight square into its own body
  const spin = (bite) => { const g = new Ouro(5, { bite, start: 9 }); for (let t = 0; t < 20 && g.alive && !g.log.some((e) => e.why === "bite"); t++) { if (t >= 8) g.steer((g.inSide + 1) % 4); g.tick(); } return g; };
  const a = spin("cut"), b = spin("die"), bite = a.log.find((e) => e.why === "bite");
  ok(bite && bite.lost > 2 && a.alive && bite.food === bite.lost - 1 && b.cause === "bitten", "a bite bites off what's behind it (" + (bite ? bite.lost : 0) + " cells, all but the bitten one left as food) and you live, or it kills you when bites kill");
  const run = () => { const g = new Ouro(99); let r = 5; const rr = () => (r = (r * 16807) % 2147483647) / 2147483647; for (let t = 0; t < 300 && g.alive; t++) { autopilot(g, rr); g.tick(); } return [g.ticks, g.cuts, g.eaten, g.word.join(""), g.body.join()].join("|"); };
  ok(run() === run(), "deterministic: the same seed and the same steering play the same game");
}

console.log(fails ? `ouro: ${fails} of ${checks} checks FAILED` : `ouro: all ${checks} checks ok`);
process.exit(fails ? 1 : 0);
