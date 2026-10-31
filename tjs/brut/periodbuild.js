// tjs/brut/periodbuild.js — ONE BUILDING IN ITS PERIOD, standing on its own plot: the standalone
// generator behind /brut/period/. Pure, DOM-free, three.js-free; the same house rules as arch.js.
//
// period.js gives a city building its shell (walls classed, laid out in bays and storeys, openings,
// bands, balconies, the masonry check). This builds it: every wall cut round its openings and as
// thick as its storey's masonry says; every opening in its reveal with its frame, glass and glazing
// bars, its sill and its head; the bands, the cornice with its modillions, the parapet's coping; the
// railings bar by bar; the jetty and its bressumer; the roof the period built; the chimney stacks and
// their pots; the street, and a Georgian house's area, railings and steps. And the plan the period
// lived in, floor by floor. All of it as data:
//
//   parts  — boxes { mat, kind, x, y, z, w, h, d, ry, rz } (centre-based, y up, like arch.js parts();
//            ry turns the box's x onto its wall, rz tilts it in the wall's own plane), plus
//            { shape: 'quad'|'tri', pts } roof planes, { shape: 'halfdisc' } fanlights and
//            { shape: 'cyl' } chimney pots
//   plan   — per storey, rooms as rectangles in plan, with the stair
//
// The plot: frontage W along x, depth D; the street front at z = 0 facing +z, the building behind it.
// In plan (what period.js reads) x is the same and y = −z, so the footprint runs counter-clockwise.

import { shell, maxStoreys, PERIODS } from './period.js';
import { Rand } from './rand.js';

