// node enclosure/measure.mjs [--write] — builds every enclosure tree in the exact kernel (engines/cad,
// Truck) and computes TAPE-ENC's numbers from the built models, not from gen.mjs's params:
//   E     every printed part builds, is watertight, fits a 200 mm cube; one has two dims ≥ 89 and ≥ 64
//   NEST  the nest pocket's walls, read off the lid's named planar faces, clear an 88 × 63 card 0.5..1.5 mm per side
//   SEAL  back air = pod volume (bbox − solid, exact for a rectangular cup), cross-checked against the
//         reference air solid; minus the driver's bounding cylinder; must be ≥ 200 cm³
//   GRILLE every grille hole, read off the lid's named cylinder faces, is under 4 mm; summed open area
//         ≥ 1257 mm²; every hole lies inside the collar's front chamber (else it would vent the box, not the cone)
// --write saves enclosure/ref/measures.json (not in enclosure/: the lab builds every enclosure/*.json as a part). Exits 1 if anything fails.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cad = join(here, '..', 'engines', 'cad');

export function build(file) {
  const dir = mkdtempSync(join(tmpdir(), 'enc-')), out = join(dir, 'r.json');
  try {
    try { execFileSync(process.execPath, ['agent/build.mjs', file, '--json', out], { cwd: cad, stdio: 'pipe' }); }
    catch (e) { try { return JSON.parse(readFileSync(out, 'utf8')); } catch { return { ok: false, error: String(e.stderr || e.message).slice(0, 400) }; } }
    return JSON.parse(readFileSync(out, 'utf8'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const named = (r, re) => r.faces.filter((f) => f.names.some((n) => re.test(n)));
const dims = (r) => { const [a, b] = r.invariants.bbox; return [0, 1, 2].map((i) => b[i] - a[i]); };

export function measure() {
  const files = readdirSync(here).filter((f) => f.endsWith('.json')).sort();
  const res = {}, fail = [];
  for (const f of files) res[f.replace(/\.json$/, '')] = build(join(here, f));
  const out = { parts: {}, E: {}, NEST: {}, SEAL: {}, GRILLE: {} };

  // E
  let nestHolder = null;
  for (const [k, r] of Object.entries(res)) {
    const ok = !!(r.ok && r.invariants && r.invariants.watertight);
    const d = ok ? dims(r) : null, s = d ? [...d].sort((a, b) => b - a) : null;
    out.parts[k] = { ok, watertight: ok, dims: d && d.map((x) => +x.toFixed(4)), volume: ok ? +r.invariants.volume.toFixed(3) : null };
    if (!ok) fail.push(`E: ${k} did not build watertight (${JSON.stringify(r.error || 'not watertight').slice(0, 200)})`);
    else if (Math.max(...d) > 200) fail.push(`E: ${k} is ${Math.max(...d)} mm, over the 200 mm cube`);
    if (s && s[0] >= 89 && s[1] >= 64) nestHolder = nestHolder || k;
  }
  out.E = { printed: files.length, cardSized: nestHolder };
  if (!nestHolder) fail.push('E: no part is 89 × 64 or larger');
  const lid = res.lid, baffle = res.baffle, collar = res.collar, pod = res.pod;
  if (![lid, baffle, collar, pod].every((r) => r && r.ok)) { out.fail = fail.concat('lid, baffle, collar and pod must all build'); return out; }

  // NEST: the pocket's four side walls are planes named nest.nest[k]; their positions bound the pocket.
  const walls = named(lid, /^nest\.nest\[\d\]$/).filter((f) => f.geom && f.geom.kind === 'plane');
  const xs = walls.filter((f) => Math.abs(f.normal[0]) > 0.99).map((f) => f.centroid[0]);
  const ys = walls.filter((f) => Math.abs(f.normal[1]) > 0.99).map((f) => f.centroid[1]);
  const floorZ = named(lid, /^nest\./).filter((f) => Math.abs(f.normal[2]) > 0.99).map((f) => f.centroid[2]);
  const pw = Math.max(...xs) - Math.min(...xs), ph = Math.max(...ys) - Math.min(...ys);
  const cx = [(pw - 88) / 2, (ph - 63) / 2];
  out.NEST = { pocket: [+pw.toFixed(4), +ph.toFixed(4)], clearancePerSide: cx.map((x) => +x.toFixed(4)), floorAboveBottom: floorZ.length ? +Math.min(...floorZ).toFixed(4) : null, walls: walls.length };
  if (walls.length < 4 || xs.length < 2 || ys.length < 2) fail.push(`NEST: found ${walls.length} pocket walls, need 4`);
  for (const c of cx) if (!(c >= 0.5 && c <= 1.5)) fail.push(`NEST: clearance ${c.toFixed(3)} mm per side is outside 0.5..1.5`);

  // SEAL
  const pd = dims(pod), cavity = pd[0] * pd[1] * pd[2] - pod.invariants.volume;
  const air = res['ref/back-air'] || build(join(here, 'ref', 'back-air.json'));
  const drv = build(join(here, 'ref', 'driver-bound.json'));
  const net = cavity - drv.invariants.volume;
  out.SEAL = { podCavity_cm3: +(cavity / 1000).toFixed(3), airSolid_cm3: +(air.invariants.volume / 1000).toFixed(3), driverBound_cm3: +(drv.invariants.volume / 1000).toFixed(3), net_cm3: +(net / 1000).toFixed(3) };
  if (Math.abs(cavity - air.invariants.volume) > 1e-3 * cavity) fail.push(`SEAL: pod cavity ${cavity.toFixed(1)} and air solid ${air.invariants.volume.toFixed(1)} disagree`);
  if (!(drv.ok && drv.invariants.volume > 0 && Math.abs(cavity - drv.invariants.volume - net) < 1)) fail.push('SEAL: the driver bound was not subtracted');
  if (!(net >= 200000)) fail.push(`SEAL: net back air ${(net / 1000).toFixed(1)} cm³ < 200`);

  // GRILLE: one hole per grilleN loop, from its cylinder faces.
  const holes = new Map();
  for (const f of named(lid, /^lid\.grille\d+\[/)) {
    if (!f.geom || f.geom.kind !== 'cylinder') continue;
    const k = f.names.find((n) => /^lid\.grille\d+\[/.test(n)).match(/grille(\d+)/)[1];
    const h = holes.get(k) || { r: 0, c: f.geom.center };
    h.r = Math.max(h.r, f.geom.radius); holes.set(k, h);
  }
  const front = named(collar, /^collar\.front\[\d\]$/).filter((f) => f.geom && f.geom.kind === 'plane');
  const fx = front.filter((f) => Math.abs(f.normal[0]) > 0.99).map((f) => f.centroid[0]);
  const fy = front.filter((f) => Math.abs(f.normal[1]) > 0.99).map((f) => f.centroid[1]);
  const [x0, x1, y0, y1] = [Math.min(...fx), Math.max(...fx), Math.min(...fy), Math.max(...fy)];
  let area = 0, maxD = 0, outside = 0;
  for (const { r, c } of holes.values()) {
    area += Math.PI * r * r; maxD = Math.max(maxD, 2 * r);
    if (!(c[0] - r > x0 && c[0] + r < x1 && c[1] - r > y0 && c[1] + r < y1)) outside++;
  }
  out.GRILLE = { holes: holes.size, maxDiameter: +maxD.toFixed(4), openArea_mm2: +area.toFixed(2), outsideFrontChamber: outside, frontChamber: [x0, x1, y0, y1].map((v) => +v.toFixed(3)) };
  if (!(holes.size > 0 && maxD < 4)) fail.push(`GRILLE: largest hole ${maxD.toFixed(3)} mm (need < 4)`);
  if (!(area >= 1257)) fail.push(`GRILLE: open area ${area.toFixed(1)} mm² < 1257`);
  if (outside) fail.push(`GRILLE: ${outside} holes fall outside the front chamber`);
  if (fx.length < 2 || fy.length < 2) fail.push('GRILLE: could not find the front chamber walls');
  out.fail = fail;
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const m = measure();
  console.log(JSON.stringify(m, null, 1));
  if (process.argv.includes('--write')) writeFileSync(join(here, 'ref', 'measures.json'), JSON.stringify(m, null, 1) + '\n');
  process.exit(m.fail.length ? 1 : 0);
}
