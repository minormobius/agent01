/* The Cheshire cat lab's checks: the cat (js/cat.js) and the lab's turning (js/lab.js), without a browser.
     node games/cheshire/test/cheshire.selftest.mjs */
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
const here = path.dirname(fileURLToPath(import.meta.url));
const C = await import(path.join(here, "../js/cat.js")), L = await import(path.join(here, "../js/lab.js")), G = await import(path.join(here, "../js/gait.js")), WK = await import(path.join(here, "../js/walk.js"));
let checks = 0, fails = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log("FAIL " + msg); } else console.log("✓ " + msg); };
const t0 = Date.now();
const sub = (a, b) => a.map((x, i) => x - b[i]), det3 = (a, b, c) => a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
const rnd = ((s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(11);

/* 1 · it stands: four feet on the floor at the corners of a real tetrahedron of the 3D floor (x, z, w), and its centre
   of mass over that tetrahedron, at every moment of its idle (breathing, the tail swaying through w) */
{
  let worst = 1, vol = 0, onFloor = true;
  for (let k = 0; k < 24; k++) {
    const P = C.pose(k * 0.37), F = C.paws(P).map((p) => [p[0], p[2], p[3]]), c = C.mass(P).c, cf = [c[0], c[2], c[3]];
    onFloor &&= C.paws(P).length === 4 && C.paws(P).every((p) => Math.abs(p[1]) < 1e-9);
    const V = det3(sub(F[1], F[0]), sub(F[2], F[0]), sub(F[3], F[0])) / 6; vol = Math.max(vol, Math.abs(V));
    for (let i = 0; i < 4; i++) { const G = F.slice(); G[i] = cf; worst = Math.min(worst, det3(sub(G[1], G[0]), sub(G[2], G[0]), sub(G[3], G[0])) / 6 / V); }
  }
  ok(onFloor && vol > 1e-3 && worst > 0.15, `it stands: four feet on the floor spanning ${(vol * 1e6).toFixed(0)} cm³ of it, its centre of mass inside (smallest barycentric weight ${worst.toFixed(2)})`);
  // and a rectangle of feet wouldn't: the same feet with the hind pair turned into z are coplanar in the floor
  const P = C.pose(0, { idle: false }), F = C.paws(P).map((p) => [p[0], Math.abs(p[2]) + Math.abs(p[3]) > 0 ? (p[2] || p[3]) : 0, 0]);
  ok(Math.abs(det3(sub(F[1], F[0]), sub(F[2], F[0]), sub(F[3], F[0]))) < 1e-12, "four feet on a rectangle span no volume of a 3D floor: no stance");
}

/* 2 · the distance is safe to march: outside the cat, where rays travel, it never changes faster than the distance
   moved (the shader steps 0.9 of it). Inside, the ellipsoids' approximate distance is steeper, which a ray never sees */
{
  const P = C.pose(1.3); let worst = 0, n0 = 0;
  for (let k = 0; k < 8000; k++) {
    const p = [-0.5 + rnd(), rnd() * 0.65, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.6], dir = [rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], s = 0.002 + 0.03 * rnd(), n = Math.hypot(...dir);
    const q = p.map((x, i) => x + (dir[i] / n) * s), a = C.sdf(p, P).d, b = C.sdf(q, P).d;
    if (a > 0 && b > 0) { n0++; worst = Math.max(worst, Math.abs(a - b) / s); }
  }
  ok(n0 > 4000 && worst < 1 / 0.9, `outside the cat the distance changes at most ${worst.toFixed(3)} per unit moved (marched at 0.9 a step, so it may not exceed ${(1 / 0.9).toFixed(3)})`);
}

/* 3 · Cheshire: slice by slice. The page's list of what's in your slice (cut) never misses a part that's there; at
   w = 0 the whole cat is one piece; past the tail's sway, only the grin; past the grin's reach, nothing */
{
  const P = C.pose(0, { idle: false }), n = [0, 0, 0, 1];
  const inside = (w, N = 40) => { const found = new Set(); for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) { const p = [-0.52 + (0.95 * i) / (N - 1), (0.62 * j) / (N - 1), -0.32 + (0.64 * k) / (N - 1), w], s = C.sdf(p, P); if (s.d < 0) found.add(nearestGroup(p)); } return found; };
  const nearestGroup = (p) => { let best = Infinity, g = null; for (const k of P.caps) { const d = C.capD(p, k); if (d < best) { best = d; g = k.g; } } for (const e of P.ells) { const d = C.ellD(p, e); if (d < best) { best = d; g = e.g; } } return g; };
  let misses = [];
  for (const w of [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.2, 0.25]) { const cut = C.cut(P, n, w).groups; for (const g of inside(w)) if (!cut.includes(g)) misses.push(`${g}@${w}`); }
  ok(!misses.length, `the page's "in your slice" list never misses a part that's there${misses.length ? ": " + misses.join(", ") : ""}`);
  const g0 = C.cut(P, n, 0).groups, gHind = C.cut(P, n, 0.16).groups, gNone = C.cut(P, n, 0.2).groups;
  ok(g0.length === C.GROUPS.length && gHind.join() === "hind legs" && [...inside(0.16, 48)].every((g) => g === "hind legs") && !gNone.length && inside(0.2, 60).size === 0,
    "at w = 0 all of it; at 16 cm only its hind feet; at 20 cm nothing (the list and sampling agree)");
}

/* 4 · turning and the three eyes: the lab's turns are rotations; the eyes are an equilateral triangle in the zw plane
   (so their baselines span both sideways directions: depth from any direction of edge); your slice at w = 0 holds two of
   them, and a quarter turn in zw takes those two out and brings the third in */
{
  const R = L.rotation({ zw: 0.7, xw: -0.4, yw: 0.2, xz: 1.1 }); let orth = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += R[i * 4 + k] * R[j * 4 + k]; orth = Math.max(orth, Math.abs(s - (i === j ? 1 : 0))); }
  const E = C.EYES.map((e) => [e[2], e[3]]), side = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), s3 = [side(E[0], E[1]), side(E[1], E[2]), side(E[2], E[0])];
  const area = Math.abs((E[1][0] - E[0][0]) * (E[2][1] - E[0][1]) - (E[2][0] - E[0][0]) * (E[1][1] - E[0][1])) / 2;
  const P0 = C.pose(0, { idle: false }), eyesIn = (Q) => C.cut(P0, [Q[12], Q[13], Q[14], Q[15]], 0).parts.filter((p) => p.g === "eyes").length;
  const Q = L.rotation({ zw: Math.PI / 2 }), g = C.cut(P0, [Q[12], Q[13], Q[14], Q[15]], 0).groups;
  ok(orth < 1e-12 && Math.max(...s3) - Math.min(...s3) < 2e-4 && area > 0.002 && eyesIn(L.rotation({})) === 2 && eyesIn(Q) === 1 && g.includes("ears") && g.includes("grin"),
    `turns are rotations; three eyes in an equilateral triangle (side ${(s3[0] * 100).toFixed(1)} cm) across z and w; two in your slice, and a quarter turn through w swaps them for the third`);
}

