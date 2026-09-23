#!/usr/bin/env node
// csaszar/poly.selftest.mjs — holds poly.js to every claim the page makes.
//
// It imports the exact module the browser loads, and it also imports the DUAL
// page's module to check the two really are dual. Run it before touching
// anything in this directory:
//
//     node csaszar/poly.selftest.mjs      # ~3 s
//
// scripts/preflight.mjs picks it up automatically for changed dirs.

import * as P from './poly.js';
import * as S from '../szilassi/poly.js';

let checks = 0, failures = 0;
const ok = (cond, what, detail = '') => {
  checks++;
  if (!cond) { failures++; console.log(`  FAIL  ${what}${detail ? `  — ${detail}` : ''}`); }
};
const close = (a, b, tol, what) => ok(Math.abs(a - b) <= tol, what, `${a} vs ${b} (tol ${tol})`);
const section = (t) => console.log(`\n${t}`);
const key = (a) => a.slice().sort((x, y) => x - y).join(',');

// ---------------------------------------------------------------------------
section('the Möbius torus');

// the triangulation, re-derived from Möbius' description rather than read off
const DERIVED = [];
for (let i = 0; i < 7; i++) {
  DERIVED.push([i, (i + 1) % 7, (i + 3) % 7]);
  DERIVED.push([i, (i + 2) % 7, (i + 3) % 7]);
}
ok(P.FACES.length === 14, '14 triangles');
ok(new Set(P.FACES.map(key)).size === 14, 'all different');
ok(new Set(P.FACES.map(key)).size === new Set(DERIVED.map(key)).size
   && P.FACES.every((f) => DERIVED.some((d) => key(d) === key(f))),
   'FACES is exactly {i,i+1,i+3} and {i,i+2,i+3} mod 7');
ok(P.EDGES.length === 21, '21 edges');
ok(7 - 21 + 14 === 0, 'V − E + F = 0 — a torus');

// the defining property: NO DIAGONALS
{
  const have = new Set(P.EDGES.map(([a, b]) => key([a, b])));
  let missing = 0;
  for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) if (!have.has(key([i, j]))) missing++;
  ok(have.size === 21 && missing === 0,
     'every one of the 21 vertex pairs is an edge — the solid has no diagonals', `${missing} missing`);
}
{
  const deg = new Array(7).fill(0);
  for (const [a, b] of P.EDGES) { deg[a]++; deg[b]++; }
  ok(deg.every((d) => d === 6), 'every vertex meets 6 edges');
  ok(P.VERTEX_FACES.every((f) => f.length === 6), 'and 6 triangles');
}
// orientability: the 14 cycles traverse each edge once each way
{
  const dirs = new Set();
  let doubled = 0;
  for (const f of P.FACES) for (let i = 0; i < 3; i++) {
    const k = `${f[i]}>${f[(i + 1) % 3]}`;
    if (dirs.has(k)) doubled++;
    dirs.add(k);
  }
  ok(doubled === 0 && dirs.size === 42, 'each edge is traversed once in each direction — consistently oriented');
  ok(P.volume(P.PRESETS[0].points) > 0, 'and the normals point outwards (positive enclosed volume)');
}

// ---------------------------------------------------------------------------
section('the 42 relabellings');
{
  ok(P.AUTOMORPHISMS.length === 42, 'Aut has order 42', `${P.AUTOMORPHISMS.length}`);
  const target = new Set(P.FACES.map(key));
  ok(P.AUTOMORPHISMS.every((p) => P.FACES.every((f) => target.has(key(f.map((v) => p[v]))))),
     'and every one of them really does preserve the triangulation');
  // each should be x -> ax + b mod 7 with a a unit
  let affine = 0;
  for (const p of P.AUTOMORPHISMS) {
    for (let a = 1; a < 7; a++) for (let b = 0; b < 7; b++) {
      if (p.every((img, x) => img === (a * x + b) % 7)) affine++;
    }
  }
  ok(affine === 42, 'and each is an affine map x ↦ ax + b mod 7', `${affine}`);
}

