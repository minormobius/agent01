// stage.js — the concert stage behind (and in front of) the dancers, in 2D.
//
// Everything is placed in the WORLD, in head units (the figure's own), and drawn with the
// same orthographic camera the dancers are rendered with (shader.js project), so the floor,
// the LED wall and the crowd line up with them from every angle the video cuts to.

import { project } from '../vendor/figure/lib/shader.js';

export const PALETTES = {
  night: { sky: ['#0b0620', '#1c0f3d'], wall: '#7a5cff', beam: [150, 120, 255], floor: '#140c2a', edge: '#a58bff', stick: ['#8f7bff', '#5ee1ff'] },
  dusk: { sky: ['#1a0a2e', '#4a1d4f'], wall: '#ff8a5c', beam: [255, 150, 120], floor: '#1d0f26', edge: '#ffb08a', stick: ['#ff9d6b', '#ffd36b'] },
  hot: { sky: ['#2a0630', '#7a0f5c'], wall: '#ff4fb4', beam: [255, 90, 190], floor: '#22061f', edge: '#ff7ccd', stick: ['#ff5cc3', '#ffe45c'] },
  deep: { sky: ['#03101c', '#0a2a3d'], wall: '#3ad6c4', beam: [80, 220, 210], floor: '#061520', edge: '#6ff0e0', stick: ['#3ad6c4', '#8fa8ff'] },
  fever: { sky: ['#30031f', '#b0126a'], wall: '#ff3d8b', beam: [255, 70, 150], floor: '#28041c', edge: '#ffd24d', stick: ['#ff3d8b', '#4df0ff'] },
  blackout: { sky: ['#000000', '#07040c'], wall: '#2a1740', beam: [255, 255, 255], floor: '#050308', edge: '#3a2750', stick: ['#555', '#777'] },
};