export const VERSION = 'periodbuild/1';
export const ERAS = ['village', 'medieval', 'georgian', 'haussmann', 'villa', 'modern', 'glass'];
export const ERA_LABELS = {
  village: 'village house, c. 1250', medieval: 'timber-framed house, c. 1480', georgian: 'Georgian terrace, c. 1790',
  haussmann: 'Haussmann block, c. 1868', villa: 'suburban villa, c. 1925', modern: 'concrete slab, c. 1966', glass: 'glass tower, c. 2008',
};
// each era's plot and height, as ranges a seed draws in
const SIZES = {
  village: { frontage: [8.5, 11], depth: [6, 7.5], storeys: [1, 2] },
  medieval: { frontage: [4.6, 6.4], depth: [9, 12], storeys: [3, 4] },
  georgian: { frontage: [5.8, 8.2], depth: [10, 12.5], storeys: [3, 5] },
  haussmann: { frontage: [13, 18], depth: [12, 15], storeys: [6, 6] },
  villa: { frontage: [9, 11.5], depth: [8, 10], storeys: [2, 2] },
  modern: { frontage: [26, 40], depth: [12, 15], storeys: [6, 12] },
  glass: { frontage: [24, 32], depth: [24, 32], storeys: [18, 32] },
};
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------------- params --
/** A seed's own reading of an era: its plot and its height. */
export function deriveParams(seed, era) {
  const S = SIZES[era] || SIZES.georgian, R = Rand(seed, `periodparams/${era}`);
  const p = { era, seed: String(seed), frontage: r2(R.range(...S.frontage)), depth: r2(R.range(...S.depth)), storeys: R.int(...S.storeys) };
  // a seed's own reading stands up: a load-bearing period never draws more storeys than its walls carry
  // on that plot (the slider can still ask for more, and the check will say so)
  if (PERIODS[era].system === 'masonry' || PERIODS[era].system === 'stone') p.storeys = Math.max(S.storeys[0] > 2 ? 2 : 1, Math.min(p.storeys, maxStoreys(era, p.frontage, p.depth)));
  return p;
}
/** A query (string or URLSearchParams) → canonical params: era, seed, and any overrides. */
export function resolveParams(q) {
  const u = q instanceof URLSearchParams ? q : new URLSearchParams(String(q || '').replace(/^[?#]/, ''));
  const era = ERAS.includes(u.get('era')) ? u.get('era') : 'georgian', seed = u.get('s') || '1';
  const p = deriveParams(seed, era), num = (k, lo, hi) => { const v = parseFloat(u.get(k)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null; };
  const w = num('w', 3, 80), d = num('d', 4, 60), n = num('n', 1, 60);
  if (w != null) p.frontage = r2(w);
  if (d != null) p.depth = r2(d);
  if (n != null) p.storeys = Math.round(n);
  return p;
}
/** Params → the shortest query that reopens them: the era, the seed, and only what differs from it. */
export function paramsToQuery(p) {
  const base = deriveParams(p.seed, p.era), q = new URLSearchParams({ era: p.era, s: p.seed });
  if (p.frontage !== base.frontage) q.set('w', p.frontage);
  if (p.depth !== base.depth) q.set('d', p.depth);
  if (p.storeys !== base.storeys) q.set('n', p.storeys);
  return q.toString();
}

// ---------------------------------------------------------------------------------- the building --
/** One building on its plot. `id` is its place in a row (neighbours mirror: doors pair across walls). */
export function building(p, id = 0, opts = {}) {
  const W = p.frontage, D = p.depth;
  const footprint = [[0, 0], [W, 0], [W, D], [0, D]];
  const sh = shell({ footprint, front: [[0, 0], [W, 0]], storeys: p.storeys, style: p.era, seed: p.seed, id, depth: D }, { kinds: kindsFor(p.era) });
  const b = { params: p, id, era: p.era, label: PERIODS[p.era].label, W, D, footprint, shell: sh, structure: sh.structure || null, eaves: sh.eaves, top: sh.top };
  b.parts = parts(b, opts);
  b.plan = plan(b);
  b.maxStoreys = sh.structure ? maxStoreys(p.era, W, D) : null;
  return b;
}
function kindsFor(era) {
  const P = PERIODS[era];
  return P.attached ? ['front', 'party', 'back', 'party'] : ['front', 'side', 'back', 'side'];
}

// ---------------------------------------------------------------------------------- parts --
const MAT = {
  village: { wall: 'cob', frame: 'timber' }, medieval: { wall: 'daub', frame: 'timber' },
  georgian: { wall: 'brick' }, haussmann: { wall: 'stone' }, villa: { wall: 'brickred' },
  modern: { wall: 'concrete' }, glass: { wall: 'spandrel' },
};
const REVEAL = { village: 0.06, medieval: 0.03, georgian: 0.11, haussmann: 0.16, villa: 0.08, modern: 0.06, glass: 0.0 };

export function parts(b, opts = {}) {
  const sh = b.shell, era = b.era, M = MAT[era], out = [], P = PERIODS[era];
  const push = (o) => { out.push(o); return o; };
  const zmin = Math.min(0, ...sh.storeys.map((s) => s.z0));
  const thick = (z) => {                                           // the wall's thickness at a height
    if (sh.structure) { const k = sh.storeys.findIndex((s) => z >= s.z0 - 1e-6 && z < s.z0 + s.h - 1e-6); return sh.structure.storeys[Math.max(0, k)] ? sh.structure.storeys[Math.max(0, k)].t : 0.34; }
    return era === 'glass' ? 0.08 : era === 'modern' ? 0.25 : 0.2;
  };
  const jettyAt = (wall, z) => {                                   // how far a storey oversails the street
    if (!sh.jetty || wall.kind !== 'front') return 0;
    const k = sh.storeys.findIndex((s) => z >= s.z0 - 1e-6 && z < s.z0 + s.h - 1e-6);
    return Math.max(0, k) * sh.jetty;
  };

  for (const wall of sh.walls) {
    // the wall's frame in the world: along it (u), out of it (n), up
    const [ax, ay] = wall.a, [bx, by] = wall.b, L = wall.length, ux = (bx - ax) / L, uy = (by - ay) / L;
    const U = [ux, -uy], N = [uy, ux], ry = Math.atan2(uy, ux);   // world (x, z) of along and out; plan y = −z
    const A = [ax, -ay];
    const box = (x0, x1, o0, o1, z0, z1, mat, kind, extra = {}) => {
      if (x1 - x0 < 1e-4 || z1 - z0 < 1e-4 || o1 - o0 < 1e-4) return null;
      const xm = (x0 + x1) / 2, om = (o0 + o1) / 2;
      return push({ mat, kind, x: r3(A[0] + U[0] * xm + N[0] * om), y: r3((z0 + z1) / 2), z: r3(A[1] + U[1] * xm + N[1] * om), w: r3(x1 - x0), h: r3(z1 - z0), d: r3(o1 - o0), ry: r3(ry), ...extra });
    };
    const top = wall.top;
    // ---- the wall itself: its face minus its openings, cut at every storey (thickness, jetty) and at the
    // stucco's top (material)
    const ops = wall.openings.filter((o) => !(era === 'glass'));
    const zs = new Set([zmin, top]);
    for (const s of sh.storeys) { zs.add(s.z0); zs.add(s.z0 + s.h); }
    const stucco = wall.bands.find((x) => x.kind === 'stucco' || x.kind === 'rustication');
    if (stucco) zs.add(stucco.z1);
    if (era !== 'glass') {
      const pieces = subtract({ x0: 0, x1: L, z0: zmin, z1: top }, ops.map((o) => ({ x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1 + (o.fan || 0) })), [...zs]);
      for (const pc of pieces) {
        const t = thick(pc.z0), j = jettyAt(wall, pc.z0 + 1e-3), mat = stucco && pc.z1 <= stucco.z1 + 1e-6 ? 'stucco' : wall.kind === 'party' && era === 'georgian' ? 'brick' : M.wall;
        box(pc.x0, pc.x1, j - t, j, pc.z0, pc.z1, mat, 'wall');
        // rustication: horizontal joints cut into the stucco or the stone, across this piece only
        if (stucco && stucco.rusticated && pc.z1 <= stucco.z1 + 1e-6 && wall.kind === 'front') {
          for (let z = Math.ceil((pc.z0 + 0.05) / 0.36) * 0.36; z < pc.z1 - 0.05; z += 0.36) box(pc.x0, pc.x1, j - 0.012, j + 0.002, z - 0.012, z + 0.012, 'groove', 'rustication');
        }
      }
    }
    // the timber frame: posts at the bay lines and corners, rails at each floor and at sill and head
    if (P.system === 'timber' && wall.kind !== 'party') {
      const posts = new Set([0.1, L - 0.1, ...(wall.bays || []).flatMap(([x0, x1]) => [x0, x1])]);
      for (const s of sh.storeys) {
        const j = jettyAt(wall, s.z0 + 1e-3);
        for (const x of posts) if (!ops.some((o) => x > o.x0 - 0.08 && x < o.x1 + 0.08 && s.z0 < o.z1 && s.z0 + s.h > o.z0)) box(x - 0.09, x + 0.09, j - 0.02, j + 0.025, s.z0, s.z0 + s.h, M.frame, 'post');
        box(0, L, j - 0.02, j + 0.03, s.z0, s.z0 + 0.2, M.frame, 'rail');
        box(0, L, j - 0.02, j + 0.025, s.z0 + 0.85, s.z0 + 0.97, M.frame, 'rail');
        // braces in the corner panels that carry no opening (the frame's own stiffening)
        for (const [x0, x1] of [[0.19, Math.min(1.4, L / 3)], [Math.max(L - 1.4, L * 2 / 3), L - 0.19]]) {
          if (ops.some((o) => o.x0 < x1 && o.x1 > x0 && o.z0 < s.z0 + s.h && o.z1 > s.z0)) continue;
          const hh = s.h - 0.2, len = Math.hypot(x1 - x0, hh), ang = Math.atan2(hh, x1 - x0) * (x0 < L / 2 ? 1 : -1);
          box((x0 + x1) / 2 - len / 2, (x0 + x1) / 2 + len / 2, j - 0.015, j + 0.02, s.z0 + 0.1 + hh / 2 - 0.07, s.z0 + 0.1 + hh / 2 + 0.07, M.frame, 'brace', { rz: r3(ang) });
        }
      }
    }
    // the jetty: each upper storey oversails the one below on its joists, carried by a bressumer
    if (sh.jetty && wall.kind === 'front') for (let k = 1; k < sh.storeys.length; k++) {
      const s = sh.storeys[k], j = k * sh.jetty;
      box(0, L, j - 0.3, j + 0.04, s.z0 - 0.28, s.z0, M.frame, 'bressumer');
      for (let x = 0.25; x < L - 0.1; x += 0.45) box(x - 0.06, x + 0.06, j - sh.jetty - 0.05, j - 0.25, s.z0 - 0.42, s.z0 - 0.28, M.frame, 'joist end');
    }

    // ---- the openings
    for (const o of wall.openings) {
      const j = jettyAt(wall, o.z0 + 1e-3), r = REVEAL[era], z0 = Math.max(o.z0, zmin);
      const fr = (x0, x1, za, zb, w) => { box(x0, x0 + w, j - r - 0.07, j - r, za, zb, 'frame', 'frame'); box(x1 - w, x1, j - r - 0.07, j - r, za, zb, 'frame', 'frame'); box(x0, x1, j - r - 0.07, j - r, za, za + w, 'frame', 'frame'); box(x0, x1, j - r - 0.07, j - r, zb - w, zb, 'frame', 'frame'); };
      const glass = (x0, x1, za, zb) => box(x0, x1, j - r - 0.05, j - r - 0.035, za, zb, 'glass', 'glass');
      if (o.kind === 'curtain' || o.kind === 'ribbon' || o.kind === 'lobby') {
        const rr = era === 'glass' ? 0 : r;
        box(o.x0, o.x1, j - rr - 0.05, j - rr - 0.035, z0, o.z1, 'glass', 'glass');
        const step = o.mullion || 1.5;
        for (let x = o.x0; x <= o.x1 + 1e-6; x += step) box(x - 0.03, x + 0.03, j - rr - 0.04, j - rr + (era === 'glass' ? 0.12 : 0.02), z0, o.z1, era === 'glass' ? 'mullion' : 'frame', 'mullion');
        if (era === 'glass') { box(o.x0, o.x1, j - 0.04, j + 0.1, o.z1 - 0.06, o.z1 + 0.06, 'mullion', 'transom'); box(o.x0, o.x1, j - 0.03, j + 0.02, z0 + 0.0, z0 + 0.95, 'spandrel', 'spandrel glass'); }
        continue;
      }
      if (o.kind === 'door' || o.kind === 'carriage door') {
        const leaf = (x0, x1) => { box(x0, x1, j - r - 0.08, j - r - 0.02, z0, o.z1, 'door', o.kind); for (let c = 0; c < 2; c++) for (let rr = 0; rr < 3; rr++) { const cw = (x1 - x0) / 2, ph = (o.z1 - z0) / 3; box(x0 + c * cw + 0.07, x0 + (c + 1) * cw - 0.07, j - r - 0.02, j - r - 0.005, z0 + rr * ph + 0.1, z0 + (rr + 1) * ph - 0.08, 'doorpanel', 'panel'); } };
        if (o.kind === 'carriage door') { leaf(o.x0, (o.x0 + o.x1) / 2); leaf((o.x0 + o.x1) / 2, o.x1); }
        else leaf(o.x0, o.x1);
        if (o.fan) {
          // the fanlight: a half disc of glass over the door, its bars radiating from the springing
          const cx = (o.x0 + o.x1) / 2, rad = (o.x1 - o.x0) / 2, wc = [A[0] + U[0] * cx + N[0] * (j - r - 0.04), A[1] + U[1] * cx + N[1] * (j - r - 0.04)];
          push({ shape: 'halfdisc', mat: 'glass', kind: 'fanlight', x: r3(wc[0]), y: r3(o.z1), z: r3(wc[1]), r: r3(rad), ry: r3(ry) });
          for (let k = 1; k < 6; k++) {
            const a = Math.PI * k / 6, xm = cx + Math.cos(a) * rad / 2, zm = o.z1 + Math.sin(a) * rad / 2, om = j - r - 0.025;
            push({ mat: 'frame', kind: 'fan bar', x: r3(A[0] + U[0] * xm + N[0] * om), y: r3(zm), z: r3(A[1] + U[1] * xm + N[1] * om), w: r3(rad * 0.95), h: 0.024, d: 0.02, ry: r3(ry), rz: r3(a) });
          }
          box(o.x0, o.x1, j - r - 0.07, j - r, o.z1 - 0.05, o.z1 + 0.02, 'frame', 'transom');
        }
        if (era === 'georgian') {
          // the doorcase: pilasters and an entablature standing proud of the brick
          const top2 = o.z1 + (o.fan || 0) + 0.12;
          box(o.x0 - 0.3, o.x0 - 0.08, j, j + 0.07, z0, top2, 'stucco', 'pilaster');
          box(o.x1 + 0.08, o.x1 + 0.3, j, j + 0.07, z0, top2, 'stucco', 'pilaster');
          box(o.x0 - 0.38, o.x1 + 0.38, j, j + 0.16, top2, top2 + 0.28, 'stucco', 'entablature');
        }
        if (era === 'haussmann') box(o.x0 - 0.25, o.x1 + 0.25, j, j + 0.1, o.z1, o.z1 + 0.45, 'stone', 'keystone arch');
        continue;
      }
      if (o.kind === 'shop') {
        // a shopfront: stallriser, glass, glazing bars, and the fascia over it
        box(o.x0, o.x1, j - 0.12, j - 0.02, z0, z0 + 0.5, 'fascia', 'stallriser');
        glass(o.x0, o.x1, z0 + 0.5, o.z1 - 0.1);
        for (let x = o.x0 + 0.6; x < o.x1 - 0.3; x += 0.6) box(x - 0.025, x + 0.025, j - 0.12, j - 0.06, z0 + 0.5, o.z1 - 0.1, 'frame', 'bar');
        box(o.x0 - 0.1, o.x1 + 0.1, j, j + 0.12, o.z1 - 0.1, o.z1 + 0.45, 'fascia', 'fascia');
        continue;
      }
      if (o.kind === 'shutter') {
        // a medieval shop: the lower shutter let down as the counter, the upper propped as an awning
        box(o.x0, o.x1, j - 0.05, j + 0.45, o.z0 - 0.04, o.z0 + 0.04, M.frame, 'counter');
        box(o.x0, o.x1, j, j + 0.05, o.z1 - 0.02, o.z1 + 0.5, M.frame, 'shutter', { rz: 0 });
        box(o.x0 + 0.05, o.x1 - 0.05, j - 0.6, j - 0.55, o.z0, o.z1, 'interior', 'shop');
        continue;
      }
      // a window: frame in its reveal, glass, bars, sill, head
      const bw = era === 'georgian' ? 0.07 : 0.06;
      fr(o.x0, o.x1, z0, o.z1, bw);
      glass(o.x0 + bw, o.x1 - bw, z0 + bw, o.z1 - bw);
      const [cols, rows] = o.panes || [1, 1];
      for (let c = 1; c < cols; c++) { const x = o.x0 + (o.x1 - o.x0) * c / cols; box(x - 0.013, x + 0.013, j - r - 0.045, j - r - 0.02, z0, o.z1, 'frame', 'glazing bar'); }
      for (let k = 1; k < rows; k++) { const z = z0 + (o.z1 - z0) * k / rows, meet = o.kind === 'sash' && k === Math.round(rows / 2); box(o.x0, o.x1, j - r - 0.045, j - r - (meet ? 0.0 : 0.02), z - (meet ? 0.028 : 0.013), z + (meet ? 0.028 : 0.013), 'frame', meet ? 'meeting rail' : 'glazing bar'); }
      if (o.kind === 'mullion') box((o.x0 + o.x1) / 2 - 0.05, (o.x0 + o.x1) / 2 + 0.05, j - r - 0.06, j, z0, o.z1, M.frame, 'mullion');
      if (era === 'georgian' || era === 'haussmann' || era === 'villa') box(o.x0 - 0.06, o.x1 + 0.06, j - 0.14, j + 0.05, z0 - 0.08, z0, 'stone', 'sill');
      if (era === 'georgian' && z0 > 0.5) box(o.x0 - 0.12, o.x1 + 0.12, j - 0.03, j + 0.004, o.z1, o.z1 + 0.27, 'rubbed', 'flat arch');
      if (era === 'haussmann') {
        // a stone surround, and a cornice over each window of the étage noble
        box(o.x0 - 0.16, o.x0, j, j + 0.04, z0, o.z1, 'stone2', 'architrave'); box(o.x1, o.x1 + 0.16, j, j + 0.04, z0, o.z1, 'stone2', 'architrave'); box(o.x0 - 0.16, o.x1 + 0.16, j, j + 0.04, o.z1, o.z1 + 0.16, 'stone2', 'architrave');
        if (o.storey === 'étage noble') box(o.x0 - 0.3, o.x1 + 0.3, j, j + 0.16, o.z1 + 0.25, o.z1 + 0.4, 'stone2', 'window cornice');
      }
    }

    // ---- bands
    for (const band of wall.bands) {
      if (band.kind === 'string course') box(0, L, 0, 0.07, band.z, band.z + band.h, era === 'georgian' ? 'stucco' : 'stone2', 'string course');
      else if (band.kind === 'slab edge') box(0, L, 0, 0.04, band.z, band.z + band.h, 'concrete2', 'slab edge');
      else if (band.kind === 'cornice') {
        const z = band.z, mat = era === 'georgian' ? 'stucco' : 'stone2';
        box(0, L, 0, 0.1, z, z + 0.14, mat, 'cornice'); box(0, L, 0, 0.2, z + 0.14, z + 0.26, mat, 'cornice'); box(0, L, 0, 0.34, z + 0.26, z + 0.42, mat, 'cornice');
        for (let x = 0.25; x < L - 0.1; x += 0.42) box(x - 0.05, x + 0.05, 0.1, 0.3, z + 0.17, z + 0.26, mat, 'modillion');
      } else if (band.kind === 'parapet') box(0, L, -thick(band.z) - 0.04, 0.05, band.z + band.h - 0.09, band.z + band.h, 'stone', 'coping');
    }
    // ---- balconies
    for (const bl of wall.balconies) {
      const z = bl.z, dpt = bl.depth;
      if (bl.kind === 'continuous') {
        box(bl.x0, bl.x1, 0, dpt, z - 0.18, z, 'stone2', 'balcony slab');
        for (let x = bl.x0 + 0.4; x < bl.x1; x += 1.6) box(x - 0.12, x + 0.12, 0, dpt * 0.7, z - 0.55, z - 0.18, 'stone2', 'console');
      } else box(bl.x0, bl.x1, 0, dpt, z - 0.05, z, 'iron', 'balconette plate');
      railing(box, bl.x0, bl.x1, dpt - 0.04, z, 0.95);
    }
  }

  // ---- inside: the dark of the rooms, and the floors seen through the windows
  const t0 = sh.structure ? sh.structure.storeys[sh.structure.storeys.length - 1].t : 0.2;
  push({ mat: 'interior', kind: 'interior', x: r3(b.W / 2), y: r3((zmin + sh.eaves) / 2), z: r3(-b.D / 2), w: r3(b.W - 2 * t0 - 0.2), h: r3(sh.eaves - zmin - 0.05), d: r3(b.D - 2 * t0 - 0.2), ry: 0 });
  for (const s of sh.storeys) push({ mat: 'floor', kind: 'floor', x: r3(b.W / 2), y: r3(s.z0 - 0.12), z: r3(-b.D / 2), w: r3(b.W - 0.1), h: 0.24, d: r3(b.D - 0.1), ry: 0 });

  roof(b, push, opts);
  site(b, push, opts);
  return out;
}
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Railings: a top and bottom rail and bars every 11 cm, the bars of wrought iron. */
function railing(box, x0, x1, o, z, h) {
  box(x0, x1, o - 0.02, o + 0.02, z + h - 0.04, z + h, 'iron', 'rail');
  box(x0, x1, o - 0.015, o + 0.015, z + 0.08, z + 0.12, 'iron', 'rail');
  for (let x = x0 + 0.05; x < x1 - 0.02; x += 0.11) box(x - 0.008, x + 0.008, o - 0.008, o + 0.008, z, z + h, 'iron', 'bar');
}

/**
 * A rectangle with holes cut in it, as disjoint rectangles: the coordinates of every edge make a grid,
 * the covered cells are dropped, and each column's runs are merged back up (brut's rect.subtract,
 * in a wall's own plane). Extra z cuts (storeys, a band's top) are kept.
 */
export function subtract(R, holes, zcuts = []) {
  const xs = [...new Set([R.x0, R.x1, ...holes.flatMap((h) => [h.x0, h.x1])])].filter((x) => x >= R.x0 - 1e-9 && x <= R.x1 + 1e-9).sort((a, b) => a - b);
  const zs = [...new Set([R.z0, R.z1, ...holes.flatMap((h) => [h.z0, h.z1]), ...zcuts])].filter((z) => z >= R.z0 - 1e-9 && z <= R.z1 + 1e-9).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i], x1 = xs[i + 1], xm = (x0 + x1) / 2;
    if (x1 - x0 < 1e-6) continue;
    let run = null;
    for (let k = 0; k + 1 < zs.length; k++) {
      const z0 = zs[k], z1 = zs[k + 1], zm = (z0 + z1) / 2;
      if (z1 - z0 < 1e-6) continue;
      const covered = holes.some((h) => xm > h.x0 && xm < h.x1 && zm > h.z0 && zm < h.z1);
      const cut = zcuts.some((c) => Math.abs(c - z0) < 1e-6);
      if (covered) { if (run) { out.push(run); run = null; } continue; }
      if (run && !cut) run.z1 = z1; else { if (run) out.push(run); run = { x0, x1, z0, z1 }; }
    }
    if (run) out.push(run);
  }
  return out;
}

// ---------------------------------------------------------------------------------- roofs --
function roof(b, push, opts) {
  const { W, D, era } = b, E = b.eaves, sh = b.shell;
  // every roof plane is remembered, so a stack can find the roof under it
  const planes = [];
  const plane = (pts) => { if (Math.abs(pts[0][1] - pts[1][1]) + Math.abs(pts[1][1] - pts[2][1]) > 1e-6 || pts.every((q) => Math.abs(q[1] - pts[0][1]) < 1e-6)) planes.push(pts); };
  const quad = (pts, mat, kind = 'roof') => { plane(pts); return push({ shape: 'quad', mat, kind, pts: pts.map((p) => p.map(r3)) }); };
  const tri = (pts, mat, kind = 'gable') => { if (kind !== 'party gable' && !/gable/.test(kind)) plane(pts); return push({ shape: 'tri', mat, kind, pts: pts.map((p) => p.map(r3)) }); };
  /** The roof's height over a point in plan (the highest plane above it), or the eaves where there is none. */
  const roofY = (x, z) => {
    let best = -Infinity;
    for (const P of planes) {
      // inside the plane's footprint (its projection on the ground)?
      let inside = true;
      for (let i = 0, n = P.length, sgn = 0; i < n; i++) {
        const a = P[i], b = P[(i + 1) % n], c = (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0]);
        if (Math.abs(c) < 1e-9) continue;
        if (!sgn) sgn = Math.sign(c); else if (Math.sign(c) !== sgn) { inside = false; break; }
      }
      if (!inside) continue;
      // the plane through its first three corners
      const [a, b, c] = P, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (Math.abs(ny) < 1e-9) continue;
      best = Math.max(best, a[1] - (nx * (x - a[0]) + nz * (z - a[2])) / ny);
    }
    return best > -Infinity ? best : E;
  };
  /** A chimney stack: it starts inside the roof (or the wall it stands on) and rises clear of the roof's
   *  highest point over its footprint by `clear`; a coping caps it and the pots stand on the coping. */
  const stack = (x, z, w, d, mat, clear, flues, along = 'z') => {
    // a stack is as long as its row of flues: one pot to a flue, 30 cm apart
    if (flues) { const need = flues * 0.3 + 0.12; if (along === 'z') d = Math.max(d, need); else w = Math.max(w, need); }
    const pts = [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2], [x, z]];
    const hs = pts.map(([a, c]) => roofY(a, c)), low = Math.min(...hs) - 0.3, top = Math.max(...hs) + clear;
    boxW(x, (low + top) / 2, z, w, top - low, d, mat, 'chimney stack');
    boxW(x, top + 0.06, z, w + 0.1, 0.12, d + 0.1, 'stone', 'stack coping');
    if (flues) pots(x, top + 0.12, z, flues, along);
    return top;
  };
  const boxW = (x, y, z, w, h, d, mat, kind) => push({ mat, kind, x: r3(x), y: r3(y), z: r3(z), w: r3(w), h: r3(h), d: r3(d), ry: 0 });
  // the pots stand ON the coping: a pot's base is at y, its centre half its height above
  const pots = (x, y, z, n, along = 'z') => { for (let k = 0; k < n; k++) { const off = (k - (n - 1) / 2) * 0.3; push({ shape: 'cyl', mat: 'pot', kind: 'chimney pot', x: r3(along === 'z' ? x : x + off), y: r3(y + 0.3), z: r3(along === 'z' ? z + off : z), r: 0.11, h: 0.6 }); } };
  const hip = (x0, x1, z0, z1, y, pitch, mat, over = 0) => {
    // a hipped roof over a rectangle (z0 > z1 in the world: the front is the larger z)
    x0 -= over; x1 += over; z0 += over; z1 -= over;
    const w = x1 - x0, d = z0 - z1, s = Math.min(w, d) / 2, H = y + s * pitch;
    if (w >= d) { const r0 = x0 + s, r1 = x1 - s, zm = (z0 + z1) / 2; quad([[x0, y, z0], [x1, y, z0], [r1, H, zm], [r0, H, zm]], mat); quad([[x1, y, z1], [x0, y, z1], [r0, H, zm], [r1, H, zm]], mat); tri([[x0, y, z1], [x0, y, z0], [r0, H, zm]], mat, 'hip'); tri([[x1, y, z0], [x1, y, z1], [r1, H, zm]], mat, 'hip'); }
    else { const r0 = z0 - s, r1 = z1 + s, xm = (x0 + x1) / 2; quad([[x0, y, z1], [x0, y, z0], [xm, H, r0], [xm, H, r1]], mat); quad([[x1, y, z0], [x1, y, z1], [xm, H, r1], [xm, H, r0]], mat); tri([[x0, y, z0], [x1, y, z0], [xm, H, r0]], mat, 'hip'); tri([[x1, y, z1], [x0, y, z1], [xm, H, r1]], mat, 'hip'); }
    return H;
  };
  if (era === 'georgian') {
    // the London "M" roof: two pitched roofs side by side, ridges along the street, a valley between,
    // all hidden behind the parapet; the party walls rise between neighbours to the ridges
    const p = Math.tan(38 * Math.PI / 180), h = (D / 4) * p;
    for (const zc of [-D / 4, -3 * D / 4]) {
      quad([[0, E, zc + D / 4], [W, E, zc + D / 4], [W, E + h, zc], [0, E + h, zc]], 'slate');
      quad([[W, E, zc - D / 4], [0, E, zc - D / 4], [0, E + h, zc], [W, E + h, zc]], 'slate');
      for (const x of [0, W]) tri([[x, E, zc + D / 4], [x, E, zc - D / 4], [x, E + h, zc]], 'brick', 'party gable');
    }
    // the stacks stand on the party wall, one shared by each pair of houses
    const flues = sh.storeys.length, sw = 0.55 + 0.11 * flues;
    for (const x of opts.endRight ? [0, W] : [0]) for (const zc of [-D / 4, -3 * D / 4]) {
      stack(x, zc, 0.62, sw, 'brick', 0.9, flues);
    }
  } else if (era === 'haussmann') {
    // the mansard: a steep lower slope of slate (the brisis) with a dormer to every bay, a shallow
    // upper slope of zinc (the terrasson); the stacks rise from the party walls
    const inset = 1.0, rise = 3.0, top = E + rise, ridge = top + (D / 2 - inset) * Math.tan(12 * Math.PI / 180);
    quad([[0, E, 0], [W, E, 0], [W, top, -inset], [0, top, -inset]], 'slate', 'brisis');
    quad([[W, E, -D], [0, E, -D], [0, top, -D + inset], [W, top, -D + inset]], 'slate', 'brisis');
    quad([[0, top, -inset], [W, top, -inset], [W, ridge, -D / 2], [0, ridge, -D / 2]], 'zinc', 'terrasson');
    quad([[W, top, -D + inset], [0, top, -D + inset], [0, ridge, -D / 2], [W, ridge, -D / 2]], 'zinc', 'terrasson');
    for (const x of [0, W]) { push({ shape: 'quad', mat: 'stone', kind: 'party gable', pts: [[x, E, 0], [x, E, -D], [x, top, -D + inset], [x, top, -inset]].map((p) => p.map(r3)) }); tri([[x, top, -inset], [x, top, -D + inset], [x, ridge, -D / 2]], 'stone', 'party gable'); }
    const front = sh.walls.find((w) => w.kind === 'front');
    for (const [x0, x1] of front.bays || []) {
      const cx = (x0 + x1) / 2, dw = 1.05, dz = -inset * 0.45;
      boxW(cx, E + 1.15, dz, dw + 0.3, 2.3, inset * 0.9, 'zinc', 'dormer');
      boxW(cx, E + 1.05, dz + inset * 0.45 + 0.01, dw - 0.2, 1.5, 0.03, 'glass', 'dormer window');
      boxW(cx, E + 1.05, dz + inset * 0.45 + 0.02, 0.05, 1.5, 0.03, 'frame', 'dormer bar');
      push({ mat: 'zinc', kind: 'dormer pediment', x: r3(cx), y: r3(E + 2.45), z: r3(dz + 0.1), w: r3(dw + 0.5), h: 0.18, d: r3(inset * 1.1), ry: 0 });
    }
    const flues = sh.storeys.length + 1;
    for (const x of opts.endRight ? [0, W] : [0]) for (const zc of [-D * 0.3, -D * 0.7]) stack(x, zc, 0.6, 0.6 + 0.12 * flues, 'stone', 1.4, flues);
  } else if (era === 'medieval') {
    // the gable to the street: ridge running back from the front, steep for tiles, over the top jetty
    const jt = sh.jetty * (sh.storeys.length - 1), p = Math.tan(52 * Math.PI / 180), H = E + (W / 2) * p, zf = jt + 0.3, zb = -D - 0.3;
    quad([[-0.1, E, zf], [W / 2, H, zf], [W / 2, H, zb], [-0.1, E, zb]], 'tile');
    quad([[W / 2, H, zf], [W + 0.1, E, zf], [W + 0.1, E, zb], [W / 2, H, zb]], 'tile');
    tri([[0, E, jt], [W, E, jt], [W / 2, H - 0.2, jt]], 'daub', 'front gable');
    tri([[W, E, -D], [0, E, -D], [W / 2, H - 0.2, -D]], 'daub', 'back gable');
    boxW(W / 2, (E + H) / 2, jt + 0.02, 0.16, H - E - 0.2, 0.06, 'timber', 'king post');
    boxW(W / 2, E + 0.1, jt + 0.03, W, 0.2, 0.06, 'timber', 'tie beam');
    // the stack rises through the slope near the ridge, clear of it by the old rule of thumb
    stack(W / 2 + 0.75, -D * 0.55, 0.9, 0.9, 'brick', 0.9, 2, 'z');
  } else if (era === 'village') {
    const H = hip(0, W, 0, -D, E, Math.tan(50 * Math.PI / 180), 'thatch', 0.45);
    const s = Math.min(W, D) / 2 + 0.45, cx = Math.max(W * 0.2, s - 0.45 + 0.6);    // on the ridge, near the hall's end
    stack(cx, -D / 2, 0.8, 0.8, 'cob', 0.6, 0);
  } else if (era === 'villa') {
    const H = hip(0, W, 0, -D, E, Math.tan(35 * Math.PI / 180), 'tile', 0.45);
    stack(W * 0.72, -D * 0.35, 0.7, 0.6, 'brickred', 0.9, 2, 'x');
  } else {
    // a flat roof: the slab, the parapet's coping (the walls rise to it), the plant on top
    boxW(W / 2, E + 0.15, -D / 2, W, 0.3, D, era === 'glass' ? 'concrete2' : 'concrete', 'roof slab');
    const pw = era === 'glass' ? W * 0.5 : W * 0.25, pd = D * 0.45;
    boxW(W / 2, E + 0.3 + 1.6, -D / 2, pw, 3.2, pd, era === 'glass' ? 'spandrel' : 'concrete', 'plant room');
    boxW(W / 2 + pw / 2 + 1.6, E + 0.3 + 2.2, -D / 2, 2.6, 4.4, 2.6, 'concrete', 'lift overrun');
  }
}

