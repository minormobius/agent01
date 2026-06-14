// fixtures.js — CHAMBER FIXTURES: drawn, place-bound set dressing for the hoop chambers.
//
// Same "hand" as /yarrow (clock/lib/stalk-render.js, vendored into hoop/js/ink.js as drawStalk):
// a GENOME → MODEL → DRAWING, pure Canvas2D, fully seed-driven, feature density scaled to the
// rendered size. Where drawStalk grows one milfoil stalk for garden rooms, this grows the rest of
// the furniture — hearths, anvils, looms, altars, barrels, shelves… — each a parametric body whose
// CONFIGURATION implies variety (no two anvils alike) and whose KIND is TIED TO PLACE (a forge gets
// anvils + a furnace; a temple gets an altar + a brazier), keyed to the same civic verbs the item
// engine's bindings.js uses.
//
// Contract (mirrors drawStalk so hoop can drop it in beside it):
//   fixtureModel(type, rng) → a tile-unit model (+ grainSeed) — minted once, cached on the fixture
//   drawFixture(ctx, { type, model }, { x, y, t, ang, detail, lit }) — x,y = ground point (px),
//       t = px per tile, ang = small lean, detail ∈ 0..1 (zoom), lit ∈ 0..~1.2 (chamber light)
//   furnish(role, rng, { w, h }) → placements [{ type, model, tx, ty, ang }] for a room of that role
//
// Billboard convention (same as the stalk): the fixture stands at its ground point and is drawn
// UPWARD on screen (toward −y). Zero imports / zero assets, self-contained for vendoring.

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const cl = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const hsl = (h, s, l, a) => `hsla(${h} ${cl(s, 0, 100)}% ${cl(l, 4, 96)}% / ${a == null ? 1 : a})`;
const lerp = (a, b, t) => a + (b - a) * t;

// material palettes (hsl base) the fixtures draw from — earthy, low-sat, lamplit ship interior.
const MAT = {
  wood:   { h: 28, s: 34, l: 40 }, dark: { h: 24, s: 28, l: 26 }, pale: { h: 36, s: 26, l: 58 },
  stone:  { h: 210, s: 7, l: 44 }, iron: { h: 212, s: 7, l: 36 }, brass: { h: 42, s: 50, l: 50 },
  hide:   { h: 32, s: 26, l: 46 }, ember: { h: 22, s: 92, l: 56 }, cloth: { h: 350, s: 30, l: 48 },
};
const jcol = (rng, base, dh = 8, dl = 8) => ({ h: base.h + (rng() - 0.5) * dh, s: base.s + (rng() - 0.5) * 6, l: base.l + (rng() - 0.5) * dl });

// ── shared draw helpers (operate in TILE units; caller has translated to ground point + scaled) ──
function box(ctx, x, y, w, h, col, lit, lw) { ctx.fillStyle = hsl(col.h, col.s, col.l * lit); ctx.fillRect(x, y, w, h); ctx.strokeStyle = hsl(MAT.dark.h, MAT.dark.s, MAT.dark.l * lit * 0.8); ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h); }
function poly(ctx, pts, col, lit, lw) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = hsl(col.h, col.s, col.l * lit); ctx.fill(); if (lw) { ctx.strokeStyle = hsl(MAT.dark.h, MAT.dark.s, MAT.dark.l * lit * 0.8); ctx.lineWidth = lw; ctx.stroke(); } }
function disc(ctx, cx, cy, r, col, lit) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = hsl(col.h, col.s, col.l * lit); ctx.fill(); }
function glow(ctx, cx, cy, r, hue) { for (let i = 3; i >= 1; i--) { ctx.beginPath(); ctx.arc(cx, cy, r * i / 1.6, 0, Math.PI * 2); ctx.fillStyle = hsl(hue, 95, 58, 0.14 + (3 - i) * 0.05); ctx.fill(); } }
function contact(ctx, w, lit) { ctx.beginPath(); ctx.ellipse(0, 0, w, w * 0.34, 0, 0, Math.PI * 2); ctx.fillStyle = `rgba(0,0,0,${0.22 * lit})`; ctx.fill(); }   // soft ground ellipse

