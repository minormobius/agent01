// render.js — Nocturne at one size: what both the page and the video draw.
//
// makeRenderer(W, H, dpr) → draw(ctx, t) paints second t into a W·dpr × H·dpr
// canvas. Layers, back to front:
//
//   sky        dusk to night over the first phrase; stars, a far skyline in
//              parallax, the moon rising through the middle section
//   buildings  one ink drawing per bar, each on its own canvas and its own
//              Painter, drawn by the pen in the beats before its bar begins
//   lights     every note's window, lit at its note: a flash, then a steady
//              glow. Out-of-key notes are cooler lamps.
//   quay       lamps (the bass notes under the city) and the river, where every
//              light is doubled as a trembling streak
//   paper      the tooth of the paper over all of it
//
// And at the end, the camera pulls back and the city folds into rows, like
// systems on a page: the lit windows are the whole score you just heard.

import { cues, BARS } from './score.js';
import { Painter, Wash, Ink, makeGrain, hash, rng, rgba, mixc, clamp, TAU, deform } from '../lib/paint.js';
import { buildCity, colX, beatAt } from './city.js';

const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const span = (t, a, b) => clamp((t - a) / (b - a));

const INK = [24, 22, 34];
const BODY = [92, 100, 138];      // moonlit slate: light enough for the ink to read on it
const PANE = [30, 32, 54];
const WARM = [255, 208, 128];
const COOL = [168, 212, 255];

function sprite(color, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, rgba(color, 0.9));
  g.addColorStop(0.25, rgba(color, 0.35));
  g.addColorStop(1, rgba(color, 0));
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

/** Unlit panes, laid a row at a time from the ground up. */
class Panes {
  constructor({ panes, t0, t1 }) { this.panes = panes; this.t0 = t0; this.t1 = t1; this.id = 0; }
  draw(ctx, from, to) {
    const a = Math.floor(from * this.panes.length), b = Math.floor(to * this.panes.length + 1e-9);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = a; i < b; i++) {
      const [x, y, w, h] = this.panes[i];
      ctx.fillStyle = rgba(PANE, 0.92);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(150,160,200,0.18)';
      ctx.fillRect(x, y, w, Math.max(0.6, h * 0.12));
    }
  }
}