/* 5 · the shader is the same cat: its joins use the materials' thresholds and the join width cat.js uses, and its
   arrays are cat.js's sizes */
{
  const src = fs.readFileSync(path.join(here, "../js/lab.js"), "utf8");
  ok(src.includes("else if (m >= ${MAT.grin}.) hard(E, N, d, m); else if (m >= ${MAT.pink}.) hard(D, M, d, m); else blend(F, d, uK * (1. - m));") && src.includes("F = mix(F, d, h) - k * h * (1. - h)") && src.includes("uniform4fv(U.uCp, f4(caps, (k) => [k.ra, k.rb, k.m, k.wx]))") && src.includes("${LIMITS.caps}"),
    "the shader joins as cat.js does (fur smooth by mix, skin and eyes hard and apart, carved, then the mouth's parts), and reads the parts' fields in cat.js's order");
}

/* 6 · balance (js/gait.js): its geometry against brute force, then each leg plan judged as the panel says */
{
  // Chebyshev's centre is the deepest point (no random point inside is deeper), and the least sway is least
  const tet = [[0.16, 0.088, 0], [0.16, -0.088, 0], [-0.16, 0, 0.11], [-0.16, 0, -0.11], [-0.4, 0.02, 0.01]], h = G.hull(tet), c = G.cheb(h), p0 = [0.15, 0.05, 0.08], sw = G.swayTo(h, p0, 0.01);
  let deeper = 0, closer = 0;
  for (let k = 0; k < 20000; k++) {
    const q = [-0.45 + 0.65 * rnd(), -0.1 + 0.2 * rnd(), -0.12 + 0.24 * rnd()], m = G.margin(h, q);
    if (m > c.r + 1e-9) deeper++;
    if (m >= 0.01 && Math.hypot(...q.map((x, i) => x - p0[i])) < sw.d - 1e-6) closer++;
  }
  ok(h.dim === 3 && Math.abs(G.margin(h, c.p) - c.r) < 1e-9 && !deeper && sw && Math.abs(G.margin(h, sw.p) - 0.01) < 1e-6 && !closer,
    `the support's geometry: Chebyshev's centre ${(c.r * 100).toFixed(2)} cm deep and no sampled point deeper; the least sway (${(sw.d * 100).toFixed(2)} cm) and none shorter`);
  const P = C.pose(0, { idle: false }), fl = (p) => [p[0], p[2], p[3]], PT = C.pose(0, { idle: false, tailFoot: true });
  const P5 = C.pose(0, { idle: false, legs: 5 });
  const cat = { feet: C.paws(P).map(fl), labels: C.pawNames(P), com: fl(C.mass(P).c), comTail: fl(C.mass(PT).c), tailFoot: C.TAIL_FOOT, five: { feet: C.paws(P5).map(fl), labels: C.pawNames(P5), com: fl(C.mass(P5).c) } };
  const A = Object.fromEntries(G.plans(cat).map((p) => [p.id, { plan: p, a: G.analyse(p) }]));
  ok(A.cat.a.canStand && !A.cat.a.canCreep && A.cat.a.creep.every((c) => c.dim === 2 && c.free === 1) && A.cat.a.halves.every((x) => x.dim === 1 && x.free === 2),
    "the cat stands, but lifting any foot leaves three in a plane (one way to tip), and its trot stands on lines (two ways)");
  ok(A.aligned.a.stand.dim === 2 && !A.aligned.a.canStand, "hips aligned (both pairs across z): four feet in a plane, so it can't even stand");
  ok(A.tail.a.canCreep && A.tail.a.swayMax < 0.07, `its tail planted, the cat creeps: every foot lifted alone leaves a solid, the body swaying at most ${(A.tail.a.swayMax * 100).toFixed(1)} cm`);
  // and the cat itself, posed: swayed by swayFor and the foot lifted, its own centre of mass is over the four still down
  let worst = 1;
  for (const c of A.tail.a.creep) {
    const o = { tailFoot: true, lift: c.lift.map((k) => A.tail.plan.labels[k]) }, Q = C.pose(0, { idle: false, ...o, sway: C.swayFor(c.sway.p, o) });
    worst = Math.min(worst, G.margin(G.hull(C.paws(Q).map(fl)), fl(C.mass(Q).c)));
  }
  ok(worst > 0.0099, `acted out: lifting each of its five feet in turn, the posed cat's centre of mass stays ${(worst * 100).toFixed(2)} cm or more inside the other four`);
  // the five-legged cat: stands, creeps on its own body (every foot lifted in turn, swayed by swayFor), three feet in
  // the slice w = 0 and two off it, and its arrays still fit the shader's
  let worst5 = 1;
  for (const c of A.five.a.creep) {
    const o = { legs: 5, lift: c.lift.map((k) => A.five.plan.labels[k]) }, Q = C.pose(0, { idle: false, ...o, sway: C.swayFor(c.sway.p, o) });
    worst5 = Math.min(worst5, G.margin(G.hull(C.paws(Q).map(fl)), fl(C.mass(Q).c)));
  }
  const inSlice = C.paws(P5).filter((p) => Math.abs(p[3]) < 0.03).length, P5t = C.pose(0, { idle: false, legs: 5, tailFoot: true });
  ok(A.five.a.canStand && A.five.a.canCreep && worst5 > 0.0099 && inSlice === 3 && C.paws(P5).length === 5 && P5t.caps.length <= C.LIMITS.caps && P5t.ells.length <= C.LIMITS.ells,
    `the five-legged cat stands (${(A.five.a.stand.margin * 100).toFixed(1)} cm in) and creeps on its own body, swaying at most ${(A.five.a.swayMax * 100).toFixed(1)} cm, its centre of mass ${(worst5 * 100).toFixed(2)} cm or more in; three feet in your slice, two off it`);
  const D = Math.PI / 180, ring = (x, r, d) => d.map((a) => [x, r * Math.cos(a * D), r * Math.sin(a * D)]);
  const badFive = G.analyse({ ...A.five.plan, feet: [[0.16, 0.09, 0], [0.16, -0.09, 0], ...ring(-0.16, 0.1, [90, 210, 330])] });
  ok(A.five.a.canCreep && !badFive.canCreep && badFive.creep.some((c) => c.dim === 2),
    "five legs creep, but only if no two hind feet line up with the front pair: turned 90°, one lift lays the other four in a plane");
  ok(A.six.a.canCreep && A.six.a.halves.every((x) => x.dim === 2) && A.eight.a.canCreep && A.eight.a.halvesStatic,
    "six legs creep but alternate on triangles (dynamic); eight alternate on two solid fours, each the cat's own stance");
  // the tail: level, it can push against pitch only; raised θ, against all three, sideways in proportion to sin θ
  const lv = G.tailReach(0), up = G.tailReach(0.6);
  ok(lv.rank === 1 && up.rank === 3 && Math.abs(up.reach[1] - Math.sin(0.6)) < 1e-12 && Math.abs(up.reach[2] - Math.sin(0.6)) < 1e-12 && Math.abs(up.reach[0] - 1) < 1e-12,
    "a level tail catches only forward tipping; raised θ, all three, the sideways two in proportion to sin θ");
}

