// tjs/brut/period.js — BRUT THROUGH THE CENTURIES: the shell of a city building in its period.
// Pure, DOM-free, three.js-free, the same house rules as arch.js (seeded sub-streams, metres).
//
// arch.js builds one freestanding concrete building, inside and out. A city is mostly the other kind
// of building: one of a row, on a narrow plot, with one face to the street and its sides shared with
// its neighbours, built in whatever way its century built. This file builds THAT, as a shell: walls
// classed by what they face, laid out in bays and storeys, with their openings, bands, balconies and
// parapets — data, which the city's model view and the elevation drawing both read.
//
// THE RULE THAT HOLDS IT UP is arch.js's own: the growth rule and the structural rule are the same
// rule. How a building stood up decided what its face could be:
//
//   timber frame (village, medieval)   the frame carries the floors; the panels between its posts are
//                                      infill, so windows are small and sit between the posts; upper
//                                      storeys oversail the street on their joists (the jetty)
//   load-bearing brick (Georgian)      the wall IS the structure: what is cut out of it for a window is
//                                      taken from the piers that carry everything above, so windows are
//                                      a fixed width with a pier at least as wide between, and the
//                                      walls thicken toward the ground (the 1774 Building Act's rates)
//   stone and an iron shop frame       a masonry front over a ground floor opened up on iron beams:
//     (Haussmann)                      shops below, an entresol, the balconied étage noble, a mansard
//   concrete frame (modern)            the frame frees the face: windows become a ribbon
//   steel frame, curtain wall (glass)  the face is not structure at all: a grid of mullions
//
// `masonry(shell)` checks the load-bearing ones the way they actually failed or stood: compression in
// the piers of the front (which carries little but itself) and in the party walls (which carry the
// floors, since joists span between them), and slenderness. So the height a brick terrace could reach
// is a consequence, not a setting (`maxStoreys`).
//
//   const sh = shell({ footprint, front: [a, q], storeys, style: 'georgian', seed, id }, { lot });
//   sh.walls[i] = { kind: 'front'|'side'|'party'|'back', a, b, length, openings[], bands[], balconies[] }
//   opening = { kind, x0, x1, z0, z1, ... }   x along the wall from its left as seen from outside;
//                                             z above the building's platform

import { Rand } from './rand.js';

export const VERSION = 'period/1';

const BRICK = 0.225;                     // a brick's length: wall thicknesses are counted in bricks

