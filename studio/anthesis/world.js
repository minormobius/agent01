// world.js — everything that is not the plant: the day, the sky, the soil, the rain.
//
// The camera is a timelapse. Days go by fast while the plant is small and slow
// right down once the bud forms, so the bloom happens in one long morning and
// the last chord rings into a sunset. That schedule is solved from the score's
// cues, not written in seconds, so it follows the music if the music changes.

import { clamp, lerp, span, ease, mix, rgba, cyclic, mulberry32 } from './util.js';

// ------------------------------------------------------------------ the day --

const FAST = 1 / 6.2;            // days per second while the plant is young

/** Day phase over time: 0 midnight, .25 sunrise, .5 noon, .75 sunset. */
export function makeClock(cues) {
  const BLOOM_AT = 0.40;         // mid-morning when the petals open
  const END_AT = 0.765;          // just past sunset when the room goes quiet
  const slow = (END_AT - BLOOM_AT) / (cues.end - cues.bloom);
  const a = cues.bud - 7, b = cues.bud + 5;
  const rate = (t) => lerp(FAST, slow, ease(span(t, a, b)));
  const dt = 1 / 40;
  const n = Math.ceil((cues.end + 30) / dt) + 1;
  const acc = new Float64Array(n);
  for (let i = 1; i < n; i++) acc[i] = acc[i - 1] + rate((i - 0.5) * dt) * dt;
  const at = (t) => {
    const x = clamp(t / dt, 0, n - 1.001);
    const i = Math.floor(x);
    return acc[i] + (acc[i + 1] - acc[i]) * (x - i);
  };
  const offset = BLOOM_AT - at(cues.bloom);
  return (t) => at(Math.max(0, t)) + offset;
}

/** What the light is doing at a given phase. */
export function lightAt(phase) {
  const f = ((phase % 1) + 1) % 1;
  const elev = Math.sin(2 * Math.PI * (f - 0.25));              // 1 at noon, -1 at midnight
  const light = ease(span(elev, -0.14, 0.38));
  const warm = Math.exp(-(((elev - 0.04) / 0.2) ** 2));          // strongest just above the horizon
  const sunX = -Math.cos(2 * Math.PI * (f - 0.25));            // -1 east (left) .. 1 west (right)
  return { phase, f, elev, light, warm, sunX };
}

// ------------------------------------------------------------------ the sky --

const SKY_TOP = [
  [0.0, [9, 13, 32]], [0.21, [22, 28, 62]], [0.265, [72, 86, 140]], [0.34, [96, 150, 206]],
  [0.5, [88, 146, 206]], [0.68, [98, 136, 196]], [0.74, [72, 66, 124]], [0.8, [26, 28, 64]],
];
const SKY_LOW = [
  [0.0, [20, 26, 54]], [0.21, [44, 46, 86]], [0.255, [236, 150, 120]], [0.3, [246, 206, 170]],
  [0.36, [200, 226, 240]], [0.5, [206, 230, 242]], [0.66, [236, 222, 196]], [0.735, [244, 136, 90]],
  [0.77, [150, 84, 112]], [0.81, [40, 40, 80]],
];

export function drawSky(p, W, gy, env) {
  const ctx = p.drawingContext;
  const top = cyclic(SKY_TOP, env.f);
  const low = cyclic(SKY_LOW, env.f);
  const g = ctx.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, rgba(top));
  g.addColorStop(0.72, rgba(mix(top, low, 0.55)));
  g.addColorStop(1, rgba(low));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, gy + 2);
  return { top, low };
}

export function makeStars(seed = 7) {
  const r = mulberry32(seed);
  return Array.from({ length: 170 }, () => ({ x: r(), y: r() ** 1.4, s: 0.4 + r() * 1.3, k: r() * 6.28, w: 0.6 + r() * 2 }));
}

export function drawStars(p, W, gy, env, stars, t) {
  const night = 1 - ease(span(env.elev, -0.3, 0.02));
  if (night <= 0.01) return;
  const ctx = p.drawingContext;
  for (const s of stars) {
    const a = night * (0.45 + 0.55 * Math.sin(t * s.w + s.k) ** 2) * (1 - s.y * 0.6);
    ctx.fillStyle = `rgba(235,238,255,${a})`;
    ctx.fillRect(s.x * W, s.y * gy * 0.85, s.s, s.s);
  }
}

