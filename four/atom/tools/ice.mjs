/* Which crystal does each water freeze into? Random cells of Z rigid molecules on the force field fitted to
   Hartree–Fock pairs (js/forcefields.js), each relaxed with its cell to the nearest minimum of the lattice energy
   (js/crystal.js), the way crystal-structure prediction is done for our molecules: many random starts, keep the
   lowest. Keys as in tools/forcefield.mjs: 3 our water (the known answer: it must freeze into a four-connected
   hydrogen-bonded net, as ice does), 4 Xater, 4.9 element 9's XH₃.
     node four/atom/tools/ice.mjs <key> <Z> [starts] [--shard i/m] [--pol]   # one search (--pol: on the polarizable field)
     node four/atom/tools/ice.mjs known                             # our water's ice Ic, built by hand and relaxed
     node four/atom/tools/ice.mjs bake                              # gather what's done into js/icedata.js
     node four/atom/tools/ice.mjs probe <key> <round> [n] [--from f] # Hartree–Fock on the found crystals' closest pairs
   A start: a cell of random shape (angles 60–120°, edges within a factor of 1.6 of each other) with room for Z
   molecules at 2–4 times the pair's close packing, each molecule turned at random and placed at random, no two sites of
   different molecules closer than the pair's own closest contact allows. Relaxations that run out of steps are
   counted as unfinished, not as minima. Two minima are the same if their energies agree within 0.02 kcal/mol and
   their volumes within 1% (Z of them; a Z = 2 search can land on a Z = 1 crystal twice over, and that counts as the
   same). Each start has its own seed, so --shard i/m runs starts s ≡ i (mod m) on another machine, into its own cache. */
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { WORLDS, monoOf } from "./forcefield.mjs";
import { hydrideAtoms } from "./census.mjs";
import { FORCEFIELDS } from "../js/forcefields.js";
import { termsOf } from "../js/ffmodel.js";
import { randomRotation } from "../js/md.js";
import { rng } from "../js/landscape.js";
import { Crystal, relaxSteps, sitesOf, tidy, det } from "../js/crystal.js";

const KCAL = 627.509, CACHE = path.join(tmpdir(), "atom4-ice"), BOHR_CM = 0.529177210903e-8, NA = 6.02214076e23;
const RC = { 3: 12, 4: 14 };
/* the crystal for a key on the pairwise field (js/forcefields.js), or with pol on the polarizable one (js/polfields.js,
   js/polcrystal.js: slower, its slopes analytic too) */
export async function polCrystalOf(key) {
  const { POLFIELDS } = await import("../js/polfields.js"), { PolCrystal } = await import("../js/polcrystal.js"), { termsFor } = await import("./fitpol.mjs");
  const w = WORLDS[key], d = w.d, m = monoOf(key), tmpl = hydrideAtoms(m.Z, d, m.R, m.param).map((a) => a.at);
  return { d, m, C: new PolCrystal({ d, tmpl, terms: termsFor(POLFIELDS[key]) }) };
}
export function crystalOf(key) {
  const w = WORLDS[key], d = w.d, m = monoOf(key), tmpl = hydrideAtoms(m.Z, d, m.R, m.param).map((a) => a.at), nH = tmpl.length - 1, { q, pairs } = termsOf(FORCEFIELDS[key].p);
  return { d, m, C: new Crystal({ d, tmpl, q: [-nH * q, ...new Array(nH).fill(q)], types: ["X", ...new Array(nH).fill("H")], pairs, rc: RC[d], width: 2 }) };
}
/* what a minimum looks like: per molecule, its heavy-atom neighbours within 1.2 × the pair's spacing, and its hydrogen
   bonds (an H of one molecule within 1.25 × the pair's H···X distance of another's heavy atom, and the X–H···X
   angle past 140°), averaged over the cell; and the nearest heavy-atom distance */