// ── THE FIXTURE LIBRARY — each: model(rng) → tile-unit genome; draw(ctx, m, lit, detail) upward ──
// draw works in tile units with the ground point at (0,0) and "up" = −y. lw ≈ 0.03 tiles.
const LW = 0.035;
export const FIXTURES = {
  hearth: {                                                   // a stone hearth, embers aglow (dwell/serve)
    model: (r) => ({ w: lerp(0.9, 1.4, r()), h: lerp(0.5, 0.75, r()), col: jcol(r, MAT.stone), grainSeed: (r() * 1e9) >>> 0, fire: r() > 0.2 }),
    draw(ctx, m, lit, d) { const w = m.w, h = m.h; contact(ctx, w * 0.6, lit);
      poly(ctx, [[-w / 2, 0], [w / 2, 0], [w * 0.42, -h], [-w * 0.42, -h]], m.col, lit, LW);          // trapezoid block
      box(ctx, -w * 0.34, -h, w * 0.68, h * 0.34, MAT.dark, lit, LW);                                  // dark mouth
      if (m.fire) { glow(ctx, 0, -h * 0.5, w * 0.3, MAT.ember.h); const rng = mulberry32(m.grainSeed); const n = 2 + Math.round(d * 3); for (let i = 0; i < n; i++) disc(ctx, (rng() - 0.5) * w * 0.4, -h * 0.5 - rng() * h * 0.2, w * 0.04, MAT.ember, 1.2); } },
  },
  brazier: {                                                  // a fire-bowl on a tripod (worship/light)
    model: (r) => ({ r: lerp(0.22, 0.34, r()), legH: lerp(0.5, 0.8, r()), col: jcol(r, MAT.iron), grainSeed: (r() * 1e9) >>> 0 }),
    draw(ctx, m, lit, d) { const R = m.r, H = m.legH; contact(ctx, R * 1.4, lit);
      ctx.strokeStyle = hsl(m.col.h, m.col.s, m.col.l * lit); ctx.lineWidth = LW * 2;
      for (const sx of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(sx * R * 0.7, 0); ctx.lineTo(0, -H + R * 0.4); ctx.stroke(); }
      poly(ctx, [[-R, -H], [R, -H], [R * 0.7, -H + R * 0.5], [-R * 0.7, -H + R * 0.5]], m.col, lit, LW);  // bowl
      glow(ctx, 0, -H - R * 0.1, R * 0.9, MAT.ember.h);
      const rng = mulberry32(m.grainSeed); const n = 2 + Math.round(d * 4); for (let i = 0; i < n; i++) disc(ctx, (rng() - 0.5) * R, -H - rng() * R * 0.8, R * 0.18, MAT.ember, 1.2); },
  },
  anvil: {                                                    // forge anvil on a stump (make/craft)
    model: (r) => ({ w: lerp(0.7, 0.95, r()), col: jcol(r, MAT.iron), stump: jcol(r, MAT.wood), grainSeed: (r() * 1e9) >>> 0 }),
    draw(ctx, m, lit) { const w = m.w; contact(ctx, w * 0.6, lit);
      box(ctx, -w * 0.28, -0.42, w * 0.56, 0.42, m.stump, lit, LW);                                     // stump
      poly(ctx, [[-w * 0.5, -0.42], [w * 0.5, -0.42], [w * 0.34, -0.56], [-w * 0.34, -0.56]], m.col, lit, LW);  // body
      poly(ctx, [[w * 0.18, -0.56], [w * 0.62, -0.62], [w * 0.5, -0.7], [w * 0.18, -0.68]], m.col, lit, LW);    // horn
      box(ctx, -w * 0.34, -0.72, w * 0.6, 0.07, m.col, lit, LW); },                                     // face
  },
  furnace: {                                                  // a glowing forge furnace (make/light)
    model: (r) => ({ w: lerp(0.8, 1.1, r()), h: lerp(0.9, 1.3, r()), col: jcol(r, MAT.stone), grainSeed: (r() * 1e9) >>> 0 }),
    draw(ctx, m, lit, d) { const w = m.w, h = m.h; contact(ctx, w * 0.55, lit);
      poly(ctx, [[-w / 2, 0], [w / 2, 0], [w * 0.36, -h], [-w * 0.36, -h]], m.col, lit, LW);
      glow(ctx, 0, -h * 0.38, w * 0.26, MAT.ember.h);
      ctx.beginPath(); ctx.arc(0, -h * 0.38, w * 0.2, 0, Math.PI * 2); ctx.fillStyle = hsl(MAT.ember.h, 95, 56, 0.92); ctx.fill();   // mouth
      box(ctx, -w * 0.08, -h - 0.18, w * 0.16, 0.2, MAT.dark, lit, LW); },                              // flue
  },
  barrel: {                                                   // a staved barrel (store/trade/serve)
    model: (r) => ({ w: lerp(0.4, 0.6, r()), h: lerp(0.55, 0.85, r()), col: jcol(r, MAT.wood), grainSeed: (r() * 1e9) >>> 0 }),
    draw(ctx, m, lit, d) { const w = m.w, h = m.h; contact(ctx, w * 0.6, lit);
      poly(ctx, [[-w * 0.42, 0], [w * 0.42, 0], [w * 0.5, -h * 0.5], [w * 0.42, -h], [-w * 0.42, -h], [-w * 0.5, -h * 0.5]], m.col, lit, LW);
      ctx.strokeStyle = hsl(MAT.dark.h, MAT.dark.s, MAT.dark.l * lit); ctx.lineWidth = LW * 1.4;
      for (const yy of [-h * 0.22, -h * 0.78]) { ctx.beginPath(); ctx.moveTo(-w * 0.48, yy); ctx.lineTo(w * 0.48, yy); ctx.stroke(); }
      const n = 1 + Math.round(d * 3); ctx.strokeStyle = hsl(m.col.h, m.col.s, (m.col.l - 12) * lit); ctx.lineWidth = LW * 0.7;
      for (let i = 1; i <= n; i++) { const x = -w * 0.42 + (w * 0.84) * i / (n + 1); ctx.beginPath(); ctx.moveTo(x, -h * 0.06); ctx.lineTo(x, -h * 0.94); ctx.stroke(); } },   // staves
  },
  crate: {                                                    // a wooden crate, plank-faced (store/trade)
    model: (r) => ({ w: lerp(0.5, 0.8, r()), h: lerp(0.45, 0.7, r()), col: jcol(r, MAT.wood), grainSeed: (r() * 1e9) >>> 0, stack: r() > 0.6 }),
    draw(ctx, m, lit, d) { const w = m.w, h = m.h;
      const one = (yb, ww, hh) => { box(ctx, -ww / 2, yb - hh, ww, hh, m.col, lit, LW);
        ctx.strokeStyle = hsl(MAT.dark.h, MAT.dark.s, MAT.dark.l * lit * 0.7); ctx.lineWidth = LW * 0.7;
        ctx.beginPath(); ctx.moveTo(-ww / 2, yb - hh); ctx.lineTo(ww / 2, yb); ctx.moveTo(ww / 2, yb - hh); ctx.lineTo(-ww / 2, yb); ctx.stroke(); };
      contact(ctx, w * 0.6, lit); one(0, w, h); if (m.stack) one(-h, w * 0.7, h * 0.8); },
  },
  shelf: {                                                    // shelving stocked with goods (store/learn/dwell)
    model: (r) => ({ w: lerp(0.7, 1.1, r()), h: lerp(0.9, 1.3, r()), col: jcol(r, MAT.wood), grainSeed: (r() * 1e9) >>> 0, tiers: 2 + Math.floor(r() * 2) }),
    draw(ctx, m, lit, d) { const w = m.w, h = m.h, rng = mulberry32(m.grainSeed); contact(ctx, w * 0.5, lit);
      box(ctx, -w / 2, -h, w, h, { ...m.col, l: m.col.l - 8 }, lit, LW);
      for (let k = 1; k <= m.tiers; k++) { const yy = -h * k / (m.tiers + 1); box(ctx, -w / 2, yy, w, LW * 1.5, MAT.dark, lit, 0);
        if (d > 0.3) { let x = -w * 0.42; while (x < w * 0.38) { const bw = 0.05 + rng() * 0.09, bh = 0.1 + rng() * 0.12; box(ctx, x, yy - bh, bw, bh, jcol(rng, rng() > 0.5 ? MAT.pale : MAT.cloth, 40, 14), lit, LW * 0.6); x += bw + 0.03; } } } },
  },
  loom: {                                                     // an upright loom, warp threads (make/fiber)
    model: (r) => ({ w: lerp(0.7, 1.0, r()), h: lerp(1.0, 1.4, r()), col: jcol(r, MAT.wood), cloth: jcol(r, MAT.cloth, 80, 16), grainSeed: (r() * 1e9) >>> 0 }),
    draw(ctx, m, lit, d) { const w = m.w, h = m.h; contact(ctx, w * 0.5, lit);
      box(ctx, -w / 2, -h, LW * 2.4, h, m.col, lit, LW); box(ctx, w / 2 - LW * 2.4, -h, LW * 2.4, h, m.col, lit, LW);   // posts
      box(ctx, -w / 2, -h, w, LW * 2.4, m.col, lit, LW);                                                  // top beam
      const n = 4 + Math.round(d * 8); ctx.strokeStyle = hsl(MAT.pale.h, MAT.pale.s, MAT.pale.l * lit, 0.8); ctx.lineWidth = LW * 0.5;
      for (let i = 0; i <= n; i++) { const x = -w * 0.42 + (w * 0.84) * i / n; ctx.beginPath(); ctx.moveTo(x, -h + LW * 2.4); ctx.lineTo(x, -h * 0.42); ctx.stroke(); }
      box(ctx, -w * 0.44, -h * 0.42, w * 0.88, h * 0.42, m.cloth, lit, LW); },                            // woven cloth
  },
  altar: {                                                    // a stone altar with a cloth runner (worship)
    model: (r) => ({ w: lerp(0.8, 1.2, r()), h: lerp(0.55, 0.75, r()), col: jcol(r, MAT.stone), cloth: jcol(r, MAT.cloth, 120, 14), grainSeed: (r() * 1e9) >>> 0 }),
    draw(ctx, m, lit, d) { const w = m.w, h = m.h; contact(ctx, w * 0.6, lit);
      box(ctx, -w / 2, -h, w, h, m.col, lit, LW);
      box(ctx, -w * 0.42, -h - 0.06, w * 0.84, 0.1, m.cloth, lit, LW);                                    // runner
      if (d > 0.4) { const rng = mulberry32(m.grainSeed); for (const sx of [-0.3, 0.3]) { box(ctx, sx * w - LW, -h - 0.34, LW * 2, 0.28, MAT.pale, lit, 0); glow(ctx, sx * w, -h - 0.34, 0.08, 48); } } },  // candles
  },
  lectern: {                                                  // a slanted reading stand (learn/govern)
    model: (r) => ({ h: lerp(0.85, 1.1, r()), col: jcol(r, MAT.wood), grainSeed: (r() * 1e9) >>> 0 }),
    draw(ctx, m, lit) { const h = m.h; contact(ctx, 0.3, lit);
      box(ctx, -LW * 1.6, -h * 0.7, LW * 3.2, h * 0.7, m.col, lit, LW);                                   // post
      disc(ctx, 0, 0, 0.18, { ...m.col, l: m.col.l - 6 }, lit);                                           // foot
      ctx.save(); ctx.translate(0, -h * 0.7); ctx.rotate(-0.5);
      box(ctx, -0.24, -0.04, 0.48, 0.34, m.col, lit, LW); box(ctx, -0.2, -0.02, 0.4, 0.04, MAT.pale, lit, 0); ctx.restore(); },  // slanted top + page
  },
  cot: {                                                      // a low pallet/cot (heal/dwell)
    model: (r) => ({ w: lerp(0.9, 1.2, r()), col: jcol(r, MAT.wood), sheet: jcol(r, MAT.pale, 20, 10), grainSeed: (r() * 1e9) >>> 0 }),
    draw(ctx, m, lit) { const w = m.w; contact(ctx, w * 0.55, lit);
      box(ctx, -w / 2, -0.26, w, 0.26, m.col, lit, LW);
      box(ctx, -w / 2 + LW, -0.34, w - LW * 2, 0.1, m.sheet, lit, LW * 0.6);
      disc(ctx, -w * 0.36, -0.4, 0.1, m.sheet, lit); },                                                   // pillow
  },
  planter: {                                                  // a trough with sprigs (grow/dwell)
    model: (r) => ({ w: lerp(0.55, 0.85, r()), col: jcol(r, MAT.wood), leaf: jcol(r, { h: 96, s: 38, l: 40 }, 20, 12), grainSeed: (r() * 1e9) >>> 0 }),
    draw(ctx, m, lit, d) { const w = m.w; contact(ctx, w * 0.6, lit);
      poly(ctx, [[-w / 2, 0], [w / 2, 0], [w * 0.42, -0.28], [-w * 0.42, -0.28]], m.col, lit, LW);
      const rng = mulberry32(m.grainSeed); const n = 2 + Math.round(d * 4);
      ctx.lineCap = 'round'; ctx.strokeStyle = hsl(m.leaf.h, m.leaf.s, m.leaf.l * lit); ctx.lineWidth = LW * 1.4;
      for (let i = 0; i < n; i++) { const x = (rng() - 0.5) * w * 0.7, hh = 0.2 + rng() * 0.4; ctx.beginPath(); ctx.moveTo(x, -0.24); ctx.quadraticCurveTo(x + (rng() - 0.5) * 0.2, -0.24 - hh * 0.6, x + (rng() - 0.5) * 0.3, -0.24 - hh); ctx.stroke(); } },
  },
  stool: {                                                    // a humble stool/bench (dwell/serve/play)
    model: (r) => ({ w: lerp(0.35, 0.6, r()), h: lerp(0.3, 0.5, r()), col: jcol(r, MAT.wood), grainSeed: (r() * 1e9) >>> 0 }),
    draw(ctx, m, lit) { const w = m.w, h = m.h; contact(ctx, w * 0.55, lit);
      ctx.strokeStyle = hsl(m.col.h, m.col.s, (m.col.l - 8) * lit); ctx.lineWidth = LW * 1.6;
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * w * 0.4, 0); ctx.lineTo(sx * w * 0.3, -h); ctx.stroke(); }
      box(ctx, -w / 2, -h - 0.06, w, 0.1, m.col, lit, LW); },                                             // seat
  },
  banner: {                                                   // a hanging standard/cloth (govern/worship/trade)
    model: (r) => ({ h: lerp(1.0, 1.5, r()), w: lerp(0.3, 0.5, r()), col: jcol(r, MAT.cloth, 200, 16), pole: jcol(r, MAT.dark), grainSeed: (r() * 1e9) >>> 0 }),
    draw(ctx, m, lit, d) { const h = m.h, w = m.w; contact(ctx, 0.18, lit);
      box(ctx, -LW, -h, LW * 2, h, m.pole, lit, LW);                                                      // pole
      poly(ctx, [[0, -h], [w, -h], [w, -h * 0.32], [w * 0.5, -h * 0.42], [0, -h * 0.32]], m.col, lit, LW);// pennon
      if (d > 0.4) { ctx.strokeStyle = hsl(m.col.h, m.col.s, (m.col.l + 18) * lit, 0.7); ctx.lineWidth = LW * 0.7; ctx.beginPath(); ctx.arc(w * 0.5, -h * 0.66, w * 0.18, 0, Math.PI * 2); ctx.stroke(); } },  // emblem
  },
};
export const FIXTURE_TYPES = Object.keys(FIXTURES);

