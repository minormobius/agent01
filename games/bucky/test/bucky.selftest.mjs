/* Bucky's invariants: the ball is C60, the clock does what the README
   says, every level is buildable, and every baked par design passes its
   own level's check with only that level's parts.
     node games/bucky/test/bucky.selftest.mjs */
import { loadBucky } from "./harness.mjs";
const B = await loadBucky();
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; console.error("FAIL " + m); } };

/* ---- the ball */
const ball = B.ball();
ok(ball.n === 60 && ball.bonds.length === 90, "60 atoms, 90 bonds");
ok(ball.nbrs.every((x) => x.length === 3 && new Set(x).size === 3), "every atom has three distinct bonds");
ok(ball.nbrs.every((x, a) => x.every((b) => ball.nbrs[b].includes(a))), "bonds are symmetric");
const ring = (f) => f.every((a, i) => ball.nbrs[a].includes(f[(i + 1) % f.length]));
ok(ball.faces.pent.length === 12 && ball.faces.pent.every(ring), "12 pentagons, each a ring");
ok(ball.faces.hex.length === 20 && ball.faces.hex.every(ring), "20 hexagons, each a ring");
ok(ball.atoms.every((p) => Math.abs(Math.hypot(...p) - 1) < 1e-9), "atoms on the unit sphere");
ok(Math.max(...B.dist(ball, 0)) === 9, "diameter 9");
const lens = ball.bonds.map(([a, b]) => Math.hypot(...ball.atoms[a].map((x, i) => x - ball.atoms[b][i])));
ok(Math.max(...lens) / Math.min(...lens) < 1.0001, "all bonds the same length");

/* ---- the clock */
const lv0 = B.LEVELS[0];
function loop(nots) { // a pentagon, wired round; `nots` of its atoms are NOT
  const d = B.blank(B.LEVELS.find((l) => l.id === "blink")), f = ball.faces.pent[5];
  f.forEach((a, i) => { d.role[a] = i < nots ? "not" : "wire"; d.arrow[B.key(a, f[(i + 1) % 5])] = a; });
  return { d, f };
}
function period(d, a) {
  const c = B.compile(d); let v = B.zero(c); const tr = [];
  for (let k = 0; k < 200; k++) { v = B.step(c, v, {}); tr.push(v[a]); }
  const t = tr.slice(100);
  for (let p = 1; p <= 50; p++) if (t.every((x, i) => i + p >= t.length || x === t[i + p])) return p;
  return -1;
}
{ const { d, f } = loop(1); ok(f.every((a) => B.compile(d).status[a] === "ok"), "a wired pentagon is all ok"); ok(period(d, f[2]) === 10, "one NOT round a pentagon: period 10"); }
{ const { d, f } = loop(5); ok(period(d, f[0]) === 2, "five NOTs round a pentagon: period 2"); }
{ const { d, f } = loop(2); const p = period(d, f[0]); ok(p > 0 && 10 % p === 0, "two NOTs round a pentagon: an even ring, a period dividing 10"); }
{ const { d, f } = loop(0); ok(period(d, f[0]) === 1, "a ring of wires from cold holds still"); }
{ // status rules
  const d = B.blank(lv0), t = B.terminals(lv0), a = ball.nbrs[t.at.A][0], b = ball.nbrs[a].find((x) => x !== t.at.A);
  d.role[a] = "and"; d.arrow[B.key(t.at.A, a)] = t.at.A;
  ok(B.compile(d).status[a] === "open", "a gate with one input is open");
  d.role[a] = "wire"; ok(B.compile(d).status[a] === "ok", "a wire with one input is ok");
  d.role[b] = "wire"; d.arrow[B.key(a, b)] = b;
  ok(B.compile(d).status[a] === "ok", "a wire with two inputs is ok: a join");
  { const c = B.compile(d), tt = [[0, 0], [0, 1], [1, 0], [1, 1]];
    ok(tt.every(([x, y]) => { const v = B.zero(c); v[t.at.A] = x; v[b] = y; return B.step(c, v, { [t.at.A]: x })[a] === (x | y); }), "a join is an OR");
    d.role[a] = "not"; const c2 = B.compile(d);
    ok(c2.status[a] === "ok" && tt.every(([x, y]) => { const v = B.zero(c2); v[t.at.A] = x; v[b] = y; return B.step(c2, v, { [t.at.A]: x })[a] === 1 - (x | y); }), "a NOT with two in is a NOR"); }
  d.role[a] = "and"; ok(B.compile(d).status[a] === "ok", "a gate with two inputs is ok");
  { const c = B.compile(d), x = ball.nbrs[a].find((y) => y !== t.at.A && y !== b); d.role[x] = "wire"; d.arrow[B.key(a, x)] = x;
    ok(B.compile(d).status[a] === "bad", "a gate with three inputs is bad"); B.clear(d, x); }
  d.arrow[B.key(t.at.A, a)] = a; ok(B.compile(d).status[t.at.A] === "bad", "an arrow into a source is bad");
  const e = B.decode(lv0, B.encode(d)); ok(B.encode(e) === B.encode(d), "encode/decode round trip");
  B.clear(d, a); ok(!d.role[a] && ball.nbrs[a].every((x) => d.arrow[B.key(a, x)] === undefined), "clearing a part takes its arrows");
  B.clear(d, t.at.A); ok(d.role[t.at.A] === "src", "a source can't be cleared");
}