export function describe(key, C, st) {
  const { d } = C, m = monoOf(key), S = sitesOf(C, st), Z = S.length, ns = C.tmpl.length, Hs = st.H;
  // the pair's own H···X distance, from the census's dimer: heavy atoms RXX apart, the bond's H on the line between
  const hx = m.dimer.RXX - m.R, cut = 1.2 * m.dimer.RXX;
  const imgs = []; { const n = new Array(d).fill(-1); for (;;) { imgs.push(Hs[0].map((_, c) => n.reduce((s, v, i) => s + v * Hs[i][c], 0))); let i = 0; while (i < d && n[i] === 1) { n[i] = -1; i++; } if (i === d) break; n[i]++; } }
  let nb = 0, hb = 0, nearest = Infinity;
  for (let a = 0; a < Z; a++) for (let b = 0; b < Z; b++) for (const t of imgs) {
    if (a === b && t.every((v) => Math.abs(v) < 1e-9)) continue;
    const X = (k) => S[b][k].map((v, c) => v + t[c]), dxx = Math.hypot(...S[a][0].map((v, c) => v - X(0)[c])); nearest = Math.min(nearest, dxx); if (dxx < cut) nb++;
    for (let k = 1; k < ns; k++) { // a's hydrogen k bonded to b's heavy atom?
      const h = S[a][k], o = X(0), r = Math.hypot(...h.map((v, c) => v - o[c])); if (r > 1.25 * hx) continue;
      const u = S[a][0].map((v, c) => v - h[c]), w = o.map((v, c) => v - h[c]), cos = u.reduce((s, v, c) => s + v * w[c], 0) / (Math.hypot(...u) * Math.hypot(...w)); if (cos < Math.cos((140 * Math.PI) / 180)) hb++;
    }
  }
  const V = Math.abs(det(Hs)) / Z, out = { V: +V.toFixed(2), neighbours: +(nb / Z).toFixed(2), hbonds: +(hb / Z).toFixed(2), nearest: +nearest.toFixed(3) };
  if (d === 3) out.density = +((m.Z * 0 + 18.015) / NA / (V * BOHR_CM ** 3)).toFixed(4); // g/cm³ (our water only)
  return out;
}
const same = (a, b) => Math.abs(a.E - b.E) < 0.02 && Math.abs(a.V - b.V) < 0.01 * a.V;
/* start s for key, Z */
export function start(key, C, Z, s) {
  const { d } = C, m = monoOf(key), rnd = rng(1e7 * Z + 1e5 * (key === "4.9" ? 9 : +key) + s), v0 = (m.dimer.RXX ** d) / Math.SQRT2;
  for (;;) {
    // edges and angles at random, then scaled to the volume
    const len = Array.from({ length: d }, () => 1 + 0.6 * rnd()), dirs = [];
    for (let i = 0; i < d; i++) for (;;) { const g = Array.from({ length: d }, () => 2 * rnd() - 1), n = Math.hypot(...g); if (n > 1 || n < 0.1) continue; const u = g.map((v) => v / n); if (dirs.every((e) => Math.abs(e.reduce((t, v, c) => t + v * u[c], 0)) < 0.5)) { dirs.push(u); break; } }
    let H = dirs.map((u, i) => u.map((v) => v * len[i])); const V = Math.abs(det(H)), want = Z * v0 * (2 + 2 * rnd()), k = (want / V) ** (1 / d); H = H.map((r) => r.map((v) => v * k));
    const st = tidy({ H, mols: Array.from({ length: Z }, (_, a) => ({ R0: randomRotation(d, rnd), s: a ? Array.from({ length: d }, rnd) : new Array(d).fill(0) })) });
    // no two sites of different molecules (or of a molecule and its own image) closer than 0.8 × the pair's H···X
    const S = sitesOf(C, st), close = 0.8 * (m.dimer.RXX - m.R); let ok = true;
    const imgs = []; { const n = new Array(d).fill(-1); for (;;) { imgs.push(st.H[0].map((_, c) => n.reduce((t, v, i) => t + v * st.H[i][c], 0))); let i = 0; while (i < d && n[i] === 1) { n[i] = -1; i++; } if (i === d) break; n[i]++; } }
    for (let a = 0; a < Z && ok; a++) for (let b = a; b < Z && ok; b++) for (const t of imgs) { if (a === b && t.every((v) => Math.abs(v) < 1e-9)) continue; if (S[a].some((p) => S[b].some((r) => Math.hypot(...p.map((v, c) => v - r[c] - t[c])) < close))) { ok = false; break; } }
    if (ok) return st;
  }
}
export async function search(key, Z, starts, log = () => {}, [si, sm] = [0, 1], pol = false) {
  const { C } = pol ? await polCrystalOf(key) : crystalOf(key), tag = pol ? "_pol" : "", file = path.join(CACHE, sm > 1 ? `${key}_${Z}${tag}_s${si}of${sm}.json` : `${key}_${Z}${tag}.json`); mkdirSync(CACHE, { recursive: true });
  const st = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { key, d: C.d, Z, field: pol ? "pol" : "pair", shard: [si, sm], done: 0, minima: [], curve: [], unfinished: 0, collapsed: 0, steps: [], seconds: 0 };
  const at = () => si + sm * st.done;
  let t0 = Date.now(), lastSave = Date.now();
  while (at() < starts) {
    let last, k = 0; for (const s of relaxSteps(C, start(key, C, Z, at()), 4000)) { last = s; k++; }
    if (!last || last.g > 2e-5) st.unfinished++;
    else {
      const fin = tidy(last.st), desc = describe(key, C, fin);
      if (desc.nearest < 2) st.collapsed++; // fell through the hard core: not a crystal of molecules
      else {
        const q = { E: +(last.f * KCAL).toFixed(4), ...desc }; let b = st.minima.find((r) => same(r, q));
        if (!b) { b = { ...q, hits: 0, first: at(), H: fin.H.map((r) => r.map((v) => +v.toFixed(5))), mols: fin.mols.map(({ R0, s }) => ({ R0: R0.map((r) => r.map((v) => +v.toFixed(6))), s: s.map((v) => +v.toFixed(6)) })) }; st.minima.push(b); }
        b.hits++;
      }
    }
    st.steps.push(k); st.done++; st.curve.push(st.minima.length);
    if (Date.now() - lastSave > 20000 || at() >= starts) {
      st.seconds += (Date.now() - t0) / 1000; t0 = Date.now(); lastSave = Date.now(); st.minima.sort((a, b) => a.E - b.E);
      writeFileSync(file, JSON.stringify(st)); const b = st.minima[0];
      log(`${key} Z=${Z}${sm > 1 ? ` shard ${si}/${sm}` : ""}: start ${at()}/${starts}, ${st.minima.length} minima (best ${b?.E} kcal/mol, V ${b?.V}, ${b?.hbonds} H-bonds, ×${b?.hits ?? 0}), ${st.unfinished} unfinished, ${st.collapsed} collapsed, ${(st.seconds / st.done).toFixed(1)} s each`);
    }
  }
  return st;
}
/* the known answer: our water's proton-ordered cubic ice (oxygens on diamond, each molecule giving its two hydrogens
   along two of its four bonds so that every bond carries one: the polar ordering, two molecules a cell), built at
   ice's own O–O of 2.75 Å and relaxed */
