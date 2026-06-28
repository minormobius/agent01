// infinitefoam.selftest.mjs — THE RIND IS A CYLINDRICAL SHELL: bounded in radius, bounded+periodic around
// the circumference (the ring closes), infinite along the axis (it streams). The directionality: naves on
// the inner shell, production stratified outward. node hoop/forge/test/infinitefoam.selftest.mjs

import { hubAt, shipWindow, minCrossDistance, DEFAULTS, SHELL } from '../infinitefoam.js';

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

console.log(`\ninfinitefoam.selftest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
