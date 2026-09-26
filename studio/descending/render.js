// render.js — the picture: a figure descending a staircase, in planes, after Duchamp (1912).
//
//   makeRenderer(W, H, dpr) → draw(ctx, t)
//
// The same function draws the page and the exported video. Everything is a pure function of t:
// the figure's joints come from figure.js, how far it has come into a body from score.js's embody().
//
// The figure is never a person: limbs are cones cut into three flat facets (lit, mid, shade), the
// torso a tapered block, the head an ovoid with a mouth that opens on the sung vowels. Unembodied, it
// is many exposures at once, a chronophotograph: the same body a fraction of a second apart, each
// one broken into shards that drift off their joints, with dotted arcs where the hips and knees went.
// As embody() rises the exposures close up and the shards come home, until one body stands at the
// foot of the stairs and turns to us.

import { pose, RISE, RUN, WIDTH, STEPS, NOTES } from './figure.js';
import { embody, cues, duration } from './score.js';

const PAL = {
  ground: '#21160d', ground2: '#3a2716', ink: '#1a1008',
  light: '#e2b878', mid: '#b98446', shade: '#6d4523', deep: '#3e2613',
  tread: '#a07a4a', riser: '#5c3d22', stringer: '#452c17', glow: '#f3d9a4',
};
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
// a hash, never a running generator: the same shard jitters the same way at the same t
const hash = (a, b = 0, c = 0) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function makeRenderer(W, H, dpr = 1) {
  const w = W * dpr, h = H * dpr;
  // the camera: orthographic, turned so the flight runs down to the right, looking a little down on it
  const YAW = -0.42, PITCH = 0.2, cy = Math.cos(YAW), sy = Math.sin(YAW), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  const tall = h > w * 1.1, S = Math.min(h * 0.3, w * (tall ? 0.52 : 0.62));   // pixels per metre
  const CX = w * (tall ? 0.64 : 0.5);                                // where the pelvis sits: a tall frame leaves room for the exposures behind it
  const view = (P) => {
    const x = P[0] * cy + P[2] * sy, z = -P[0] * sy + P[2] * cy;    // yaw about y
    const y = P[1] * cp - z * sp, d = P[1] * sp + z * cp;           // pitch about x
    return [x, y, d];
  };
  let cam = [0, 0];
  const proj = (P) => { const [x, y, d] = view(P); return [CX + (x - cam[0]) * S, h * 0.46 - (y - cam[1]) * S, d]; };

  // the paper's tooth: a fixed grain, multiplied over everything
  const grain = (() => {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
    const g = c.getContext('2d'), im = g.createImageData(256, 256);
    for (let i = 0; i < 256 * 256; i++) { const v = 200 + 55 * hash(i, 7); im.data[i * 4] = v; im.data[i * 4 + 1] = v * 0.96; im.data[i * 4 + 2] = v * 0.88; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    return c;
  })();
  let grainPat = null;

  function poly(ctx, pts, fill, stroke, lw = 1) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw * dpr; ctx.stroke(); }
  }

  // ---- the staircase -----------------------------------------------------------------------------
  function stairs(ctx, p, e) {
    const j0 = Math.max(0, Math.floor(p) - 9), j1 = Math.min(STEPS, Math.floor(p) + 9);
    const zf = -WIDTH / 2, zn = WIDTH / 2;
    // the far wall: a dark plane that steps down with the stairs, and the landing's wall at the top
    for (let j = j1; j >= j0; j--) {
      const x0 = j === 0 ? -3 : j * RUN, x1 = j === STEPS ? (j + 40) * RUN : (j + 1) * RUN, y = -j * RISE;
      const fade = clamp(1 - Math.abs(j - p) / 9);
      ctx.globalAlpha = 0.35 + 0.65 * fade;
      poly(ctx, [proj([x0, y, zf]), proj([x1, y, zf]), proj([x1, y + 2.6, zf]), proj([x0, y + 2.6, zf])], j % 2 ? '#2b1d11' : '#2f2013');
    }
    for (let j = j1; j >= j0; j--) {
      const x0 = j === 0 ? -3 : j * RUN, x1 = j === STEPS ? (j + 40) * RUN : (j + 1) * RUN, y = -j * RISE;
      const fade = clamp(1 - Math.abs(j - p) / 9);
      ctx.globalAlpha = 0.3 + 0.7 * fade;
      // the riser below this tread's nose, the tread, the near stringer's face
      if (j < STEPS) poly(ctx, [proj([x1, y, zf]), proj([x1, y, zn]), proj([x1, y - RISE, zn]), proj([x1, y - RISE, zf])], PAL.riser, PAL.ink, 1);
      poly(ctx, [proj([x0, y, zf]), proj([x1, y, zf]), proj([x1, y, zn]), proj([x0, y, zn])], PAL.tread, PAL.ink, 1);
      poly(ctx, [proj([x0, y, zn]), proj([x1, y, zn]), proj([x1, y - 0.5, zn]), proj([x0, y - 0.5, zn])], PAL.stringer, PAL.ink, 0.8);
      // the tread's light: a lit band along its nose, broken while the picture is
      const a = proj([x1 - 0.05, y, zf]), b = proj([x1 - 0.05, y, zn]);
      ctx.strokeStyle = 'rgba(243, 217, 164, 0.18)'; ctx.lineWidth = 2 * dpr * (0.6 + 0.4 * e);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---- a limb: a cone in three facets -------------------------------------------------------------
  const LIGHT = [-0.55, -0.83];
  function cone(ctx, A, Bp, ra, rb, alpha, jitter, seed) {
    let a = proj(A), b = proj(Bp);
    // a shard off its joint: displaced and turned, by how unembodied the picture is
    if (jitter > 0.001) {
      const dx = (hash(seed, 1) - 0.5) * jitter * S, dy = (hash(seed, 2) - 0.5) * jitter * S, rot = (hash(seed, 3) - 0.5) * jitter * 4;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, c = Math.cos(rot), s = Math.sin(rot);
      const turn = (q) => [mx + dx + (q[0] - mx) * c - (q[1] - my) * s, my + dy + (q[0] - mx) * s + (q[1] - my) * c, q[2]];
      a = turn(a); b = turn(b);
    }
    const vx = b[0] - a[0], vy = b[1] - a[1], L = Math.hypot(vx, vy) || 1, nx = -vy / L, ny = vx / L;
    const A0 = ra * S, B0 = rb * S;
    const at = (q, r, f) => [q[0] + nx * r * f, q[1] + ny * r * f];
    const lit = nx * LIGHT[0] + ny * LIGHT[1] > 0;                  // which side faces the light
    const bands = [[-1, -0.3], [-0.3, 0.35], [0.35, 1]], tones = lit ? [PAL.shade, PAL.mid, PAL.light] : [PAL.light, PAL.mid, PAL.shade];
    ctx.globalAlpha = alpha;
    bands.forEach(([f0, f1], i) => {
      if (jitter > 0.02 && hash(seed, 9 + i) < jitter * 1.6) return;     // a facet missing: the body in pieces
      poly(ctx, [at(a, A0, f0), at(b, B0, f0), at(b, B0, f1), at(a, A0, f1)], tones[i]);
    });
    poly(ctx, [at(a, A0, -1), at(b, B0, -1), at(b, B0, 1), at(a, A0, 1)], null, PAL.ink, 1.2);
    ctx.globalAlpha = 1;
  }

  function head(ctx, P, alpha, jitter, seed) {
    const c = proj(P.head), r = 0.115 * S;
    let dx = 0, dy = 0;
    if (jitter > 0.001) { dx = (hash(seed, 1) - 0.5) * jitter * S; dy = (hash(seed, 2) - 0.5) * jitter * S; }
    const cx = c[0] + dx, cyy = c[1] + dy;
    // an ovoid in facets, its face turned where the body faces
    const f = proj([P.head[0] + P.fwd[0], P.head[1], P.head[2] + P.fwd[2]]), fx = f[0] - c[0], fy = f[1] - c[1], fl = Math.hypot(fx, fy) || 1;
    const ux = fx / fl, uy = fy / fl, side = fl / S;                    // side: 1 in profile, ~0 facing us
    const pts = [];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; pts.push([cx + Math.cos(a) * r * 0.82, cyy + Math.sin(a) * r * 1.08]); }
    ctx.globalAlpha = alpha;
    poly(ctx, pts, PAL.mid, PAL.ink, 1.2);
    // the lit half, cut on the face's line
    poly(ctx, [[cx, cyy - r * 1.08], [cx - r * 0.82, cyy - r * 0.2], [cx - r * 0.5, cyy + r * 0.8], [cx + ux * r * 0.3, cyy + r * 0.3]], PAL.light);
    // the face plane, towards where it looks, and the mouth on it
    const mx = cx + ux * r * 0.55 * side, my = cyy + r * 0.45 - P.lift * r * 0.1;
    const m = P.mouth;
    poly(ctx, [[cx + ux * r * 0.2, cyy - r * 0.7], [cx + ux * r * 0.95 * side + (1 - side) * r * 0.5, cyy - r * 0.1], [cx + ux * r * 0.8 * side + (1 - side) * r * 0.4, cyy + r * 0.8], [cx + ux * r * 0.1, cyy + r * 0.6]], PAL.shade);
    if (m > 0.02) {
      ctx.beginPath();
      ctx.ellipse(mx, my, r * (0.1 + 0.08 * (1 - side)), r * (0.04 + 0.2 * m), 0, 0, Math.PI * 2);
      ctx.fillStyle = PAL.ink; ctx.fill();
    } else { ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.2 * dpr; ctx.beginPath(); ctx.moveTo(mx - r * 0.1, my); ctx.lineTo(mx + r * 0.1, my); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }

  // the body, far side first: [from, to, r0, r1]
  function body(ctx, P, alpha, jitter, seedBase) {
    const segs = [
      [P.hipR, P.kneeR, 0.075, 0.055], [P.kneeR, P.ankleR, 0.055, 0.038], [P.heelR, P.toeR, 0.04, 0.03],
      [P.shR, P.elbowR, 0.045, 0.038], [P.elbowR, P.handR, 0.036, 0.028],
      [P.pelvis, P.chest, 0.14, 0.17], [P.chest, P.neck, 0.12, 0.05],
      [P.hipL, P.kneeL, 0.075, 0.055], [P.kneeL, P.ankleL, 0.055, 0.038], [P.heelL, P.toeL, 0.04, 0.03],
      [P.shL, P.elbowL, 0.045, 0.038], [P.elbowL, P.handL, 0.036, 0.028],
    ].map((s, i) => ({ s, i, d: (view(s[0])[2] + view(s[1])[2]) / 2 + (i === 5 || i === 6 ? 0 : 0) }));
    segs.sort((a, b) => a.d - b.d);
    let headDone = false;
    const hd = view(P.head)[2];
    for (const { s, i, d } of segs) {
      if (!headDone && d > hd) { head(ctx, P, alpha, jitter, seedBase * 31 + 99); headDone = true; }
      cone(ctx, s[0], s[1], s[2], s[3], alpha, jitter, seedBase * 31 + i);
    }
    if (!headDone) head(ctx, P, alpha, jitter, seedBase * 31 + 99);
  }

  // the dotted arcs: where the hips and knees have just been
  function arcs(ctx, t, k) {
    if (k < 0.02) return;
    ctx.fillStyle = PAL.glow;
    for (let i = 1; i < 40; i++) {
      const tt = t - i * 0.04, P = pose(tt), a = k * (1 - i / 40) * 0.55;
      ctx.globalAlpha = a;
      for (const q of [P.pelvis, P.kneeL, P.kneeR, P.handL]) { const s = proj(q); ctx.beginPath(); ctx.arc(s[0], s[1], 1.4 * dpr, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  // the words, painted in the corner as they are sung (Duchamp lettered his title onto the canvas)
  const LINES = (() => {
    const out = [];
    let cur = null;
    NOTES.forEach((n, i) => {
      const prev = NOTES[i - 1];
      if (!prev || n.line !== prev.line || n.t - (prev.t + prev.dur) > 0.3 || n.t - prev.t > 6) { cur = { from: n.t, syl: [] }; out.push(cur); }
      if (n.syl) cur.syl.push({ t: n.t, text: n.syl.text, first: n.syl.first, punct: n.syl.punct || '' });
      cur.to = n.t + n.dur;
    });
    return out;
  })();
  function words(ctx, t, e) {
    const line = LINES.find((l) => t >= l.from - 0.4 && t <= l.to + 0.8);
    const fs = Math.round(Math.max(15 * dpr, Math.min(w, h) * 0.034));
    ctx.font = `500 ${fs}px "Cormorant Garamond", Georgia, serif`;
    ctx.textBaseline = 'alphabetic';
    const x0 = w * 0.06, y0 = h * 0.93;
    if (line) {
      // laid out first, so a long line can wrap (a phone is narrow) and stay above the bottom
      const parts = line.syl.map((s, i) => (s.first && i ? ' ' : '') + s.text.toUpperCase() + s.punct);
      let x = x0, rows = 1;
      parts.forEach((p) => { const pw = ctx.measureText(p).width; if (x + pw > w * 0.94 && x > x0) { rows++; x = x0 + ctx.measureText(' ').width * 0; } x += pw + fs * 0.05; });
      let y = y0 - (rows - 1) * fs * 1.25;
      x = x0;
      for (const [si, s] of line.syl.entries()) {
        let word = parts[si];
        if (x + ctx.measureText(word).width > w * 0.94 && x > x0) { x = x0; y += fs * 1.25; word = word.replace(/^ /, ''); }
        const on = t >= s.t - 0.02;
        ctx.globalAlpha = (on ? 0.9 : 0.18) * clamp((t - line.from + 0.4) / 0.4) * clamp((line.to + 0.8 - t) / 0.5);
        ctx.fillStyle = on ? PAL.glow : PAL.tread;
        // unembodied, each syllable sits a little off its line
        const jy = (1 - e) * (hash(Math.round(s.t * 100), 5) - 0.5) * fs * 0.5;
        ctx.fillText(word, x, y + jy);
        x += ctx.measureText(word).width + fs * 0.05;
      }
      ctx.globalAlpha = 1;
    }
    // the title, lettered at the start and at the end
    const title = Math.max(clamp(1 - (t - 6) / 3) * clamp(t / 1.5), clamp((t - (duration - 6)) / 2));
    if (title > 0.01) {
      ctx.globalAlpha = title * 0.85;
      ctx.fillStyle = PAL.glow;
      ctx.font = `500 ${Math.round(fs * 1.5)}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillText('DESCENDING', x0, h * 0.12);
      ctx.font = `italic 400 ${Math.round(fs * 0.8)}px "Cormorant Garamond", Georgia, serif`;
      ctx.fillText('Daisy Bell (Harry Dacre, 1892), sung by arithmetic', x0, h * 0.12 + fs * 1.3);
      ctx.globalAlpha = 1;
    }
  }

  const shifted = (P, d) => Object.fromEntries(Object.entries(P).map(([k, v]) => [k, Array.isArray(v) && v.length === 3 && typeof v[0] === 'number' && !['fwd', 'left'].includes(k) ? [v[0] + d[0], v[1] + d[1], v[2] + d[2]] : v]));

  return function draw(ctx, t) {
    const e = embody(t);
    const P = pose(t);
    // the camera follows the pelvis, a little behind it and above
    const pv = view(P.pelvis);
    cam = [pv[0] + 0.15, pv[1] - 0.15];
    // unembodied, the frame flickers now and then (a projector missing frames)
    const flick = (1 - e) * (hash(Math.floor(t * 12), 77) < 0.06 * (1 - e) ? 0.35 : 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, 0, w * 0.3, h);
    g.addColorStop(0, PAL.ground2); g.addColorStop(1, PAL.ground);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const p = Math.max(0, P.pelvis[0] / RUN - 0.4);
    stairs(ctx, p, e);
    // the exposures: more and further apart the less embodied; each one's shards drift off
    // (and each is set back up the stairs a little: standing still, the time between exposures shows nothing)
    const u = 1 - e, N = Math.max(1, Math.round(1 + 14 * u ** 1.1)), gap = 0.05 + 0.22 * u ** 1.2;
    const jitter = 0.16 * u ** 1.6, back = 0.045 * u ** 1.5;
    const tick = Math.floor(t * 6);                                    // the shards re-settle six times a second
    arcs(ctx, t, u * 0.9);
    for (let i = N - 1; i >= 0; i--) {
      let Pi = i ? pose(t - i * gap) : P;
      if (i && back) Pi = shifted(Pi, [-RUN * back * i / 0.33, RISE * back * i / 0.33, 0]);
      const a = i ? 0.6 * (1 - i / N) ** 1.2 : 1;
      body(ctx, Pi, a, jitter * (i ? 1.3 : 1), tick * 17 + i);
    }
    // the last chord: light gathers on the one body
    const last = clamp((t - cues.last) / 3);
    if (last > 0) {
      const c = proj(P.chest), rg = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], S * 1.4);
      rg.addColorStop(0, `rgba(243, 217, 164, ${0.22 * last})`); rg.addColorStop(1, 'rgba(243, 217, 164, 0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    }
    words(ctx, t, e);
    // the tooth over everything, and the vignette
    if (!grainPat) grainPat = ctx.createPattern(grain, 'repeat');
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = grainPat; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(10, 6, 3, 0)'); vg.addColorStop(1, `rgba(10, 6, 3, ${0.7 + flick})`);
    ctx.globalAlpha = 1; ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    if (flick) { ctx.fillStyle = `rgba(10, 6, 3, ${flick})`; ctx.fillRect(0, 0, w, h); }
    ctx.restore();
  };
}

