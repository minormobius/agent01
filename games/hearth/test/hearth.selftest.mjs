/* Hearth's invariants: the orb and its lots, the settlement (the port sets
   how big it is, the pad's clearance how tall it may get near it), and the
   triangles the renderer draws (every wall upright and facing out, every
   building between the ground and its limit).
     node games/hearth/test/hearth.selftest.mjs   (~20 s) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadHearth } from "./harness.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const H = await loadHearth(), G = await import(path.join(here, "../js/geometry.js"));
let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (process.env.VERBOSE) console.log((c ? "ok   " : "FAIL ") + m); if (!c) { fails++; console.error("FAIL " + m); } };

/* ---- every page script parses as a module (the sim runs in node; the page's own code doesn't) */
{
  const js = fs.readdirSync(path.join(here, "../js")).filter((f) => f.endsWith(".js"));
  const bad = js.filter((f) => spawnSync(process.execPath, ["--input-type=module", "--check"], { input: fs.readFileSync(path.join(here, "../js", f)) }).status !== 0);
  ok(js.length >= 6 && !bad.length, "every page script parses (" + js.length + " files" + (bad.length ? "; broken: " + bad.join(", ") : "") + ")");
}

/* ---- the orb */
const orb = H.makeOrb(7), R = H.R;
{
  const A = orb.area.reduce((a, b) => a + b, 0), sphere = 4 * Math.PI * R * R;
  ok(orb.n === H.O_.LOTS && Math.abs(A / sphere - 1) < 0.01, orb.n + " lots, " + (A / 1e6).toFixed(1) + " km² (the sphere: " + (sphere / 1e6).toFixed(1) + ")");
  const mean = A / orb.n;
  ok(orb.area.every((a) => a > 0.25 * mean && a < 2.6 * mean) && orb.plate.every((p, i) => p > 0 && p < orb.area[i]), "lots are even (" + Math.round(mean) + " m² on average) and every plate is smaller than its lot");
  ok(Math.abs(H.gAt(0) - H.G0) < 1e-9 && Math.abs(H.gAt(200) / H.G0 - (1500 / 1700) ** 2) < 1e-9, "gravity falls as 1/r² from the core: " + (H.gAt(200) / H.G0).toFixed(2) + " g at 200 m");
  ok(H.plates(0) === 0 && H.plates(8) === 8 && H.plates(30) < 30 && H.plates(31) > H.plates(30), "a tall building's floors narrow as it rises (30 floors hold " + H.plates(30).toFixed(1) + " plates)");
}