// ---------------------------------------------------------------------------------- periods --
// Each period: its construction system, whether its buildings are attached (party walls), the storey
// stack (name, height, what its windows are), the bay module, the door, the dressings.
export const PERIODS = {
  village: {
    label: 'village house', system: 'timber', attached: false,
    stack: (n) => ['ground', 'upper', 'loft'].slice(0, Math.max(1, n)).map((name, i) => ({ name, h: i ? 2.5 : 2.7, win: { w: 0.75, sill: 0.9, h: 0.9, kind: 'casement', panes: [2, 2] } })),
    bay: [2.4, 3.0], endPier: 0.6, door: { w: 0.9, h: 1.95, at: 'middle' }, eavesOnly: true,
  },
  medieval: {
    label: 'timber-framed house', system: 'timber', attached: true, jetty: 0.35,
    stack: (n) => Array.from({ length: Math.max(1, n) }, (_, i) => i === 0
      ? { name: 'ground', h: 3.0, win: { w: 1.9, sill: 0.75, h: 1.5, kind: 'shutter', panes: [1, 1] }, one: true }
      : { name: i === n - 1 && n > 2 ? 'garret' : `floor ${i}`, h: 2.7, win: { w: 1.25, sill: 0.85, h: 1.05, kind: 'mullion', panes: [3, 2] } }),
    bay: [2.6, 3.4], endPier: 0.35, door: { w: 1.0, h: 2.1, at: 'end' }, eavesOnly: true,
  },
  georgian: {
    // a London terrace house: basement in its area, the ground floor raised over it, the first floor
    // the tallest (the drawing room: the piano nobile), the windows shortening floor by floor above it
    label: 'Georgian terrace house', system: 'masonry', attached: true, basement: { h: 2.8, below: 1.3 },
    stack: (n) => {
      const all = [
        { name: 'ground', h: 3.4, win: { w: 1.0, sill: 0.95, h: 2.0, kind: 'sash', panes: [3, 4] }, stucco: true },
        { name: 'first', h: 4.0, win: { w: 1.0, sill: 0.15, h: 2.65, kind: 'sash', panes: [3, 5] }, balconette: true, string: true },
        { name: 'second', h: 3.3, win: { w: 1.0, sill: 0.75, h: 1.85, kind: 'sash', panes: [3, 4] } },
        { name: 'third', h: 2.85, win: { w: 1.0, sill: 0.7, h: 1.4, kind: 'sash', panes: [3, 3] } },
        { name: 'attic', h: 2.55, win: { w: 0.95, sill: 0.65, h: 1.0, kind: 'sash', panes: [3, 2] } },
      ];
      const out = all.slice(0, Math.min(5, Math.max(2, n)));
      for (let k = 5; k < n; k++) out.push({ name: `floor ${k}`, h: 2.6, win: { w: 0.95, sill: 0.7, h: 1.1, kind: 'sash', panes: [3, 2] } });
      return out;
    },
    bay: [1.85, 2.15], endPier: 0.55, odd: true, door: { w: 1.05, h: 2.35, fan: 0.55, at: 'end' },
    parapet: 1.0, cornice: true, density: 19, allowable: 0.42e6,
  },
  haussmann: {
    label: 'Haussmann apartment block', system: 'stone', attached: true,
    stack: (n) => {
      const names = ['ground', 'entresol', 'étage noble', 'third', 'fourth', 'fifth'], H = [4.2, 2.7, 3.3, 3.05, 2.95, 2.75];
      return Array.from({ length: Math.max(2, n) }, (_, i) => i === 0
        ? { name: 'ground', h: H[0], win: { w: 2.2, sill: 0.15, h: 3.3, kind: 'shop', panes: [2, 1] }, stone: 'rusticated' }
        : { name: names[i] || `floor ${i}`, h: H[i] || 2.7, win: { w: 1.2, sill: i === 1 ? 0.6 : 0.1, h: i === 1 ? 1.5 : Math.min(2.4, (H[i] || 2.7) - 0.6), kind: 'french', panes: [2, 4] }, balcony: i === 2 || i === 5 ? 'continuous' : i === 1 ? null : 'balconette', string: i === 2 || i === 5 });
    },
    bay: [2.8, 3.2], endPier: 0.6, door: { w: 2.5, h: 3.6, at: 'middle', carriage: true }, parapet: 0, cornice: true, density: 22, allowable: 2.0e6,
    wall: (above) => 0.4 + 0.1 * Math.floor(above / 3),               // dressed stone, ~50 cm at the street
  },
  villa: {
    label: 'detached house', system: 'masonry', attached: false,
    stack: (n) => Array.from({ length: Math.max(1, n) }, (_, i) => ({ name: i ? 'upper' : 'ground', h: i ? 2.8 : 3.0, win: { w: 1.3, sill: 0.85, h: 1.4, kind: 'casement', panes: [2, 3] } })),
    bay: [2.6, 3.4], endPier: 0.8, door: { w: 1.0, h: 2.2, at: 'middle', porch: true }, eavesOnly: true, density: 19, allowable: 0.7e6,
  },
  modern: {
    label: 'concrete slab', system: 'frame', attached: false,
    stack: (n) => Array.from({ length: Math.max(1, n) }, (_, i) => i === 0
      ? { name: 'ground', h: 4.5, win: { kind: 'lobby', sill: 0.0, h: 3.6 }, ribbon: true }
      : { name: `floor ${i}`, h: 3.2, win: { kind: 'ribbon', sill: 0.9, h: 1.35 }, ribbon: true }),
    bay: [6.0, 7.2], endPier: 0.4, door: null, parapet: 0.6,
  },
  glass: {
    label: 'glass tower', system: 'curtain', attached: false,
    stack: (n) => Array.from({ length: Math.max(1, n) }, (_, i) => ({ name: i ? `floor ${i}` : 'lobby', h: i ? 3.6 : 5.4, win: { kind: 'curtain', sill: 0.0, h: i ? 3.6 : 5.4, mullion: 1.5 }, ribbon: true })),
    bay: [7.5, 9.0], endPier: 0, door: null, parapet: 1.2,
  },
};
export const PERIOD_IDS = Object.keys(PERIODS);

// ---------------------------------------------------------------------------------- the shell --
/**
 * b: { footprint (convex, CCW), front: [a, q] (the street line), storeys, style, seed, id }
 * ctx: { lot } the block's lot (an edge of the footprint on another of its sides is a second street:
 * a corner house), or { kinds } to give every edge's kind outright.
 */