// ---------------------------------------------------------------------------------- the site --
/** The street the building fronts (pavement, kerb, road), its yard or garden, and a Georgian house's
 *  area: the sunk court before the basement, its retaining wall, the railings, and the steps up to
 *  the door across it. */
function site(b, push) {
  const { W, D, era } = b, boxW = (x, y, z, w, h, d, mat, kind) => push({ mat, kind, x: r3(x), y: r3(y), z: r3(z), w: r3(w), h: r3(h), d: r3(d), ry: 0 });
  const area = era === 'georgian' ? 1.25 : 0, pave = era === 'glass' ? 8 : era === 'modern' ? 5 : 2.4, road = 9;
  const detached = !PERIODS[era].attached, back = detached ? 8 : 6, sideW = detached ? 6 : 0;
  boxW(W / 2, 0.06 - 0.25, area + pave / 2, W, 0.5 + 0.12, pave, 'pavement', 'pavement');
  boxW(W / 2, -0.05 - 0.2, area + pave + 0.1, W, 0.5, 0.2, 'stone', 'kerb');
  boxW(W / 2, -0.25 - 0.1, area + pave + 0.2 + road / 2, W + 2 * sideW, 0.3, road, 'road', 'road');
  boxW(W / 2, -0.25, -D - back / 2, W + 2 * sideW, 0.5, back, detached ? 'grass' : 'yard', 'yard');
  if (detached) { for (const s of [-1, 1]) boxW(W / 2 + s * (W / 2 + sideW / 2), -0.25, -D / 2 + (area + pave) / 2, sideW, 0.5, D + area + pave, 'grass', 'garden'); boxW(W / 2, -0.25, area / 2, W, 0.5, Math.max(0.01, area), 'grass', 'front'); }
  boxW(W / 2, -0.25, -D / 2, W, 0.5, D, 'yard', 'under');
  if (!area) return;
  // the area: its floor down at the basement, its wall holding the pavement up, railings along the top
  const front = b.shell.walls.find((w) => w.kind === 'front'), door = front.openings.find((o) => o.kind === 'door');
  const zb = Math.min(...b.shell.storeys.map((s) => s.z0));
  boxW(W / 2, zb - 0.1, area / 2, W, 0.2, area, 'pavement', 'area floor');
  boxW(W / 2, (zb + 0.12) / 2, area + 0.11, W, 0.12 - zb, 0.22, 'brick', 'area wall');
  const gap = door ? [door.x0 - 0.2, door.x1 + 0.2] : [W, W];
  const rail = (x0, x1) => { const box = (a0, a1, o0, o1, z0, z1, mat, kind) => boxW((a0 + a1) / 2, (z0 + z1) / 2, (o0 + o1) / 2, a1 - a0, z1 - z0, o1 - o0, mat, kind); railing(box, x0, x1, area + 0.11, 0.12, 1.05); };
  if (gap[0] > 0.2) rail(0.05, gap[0]);
  if (gap[1] < W - 0.2) rail(gap[1], W - 0.05);
  if (door) {
    // the steps bridge the area from the pavement up to the door
    const ground = b.shell.storeys.find((s) => s.name === 'ground').z0, n = Math.max(2, Math.ceil(ground / 0.17)), rise = ground / n, going = (area + 0.9) / n;
    for (let k = 0; k < n; k++) boxW((door.x0 + door.x1) / 2, (rise * (k + 1)) / 2, area + 0.9 - going * (k + 0.5), door.x1 - door.x0 + 0.5, rise * (k + 1), going, 'stone', 'step');
  }
}