/* 7 · walking (js/walk.js): the five-legged cat walks a wave gait, one foot at a time, statically balanced, its stride set
   by its front legs' reach; acted out on its own posed body over a whole cycle, its centre of mass stays over the feet
   actually down, and a foot down doesn't slide on the floor. The cat with four has no such gait */
{
  const fl = (p) => [p[0], p[2], p[3]], R5 = C.rig({ legs: 5 }), com5 = fl(C.mass(C.pose(0, { idle: false, legs: 5 })).c);
  const m = WK.maxStride(R5, com5, { steps: 9 }), g = WK.wave(R5, com5, { L: 0.8 * m.L, order: m.gait.groups });
  let worst = 1, slide = 0; const planted = {};
  for (let k = 0; k <= 160; k++) {
    const t = (k * g.T) / 160, s = g.at(t), P = C.pose(0, { idle: false, legs: 5, feet: s.feet, sway: s.sway });
    worst = Math.min(worst, G.margin(G.hull(C.paws(P).map(fl)), fl(C.mass(P).c)));
    for (const nm of s.down) { const wx = s.feet[nm].p[0] + s.d; if (planted[nm] !== undefined && s.down.includes(nm)) slide = Math.max(slide, Math.abs(wx - planted[nm])); planted[nm] = wx; }
    for (const nm of Object.keys(planted)) if (!s.down.includes(nm)) delete planted[nm];
  }
  const R4 = C.rig({ legs: 4 }), com4 = fl(C.mass(C.pose(0, { idle: false })).c), four = WK.best(R4, com4, { L: 0.04 });
  ok(m.L > 0.1 && g.ok && worst > 0.009 && slide < 1e-9 && !four.isStatic && four.plan.every((p) => p.dim === 2),
    `walking: the five-legged cat's longest static stride is ${(m.L * 100).toFixed(1)} cm (reach-limited); at 80% its own posed body keeps its centre of mass ${(worst * 100).toFixed(2)} cm or more inside the feet down all cycle, and no foot down slides; the cat with four has no static gait (every swing leaves three in a plane)`);
}