export function shell(b, ctx = {}) {
  const P = PERIODS[b.style] || PERIODS.georgian, R = Rand(b.seed ?? 1, `period/${b.id ?? 0}`);
  const F = b.footprint, n = F.length;
  const kinds = ctx.kinds || classify(F, b.front, P.attached, ctx.lot);
  const stack = P.stack(b.storeys || 3);
  // the storeys, bottom to top, above the platform (a basement's below it)
  let z = P.basement ? P.basement.h - P.basement.below : 0;
  const storeys = [];
  if (P.basement) storeys.push({ name: 'basement', z0: -P.basement.below, h: P.basement.h, win: { w: 0.9, sill: 1.35, h: 1.05, kind: 'sash', panes: [3, 2] }, basement: true });
  for (const s of stack) { storeys.push({ ...s, z0: z }); z += s.h; }
  const eaves = z, top = z + (P.parapet || 0);
  const walls = [];
  for (let i = 0; i < n; i++) {
    const a = F[i], q = F[(i + 1) % n], L = Math.hypot(q[0] - a[0], q[1] - a[1]);
    const w = { i, kind: kinds[i], a, b: q, length: L, openings: [], bands: [], balconies: [], top: P.eavesOnly ? eaves : top };
    if (w.kind !== 'party' && L > 1.2) dress(w, P, storeys, R, b, eaves);
    walls.push(w);
  }
  const sh = { period: b.style in PERIODS ? b.style : 'georgian', label: P.label, system: P.system, storeys, eaves, top, walls, jetty: P.jetty || 0 };
  if (P.system === 'masonry' || P.system === 'stone') sh.structure = masonry(sh, b);
  return sh;
}

/** Each footprint edge's kind: on the street line it is the front; across from a neighbour it is a
 *  party wall (if the period built attached); on another side of the block's lot, a side street. */
