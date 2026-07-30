// infinitefoam.selftest.mjs — THE RIND IS A CYLINDRICAL SHELL: bounded in radius, bounded+periodic around
// the circumference (the ring closes), infinite along the axis (it streams). The directionality: naves on
// the inner shell, production stratified outward. node hoop/forge/test/infinitefoam.selftest.mjs

import { hubAt, shipWindow, shipStructure, minCrossDistance, DEFAULTS, SHELL } from '../infinitefoam.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const { Nth, Nr, R0, Tr } = DEFAULTS;

// ── pure function of lattice coord (the infinity hook) ──
ok(JSON.stringify(hubAt(3, 2, 1, 'material')) === JSON.stringify(hubAt(3, 2, 1, 'material')), 'a hub is a pure function of its lattice coordinate');

// ── AZIMUTHAL: bounded + periodic — the ring CLOSES (ith ≡ ith + Nth) ──
const w0 = hubAt(5, 0, 1, 'material'), wN = hubAt(5, Nth, 1, 'material'), wN2 = hubAt(5, -Nth, 1, 'material');
ok(Math.abs(w0.x - wN.x) < 1e-9 && Math.abs(w0.y - wN.y) < 1e-9 && Math.abs(w0.z - wN.z) < 1e-9, 'the ring closes: cell ith ≡ ith+Nth (same world point)');
ok(Math.abs(w0.x - wN2.x) < 1e-9, 'wraps both ways (ith−Nth too)');
ok(hubAt(5, Nth + 3, 1, 'material').ith === 3, 'azimuthal index is taken mod Nth (bounded ring)');

// ── RADIAL: bounded thickness — naves on the inner shell, production stratified outward ──
const win = shipWindow(0, 200);
ok(win.material.hubs.every((h) => h.ir >= 0 && h.ir < Nr), `radius is bounded to ${Nr} shells (no cell outside the rind)`);
let rmin = Infinity, rmax = 0; for (const h of win.material.hubs) { rmin = Math.min(rmin, h.rho); rmax = Math.max(rmax, h.rho); }
ok(rmin >= R0 - Tr && rmax <= R0 + Nr * Tr, `the shell is a bounded radial band (ρ ${rmin | 0}…${rmax | 0})`);
ok(win.naves.every((h) => h.ir === 0), 'naves dot ONLY the inner shell (ir 0 — the inner surface)');
ok(win.naves.length >= 1, `naves are present on the inner surface (${win.naves.length})`);
// the radial stratification: assembly nearest the naves, reclaim deepest (the tower laid along the radius)
const shellRoles = {}; for (const h of win.material.hubs) if (h.gland) shellRoles[h.ir] = (shellRoles[h.ir] || new Set()).add(h.gland);
ok([...(shellRoles[1] || [])].includes('assembly'), 'shell 1 (just outside the naves) is assembly — product nearest the naves');
ok([...(shellRoles[Nr - 1] || [])].includes('reclaim'), 'the outermost production shell is reclaim — raw, toward the lower rind');

// ── AXIAL: infinite — it streams, and overlapping windows agree (the seam contract along the axis) ──
const wa = shipWindow(0, 200), wb = shipWindow(150, 200);
const ma = new Map(wa.material.hubs.map((h) => [h.key, h]));
let shared = 0, agree = 0;
for (const h of wb.material.hubs) { const o = ma.get(h.key); if (o) { shared++; if (Math.abs(o.x - h.x) < 1e-9 && Math.abs(o.z - h.z) < 1e-9 && o.nave === h.nave && o.gland === h.gland) agree++; } }
ok(shared > 20 && agree === shared, `overlapping axial windows agree — streams forever (${agree}/${shared})`);
const wfar = shipWindow(1e6, 200);
ok(wfar.material.hubs.length > 10 && wfar.material.hubs.some((h) => !ma.has(h.key)), 'travel down the axis reveals new ship (infinite axially)');

// ── TWO non-touching vessel systems, in the shell ──
ok(win.pedestrian.hubs.length > 10, 'a pedestrian vein system coexists with the material arteries');
ok(minCrossDistance(win) > DEFAULTS.Tz * 0.15, `the two systems interpenetrate but never coincide (gap ${minCrossDistance(win).toFixed(0)})`);

// ── nave density on the inner shell ≈ the field probability ──
let nN = 0, nH = 0; for (let s = 0; s < 8; s++) { const w = shipWindow(s * 9000, 300); nN += w.naves.length; nH += w.material.hubs.filter((h) => h.ir === 0).length; }
ok(Math.abs(nN / nH - DEFAULTS.naveProb) < 0.08, `nave density on the inner shell ≈ field probability (${(nN / nH).toFixed(2)} ~ ${DEFAULTS.naveProb})`);