/** Sun and moon on opposite arcs over the ground line. */
export function drawLights(p, W, gy, env) {
  const ctx = p.drawingContext;
  const R = Math.min(W, gy * 2) * 0.5;
  const body = (ang, r, core, halo, a) => {
    // the arc peaks right of centre, so the midday sun is not parked behind the flower
    const x = W / 2 - Math.cos(ang) * W * 0.46 + Math.sin(ang) * W * 0.2;
    const y = gy - Math.sin(ang) * gy * 0.86;
    if (y > gy + r) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 7);
    g.addColorStop(0, rgba(halo, 0.34 * a));
    g.addColorStop(1, rgba(halo, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);
    ctx.fillStyle = rgba(core, a);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  const sunAng = 2 * Math.PI * (env.f - 0.25);
  const sunCore = mix([255, 244, 214], [255, 170, 110], env.warm);
  body(sunAng, R * 0.045, sunCore, mix([255, 236, 190], [255, 140, 80], env.warm), 1);
  const moonAng = sunAng + Math.PI;
  body(moonAng, R * 0.03, [232, 234, 246], [170, 180, 230], 0.9 * (1 - env.light));
}

/** Two far bands of hills, so the ground line is a horizon and not an edge. */
export function makeHills(seed = 11) {
  const r = mulberry32(seed);
  return [0, 1].map((layer) => {
    const k = Array.from({ length: 5 }, () => [0.8 + r() * 3, r() * 6.28, 0.3 + r() * 0.7]);
    return { layer, k };
  });
}

export function drawHills(p, W, H, gy, env, hills, sky) {
  const ctx = p.drawingContext;
  for (const h of hills) {
    const depth = h.layer === 0 ? 0.55 : 0.8;
    const base = h.layer === 0 ? [74, 92, 104] : [52, 70, 64];
    const c = mix(mix(sky.low, base, depth), [10, 14, 30], (1 - env.light) * 0.75);
    ctx.fillStyle = rgba(c);
    ctx.beginPath();
    ctx.moveTo(0, H);
    const amp = gy * (h.layer === 0 ? 0.075 : 0.045);
    for (let x = 0; x < W + 8; x += 8) {
      let y = 0;
      for (const [f, ph, a] of h.k) y += Math.sin((x / W) * f * 3.1 + ph) * a;
      ctx.lineTo(x, gy - amp * (1.1 + y * 0.35) - (h.layer === 0 ? gy * 0.02 : 0));
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }
}

// ----------------------------------------------------------------- the soil --

/** The cutaway: a glass-fronted slab of soil, rendered once per size. */
export function makeSoil(p, W, H, gy) {
  const g = p.createGraphics(W, H - gy + 4);
  g.pixelDensity(1);
  const ctx = g.drawingContext;
  const h = g.height;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#6b4a33');
  grad.addColorStop(0.08, '#5a3d2a');
  grad.addColorStop(1, '#2a1b13');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, h);
  const r = mulberry32(3);
  // grain: many small crumbs, lighter and darker than the ground they sit in
  const n = Math.floor((W * h) / 26);
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * h;
    const d = y / h;
    const light = r() < 0.5;
    const v = light ? 110 + r() * 60 : 25 + r() * 30;
    ctx.fillStyle = light
      ? `rgba(${v + 25},${v - 5},${v - 40},${0.18 + r() * 0.25 - d * 0.1})`
      : `rgba(${v},${v * 0.7},${v * 0.5},${0.3 + r() * 0.3})`;
    const s = 0.6 + r() * 1.8;
    ctx.fillRect(x, y, s, s);
  }
  // stones
  for (let i = 0; i < Math.floor(W / 28); i++) {
    const x = r() * W, y = 14 + r() * (h - 18), rx = 2 + r() ** 2 * 9, ry = rx * (0.5 + r() * 0.4);
    const tone = 80 + r() * 60;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(r() * 3);
    ctx.fillStyle = `rgb(${tone},${tone * 0.86},${tone * 0.72})`;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,245,225,0.18)';
    ctx.beginPath(); ctx.ellipse(-rx * 0.25, -ry * 0.3, rx * 0.5, ry * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // perlite
  for (let i = 0; i < Math.floor(W / 9); i++) {
    ctx.fillStyle = `rgba(238,234,222,${0.5 + r() * 0.4})`;
    const x = r() * W, y = r() * h, s = 1 + r() * 2.2;
    ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.8, r() * 3, 0, Math.PI * 2); ctx.fill();
  }
  // the glass: a cool sheen and a bright top edge
  const sheen = ctx.createLinearGradient(0, 0, W, 0);
  sheen.addColorStop(0, 'rgba(200,220,255,0.05)');
  sheen.addColorStop(0.18, 'rgba(200,220,255,0.0)');
  sheen.addColorStop(0.62, 'rgba(200,220,255,0.0)');
  sheen.addColorStop(0.7, 'rgba(210,228,255,0.07)');
  sheen.addColorStop(0.76, 'rgba(200,220,255,0.0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, h);
  return g;
}

/** The top of the soil: a little uneven, darker where it is wet. */
export function surfaceY(x) {
  return Math.sin(x * 23.1) * 0.0022 + Math.sin(x * 57.7 + 1.3) * 0.0012;
}

// ----------------------------------------------------------------- the rain --

const FALL = 0.5;                // seconds from the top of the sky to the soil

export function makeDrops(cues) {
  const r = mulberry32(21);
  return cues.drops.map((d, k) => ({
    at: d.at,
    // The early drops fall near the seed and water it; the last falls wide.
    x: k === cues.drops.length - 1 ? 0.2 : (r() - 0.5) * 0.11,
    k,
  }));
}

/** Drawn inside the world transform (units of u, ground at y = 0). */
export function drawDropsFalling(p, t, drops, topY, env) {
  const ctx = p.drawingContext;
  for (const d of drops) {
    const s = (t - (d.at - FALL)) / FALL;
    if (s < 0 || s > 1) continue;
    const y = lerp(topY, surfaceY(d.x), s * s);
    const c = mix([160, 200, 235], [210, 225, 255], env.light);
    ctx.fillStyle = rgba(c, 0.85);
    ctx.beginPath();
    ctx.moveTo(d.x, y - 0.012);
    ctx.quadraticCurveTo(d.x + 0.0042, y - 0.001, d.x, y + 0.0035);
    ctx.quadraticCurveTo(d.x - 0.0042, y - 0.001, d.x, y - 0.012);
    ctx.fill();
  }
}

export function drawSplashes(p, t, drops, env) {
  const ctx = p.drawingContext;
  for (const d of drops) {
    const s = (t - d.at) / 0.7;
    if (s < 0 || s > 1) continue;
    const y = surfaceY(d.x);
    ctx.strokeStyle = rgba(mix([170, 205, 235], [230, 240, 255], env.light), 0.7 * (1 - s));
    ctx.lineWidth = 0.0012;
    ctx.beginPath();
    ctx.ellipse(d.x, y, 0.005 + s * 0.03, 0.0015 + s * 0.006, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let j = -1; j <= 1; j += 2) {
      const bx = d.x + j * s * 0.018, by = y - Math.sin(s * Math.PI) * 0.012;
      ctx.fillStyle = rgba([200, 225, 250], 0.8 * (1 - s));
      ctx.beginPath(); ctx.arc(bx, by, 0.0016, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** Wet soil: a dark bloom under each landing that spreads down and slowly dries. */
export function drawSoak(p, t, drops) {
  const ctx = p.drawingContext;
  for (const d of drops) {
    const s = t - d.at;
    if (s < 0) continue;
    const spread = ease(s / 3.5);
    const dry = 1 - 0.7 * ease(s / 40);
    const cx = d.x * 0.6, cy = 0.012 + spread * 0.04;
    const rx = 0.02 + spread * 0.05, ry = 0.012 + spread * 0.055;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 1);
    g.addColorStop(0, `rgba(20,10,5,${0.34 * dry})`);
    g.addColorStop(1, 'rgba(20,10,5,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    ctx.translate(-cx, -cy);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/** How much water has reached the seed, 0..1. The seed swells by it. */
export function imbibed(t, drops) {
  const early = drops.filter((d) => d.k < drops.length - 1);
  let s = 0;
  for (const d of early) s += ease(span(t, d.at + 0.4, d.at + 3));
  return s / early.length;
}