export function known() {
  const { C } = crystalOf("3"), ac = (4 * 5.197) / Math.sqrt(3), r2 = Math.SQRT1_2, col = (a, b, c) => [0, 1, 2].map((i) => [a[i], b[i], c[i]]);
  const st0 = { H: [[0, 1, 1], [1, 0, 1], [1, 1, 0]].map((r) => r.map((v) => (v * ac) / 2)), mols: [{ R0: col([1, 0, 0], [0, r2, r2], [0, -r2, r2]), s: [0, 0, 0] }, { R0: col([1, 0, 0], [0, r2, -r2], [0, r2, r2]), s: [0.25, 0.25, 0.25] }] };
  const E0 = C.energy(st0.H, sitesOf(C, st0)).E * KCAL; let last; for (const s of relaxSteps(C, st0, 4000)) last = s;
  const fin = tidy(last.st);
  return { built: { E: +E0.toFixed(4), ...describe("3", C, st0) }, relaxed: { E: +(last.f * KCAL).toFixed(4), g: last.g, ...describe("3", C, fin), H: fin.H } };
}
/* Probing the force field where the crystals take it. A force field fitted to pairs placed at random (and to the
   liquid's closest pairs, tools/forcefield.mjs refine) has never seen a crystal's crowding, and a search will find any
   place where the model binds more than the molecules do. So: from the lowest minima found so far, the closest pairs
   of molecules (two per crystal), their Hartree–Fock energies (the census's pair energy, as for every point of the
   fit), added to js/ffdata.js as placements k = 10000 + 100·round + i. Then tools/fitff.mjs refits, and the search
   runs again: round by round, until the crystals found are ones Hartree–Fock agrees with. */