const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** The backdrop, the LED wall, the floor and the beams: everything behind the dancers. */
export function drawBack(ctx, cam, W, H, S) {
  const P = PALETTES[S.palette] || PALETTES.night;
  const pr = (p) => project(cam, p, W, H);
  const pulse = S.pulse;
  // the sky
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const quad = (pts, fill) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
  // the LED wall: a lattice of dots, the P(doom) meter across it
  const wz = -5.4, wx = 9.5, wy0 = 1.2, wy1 = 10.5;
  const c = [pr([-wx, wy0, wz]), pr([wx, wy0, wz]), pr([wx, wy1, wz]), pr([-wx, wy1, wz])];
  quad(c, '#07030f');
  ctx.save();
  ctx.beginPath(); c.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.clip();
  const at = (u, v) => { const x = -wx + u * 2 * wx, y = wy0 + v * (wy1 - wy0); return pr([x, y, wz]); };
  const px = Math.max(1.2, Math.abs(c[1][0] - c[0][0]) / 170);
  ctx.globalAlpha = S.palette === 'blackout' ? 0.15 : 0.9;
  // the meter: a bar that fills to P(doom), and a pulse of the section's colour through it
  for (let j = 0; j < 44; j++) for (let i = 0; i < 90; i++) {
    const u = (i + 0.5) / 90, v = (j + 0.5) / 44;
    let on = 0.05 + 0.05 * hash(i * 97 + j);
    if (v > 0.5 && v < 0.56 && u > 0.2 && u < 0.2 + 0.6 * S.doom / 100) on = 0.95;
    if (v > 0.49 && v < 0.57 && (u > 0.19 && u < 0.2 || u > 0.8 && u < 0.81)) on = Math.max(on, 0.6);
    const ring = Math.abs(Math.hypot(u - 0.5, (v - 0.62) * 0.5) - (S.beat % 4) * 0.12);
    if (ring < 0.02) on = Math.max(on, 0.55 * pulse + 0.1);
    const [x, y] = at(u, v);
    ctx.fillStyle = on > 0.5 ? P.wall : `rgba(255,255,255,${on * 0.35})`;
    ctx.globalAlpha = (S.palette === 'blackout' ? 0.15 : 0.9) * (on > 0.5 ? 1 : 0.8);
    ctx.fillRect(x - px / 2, y - px / 2, px, px);
  }
  // the words on the wall: its own, in dots' worth of pixels (a font drawn big and dim)
  ctx.globalAlpha = S.palette === 'blackout' ? 0.2 : 0.92;
  const [tx, ty] = at(0.5, 0.8), h = Math.abs(c[2][1] - c[1][1]);
  ctx.fillStyle = P.wall; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(h * 0.2)}px "Dela Gothic One", "Arial Black", sans-serif`;
  ctx.fillText('P(DOOM)', tx, ty);
  ctx.font = `700 ${Math.round(h * 0.07)}px "Dela Gothic One", "Arial Black", sans-serif`;
  const [nx, ny] = at(0.5, 0.64);
  ctx.fillText(`${S.doom.toFixed(S.doom >= 99.5 ? 1 : 0)}%`, nx, ny);
  ctx.restore();
  ctx.globalAlpha = 1;
  // the floor: dark and glossy, a lit edge at the front, lines running to the back
  const fz0 = -5.4, fz1 = 5, fx = 11;
  quad([pr([-fx, 0, fz0]), pr([fx, 0, fz0]), pr([fx, 0, fz1]), pr([-fx, 0, fz1])], P.floor);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  for (let x = -fx; x <= fx + 1e-9; x += 1.5) { const a = pr([x, 0, fz0]), b = pr([x, 0, fz1]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  for (let z = fz0; z <= fz1 + 1e-9; z += 1.4) { const a = pr([-fx, 0, z]), b = pr([fx, 0, z]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  const e0 = pr([-fx, 0, fz1]), e1 = pr([fx, 0, fz1]);
  ctx.strokeStyle = P.edge; ctx.lineWidth = Math.max(2, W / 400); ctx.globalAlpha = 0.5 + 0.5 * pulse;
  ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.stroke(); ctx.globalAlpha = 1;
  // pools of light under each dancer
  for (const d of S.spots) {
    const [x, y] = pr([d[0], 0, d[1]]), r = Math.abs(pr([d[0] + 1.6, 0, d[1]])[0] - x) + 4;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${P.beam.join(',')},${0.28 + 0.2 * pulse})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.35 + 2, 0, 0, Math.PI * 2); ctx.fill();
  }
  // beams from the truss, swinging on the beat
  ctx.globalCompositeOperation = 'lighter';
  const n = S.palette === 'blackout' ? 1 : 6;
  for (let i = 0; i < n; i++) {
    const x0 = n === 1 ? 0 : -8 + (16 * i) / (n - 1), sw = Math.sin(S.beat * Math.PI / 2 + i) * 2.5;
    const top = pr([x0, 13, -3]), foot = S.palette === 'blackout' ? pr([S.spots[0][0], 0, S.spots[0][1]]) : pr([x0 * 0.4 + sw, 0, 1]);
    const wdt = Math.abs(pr([1.4, 0, 0])[0] - pr([0, 0, 0])[0]);
    const lg = ctx.createLinearGradient(top[0], top[1], foot[0], foot[1]);
    const a = S.palette === 'blackout' ? 0.22 : 0.08 + 0.1 * pulse;
    lg.addColorStop(0, `rgba(${P.beam.join(',')},${a})`); lg.addColorStop(1, `rgba(${P.beam.join(',')},0)`);
    ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(top[0] - 3, top[1]); ctx.lineTo(top[0] + 3, top[1]); ctx.lineTo(foot[0] + wdt, foot[1]); ctx.lineTo(foot[0] - wdt, foot[1]); ctx.closePath(); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** In front of the dancers: the crowd and its glowsticks, and confetti on the big downbeats. */
export function drawFront(ctx, cam, W, H, S) {
  const P = PALETTES[S.palette] || PALETTES.night;
  const pr = (p) => project(cam, p, W, H);
  // confetti: falls through the stage's air for two bars after a chorus lands
  if (S.confetti >= 0 && S.confetti < 8) {
    const age = S.confetti;
    for (let i = 0; i < 160; i++) {
      const x = -9 + 18 * hash(i), z = -4 + 8 * hash(i + 17), y = 12 - (age * (1.6 + hash(i + 3)) * 1.1 + hash(i + 5) * 4) % 13;
      const [px, py] = pr([x + Math.sin(age * 2 + i) * 0.3, y, z]);
      if (px < -10 || px > W + 10 || py < -10 || py > H + 10) continue;
      const s = Math.max(2, W / 260) * (0.6 + hash(i + 9));
      ctx.save(); ctx.translate(px, py); ctx.rotate(age * 3 + i);
      ctx.fillStyle = [P.edge, P.wall, '#ffffff', P.stick[1]][i % 4];
      ctx.fillRect(-s / 2, -s / 4, s, s / 2); ctx.restore();
    }
  }
  // the crowd: heads and shoulders along the front of the stage, glowsticks up on the beat
  for (let i = 0; i < 26; i++) {
    // the audience stands on the floor below the stage (raised ~2.5 heads): heads just under its lip
    const x = -12 + i * 0.95 + hash(i) * 0.4, z = 6.2 + hash(i + 40) * 1.4, hy = -0.9 + hash(i + 80) * 0.5;
    const head = pr([x, hy, z]), sh = pr([x, hy - 0.9, z]);
    const r = Math.abs(pr([x + 0.33, hy, z])[0] - head[0]);
    if (head[1] > H + r * 4 || head[0] < -r * 4 || head[0] > W + r * 4) continue;
    ctx.fillStyle = '#05030a';
    ctx.beginPath(); ctx.arc(head[0], head[1], r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sh[0], sh[1] + r * 1.2, r * 2.1, r * 1.6, 0, 0, Math.PI * 2); ctx.fill();
    if (i % 2 === 0) {
      const a = Math.sin((S.beat + hash(i) * 0.3) * Math.PI) * 0.6 * (S.palette === 'blackout' ? 0 : 1);
      const hx = x + 0.55 * (hash(i + 7) > 0.5 ? 1 : -1), base = pr([hx, hy + 0.2, z]);
      const tip = pr([hx + Math.sin(a) * 1.3, hy + 0.2 + Math.cos(a) * 1.3, z]);
      ctx.strokeStyle = P.stick[i % 4 === 0 ? 0 : 1]; ctx.lineWidth = Math.max(2, r * 0.35); ctx.lineCap = 'round';
      ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = r * 1.5;
      ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }
}