/* ---- the levels */
ok(B.PAR && B.LEVELS.every((l) => B.PAR[l.id]), "every level has a baked par");
for (const lv of B.LEVELS) {
  const t = B.terminals(lv), at = Object.values(t.at);
  ok(at.length === t.srcs.length + t.lamps.length && new Set(at).size === at.length, lv.id + ": terminals placed");
  ok(at.every((a) => at.every((b) => !ball.nbrs[a].includes(b))), lv.id + ": no two terminals touch");
  ok(lv.parts.every((p) => B.PARTS[p] && p !== "src" && p !== "lamp"), lv.id + ": palette is parts");
  ok([].concat(lv.net).every((n) => n.gates.every((g) => lv.parts.includes(g.f))), lv.id + ": the reference uses the palette");
  ok(!B.check(lv, B.blank(lv)).pass, lv.id + ": an empty ball fails");
  const par = B.PAR[lv.id], d = B.decode(lv, par.design), r = B.check(lv, d);
  ok(B.encode(d) === par.design, lv.id + ": par design decodes exactly");
  ok(r.pass, lv.id + ": par design passes");
  ok(r.parts === par.parts, lv.id + ": par count matches its design");
  ok(d.role.every((x) => !x || x === "src" || x === "lamp" || lv.parts.includes(x)), lv.id + ": par design uses only the palette");
  const quick = B.par(lv, 7, 300);
  ok(quick && B.check(lv, quick).pass, lv.id + ": the router builds it again");
}
{ // a table level really checks: A straight to the lamp is not NOT
  const w = B.decode(B.LEVELS[0], B.PAR.wire.design), nt = B.LEVELS.find((l) => l.id === "not");
  ok(B.check(B.LEVELS[0], w).pass, "wire level: the wire passes");
  const tw = B.terminals(B.LEVELS[0]), tn = B.terminals(nt);
  if (tw.at.A === tn.at.A && tw.at.out === tn.at.out) ok(!B.check(nt, w).pass, "not level: a bare wire fails");
}
{ // the rules are physics, not a level's: A and B wired straight into the lamp IS the join level
  const lv = B.LEVELS.find((l) => l.id === "or"), t = B.terminals(lv), d = B.blank(lv);
  const lay = (from) => { const prev = { [from]: -1 }, q = [from];
    for (let h = 0; h < q.length; h++) for (const x of ball.nbrs[q[h]]) if (prev[x] === undefined && (!d.role[x] || x === t.at.out)) { prev[x] = q[h]; q.push(x); }
    const path = []; for (let c = t.at.out; c !== from; c = prev[c]) path.push(c);
    let f = from; path.reverse().forEach((a) => { if (!d.role[a]) d.role[a] = "wire"; d.arrow[B.key(f, a)] = f; f = a; }); };
  lay(t.at.A); lay(t.at.B);
  ok(B.check(lv, d).pass, "join level: A and B each wired into the lamp passes");
  const x = B.LEVELS.find((l) => l.id === "xor");
  if (B.terminals(x).at.out === t.at.out) ok(!B.check(x, d).pass, "xor level: the bare join fails");
}
{ // the latch must remember: a lamp wired straight from SET fails
  const lv = B.LEVELS.find((l) => l.id === "latch"), t = B.terminals(lv), d = B.blank(lv);
  const path = []; const prev = { [t.at.SET]: -1 }, q = [t.at.SET];
  for (let h = 0; h < q.length; h++) for (const b of ball.nbrs[q[h]]) if (prev[b] === undefined && (!d.role[b] || b === t.at.Q)) { prev[b] = q[h]; q.push(b); }
  for (let c = t.at.Q; c !== t.at.SET; c = prev[c]) { path.push(c); }
  let from = t.at.SET;
  path.reverse().forEach((a) => { if (!d.role[a]) d.role[a] = "wire"; d.arrow[B.key(from, a)] = from; from = a; });
  const r = B.check(lv, d);
  ok(!r.pass && r.rows.some((x) => x.ok) && r.rows.some((x) => !x.ok), "latch: SET wired straight to Q fails the hold steps only");
}
{ // ...and from cold with both inputs off, the par latch never settles (README)
  const lv = B.LEVELS.find((l) => l.id === "latch"), t = B.terminals(lv), c = B.compile(B.decode(lv, B.PAR.latch.design));
  let v = B.zero(c); const seen = new Set();
  for (let k = 0; k < 300; k++) { v = B.step(c, v, {}); if (k >= 200) seen.add(v[t.at.Q]); }
  ok(seen.size === 2, "latch: from cold, inputs off, Q never settles");
}
console.log(fails ? `bucky: ${fails}/${checks} FAILED` : `bucky: ${checks} checks ok`);
process.exit(fails ? 1 : 0);