// ---------------------------------------------------------------------------------- plans --
/**
 * How the period lived on each floor: rooms as rectangles in plan (x across the frontage, y back from
 * the street), and the stair. Coarse — the arrangement each type was built round, not a survey.
 */
export function plan(b) {
  const { W, D, era } = b, sh = b.shell, R = Rand(b.params.seed, `periodplan/${b.id}`);
  const t = 0.3, x0 = t, x1 = W - t, y0 = t, y1 = D - t;
  const rect = (name, a, c, e, f, extra = {}) => ({ name, x0: r2(a), y0: r2(c), x1: r2(e), y1: r2(f), ...extra });
  const levels = [];
  const front = sh.walls.find((w) => w.kind === 'front'), door = front && front.openings.find((o) => /door/.test(o.kind));
  const left = door ? (door.x0 + door.x1) / 2 < W / 2 : true;
  for (const s of sh.storeys) {
    const rooms = [];
    let stair = null;
    if (era === 'georgian') {
      // the hall and stair down the door's side, two rooms deep beside it: front and back
      const hw = Math.min(2.1, Math.max(1.6, W * 0.3)), hx0 = left ? x0 : x1 - hw, hx1 = left ? x0 + hw : x1, rx0 = left ? hx1 + 0.23 : x0, rx1 = left ? x1 : hx0 - 0.23;
      const mid = y0 + (y1 - y0) * 0.5, sy0 = y0 + (y1 - y0) * 0.55, sy1 = Math.min(y1, sy0 + 3.4);
      const names = { basement: ['kitchen', 'scullery'], ground: ['dining room', 'parlour'], first: ['drawing room', 'back drawing room'], second: ['bedroom', 'dressing room'], third: ['bedroom', 'nursery'], attic: ["servants' room", "servants' room"] }[s.name] || ['room', 'room'];
      stair = rect('stair', hx0, sy0, hx1, sy1, { type: 'dog-leg' });
      rooms.push(rect(s.name === 'ground' ? 'hall' : s.basement ? 'passage' : 'landing', hx0, y0, hx1, sy0));
      rooms.push(rect(names[0], rx0, y0, rx1, mid - 0.12), rect(names[1], rx0, mid + 0.12, rx1, y1));
      if (sy1 < y1 - 1) rooms.push(rect(s.basement ? 'larder' : 'closet', hx0, sy1, hx1, y1));
    } else if (era === 'haussmann') {
      // the street side an enfilade of reception rooms; a corridor; the court side service; the main
      // stair and the service stair at the back; on the ground floor, shops either side of the carriage way
      const cy = y0 + (y1 - y0) * 0.48, cw = 1.2;
      if (s.name === 'ground') {
        const pw = 3.2, px0 = W / 2 - pw / 2, px1 = W / 2 + pw / 2;
        rooms.push(rect('shop', x0, y0, px0 - 0.25, cy + 2), rect('passage cochère', px0, y0, px1, y1), rect('shop', px1 + 0.25, y0, x1, cy + 2), rect('loge', x0, cy + 2.25, px0 - 0.25, y1 - 3.5));
        stair = rect('main stair', px1 + 0.25, y1 - 4.2, Math.min(x1, px1 + 3.6), y1, { type: 'open well' });
      } else {
        const n = Math.max(2, Math.round((x1 - x0) / 4.2)), names = ['salon', 'salle à manger', 'chambre', 'chambre', 'boudoir', 'chambre'];
        for (let k = 0; k < n; k++) rooms.push(rect(names[k % names.length], x0 + (x1 - x0) * k / n + (k ? 0.12 : 0), y0, x0 + (x1 - x0) * (k + 1) / n - (k < n - 1 ? 0.12 : 0), cy));
        rooms.push(rect('corridor', x0, cy + 0.12, x1, cy + 0.12 + cw));
        const by = cy + 0.24 + cw;
        rooms.push(rect('cuisine', x0, by, x0 + (x1 - x0) * 0.3, y1), rect('chambre', x0 + (x1 - x0) * 0.3 + 0.12, by, x0 + (x1 - x0) * 0.55, y1));
        stair = rect('main stair', x0 + (x1 - x0) * 0.55 + 0.12, by, x0 + (x1 - x0) * 0.8, y1, { type: 'open well' });
        rooms.push(rect('service stair', x0 + (x1 - x0) * 0.8 + 0.12, by, x1, y1));
      }
    } else if (era === 'medieval') {
      const by = y0 + (y1 - y0) * (s.name === 'ground' ? 0.45 : 0.55);
      if (s.name === 'ground') rooms.push(rect('shop', x0, y0, x1, by), rect('hall', x0, by + 0.15, x1, y1 - 1.6));
      else rooms.push(rect(s.name === 'garret' ? 'garret' : 'chamber', x0, y0, x1, by), rect(s.name === 'garret' ? 'store' : 'chamber', x0, by + 0.15, x1, y1 - 1.6));
      stair = rect('stair', x0, y1 - 1.45, x0 + 1.1, y1, { type: 'winder' });
      rooms.push(rect(s.name === 'ground' ? 'yard door' : 'closet', x0 + 1.25, y1 - 1.45, x1, y1));
    } else if (era === 'village') {
      // a longhouse: the people's end and the beasts' end either side of the cross passage
      const px = x0 + (x1 - x0) * R.range(0.52, 0.6);
      rooms.push(rect('hall', x0, y0, px - 0.6, y1), rect('cross passage', px - 0.55, y0, px + 0.55, y1), rect('byre', px + 0.6, y0, x1, y1));
      if (s.name !== 'ground') rooms.splice(0, 3, rect('loft', x0, y0, x1, y1));
    } else if (era === 'villa') {
      const hx = x0 + (x1 - x0) * 0.42;
      if (s.name === 'ground') { rooms.push(rect('living room', x0, y0, hx - 0.12, y0 + (y1 - y0) * 0.55), rect('hall', hx, y0, hx + 2.0, y1 - 3.5), rect('dining room', hx + 2.12, y0, x1, y0 + (y1 - y0) * 0.55), rect('kitchen', hx + 2.12, y0 + (y1 - y0) * 0.55 + 0.12, x1, y1), rect('study', x0, y0 + (y1 - y0) * 0.55 + 0.12, hx - 0.12, y1)); }
      else rooms.push(rect('bedroom', x0, y0, hx - 0.12, y0 + (y1 - y0) * 0.55), rect('landing', hx, y0, hx + 2.0, y1 - 3.5), rect('bedroom', hx + 2.12, y0, x1, y0 + (y1 - y0) * 0.55), rect('bathroom', hx + 2.12, y0 + (y1 - y0) * 0.55 + 0.12, x1, y1), rect('bedroom', x0, y0 + (y1 - y0) * 0.55 + 0.12, hx - 0.12, y1));
      stair = rect('stair', hx, y1 - 3.4, hx + 2.0, y1, { type: 'quarter turn' });
    } else if (era === 'modern') {
      // a central corridor, flats either side, a stair and lift core in the middle
      const cy0 = y0 + (y1 - y0) / 2 - 0.75, cy1 = cy0 + 1.5, cx = W / 2;
      stair = rect('core', cx - 2.6, cy0 - 3.0, cx + 2.6, cy1 + 3.0, { type: 'scissor' });
      if (s.name === 'ground') rooms.push(rect('entrance hall', x0, y0, x1, y1));
      else {
        rooms.push(rect('corridor', x0, cy0, cx - 2.6, cy1), rect('corridor', cx + 2.6, cy0, x1, cy1));
        const fw = 7.2, n = Math.max(1, Math.floor((cx - 2.6 - x0) / fw));
        for (const side of [-1, 1]) for (let k = 0; k < n; k++) {
          const a = side < 0 ? cx - 2.6 - (k + 1) * fw : cx + 2.6 + k * fw, c = a + fw - 0.2;
          rooms.push(rect('flat', a, y0, c, cy0 - 0.12), rect('flat', a, cy1 + 0.12, c, y1));
        }
      }
    } else {
      // a glass tower: a central core of lifts and stairs, open floor round it
      const cw = Math.min(W, D) * 0.36, cx = W / 2, cy = D / 2;
      stair = rect('core', cx - cw / 2, cy - cw / 2, cx + cw / 2, cy + cw / 2, { type: 'scissor' });
      rooms.push(rect(s.name === 'lobby' ? 'lobby' : 'open office', x0, y0, x1, y1));
    }
    levels.push({ name: s.name, z0: s.z0, h: s.h, rooms, stair });
  }
  return levels;
}