export function classify(F, front, attached, lot) {
  const [a, q] = front, dx = q[0] - a[0], dy = q[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const off = (p) => nx * (p[0] - a[0]) + ny * (p[1] - a[1]);           // distance in from the street line
  const onLot = (p, r) => {
    if (!lot) return false;
    for (let k = 0; k < lot.length; k++) {
      const s = lot[k], t = lot[(k + 1) % lot.length], ex = t[0] - s[0], ey = t[1] - s[1], ll = Math.hypot(ex, ey) || 1;
      const d1 = Math.abs((-(ey) * (p[0] - s[0]) + ex * (p[1] - s[1])) / ll), d2 = Math.abs((-(ey) * (r[0] - s[0]) + ex * (r[1] - s[1])) / ll);
      if (d1 < 0.6 && d2 < 0.6 && Math.abs(ux * ex / ll + uy * ey / ll) < 0.9) return true;    // along another lot edge
    }
    return false;
  };
  return F.map((p, i) => {
    const r = F[(i + 1) % F.length], ex = r[0] - p[0], ey = r[1] - p[1], el = Math.hypot(ex, ey) || 1;
    if (Math.abs(off(p)) < 0.6 && Math.abs(off(r)) < 0.6) return 'front';
    if (onLot(p, r)) return 'side';
    const across = Math.abs((ex * ux + ey * uy) / el) < 0.5;            // runs back from the street
    if (across) return attached ? 'party' : 'side';                  // a detached house has windows down its sides
    return 'back';
  });
}

/** Lay a wall out: bays along it, an opening per bay per storey (the period's window for that storey),
 *  the door, bands, balconies. Party walls are blank; a back wall gets the windows and nothing else. */
function dress(w, P, storeys, R, b, eaves) {
  const L = w.length, front = w.kind === 'front' || w.kind === 'side';
  const e = Math.min(P.endPier, L * 0.2);
  // the bays: as many as the module allows, odd in a period that composed about a centre
  const m = R.range(P.bay[0], P.bay[1]);
  let nb = Math.max(1, Math.round((L - 2 * e) / m));
  if (P.odd && nb >= 4 && nb % 2 === 0) nb = (L - 2 * e) / (nb + 1) >= P.bay[0] ? nb + 1 : nb - 1;
  const bw = (L - 2 * e) / nb;
  w.bays = Array.from({ length: nb }, (_, k) => [e + k * bw, e + (k + 1) * bw]);
  // the door: in an end bay (a terrace house's hall runs up one side; neighbours mirror, so doors pair
  // up across a party wall), or in the middle
  let doorBay = -1;
  if (front && P.door && w.kind === 'front') doorBay = P.door.at === 'middle' || nb >= 5 ? Math.floor(nb / 2) : ((b.id ?? 0) % 2 ? nb - 1 : 0);
  for (const s of storeys) {
    if (s.basement && !front) continue;
    const win = s.win;
    if (s.ribbon) {
      // a frame building: one band of glazing the length of the wall per storey (or a curtain grid)
      const x0 = Math.min(e, 0.4), x1 = L - x0;
      if (win.kind === 'curtain') w.openings.push({ kind: 'curtain', x0: 0, x1: L, z0: s.z0 + 0.05, z1: s.z0 + s.h - 0.05, mullion: win.mullion, storey: s.name });
      else if (win.kind === 'lobby') { if (front) w.openings.push({ kind: 'lobby', x0: x0 + 0.6, x1: x1 - 0.6, z0: s.z0, z1: s.z0 + win.h, mullion: 1.8, storey: s.name }); }
      else w.openings.push({ kind: 'ribbon', x0, x1, z0: s.z0 + win.sill, z1: s.z0 + win.sill + win.h, mullion: 1.2, storey: s.name });
      w.bands.push({ kind: 'slab edge', z: s.z0, h: 0.35 });
      continue;
    }
    for (let k = 0; k < nb; k++) {
      const [b0, b1] = w.bays[k], c = (b0 + b1) / 2;
      if (s.name === 'ground' && k === doorBay) {
        const d = P.door, dw = Math.min(d.w, bw * 0.8), dh = Math.min(d.h, s.h - (d.fan || 0) - 0.15);
        w.openings.push({ kind: d.carriage ? 'carriage door' : 'door', x0: c - dw / 2, x1: c + dw / 2, z0: s.z0, z1: s.z0 + dh, fan: d.fan ? Math.min(d.fan, dw / 2) : 0, storey: s.name });
        continue;
      }
      if (s.basement && k === doorBay) continue;                         // the steps cross the area here
      if (s.one && k !== (doorBay === 0 ? nb - 1 : 0) && nb > 1) {        // a medieval ground floor: one shop opening
        if (!front) continue;
      }
      const ww = Math.min(win.w, bw * (front ? 0.62 : 0.5)), wh = Math.min(win.h, s.h - win.sill - 0.15);
      if (wh < 0.4 || ww < 0.3) continue;
      if (!front && s.name === 'ground' && P.attached && R.chance(0.3)) continue;   // a back yard's door or a blank
      w.openings.push({ kind: win.kind, x0: c - ww / 2, x1: c + ww / 2, z0: s.z0 + win.sill, z1: s.z0 + win.sill + wh, panes: win.panes, storey: s.name, ...(s.balconette && front ? { balconette: true } : {}) });
    }
    if (!front) continue;
    if (s.string) w.bands.push({ kind: 'string course', z: s.z0, h: 0.18 });
    if (s.stucco) w.bands.push({ kind: 'stucco', z: 0, z1: s.z0 + s.h, rusticated: true });
    if (s.stone === 'rusticated') w.bands.push({ kind: 'rustication', z: 0, z1: s.z0 + s.h, rusticated: true });
    if (s.balcony === 'continuous') w.balconies.push({ x0: 0.2, x1: L - 0.2, z: s.z0, depth: 0.85, kind: 'continuous' });
    else if (s.balcony === 'balconette') for (const o of w.openings) if (o.storey === s.name && o.kind === 'french') w.balconies.push({ x0: o.x0 - 0.1, x1: o.x1 + 0.1, z: o.z0, depth: 0.3, kind: 'balconette' });
    if (s.balconette) for (const o of w.openings) if (o.storey === s.name && o.balconette) w.balconies.push({ x0: o.x0 - 0.05, x1: o.x1 + 0.05, z: o.z0, depth: 0.25, kind: 'balconette' });
  }
  if (front && P.cornice) w.bands.push({ kind: 'cornice', z: eaves - 0.35, h: 0.45 });
  if (front && P.parapet) w.bands.push({ kind: 'parapet', z: eaves, h: P.parapet });
}

// ---------------------------------------------------------------------------------- masonry --
/**
 * The load-bearing check, storey by storey from the top. Wall thickness by the old rates: one brick in
 * the top two storeys, half a brick more for every two below (the 1774 Act's pattern), half a brick
 * more again in a basement (or the period's own rule: dressed stone for Haussmann). The FRONT carries its own weight down its
 * piers (what the windows leave of it); the PARTY WALLS carry the floors, whose joists span between
 * them, plus their own weight. Stress against the masonry's allowable; slenderness h/t ≤ 18.
 */
export function masonry(sh, b = {}) {
  const P = PERIODS[sh.period], gamma = (P.density || 19) * 1e3, allow = P.allowable || 0.42e6;
  const front = sh.walls.find((w) => w.kind === 'front'), width = front ? front.length : 6;
  // the joists span the short way: between the party walls on a narrow house; on a wide one front to
  // back onto a spine wall, which puts the floors on the FRONT (and the spine) instead
  const depth = b.depth || (front ? Math.max(...sh.walls.map((w) => w.length)) : 12), across = width <= Math.max(7.6, depth / 2);
  const span = across ? width : depth / 2;
  // working loads against a working (allowable) stress, as the period designed: a timber floor's boards,
  // joists and plaster ceiling, and a dwelling's live load, unfactored
  const floor = 1.0e3 + 1.5e3;
  const st = sh.storeys, out = [];
  let Nfront = 0, Nparty = 0;                                            // per metre of wall, accumulated downward
  for (let k = st.length - 1; k >= 0; k--) {
    const s = st[k], above = st.length - 1 - k;
    // (the Act rated houses by size: a first-rate house, over ~84 m² a floor, walls half a brick thicker)
    const rate = width * depth > 84 ? 0.5 : 0;
    const t = P.wall ? P.wall(above, !!s.basement) : BRICK * (1 + rate + 0.5 * Math.floor(above / 2) + (s.basement ? 0.5 : 0));
    const h = s.h + (k === st.length - 1 ? (P.parapet || 0) : 0);
    // the front: its weight less its openings, carried by its piers
    let open = 0, piers = 1;
    if (front) {
      const ops = front.openings.filter((o) => o.storey === s.name);
      open = ops.reduce((a, o) => a + (o.x1 - o.x0) * (o.z1 - o.z0), 0) / (front.length * s.h);
      piers = Math.max(0.05, 1 - ops.reduce((a, o) => a + (o.x1 - o.x0), 0) / front.length);
    }
    Nfront += gamma * t * h * (1 - open) + (across ? 0 : floor * span / 2);
    Nparty += gamma * t * h + (across ? floor * span / 2 : 0);
    const fs = Nfront / (t * piers), ps = Nparty / t, slender = s.h / t;
    out.push({ name: s.name, t, frontStress: fs, partyStress: ps, slender, ok: fs <= allow && ps <= allow && slender <= 18 });
  }
  out.reverse();
  return { storeys: out, joists: across ? 'party to party' : 'front to spine', span, ok: out.every((s) => s.ok), worst: Math.max(...out.map((s) => Math.max(s.frontStress, s.partyStress) / allow)), allowable: allow };
}

/** How tall this period could build in load-bearing walls on a given frontage: the storeys at which the
 *  check first fails. (A brick terrace tops out where its party walls run out of strength.) */
export function maxStoreys(style, frontage = 6, depth = 12) {
  const fp = [[0, 0], [frontage, 0], [frontage, depth], [0, depth]];
  for (let n = 2; n <= 30; n++) {
    const sh = shell({ footprint: fp, front: [[0, 0], [frontage, 0]], storeys: n, style, seed: 1, id: 0 });
    if (!sh.structure || !sh.structure.ok) return n - 1;
  }
  return 30;
}

/** One wall's elevation as flat primitives in (x along the wall from its left, z up): what the drawing
 *  and the model's facades both draw. */
export function elevation(sh, i) {
  const w = sh.walls[i], prims = [{ kind: 'wall', x0: 0, x1: w.length, z0: Math.min(0, ...sh.storeys.map((s) => s.z0)), z1: w.top }];
  for (const band of w.bands) prims.push(band.z1 != null ? { kind: band.kind, x0: 0, x1: w.length, z0: band.z, z1: band.z1, rusticated: band.rusticated } : { kind: band.kind, x0: 0, x1: w.length, z0: band.z, z1: band.z + band.h });
  for (const o of w.openings) prims.push({ ...o });
  for (const bl of w.balconies) prims.push({ kind: bl.kind === 'continuous' ? 'balcony' : 'balconette', x0: bl.x0, x1: bl.x1, z0: bl.z, z1: bl.z + 1.0, depth: bl.depth });
  return prims;
}