// ── POWER + WATER: the 3rd & 4th path sets — major trunks rising from the lower rind ──
const wu = shipWindow(0, 300);
ok(wu.power.hubs.length > 5 && wu.water.hubs.length > 5, `power & water trunk systems are present (${wu.power.hubs.length} / ${wu.water.hubs.length})`);
ok(wu.power.hubs.some((h) => h.ir === DEFAULTS.Nr - 1), 'power trunks run along the deepest shell (against the lower rind)');
ok(wu.power.hubs.some((h) => h.ir < DEFAULTS.Nr - 1), 'power risers climb inward to feed production');
// power & water never share a slot/point (interleaved azimuthally)
let umin = Infinity; for (const a of wu.power.hubs) for (const b of wu.water.hubs) { const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2; if (d < umin) umin = d; }
ok(Math.sqrt(umin) > 1, `power & water are interleaved — never coincide (gap ${Math.sqrt(umin).toFixed(0)})`);
// trunks are deeper (larger ρ) than the production they feed — they come UP from the lower rind
const trunkRho = wu.power.hubs.filter((h) => h.ir === DEFAULTS.Nr - 1)[0].rho;
ok(trunkRho > DEFAULTS.R0 + DEFAULTS.Tr, 'trunks sit deep in the rind (outer shells), rising from below');
// utilities stream too (the seam contract)
const ua = shipWindow(0, 300), ub = shipWindow(270, 300);
const upa = new Set(ua.power.hubs.map((h) => h.key));
ok(ub.power.hubs.some((h) => upa.has(h.key)) && ub.power.hubs.some((h) => !upa.has(h.key)), 'utility trunks stream along the axis (overlap + new ahead)');

// ── RIND STRUCTURE: the {N/k} secant-cable web, hooped + advanced axially ──
const st = shipStructure(0, 300);
ok(st.cables.length > 10 && st.hoops.length > 4 && st.stringers.length === (st.opt.Nstr || 9), `structure has cables, hoops & stringers (${st.cables.length}/${st.hoops.length}/${st.stringers.length})`);
// every cable joins anchors k apart around the ring (the {N/k} star polygon) — and both mirrored families exist
const sep = (c) => { let d = Math.abs(c.a.i - c.b.i); return Math.min(d, st.N - d); };
ok(st.cables.every((c) => sep(c) === st.k), `every cable is the k-th chord — an {${st.N}/${st.k}} web`);
ok(st.cables.some((c) => c.fam === 'A') && st.cables.some((c) => c.fam === 'B'), 'two mirrored families (counter-rotating helices that cross axially)');
// each cable is a SECANT: it advances axially (b.z > a.z) and cuts across the bore, clearing the centre
ok(st.cables.every((c) => c.b.z > c.a.z), 'cables advance along the axis (the hyperboloid twist)');
const segCore = (c) => { const ax = c.b.x - c.a.x, ay = c.b.y - c.a.y, az = c.b.z - c.a.z, L2 = ax * ax + ay * ay + az * az; let t = -(c.a.x * ax + c.a.y * ay + c.a.z * az) / L2; t = Math.max(0, Math.min(1, t)); const x = c.a.x + t * ax, y = c.a.y + t * ay; return Math.hypot(x, y); };
let nearest = Infinity; for (const c of st.cables) nearest = Math.min(nearest, segCore(c));
ok(nearest > st.coreClear - 1 && st.coreClear > 0 && st.coreClear < st.ROUT, `cables keep the bore open — nearest approach ≈ coreClear (${nearest.toFixed(0)} ~ ${st.coreClear.toFixed(0)} < ${st.ROUT})`);
// the web must cut THROUGH the inner radius (fully visible across the bore), yet leave a central core for the light pipe
ok(st.coreClear < st.Rin, `cables come through the inner radius — coreClear ${st.coreClear.toFixed(0)} < R0 ${st.Rin}`);
ok(st.coreClear > st.Rin * 0.3, `but they leave a central core open for the light pipe (coreClear ${st.coreClear.toFixed(0)})`);
// structure streams: a shared bay agrees across overlapping windows
const sa = shipStructure(0, 300), sb = shipStructure(360, 300);
const sak = new Set(sa.cables.map((c) => c.m + '.' + c.i + c.fam));
ok(sb.cables.some((c) => sak.has(c.m + '.' + c.i + c.fam)), 'the cable web streams — overlapping windows share bays');

console.log(`\ninfinitefoam.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