// ---------------------------------------------------------------------------
section('dual to the Szilassi polyhedron');
{
  // Császár's triangles ARE the triples of Szilassi faces that meet at each of
  // its 14 corners — the definition of the dual, checked rather than asserted
  const mine = new Set(P.FACES.map(key));
  const theirs = new Set(S.VERTEX_PLANES.map(key));
  ok(mine.size === 14 && theirs.size === 14, 'both have 14 of them');
  ok([...mine].every((k) => theirs.has(k)),
     'Császár\'s 14 triangles are Szilassi\'s 14 corners, as triples of its faces');

  // and the other way round: the 6 triangles round Császár vertex i are the
  // 6 corners of Szilassi face i
  const tau = P.FACES.map((f) => S.VERTEX_PLANES.findIndex((t) => key(t) === key(f)));
  ok(new Set(tau).size === 14 && tau.every((x) => x >= 0), 'the correspondence is a bijection');
  for (let i = 0; i < 7; i++) {
    ok(key(P.VERTEX_FACES[i].map((t) => tau[t])) === key(S.FACES[i]),
       `the 6 triangles at Császár vertex ${i + 1} are the 6 corners of Szilassi face ${i + 1}`);
  }
  ok(S.EDGES.length === P.EDGES.length, 'both have 21 edges');
  ok(JSON.stringify(P.VERTEX_COLOURS) === JSON.stringify(S.FACE_COLOURS),
     'and the seven colours have not drifted apart from the dual page\'s');
}

// ---------------------------------------------------------------------------
section('the published realizations');
for (const pr of P.PRESETS) {
  const r = P.inspect(pr.points);
  ok(r.ok, `"${pr.name}" is a solid`, r.reason);
  ok(r.type.general, `"${pr.name}" has no four points in a plane`);
  ok(r.volume > 0, `"${pr.name}" encloses positive volume`);
  ok(r.clearance > 0.01, `"${pr.name}" has room to spare`, `${r.clearance}`);
}
{
  ok(new Set(P.TYPE_SIGNATURES).size === 4,
     'the four are four genuinely different oriented matroids');
  P.PRESETS.forEach((pr, i) => {
    ok(P.typeOf(pr.points).index === i, `"${pr.name}" identifies as itself`);
  });
  // the stacking order along the axis is what tells them apart by eye
  const orders = P.PRESETS.map((pr) => {
    const z = pr.points.map((p) => p[2]);
    const layer = [['16', (z[0] + z[5]) / 2], ['25', (z[1] + z[4]) / 2], ['34', (z[2] + z[3]) / 2], ['7', z[6]]];
    return layer.sort((a, b) => a[1] - b[1]).map((l) => l[0]).join(' · ');
  });
  P.PRESETS.forEach((pr, i) => ok(orders[i] === pr.stack,
    `"${pr.name}" stacks up the axis as ${pr.stack}`, orders[i]));
  ok(new Set(orders).size === 4, 'and all four stackings are different');
}

// ---------------------------------------------------------------------------
section('general position is not an assumption');
{
  // A neighbourly triangulation forces it: four points in a plane would put
  // two of the edges in that plane, and in K7 those two edges exist and would
  // have to cross. So no solid can have four coplanar points.
  let rng = 20260921 >>> 0;
  const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
  let tested = 0, degenerate = 0, worst = Infinity;
  for (let i = 0; i < 4000 && tested < 400; i++) {
    const base = P.PRESETS[i % 4].points;
    const kn = P.ZERO_KNOBS().map(() => [(rnd() * 2 - 1) * 0.35, (rnd() * 2 - 1) * 0.35, (rnd() * 2 - 1) * 0.35]);
    const V = P.build(base, kn);
    if (!P.acoptic(V).ok) continue;
    tested++;
    const gp = P.generalPosition(V);
    worst = Math.min(worst, gp.margin);
    if (!gp.ok) degenerate++;
  }
  ok(tested > 50, 'found plenty of solids to test', `${tested}`);
  ok(degenerate === 0, 'and not one of them had four points in a plane', `${degenerate}/${tested}`);
  // a solid may come arbitrarily close to four coplanar points — it just can
  // never reach them, because reaching them is exactly where it stops being one
  ok(worst > 0, 'and none of them reached it, however close some came',
     `closest quadruple seen: ${worst.toExponential(2)} of the radius cubed`);
}

