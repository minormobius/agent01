/* node games/onecoast/test/onecoast.selftest.mjs
 *
 * Gates One Coast. The load-bearing properties:
 *
 *   1. The maps are the icosahedral buckyballs: 12 pentagons each, the rest
 *      hexagons, sides aligned with neighbours.
 *   2. THE PROMISE: every generated world has exactly one coastline, and laying
 *      its own tiles through the game's rules finishes with one coastline and
 *      no cliffs. A perfect world really is in the bag.
 *   3. Coasts are continuous across tiles: every coast end is met by exactly
 *      one other, at a shared corner.
 *   4. The census agrees with itself (full vs in-progress), the codec round-
 *      trips, and painting keeps shared sides consistent.
 *
 * Picked up automatically by scripts/preflight.mjs when games/ is touched.
 */
import { loadCoast } from "./harness.mjs";
const C = await loadCoast(["geo", "world", "coastart", "game"]);
let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

console.log("maps");
for (const [name, n] of [["c60", 32], ["c80", 42], ["c180", 92], ["c240", 122]]) {
  const s = C.sphere(name), pents = s.pent.filter(Boolean).length;
  const aligned = s.nbrs.every((ns, i) => ns.every((j, k) => s.polys[j].includes(s.polys[i][k]) && s.polys[j].includes(s.polys[i][(k + 1) % s.polys[i].length])));
  ck(s.n === n && pents === 12 && s.polys.every((r, i) => r.length === (s.pent[i] ? 5 : 6)) && aligned, `${name}: ${n} tiles, 12 pentagons, sides aligned`);
}

console.log("tiles");
{
  const kinds = new Set();
  for (let m = 0; m < 64; m++) for (const c of [0, 1]) kinds.add(C.tileKey([0, 1, 2, 3, 4, 5].map((b) => (m >> b) & 1), c));
  // 14 side patterns up to rotation; the two uniform ones have one centre,
  // each of the other 12 comes as a land-centre (bays) and a sea-centre (capes) tile
  ck(kinds.size === 26, `hexagon kinds, up to rotation: ${kinds.size} (2 uniform + 12 patterns × bay/cape = 26)`);
  const t = [1, 1, 0, 0, 1, 0];
  ck([0, 1, 2, 3, 4, 5].every((r) => C.tileKey(t.map((_, j) => t[(j + r) % 6]), 1) === C.tileKey(t, 1)), "a tile's key doesn't depend on how it's turned");
}

console.log("worlds, and the promise");
for (const name of C.SPHERES) {
  const s = C.sphere(name);
  let perfect = 0, laidPerfect = 0, det = true, mixed = true; const T = name === "c240" ? 4 : 8;
  for (let t = 0; t < T; t++) {
    const w = C.generate(s, { seed: "st" + name + t });
    const cs = C.census(s, w); if (cs.coasts === 1) perfect++;
    if (JSON.stringify(C.generate(s, { seed: "st" + name + t }).edges) !== JSON.stringify(w.edges)) det = false;
    const pl = s.pent.map((p, i) => p ? w.centre[i] : null).filter((x) => x !== null), pland = pl.reduce((a, b) => a + b, 0);
    if (!(pland > 0 && pland < 12) || !s.polys.every((_, i) => !s.pent[i] || w.edges[i].every((e) => e === w.centre[i]))) mixed = false;
    // lay the world's own tiles through the rules, breadth-first from the pentagons, with the whole bag in hand
    const ex = new C.Expedition(name, "st" + t, { world: JSON.parse(JSON.stringify(w)), hand: 999 });
    let guard = 0;
    while (!ex.done() && guard++ < 500) {
      const fr = [...ex.frontier()], i = fr[0], key = C.tileKey(w.edges[i], w.centre[i]), h = ex.hand.indexOf(key);
      const t2 = C.tileFromKey(key); let rot = 0;
      for (let r = 0; r < 6; r++) if (C.placedEdges(t2, r, 6).join("") === w.edges[i].join("")) { rot = r; break; }
      ex.place(h, i, rot);
    }
    const st = ex.status(); if (ex.done() && st.coasts === 1 && st.cliffs === 0) laidPerfect++;
  }
  ck(perfect === T && det && mixed, `${name}: ${T} worlds, every one one coastline, deterministic, pentagons uniform and a mix of massifs and deeps`);
  ck(laidPerfect === T, `${name}: laying each world's own tiles through the rules finishes with 1 coastline, 0 cliffs (${laidPerfect}/${T})`);
}

console.log("coast-heavy decks");
for (const name of ["c80", "c240"]) {
  const s = C.sphere(name), hexes = s.n - 12, shares = [];
  for (let t = 0; t < 4; t++) shares.push(C.shoreTiles(s, C.generate(s, { seed: "deck" + name + t })) / hexes);
  ck(shares.every((x) => x > 0.75), `${name}: shore tiles ${shares.map((x) => Math.round(100 * x) + "%").join(", ")} of each bag (aiming at 85%)`);
}

console.log("coasts are continuous");
for (const name of ["c80", "c240"]) {
  const s = C.sphere(name), w = C.generate(s, { seed: "cont" + name }), ends = [];
  for (let i = 0; i < s.n; i++) C.cellArt(s, i, w.edges[i], w.centre[i]).coasts.forEach((p) => { ends.push(p[0], p[p.length - 1]); });
  const key = (p) => p.map((x) => x.toFixed(6)).join(",");
  const count = new Map(); ends.forEach((p) => count.set(key(p), (count.get(key(p)) || 0) + 1));
  ck(ends.length > 0 && [...count.values()].every((c) => c === 2), `${name}: ${ends.length} coast ends, each met by exactly one other at a shared corner`);
}

console.log("census, codec, painting");
{
  const s = C.sphere("c180"), w = C.generate(s, { seed: "cc" });
  const full = C.census(s, w), p = C.partial(s, s.polys.map((_, i) => ({ edges: w.edges[i], centre: w.centre[i] })));
  ck(full.land === p.land && full.sea === p.sea && p.cliffs === 0, "full census and in-progress census agree on a finished world");
  let rt = true; for (const name of C.SPHERES) { const s2 = C.sphere(name), w2 = C.generate(s2, { seed: "rt" + name }), back = C.decode(C.encode(s2, w2)).world; if (JSON.stringify(back.edges) !== JSON.stringify(w2.edges) || JSON.stringify(back.centre) !== JSON.stringify(w2.centre)) rt = false; }
  ck(rt, "every sphere's worlds round-trip through the share token");
  const a = new C.Atelier("c80", "paint");
  for (let k = 0; k < 40; k++) a.paint((k * 17) % a.s.n, k % 3 ? 1 : 0);
  const cons = a.s.nbrs.every((ns, i) => ns.every((j, side) => a.world.edges[i][side] === a.world.edges[j][C.sideTo(a.s, j, i)]));
  const pentUniform = a.s.polys.every((_, i) => !a.s.pent[i] || a.world.edges[i].every((e) => e === a.world.edges[i][0]));
  ck(cons && pentUniform, "painting keeps every shared side agreed and every pentagon uniform");
}

console.log("mappa's copies");
{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const here = fileURLToPath(new URL(".", import.meta.url));
  const same = ["geo.js", "world.js"].every((f) => readFileSync(here + "../js/" + f, "utf8") === readFileSync(here + "../../../mappa/lib/onecoast/" + f, "utf8"));
  ck(same, "mappa/lib/onecoast/{geo,world}.js are byte-identical to ours (mappa decodes our share tokens with them; edit here, then copy)");
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall one-coast invariants hold");