export function fixtureModel(type, rng) { const f = FIXTURES[type]; return f ? f.model(rng) : null; }

// drawFixture — dispatch + frame setup (translate to ground point, scale to tile px, lean, light).
export function drawFixture(ctx, fx, { x = 0, y = 0, t = 32, ang = 0, detail = 1, lit = 1 } = {}) {
  const f = FIXTURES[fx.type]; if (!f) return;
  ctx.save(); ctx.translate(x, y); if (ang) ctx.rotate(ang); ctx.scale(t, t);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  f.draw(ctx, fx.model, cl(lit, 0.2, 1.25), cl(detail, 0, 1));
  ctx.restore();
}

// ── TIED TO PLACE — which fixtures furnish a chamber of a given civic role (weighted), + density ──
// keyed to the same 13 civic verbs the item engine's bindings.js uses, so a chamber's role drives
// both its loot (items) and its furniture (fixtures).
export const FURNISH = {
  dwell:   { types: [['hearth', 3], ['stool', 4], ['shelf', 2], ['cot', 2], ['planter', 1]], density: 0.10 },
  grow:    { types: [['planter', 5], ['barrel', 1]], density: 0.16 },
  make:    { types: [['anvil', 3], ['furnace', 2], ['loom', 2], ['barrel', 2], ['crate', 2]], density: 0.12 },
  mend:    { types: [['anvil', 2], ['shelf', 2], ['barrel', 2], ['stool', 2]], density: 0.11 },
  trade:   { types: [['crate', 4], ['barrel', 3], ['banner', 1]], density: 0.13 },
  serve:   { types: [['hearth', 2], ['stool', 4], ['barrel', 2]], density: 0.12 },
  play:    { types: [['stool', 3], ['banner', 2]], density: 0.08 },
  heal:    { types: [['cot', 4], ['shelf', 2], ['planter', 1]], density: 0.11 },
  learn:   { types: [['lectern', 2], ['shelf', 4], ['stool', 2]], density: 0.11 },
  worship: { types: [['altar', 2], ['brazier', 3], ['banner', 2]], density: 0.08 },
  govern:  { types: [['lectern', 2], ['banner', 3], ['stool', 2]], density: 0.08 },
  move:    { types: [['crate', 3], ['barrel', 2]], density: 0.10 },
  store:   { types: [['crate', 5], ['barrel', 4], ['shelf', 2]], density: 0.18 },
};
const wpick = (rng, entries) => { let tot = 0; for (const e of entries) tot += e[1]; let r = rng() * tot; for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; } return entries[0][0]; };

// furnish(role, rng, {w,h}) → placements for a room of `role`, scattered, deterministic from rng.
export function furnish(role, rng, { w = 6, h = 6 } = {}) {
  const F = FURNISH[role] || FURNISH.dwell;
  const n = Math.max(1, Math.round(w * h * F.density));
  const out = [];
  for (let i = 0; i < n; i++) {
    const type = wpick(rng, F.types);
    out.push({ type, model: fixtureModel(type, rng), tx: 0.6 + rng() * (w - 1.2), ty: 0.6 + rng() * (h - 1.2), ang: (rng() - 0.5) * 0.12 });
  }
  // draw back-to-front so nearer fixtures overlap farther ones
  out.sort((a, b) => a.ty - b.ty);
  return out;
}

const FIX = { FIXTURES, FIXTURE_TYPES, fixtureModel, drawFixture, FURNISH, furnish };
if (typeof globalThis !== 'undefined') globalThis.FIX = FIX;
export default FIX;