// ---------------------------------------------------------------------------
section('the verdict, checked against a second opinion');
{
  // An INDEPENDENT test, built a different way: a triangulated closed surface
  // is embedded iff no two triangles sharing an edge are coplanar, the link of
  // every vertex is a simple closed spherical polygon, and no edge pierces a
  // triangle it shares no vertex with. (Two convex sets meet in a convex set,
  // which is what makes the first two enough for every pair that shares
  // something.) It agrees with poly.js or one of them is wrong.
  const { sub, add, mul, dot, cross, len, unit } = P;
  const linkRing = (v) => {
    const fs = P.VERTEX_FACES[v];
    const opp = (f) => P.FACES[f].filter((x) => x !== v);
    const chain = [fs[0]];
    const used = new Set(chain);
    while (chain.length < fs.length) {
      const last = opp(chain[chain.length - 1]);
      const nxt = fs.find((f) => !used.has(f) && opp(f).some((x) => last.includes(x)));
      if (nxt === undefined) return null;
      used.add(nxt); chain.push(nxt);
    }
    const ring = [];
    for (let i = 0; i < chain.length; i++) {
      const a = opp(chain[i]), b = opp(chain[(i + 1) % chain.length]);
      const sh = a.filter((x) => b.includes(x));
      if (sh.length !== 1) return null;
      ring.push(sh[0]);
    }
    return ring;
  };
  const arcsCross = (a, b, c, d) => {
    const l = cross(cross(a, b), cross(c, d));
    if (len(l) < 1e-12) return false;
    for (const s of [unit(l), mul(unit(l), -1)]) {
      const on = (p, q) => {
        const ang = Math.acos(Math.max(-1, Math.min(1, dot(p, q))));
        const a1 = Math.acos(Math.max(-1, Math.min(1, dot(p, s))));
        const a2 = Math.acos(Math.max(-1, Math.min(1, dot(s, q))));
        return a1 + a2 <= ang + 1e-9 && a1 > 1e-9 && a2 > 1e-9;
      };
      if (on(a, b) && on(c, d)) return true;
    }
    return false;
  };
  const pierces = (p, q, tri, eps) => {
    const n = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
    const nl = len(n);
    if (nl < eps) return false;
    const u = mul(n, 1 / nl);
    const sp = dot(u, sub(p, tri[0])), sq = dot(u, sub(q, tri[0]));
    if (Math.abs(sp) < eps || Math.abs(sq) < eps || (sp > 0) === (sq > 0)) return false;
    const x = add(p, mul(sub(q, p), sp / (sp - sq)));
    for (let i = 0; i < 3; i++) {
      const e = sub(tri[(i + 1) % 3], tri[i]);
      if (dot(cross(e, sub(x, tri[i])), u) < -eps * nl) return false;
    }
    return true;
  };
  const secondOpinion = (V) => {
    const scale = P.bounds(V).radius, eps = 1e-9 * scale;
    const planes = P.FACES.map((f) => P.planeOfFace(V, f));
    for (const pl of planes) if (!(pl.area2 > 1e-12 * scale * scale)) return false;
    for (const [, , f, g] of P.EDGES) {
      if (Math.abs(Math.abs(dot(planes[f].n, planes[g].n)) - 1) < 1e-12) return false;
    }
    for (let v = 0; v < 7; v++) {
      const ring = linkRing(v);
      if (!ring) return false;
      const dirs = ring.map((w) => unit(sub(V[w], V[v])));
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
        if (j === i + 1 || (i === 0 && j === 5)) continue;
        if (arcsCross(dirs[i], dirs[(i + 1) % 6], dirs[j], dirs[(j + 1) % 6])) return false;
      }
    }
    for (const [a, b] of P.EDGES) for (let f = 0; f < 14; f++) {
      if (P.FACES[f].includes(a) || P.FACES[f].includes(b)) continue;
      if (pierces(V[a], V[b], P.FACES[f].map((i) => V[i]), eps)) return false;
    }
    return true;
  };

  for (const pr of P.PRESETS) {
    ok(secondOpinion(pr.points), `the second opinion also calls "${pr.name}" a solid`);
  }
  let rng = 4242 >>> 0;
  const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
  let agree = 0, disagree = 0, solids = 0;
  for (let i = 0; i < 3000; i++) {
    const V = Array.from({ length: 7 }, () => [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]);
    const a = P.acoptic(V).ok, b = secondOpinion(V);
    if (a === b) { agree++; if (a) solids++; } else disagree++;
  }
  ok(disagree === 0, 'and the two agree on 3000 random configurations', `${disagree} disagreements`);
  ok(solids > 0, 'some of which were solids, so the agreement is not vacuous', `${solids}`);
  ok(solids < 60, 'and most of which were not', `${solids}/3000`);
}