export function closestPairs(key, C, st, n = 2) {
  const { d } = C, S = sitesOf(C, st), Z = S.length, imgs = [], out = [];
  { const m = new Array(d).fill(-1); for (;;) { imgs.push(st.H[0].map((_, c) => m.reduce((t, v, i) => t + v * st.H[i][c], 0))); let i = 0; while (i < d && m[i] === 1) { m[i] = -1; i++; } if (i === d) break; m[i]++; } }
  for (let a = 0; a < Z; a++) for (let b = 0; b < Z; b++) for (const t of imgs) { if (a === b && t.every((v) => Math.abs(v) < 1e-9)) continue; const B = S[b].map((p) => p.map((v, c) => v + t[c])); out.push({ r: Math.hypot(...S[a][0].map((v, c) => v - B[0][c])), A: S[a], B }); }
  out.sort((x, y) => x.r - y.r); const picked = []; for (const p of out) { if (picked.length >= n) break; if (picked.every((q) => Math.abs(q.r - p.r) > 0.05)) picked.push(p); }
  const Zh = monoOf(key).Z; return picked.map(({ A, B }) => [A.map((at, i) => ({ Z: i ? 1 : Zh, at })), B.map((at, i) => ({ Z: i ? 1 : Zh, at }))]);
}
export async function probe(key, round, n = 16, from = null) {
  const { C } = crystalOf(key), d = C.d, FFC = path.join(tmpdir(), "atom4-ff"), file = path.join(FFC, `crystal_${key}_${round}.json`); mkdirSync(FFC, { recursive: true });
  if (!existsSync(file)) {
    const files = from ? [from] : readdirSync(CACHE).filter((f) => f.startsWith(`${key}_`)).map((f) => path.join(CACHE, f));
    const minima = files.flatMap((f) => JSON.parse(readFileSync(f, "utf8")).minima).sort((a, b) => a.E - b.E), picks = [];
    for (const m of minima) { if (picks.length >= n) break; if (picks.some((p) => Math.abs(p.E - m.E) < 0.02)) continue; picks.push({ E: m.E, pairs: closestPairs(key, C, { H: m.H, mols: m.mols }) }); }
    writeFileSync(file, JSON.stringify(picks.flatMap((p) => p.pairs).slice(0, n)));
  }
  const pairs = JSON.parse(readFileSync(file, "utf8")), { spawn } = await import("node:child_process"), ff = path.join(path.dirname(fileURLToPath(import.meta.url)), "forcefield.mjs");
  const one = (i) => { const cf = path.join(FFC, `c_${key}_${round}_${i}.json`); if (existsSync(cf)) return Promise.resolve(JSON.parse(readFileSync(cf, "utf8")));
    return new Promise((ok, fail) => { const p = spawn(process.execPath, ["--max-old-space-size=6000", ff, "hpoint", file, i, d]); let out = ""; p.stdout.on("data", (b) => (out += b)); p.stderr.on("data", (b) => process.stderr.write(b)); p.on("close", (c) => { if (c) return fail(new Error("hpoint " + i)); const r = JSON.parse(out.trim().split("\n").pop()); writeFileSync(cf, JSON.stringify(r)); ok(r); }); }); };
  const pts = new Array(pairs.length); let next = 0; await Promise.all(Array.from({ length: 4 }, async () => { while (next < pairs.length) { const i = next++; pts[i] = await one(i); console.log(`${key} round ${round}: pair ${i} HF ${(pts[i].E * KCAL).toFixed(2)} kcal/mol`); } }));
  const { FFDATA } = await import("../js/ffdata.js"), { modelEnergy } = await import("../js/ffmodel.js"), p = FORCEFIELDS[key].p;
  const rows = pts.map((r, i) => ({ k: 10000 + 100 * round + i, A: r.A, B: r.B, E: r.E, ok: r.ok }));
  console.log(rows.map((r) => `HF ${(r.E * KCAL).toFixed(2)}  model ${(modelEnergy(p, r.A, r.B) * KCAL).toFixed(2)}`).join("\n"));
  FFDATA[key].points = FFDATA[key].points.filter((q) => !(q.k >= 10000 + 100 * round && q.k < 10100 + 100 * round)).concat(rows);
  const src = readFileSync(new URL("../js/ffdata.js", import.meta.url), "utf8"), head = src.slice(0, src.indexOf("export const FFDATA"));
  writeFileSync(new URL("../js/ffdata.js", import.meta.url), (head.includes("k ≥ 10000") ? head : head.replace("*/", "k ≥ 10000 + 100·r: the closest pairs of the crystals found\n   by tools/ice.mjs, probe round r. */")) + `export const FFDATA = ${JSON.stringify(FFDATA)};\n`);
  return rows;
}
export function bake() {
  const out = {};
  for (const f of existsSync(CACHE) ? readdirSync(CACHE) : []) {
    const r = JSON.parse(readFileSync(path.join(CACHE, f), "utf8")), id = `${r.key}_${r.Z}${r.field === "pol" ? "_pol" : ""}`; if (!r.minima) continue;
    const o = (out[id] ||= { key: r.key, d: r.d, Z: r.Z, starts: 0, unfinished: 0, collapsed: 0, seconds: 0, minima: [] });
    o.starts += r.done; o.unfinished += r.unfinished; o.collapsed += r.collapsed; o.seconds += r.seconds;
    for (const m of r.minima) { const b = o.minima.find((x) => same(x, m)); if (b) b.hits += m.hits; else o.minima.push({ ...m }); }
  }
  for (const o of Object.values(out)) { o.minima.sort((a, b) => a.E - b.E); o.found = o.minima.length; o.minima = o.minima.slice(0, 12); }
  writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../js/icedata.js"), `/* Generated by tools/ice.mjs bake; do not edit. Crystal searches: per key and Z, the lowest minima found (E per molecule, kcal/mol; V per molecule, bohrᵈ; neighbours and H-bonds per molecule), with how often each was hit. */\nexport const ICE = ${JSON.stringify(out)};\n`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, a, b] = process.argv.slice(2), sh = process.argv.indexOf("--shard"), shard = sh > 0 ? process.argv[sh + 1].split("/").map(Number) : [0, 1];
  if (cmd === "known") console.log(JSON.stringify(known(), null, 1));
  else if (cmd === "probe") { const fr = process.argv.indexOf("--from"); await probe(a, +b, +(process.argv[5] || 16), fr > 0 ? process.argv[fr + 1] : null); }
  else if (cmd === "bake") console.log(JSON.stringify(Object.fromEntries(Object.entries(bake()).map(([k, o]) => [k, { starts: o.starts, found: o.found, best: o.minima.slice(0, 3).map(({ E, V, hbonds, neighbours, hits }) => ({ E, V, hbonds, neighbours, hits })) }])), null, 1));
  else if (WORLDS[cmd]) await search(cmd, +a, +(b && !b.startsWith("--") ? b : 200), console.log, shard, process.argv.includes("--pol"));
  else console.log("usage: ice.mjs <key> <Z> [starts] [--shard i/m] | known | probe <key> <round> [n] | bake");
}