export function makeRenderer(W, H, dpr) {
  const city = buildCity();
  const groundY = H * 0.7;
  const sy = (groundY - H * 0.07) / (city.tallest + 2);
  const sx = sy * 3;
  const nowX = W * 0.7;
  const warm = sprite(WARM), cool = sprite(COOL), moonGlow = sprite([230, 232, 255]);
  const grainTile = makeGrain(21);
  let grain = null;
  const r = rng(808);
  const stars = Array.from({ length: 220 }, () => ({ x: r(), y: Math.pow(r(), 1.3), s: 0.5 + r() * 1.4, k: r() * TAU, w: 0.5 + r() * 2 }));
  const far = Array.from({ length: 60 }, (_, i) => ({ w: 0.6 + r() * 1.6, h: 6 + r() * 26 + (i % 7 === 0 ? 14 : 0), g: r() * 0.4 }));
  const farW = far.reduce((a, b) => a + b.w + b.g, 0);

  // ---- the folded layout for the end: rows of bars, like systems on a page
  const barW = 4 * sx;
  const tallestPx = (city.tallest + 2) * sy;
  let fold = { rows: 1, per: BARS, f: 0 };
  for (let rows = 1; rows <= 10; rows++) {
    const per = Math.ceil(BARS / rows);
    const f = Math.min((W * 0.92) / (per * barW), (H * 0.86) / (rows * tallestPx * 1.08));
    if (f > fold.f) fold = { rows, per, f };
  }
  const foldAt = (b) => {
    const i = b.bar - 1, row = Math.floor(i / fold.per), col = i % fold.per;
    const rowH = tallestPx * fold.f * 1.08;
    const totalW = fold.per * barW * fold.f;
    const top = (H - fold.rows * rowH) / 2;
    return { ox: (W - totalW) / 2 + col * barW * fold.f, oy: top + (row + 1) * rowH, s: fold.f };
  };

  // ---- one Painter per building, made when first needed
  const PAD = 6;
  const painters = new Map();
  function painterFor(b) {
    if (painters.has(b.bar)) return painters.get(b.bar);
    const top = b.floors + b.extra + (b.roofKind === 'spire' ? 7 : b.roofKind === 'dome' ? 2 : 1);
    const wpx = (b.x1 - b.x0) * sx + PAD * 2;
    const hpx = top * sy + PAD * 2 + 2.2 * sy;   // room below for the lamp posts' feet
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(wpx * dpr); canvas.height = Math.ceil(hpx * dpr);
    const lx = (x) => PAD + (x - b.x0) * sx;
    const ly = (y) => hpx - PAD - 2.2 * sy - y * sy;
    const T = (f) => b.drawFrom + (b.drawTo - b.drawFrom) * f;
    const marks = [];
    const L = lx(b.x0), R = lx(b.x1), F = b.floors, E = b.floors + b.extra;
    const inset = (b.x1 - b.x0) * 0.16;
    // the silhouette, by roof
    let sil;
    if (b.roofKind === 'setback' || b.roofKind === 'spire' || b.roofKind === 'dome') {
      sil = [[L, ly(0)], [L, ly(F)], [lx(b.x0 + inset), ly(F)], [lx(b.x0 + inset), ly(E)], [lx(b.x1 - inset), ly(E)], [lx(b.x1 - inset), ly(F)], [R, ly(F)], [R, ly(0)]];
    } else if (b.roofKind === 'pitched') {
      sil = [[L, ly(0)], [L, ly(F)], [(L + R) / 2, ly(E)], [R, ly(F)], [R, ly(0)]];
    } else {
      sil = [[L, ly(0)], [L, ly(E)], [R, ly(E)], [R, ly(0)]];
    }
    const tone = mixc(BODY, [70, 56, 84], b.tone * 0.6);
    marks.push(new Wash({ poly: sil.map((p) => [p[0], p[1], 0.4]), color: tone, alpha: 0.085, layers: 16, spread: 0.012, t0: T(0.25), t1: T(0.7), op: 'source-over', id: 5000 + b.bar }));
    // the outline, in one travelling line
    const outline = [...sil, sil[0]];
    const pts = [];
    for (let i = 0; i < outline.length - 1; i++) {
      const [a0, a1] = outline[i], [b0, b1] = outline[i + 1];
      const n = Math.max(2, Math.round(Math.hypot(b0 - a0, b1 - a1) / 6));
      for (let k = 0; k < n; k++) pts.push([a0 + ((b0 - a0) * k) / n + (hash(b.bar, i, k) - 0.5) * 0.8, a1 + ((b1 - a1) * k) / n, 0.8 + hash(b.bar, k, i) * 0.4]);
    }
    marks.push(new Ink({ pts, width: 1.5, color: INK, alpha: 0.92, bleed: 0.08, t0: T(0), t1: T(0.4), id: 6000 + b.bar }));
    // roof furniture
    const cx = (L + R) / 2;
    if (b.roofKind === 'tank') {
      const tx = lx(b.x0 + (b.x1 - b.x0) * (0.25 + hash(b.bar, 9) * 0.4)), tw = sx * 0.7, th = sy * 2.2, base = ly(E);
      marks.push(new Ink({ pts: [[tx, base, 1], [tx + tw * 0.1, base - sy * 1.1, 1], [tx + tw * 0.9, base - sy * 1.1, 1], [tx + tw, base, 1]], width: 0.9, t0: T(0.4), t1: T(0.5), id: 6100 + b.bar }));
      marks.push(new Wash({ poly: [[tx, base - sy * 1.1, 1], [tx + tw, base - sy * 1.1, 1], [tx + tw, base - sy * 1.1 - th, 1], [tx + tw / 2, base - sy * 1.4 - th, 1], [tx, base - sy * 1.1 - th, 1]], color: [60, 48, 52], alpha: 0.2, layers: 8, spread: 0.02, t0: T(0.45), t1: T(0.6), op: 'source-over', id: 6200 + b.bar }));
    } else if (b.roofKind === 'spire') {
      marks.push(new Ink({ pts: [[cx, ly(E), 1], [cx, ly(E + 7), 0.4]], width: 1.4, t0: T(0.4), t1: T(0.55), id: 6300 + b.bar }));
      marks.push(new Wash({ poly: [[cx - sx * 0.3, ly(E), 1], [cx + sx * 0.3, ly(E), 1], [cx, ly(E + 5), 1]], color: tone, alpha: 0.3, layers: 6, spread: 0.02, t0: T(0.45), t1: T(0.6), op: 'source-over', id: 6400 + b.bar }));
    } else if (b.roofKind === 'dome') {
      const rr = (R - L - 2 * inset * sx) / 2, dp = [];
      for (let k = 0; k <= 16; k++) { const a = Math.PI + (k / 16) * Math.PI; dp.push([cx + Math.cos(a) * rr, ly(E) + Math.sin(a) * Math.min(rr, sy * 2), 1]); }
      marks.push(new Wash({ poly: dp, color: [70, 84, 96], alpha: 0.2, layers: 8, spread: 0.02, t0: T(0.4), t1: T(0.55), op: 'source-over', id: 6500 + b.bar }));
      marks.push(new Ink({ pts: dp, width: 0.9, t0: T(0.4), t1: T(0.55), id: 6600 + b.bar }));
    }
    // antenna, now and then
    if (hash(b.bar, 44) < 0.35 && b.roofKind !== 'spire') {
      const ax = lx(b.x0 + (b.x1 - b.x0) * (0.3 + hash(b.bar, 45) * 0.4)), ay = b.roofKind === 'pitched' ? ly(E) : ly(E);
      marks.push(new Ink({ pts: [[ax, ay, 1], [ax, ay - sy * 3, 0.5]], width: 0.7, t0: T(0.5), t1: T(0.6), id: 6700 + b.bar }));
    }
    // hatching down the shadow side
    const hatch = [];
    for (let k = 0; k < Math.floor(F / 2); k++) {
      const y0 = ly(k * 2), x0 = R - sx * 0.35;
      hatch.push(new Ink({ pts: [[x0, y0, 0.6], [R - 1, y0 - sy * 1.2, 0.6]], width: 0.7, color: INK, alpha: 0.55, bleed: 0, t0: T(0.55 + (k / F) * 0.3), t1: T(0.6 + (k / F) * 0.3), id: 7000 + b.bar * 100 + k }));
    }
    marks.push(...hatch);
    // the window panes, all of them, unlit
    const panes = [];
    const topRow = b.roofKind === 'pitched' ? F : E;
    for (let f = 0; f < topRow; f++) {
      for (let c = 0; c < 8; c++) {
        const x = colX(b, c);
        if (f >= F && (b.roofKind === 'setback' || b.roofKind === 'spire' || b.roofKind === 'dome') && (x < b.x0 + inset || x > b.x1 - inset)) continue;
        panes.push([lx(x) - sx * 0.14, ly(f + 0.5) - sy * 0.28, sx * 0.28, sy * 0.52]);
      }
    }
    marks.push(new Panes({ panes, t0: T(0.35), t1: T(1) }));
    // lamp posts on the quay in front of this bar
    const posts = new Set(city.lamps.filter((l) => l.bar === b.bar).map((l) => Math.round(l.x * 4) / 4));
    for (const x of posts) {
      const px = lx(x);
      marks.push(new Ink({ pts: [[px, ly(-1.9), 1], [px, ly(1.4), 0.8], [px + sx * 0.06, ly(1.6), 0.6]], width: 1, t0: T(0.6), t1: T(0.8), id: 8000 + Math.round(x * 4) }));
    }
    const p = new Painter(canvas, null, dpr, null);
    p.setMarks(marks);
    const entry = { canvas, painter: p, wpx, hpx, lx, ly, baseY: hpx - PAD - 2.2 * sy };
    painters.set(b.bar, entry);
    return entry;
  }

  const brightness = (t, at, k) => {
    if (t < at) return 0;
    const d = t - at;
    return 0.62 + 0.38 * Math.exp(-d / 0.3) + 0.05 * Math.sin(t * (1.3 + k * 0.7) + k * 10);
  };

  function draw(ctx, t) {
    const night = ease(span(t, 0, cues.melody + 26));
    const rk = ease(span(t, cues.last + 0.6, cues.last + 7.5));        // the reveal
    const camX = Math.min(beatAt(Math.min(t, cues.last + 0.6)), BARS * 4);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // ---- sky
    const top = mixc([92, 96, 150], [12, 16, 38], night);
    const mid = mixc([200, 146, 160], [30, 34, 70], night);
    const low = mixc([246, 196, 150], [60, 58, 100], night);
    const g = ctx.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, rgba(top)); g.addColorStop(0.62, rgba(mid)); g.addColorStop(1, rgba(low));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      const a = night * (0.35 + 0.65 * Math.sin(t * s.w + s.k) ** 2) * (1 - s.y * 0.7);
      if (a < 0.02) continue;
      ctx.fillStyle = `rgba(236,236,255,${a})`;
      ctx.fillRect(s.x * W, s.y * groundY * 0.8, s.s, s.s);
    }
    // the moon
    const mu = ease(span(t, cues.melody + 16, cues.summit));
    if (mu > 0) {
      const mx = W * (0.84 - 0.1 * mu), my = groundY - (groundY - H * 0.13) * mu, mr = Math.min(W, H) * 0.035;
      ctx.globalAlpha = Math.min(1, mu * 3) * (1 - rk * 0.4);
      ctx.drawImage(moonGlow, mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
      ctx.fillStyle = '#f2f0e6';
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(180,176,196,0.35)';
      ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.1, mr * 0.28, 0, TAU); ctx.arc(mx + mr * 0.25, my + mr * 0.35, mr * 0.18, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // far skyline, in parallax
    ctx.globalAlpha = 1 - rk;
    ctx.fillStyle = rgba(mixc(mid, [90, 96, 140], 0.5), 0.55);
    const unit = sy * 1.4;
    let fx = -((camX * sx * 0.3) % (farW * unit)) - farW * unit;
    for (let rep = 0; rep < 3 + Math.ceil(W / (farW * unit)); rep++) {
      for (const f of far) {
        ctx.fillRect(fx, groundY - f.h * unit * 0.45, f.w * unit, f.h * unit * 0.45 + 2);
        fx += (f.w + f.g) * unit;
      }
    }
    ctx.globalAlpha = 1;

    // ---- the river and the quay (fade out as the city folds)
    if (rk < 1) {
      ctx.globalAlpha = 1 - rk;
      const wg = ctx.createLinearGradient(0, groundY, 0, H);
      wg.addColorStop(0, rgba(mixc([80, 70, 100], [18, 20, 40], night)));
      wg.addColorStop(1, rgba(mixc([60, 50, 80], [8, 10, 24], night)));
      ctx.fillStyle = wg;
      ctx.fillRect(0, groundY, W, H - groundY);
      ctx.strokeStyle = 'rgba(200,200,230,0.06)';
      ctx.lineWidth = 1;
      for (let k = 0; k < 18; k++) {
        const y = groundY + 6 + ((k * 37) % (H - groundY - 8));
        const x = ((k * 173 - camX * sx * 0.8) % W + W) % W;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30 + (k % 5) * 12, y); ctx.stroke();
      }
      ctx.fillStyle = rgba(INK, 0.85);
      ctx.fillRect(0, groundY - 1, W, 2.5);
      ctx.globalAlpha = 1;
    }

    // ---- buildings, lights, lamps
    const reflections = [];
    for (const b of city.buildings) {
      if (t < b.drawFrom) continue;
      const pan = { ox: nowX + (b.x0 - camX) * sx, oy: groundY, s: 1 };
      const place = rk > 0 ? (() => { const f = foldAt(b); return { ox: pan.ox + (f.ox - pan.ox) * rk, oy: pan.oy + (f.oy - pan.oy) * rk, s: 1 + (f.s - 1) * rk }; })() : pan;
      const wpxS = (b.x1 - b.x0 + 0.5) * sx * place.s;
      if (place.ox + wpxS < -20 || place.ox - 20 > W) continue;
      const P = painterFor(b);
      P.painter.advance(t);
      const s = place.s;
      ctx.drawImage(P.canvas, place.ox - PAD * s, place.oy - P.baseY * s, P.wpx * s, P.hpx * s);
      // lit windows
      for (const w of b.windows) {
        const br = brightness(t, w.at, w.col + w.floor);
        if (br <= 0) continue;
        const x = place.ox + (colX(b, w.col) - b.x0) * sx * s, y = place.oy - (w.floor + 0.5) * sy * s;
        const pw = sx * 0.28 * s, ph = sy * 0.52 * s;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = rgba(w.cool ? COOL : WARM, Math.min(1, br + 0.1));
        ctx.fillRect(x - pw / 2, y - ph / 2, pw, ph);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = br * 0.5;
        const gr = sy * 2.2 * s * (1 + 0.8 * Math.exp(-(t - w.at) / 0.3));
        ctx.drawImage(w.cool ? cool : warm, x - gr, y - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
        if (rk < 1) reflections.push([x, y, br, w.cool]);
      }
      ctx.globalCompositeOperation = 'source-over';
      // lamps in front of this bar
      for (const l of city.lamps) {
        if (l.bar !== b.bar || t < l.at) continue;
        const br = brightness(t, l.at, l.x * 3);
        const x = place.ox + (Math.round(l.x * 4) / 4 - b.x0) * sx * s, y = place.oy - 1.6 * sy * s;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = br * 0.7;
        const gr = sy * (l.deep ? 3.4 : 2.6) * s;
        ctx.drawImage(warm, x - gr, y - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        if (rk < 1) reflections.push([x, y, br * 1.3, false]);
      }
    }

    // ---- reflections in the river: every light doubled, trembling
    if (rk < 1 && reflections.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const [x, y, br, isCool] of reflections) {
        const d = groundY - y;
        const ry = groundY + d * 0.55;
        if (ry > H + 10) continue;
        // short horizontal glints, broken by the water: a reflection, not a smear
        const gh = Math.max(1.5, sy * 0.35);
        for (let k = 0; k < 3; k++) {
          const yy = ry + (k - 1) * gh * 2.2;
          const wob = Math.sin(t * 1.7 + yy * 0.15 + x * 0.05) * sx * 0.12;
          ctx.globalAlpha = br * 0.3 * (1 - rk) * (1 - k * 0.25);
          ctx.drawImage(isCool ? cool : warm, x - sx * 0.45 + wob, yy - gh, sx * 0.9, gh * 2);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // ---- the paper's tooth
    grain ??= ctx.createPattern(grainTile, 'repeat');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, W * dpr, H * dpr);
    ctx.restore();
  }

  return { draw };
}