// ---------------------------------------------------------------------------
section('you cannot get from one to another');
{
  // The chirotope can only change by passing through four coplanar points, and
  // four coplanar points cannot happen in a solid. So along any continuous
  // path of solids the type is constant, and different types live in different
  // pieces of the space. Walking straight between two of them must break.
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (i === j) continue;
      const m = P.morphBreak(P.PRESETS[i].points, P.PRESETS[j].points, 240);
      ok(m.broke !== null,
         `the straight walk from "${P.PRESETS[i].name}" to "${P.PRESETS[j].name}" stops being a solid`,
         JSON.stringify(m));
      ok(m.broke > 0 && m.broke < 1, 'and it breaks strictly on the way', `${m.broke}`);
    }
  }
  // a walk to itself never breaks
  const same = P.morphBreak(P.PRESETS[0].points, P.PRESETS[0].points, 120);
  ok(same.broke === null, 'while the walk from a shape to itself never breaks', JSON.stringify(same));
}

// ---------------------------------------------------------------------------
section('degrees of freedom');
for (const pr of P.PRESETS) {
  const d = P.degreesOfFreedom(pr.points);
  ok(d.knobs === 21, `"${pr.name}": seven points, three numbers each: 21 knobs`);
  ok(d.rigid === 7, '...of which the similarities of space use 7', `${d.rigid}`);
  ok(d.shapes === 14, '...leaving 14 shape degrees of freedom — the same 14 the dual has',
     `${d.shapes}`);
}
{
  // and the dual really does report the same number
  const s = S.degreesOfFreedom(S.ZERO_KNOBS());
  ok(s.shapes === 14, 'the Szilassi page measures 14 too', `${s.shapes}`);
}

// ---------------------------------------------------------------------------
section('the half-turn');
{
  for (const pr of P.PRESETS.slice(0, 2)) {
    let worst = 0;
    const { radius } = P.bounds(pr.points);
    for (let v = 0; v < 7; v++) {
      worst = Math.max(worst, P.len(P.sub(P.C2.rotate(pr.points[v]), pr.points[P.C2.vertexOf[v]])));
    }
    ok(worst < 1e-9 * radius, `"${pr.name}" has the half-turn exactly`, `${worst}`);
  }
  for (const pr of P.PRESETS.slice(2)) {
    let worst = 0;
    const { radius } = P.bounds(pr.points);
    for (let v = 0; v < 7; v++) {
      worst = Math.max(worst, P.len(P.sub(P.C2.rotate(pr.points[v]), pr.points[P.C2.vertexOf[v]])));
    }
    ok(worst > 0 && worst < 0.02 * radius,
       `"${pr.name}" is published a shade off the half-turn, and is kept that way`,
       `${(worst / radius).toExponential(2)} of the radius`);
  }
  ok(P.C2.vertexOf.every((x, i) => P.C2.vertexOf[x] === i), 'the vertex map is an involution');
  ok(P.C2.vertexOf.filter((x, i) => x === i).length === 1, 'and fixes exactly one vertex');
}

// ---------------------------------------------------------------------------
section('the knobs');
{
  let rng = 31337 >>> 0;
  const rnd = () => { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; };
  const base = P.PRESETS[0].points;
  ok(P.build(base, P.ZERO_KNOBS()).every((p, i) => p.every((x, k) => x === base[i][k])),
     'zero knobs give the base shape back exactly');
  let stillSolid = 0, broke = 0;
  for (let i = 0; i < 200; i++) {
    const kn = P.ZERO_KNOBS().map(() => [(rnd() * 2 - 1) * 0.3, (rnd() * 2 - 1) * 0.3, (rnd() * 2 - 1) * 0.3]);
    const V = P.build(base, kn);
    if (P.inspect(V).ok) stillSolid++; else broke++;
  }
  ok(stillSolid > 0 && broke > 0,
     'nudging the corners keeps some shapes and breaks others', `${stillSolid} kept, ${broke} broke`);
  ok(P.isSymmetric(base, P.ZERO_KNOBS()), 'the base is symmetric');
  for (let i = 0; i < 30; i++) {
    const kn = P.ZERO_KNOBS().map(() => [(rnd() * 2 - 1) * 0.2, (rnd() * 2 - 1) * 0.2, (rnd() * 2 - 1) * 0.2]);
    ok(!P.isSymmetric(base, kn), 'a random nudge is not');
    ok(P.isSymmetric(base, P.symmetrize(kn, Math.floor(rnd() * 7))), 'and symmetrize() puts it back');
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${failures ? 'FAILED' : 'PASS'} — ${checks - failures}/${checks} checks`);
process.exit(failures ? 1 : 0);