/* ---- the settlement */
{
  const a = new H.Settlement(orb), b = new H.Settlement(H.makeOrb(7));
  const caps = Array.from(a.cap);
  ok(caps[orb.port] === 0 && orb.dPort.every((d, i) => d >= H.O_.PORT_APRON || caps[i] === 0), "nothing may be built on the port's apron");
  let fed = true, capped = true, grew = true, prev = Int16Array.from(a.floors);
  for (let y = 0; y < 60; y++) {
    a.step(); b.step();
    if (a.stats.people > a.supply * (1 + 1e-9)) fed = false;
    for (let i = 0; i < orb.n; i++) { if (a.floors[i] > a.cap[i] && a.floors[i] > prev[i]) capped = false; if (a.floors[i] < prev[i]) grew = false; }
    prev = Int16Array.from(a.floors);
  }
  const s = a.stats;
  ok(fed, "the town never holds more people than the port can feed");
  ok(capped && Array.from(a.floors).every((f) => f <= H.S_.F_MAX), "nothing rises past the pad's clearance or the structure's limit (" + H.S_.F_MAX + " floors)");
  ok(grew, "buildings never lose floors");
  ok(a.floors.every((f, i) => f === b.floors[i]) && a.stats.people === b.stats.people, "the same seed grows the same town");
  ok(s.people > 100e3 && s.tall >= 20 && s.built > 200, "60 years on: " + Math.round(s.people / 1e3) + "k people, " + s.built + " lots built, the tallest " + s.tall + " floors");
  // the skyline: the tallest buildings stand clear of the pad, where the reach is and the sky is open
  const tl = s.tallLot;
  ok(orb.dPort[tl] > H.O_.PORT_APRON + 100, "the tallest building stands " + Math.round(orb.dPort[tl]) + " m from the pad, outside its clearance crater");
  // land value concentrates height: the top tenth of lots by access hold far more floor than the bottom half
  const idx = Array.from({ length: orb.n }, (_, i) => i).filter((i) => a.floors[i] > 0).sort((x, y) => a.access[y] - a.access[x]);
  const fl = (arr) => arr.reduce((t, i) => t + a.floors[i], 0) / Math.max(1, arr.length);
  ok(fl(idx.slice(0, idx.length / 10 | 0)) > 3 * fl(idx.slice(idx.length / 2)), "height follows reach: the best-reached tenth of built lots average " + fl(idx.slice(0, idx.length / 10 | 0)).toFixed(0) + " floors, the bottom half " + fl(idx.slice(idx.length / 2)).toFixed(1));

  /* ---- the triangles */
  const m = G.buildingMesh(orb, a.floors, a.kind), S = G.STRIDE, nv = m.length / S;
  let rOk = true, upright = true, outward = true, roofs = true;
  const top = R + (H.S_.F_MAX + 1) * H.O_.FLOOR + 1e-3;
  for (let v = 0; v < nv; v++) {
    const o = v * S, x = m[o], y = m[o + 1], z = m[o + 2], r = Math.hypot(x, y, z), nx = m[o + 3], ny = m[o + 4], nz = m[o + 5], vv = m[o + 7];
    if (r < R - 1e-3 || r > top) rOk = false;
    const d = (nx * x + ny * y + nz * z) / r;
    if (vv >= 0 && Math.abs(d) > 0.02) upright = false;
    if (vv < 0 && d < 0.999) roofs = false;
  }
  // a wall on the street faces the street: walls whose foot lies within 10 m of their lot's edge (the plate is
  // inset 7 m; a parcel's back wall stands 21 m or more in, and the walls cut at an alley run between) must face
  // the nearest point of that edge. (Distance from the lot's centre won't do: a 7-sided lot's corners lie further
  // out than its inradius, and its courtyard walls there pass for street walls.)
  const P = orb.P, V = orb.V; let outer = 0, bad = 0;
  for (let v = 0; v < nv; v += 6 * 7) {
    const o = v * S; if (m[o + 7] < 0 || m[o + 10] !== 1) continue;
    const o2 = (v + 1) * S, mid = [(m[o] + m[o2]) / 2, (m[o + 1] + m[o2 + 1]) / 2, (m[o + 2] + m[o2 + 2]) / 2], r = Math.hypot(...mid), u = mid.map((x) => x / r);
    let best = -2, bi = 0; for (let i = 0; i < orb.n; i++) { const d = P[3 * i] * u[0] + P[3 * i + 1] * u[1] + P[3 * i + 2] * u[2]; if (d > best) { best = d; bi = i; } }
    const ring = orb.polys[bi]; let dmin = Infinity, q = null;
    for (let k = 0; k < ring.length; k++) {
      const A = [V[3 * ring[k]], V[3 * ring[k] + 1], V[3 * ring[k] + 2]], Bv = [V[3 * ring[(k + 1) % ring.length]], V[3 * ring[(k + 1) % ring.length] + 1], V[3 * ring[(k + 1) % ring.length] + 2]];
      const ab = [Bv[0] - A[0], Bv[1] - A[1], Bv[2] - A[2]], ap = [u[0] - A[0], u[1] - A[1], u[2] - A[2]], t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
      const p = [A[0] + ab[0] * t, A[1] + ab[1] * t, A[2] + ab[2] * t], d = Math.hypot(u[0] - p[0], u[1] - p[1], u[2] - p[2]) * R;
      if (d < dmin) { dmin = d; q = p; }
    }
    if (dmin > 10) continue;
    outer++; const N = [m[o + 3], m[o + 4], m[o + 5]];
    if (N[0] * (q[0] - u[0]) + N[1] * (q[1] - u[1]) + N[2] * (q[2] - u[2]) <= 0) bad++;
  }
  outward = outer > 20 && bad === 0;
  ok(nv % 3 === 0 && nv > 1000, "the buildings are whole triangles (" + Math.round(nv / 3 / 1e3) + "k)");
  ok(rOk, "every building stands between the ground and its limit");
  ok(upright && roofs, "every wall is upright (its normal level with the ground) and every roof faces straight out");
  ok(outward, "walls on a lot's edge face the street (" + outer + " sampled)");
  const gm = G.groundMesh(orb, (i) => a.kind[i]); let gOk = true;
  for (let v = 0; v < gm.length / S; v++) { const o = v * S, r = Math.hypot(gm[o], gm[o + 1], gm[o + 2]); if (Math.abs(r - R) > 1e-2 || gm[o + 6] < 0) gOk = false; }
  ok(gOk && gm.length / S === 3 * orb.polys.reduce((t, p) => t + p.length, 0), "the ground lies on the sphere, a fan per lot, its distances to the street never negative");
}

console.log(fails ? `hearth: ${fails}/${checks} FAILED` : `hearth: ${checks} checks ok`);
process.exit(fails ? 1 : 0);