/* 8 · the hyper-mouth: a sheet (our smile curve spun round the xy plane) that opens into a volume. The spun distance is
   the true distance to the spun surface (against brute force over the angle); the mouth's parts are the same in every
   sideways direction; closed, the place behind the teeth is cat; open, it is a hole, out of the cat at every angle round
   z and w (a volume, not a slit). The teeth are set in the flesh, their faces bared, shut to open (below). And the
   shader carves and spins as cat.js does */
{
  const P0 = C.pose(0, { idle: false }), P1 = C.pose(0, { idle: false, mouth: 1 }), spun = P0.caps.filter((k) => k.wx === C.REV);
  let worst = 0;
  for (let k = 0; k < 300; k++) {
    const c = spun[k % spun.length], p = [0.3 + 0.1 * rnd(), 0.3 + 0.08 * rnd(), (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.2];
    let brute = Infinity; for (let a = 0; a < 720; a++) { const th = (a * Math.PI) / 360, rot = (q) => [q[0], q[1], q[2] * Math.cos(th), q[2] * Math.sin(th)]; brute = Math.min(brute, C.capD(p, { ...c, wx: 0, a: rot(c.a), b: rot(c.b) })); }
    worst = Math.max(worst, Math.abs(brute - C.capD(p, c)));
  }
  const mouthOnly = { caps: P1.caps.filter((k) => k.m >= C.MAT.grin), ells: P1.ells.filter((e) => e.m >= C.MAT.grin), cavity: null };
  let asym = 0;
  for (let k = 0; k < 200; k++) { const p = [0.31 + 0.06 * rnd(), 0.31 + 0.06 * rnd(), (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.12], th = rnd() * 6.28; asym = Math.max(asym, Math.abs(C.sdf(p, mouthOnly).d - C.sdf([p[0], p[1], p[2] * Math.cos(th) - p[3] * Math.sin(th), p[2] * Math.sin(th) + p[3] * Math.cos(th)], mouthOnly).d)); }
  const ring = [0, 1, 2, 3, 4, 5].map((k) => [0.352, 0.334, 0.03 * Math.cos((k * Math.PI) / 3), 0.03 * Math.sin((k * Math.PI) / 3)]);
  const closed = ring.every((p) => C.sdf(p, P0).d < 0), open = ring.every((p) => C.sdf(p, P1).d > 0.003 && C.sdf(p, P1).m === C.MAT.mouth);
  // set in the flesh: sample every tooth's spine round z and w; the flesh is everything but the teeth and tongue. A
  // tooth's root is a tooth's width up from the upper row's spine (down from the lower's, turned with the jaw), its
  // face a tooth's width forward. Shut, every root is in the flesh; at any opening the flesh meets every root within
  // 2 mm (a third of a tooth), and no face is under the lips by more than that (the smile's corners tuck in a little)
  let shutRooted = true, gap = -1, cover = -1;
  for (const mouth of [0, 0.25, 0.5, 0.75, 1]) {
    const P = C.pose(0, { idle: false, mouth }), flesh = { ...P, caps: P.caps.filter((k) => k.m < C.MAT.grin || k.m === C.MAT.mouth), ells: P.ells.filter((e) => e.m < C.MAT.grin) };
    const teeth = P.caps.filter((k) => k.m === C.MAT.grin), a = 0.5 * mouth, turn = ([dx, dy]) => [dx * Math.cos(a) + dy * Math.sin(a), -dx * Math.sin(a) + dy * Math.cos(a)];
    teeth.forEach((k, i) => {
      const lower = i % 2 === 1, up = lower ? turn([0, -1]) : [0, 1], fwd = lower ? turn([1, 0]) : [1, 0];
      for (let h = 0; h <= 1; h += 0.25) for (let th = 0; th < 6.28; th += 0.7) {
        const x = k.a[0] + (k.b[0] - k.a[0]) * h, y = k.a[1] + (k.b[1] - k.a[1]) * h, r = k.a[2] + (k.b[2] - k.a[2]) * h, at = (d) => [x + d[0] * C.TOOTH, y + d[1] * C.TOOTH, r * Math.cos(th), r * Math.sin(th)];
        const dr = C.sdf(at(up), flesh).d, df = C.sdf(at(fwd), flesh).d;
        if (!mouth && dr >= 0) shutRooted = false; gap = Math.max(gap, dr); cover = Math.max(cover, -df);
      }
    });
  }
  const src = fs.readFileSync(path.join(here, "../js/lab.js"), "utf8");
  const shader = src.includes("else if (wx < 0.) P = vec4(p.x, p.y, length(p.zw), 0.);") && src.includes("if (C > D) { D = C; M = ${MAT.mouth}.; }") && src.includes("return E < D ? vec2(E, N) : vec2(D, M);") && src.includes("if (m > ${MAT.mouth - 0.5}) C = max(C, -d);");
  ok(worst < 1e-5 && asym < 1e-9 && closed && open && shutRooted && gap < 0.002 && cover < 0.002 && P1.caps.some((k) => k.m === C.MAT.mouth) && shader,
    `the hyper-mouth: spun distance exact (to ${worst.toExponential(0)}); the same every way round z and w; shut, cat behind the teeth; open, a hole at every angle round them (a volume); the teeth set in the flesh (shut, every root in it; open, the flesh within ${(Math.max(0, gap) * 1000).toFixed(1)} mm of every root; no face under the lips by more than ${(Math.max(0, cover) * 1000).toFixed(1)} mm); the shader carves and spins as cat.js does`);
}

console.log(fails ? `\n✗ ${fails} of ${checks} cheshire checks failed` : `\n✓ cheshire: ${checks} checks in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fails ? 1 : 0);
