// draw.js — the water column, what lives in it, and the bucket.
//
// The one job the picture has that /qwop/'s did not: make the budget legible.
// A player has to be able to see, without reading anything, that the water is
// brighter up top, that beating is draining them, and that they are loud. So
// light is literally painted as light, the energy bar carries a live arrow for
// which way the balance is running, and the noise ring is the same dashed
// circle as /qwop/ because it means exactly the same thing.

import { PTEROSPERMA } from '../proteus/flagella.js';
import { CILIUM_COLOR, fitCanvas } from '../qwop/draw.js';
import {
  ciliumPath, KEYS, lightAt, SURFACE_Y, DEPTH_Y, PREY_KINDS, PREDATOR_KINDS,
} from './game.js';

const TWO_PI = Math.PI * 2;
const INK = '#d8dde2';
const DIM = '#6a727b';
const BODY_EXAGGERATION = 2.6;

const KEENEST_HEARING = Math.max(...Object.values(PREDATOR_KINDS).map((k) => k.hearing));

export { CILIUM_COLOR };

function text(ctx, s, x, y, color, size, dpr, align = 'left') {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.font = `${size * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
}

// Deterministic motes of background detritus, purely decorative.
const DUST = (() => {
  const pts = [];
  let s = 0xb17e55;
  const rnd = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 130; i++) pts.push({ x: rnd(), y: rnd(), r: 0.4 + rnd() * 1.3, a: 0.04 + rnd() * 0.14 });
  return pts;
})();
const TILE_UM = 620;

export function drawGame(cnv, game, opts = {}) {
  const { ctx, w, h, dpr } = fitCanvas(cnv);
  const { cell, ocean } = game;

  // Show a fixed slice of the column, camera following the cell.
  const viewUm = 1250;
  const pxPerUm = h / viewUm;
  const camX = cell.x - (w * 0.5) / pxPerUm;
  const camY = Math.max(SURFACE_Y - 60, Math.min(DEPTH_Y - viewUm + 60, cell.y - viewUm * 0.5));
  const toX = (ux) => (ux - camX) * pxPerUm;
  const toY = (uy) => (uy - camY) * pxPerUm;

  // The water, painted by its own light curve rather than a hand-picked
  // gradient — the same lightAt() the energy budget reads, so what you see is
  // what you are being paid.
  const g = ctx.createLinearGradient(0, toY(SURFACE_Y), 0, toY(DEPTH_Y));
  for (let i = 0; i <= 8; i++) {
    const l = lightAt(SURFACE_Y + (DEPTH_Y - SURFACE_Y) * (i / 8));
    g.addColorStop(i / 8, `rgb(${(6 + l * 26) | 0}, ${(20 + l * 54) | 0}, ${(30 + l * 62) | 0})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // The surface itself, and the compensation depth — the line above which
  // holding still pays and below which it does not.
  const surf = toY(SURFACE_Y);
  if (surf > -20) {
    const sg = ctx.createLinearGradient(0, surf - 30 * dpr, 0, surf + 40 * dpr);
    sg.addColorStop(0, 'rgba(190, 240, 255, 0.30)');
    sg.addColorStop(1, 'rgba(190, 240, 255, 0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, surf - 30 * dpr, w, 70 * dpr);
    ctx.strokeStyle = 'rgba(200, 245, 255, 0.55)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.moveTo(0, surf); ctx.lineTo(w, surf); ctx.stroke();
  }
  if (opts.compensationY != null) {
    const cy = toY(opts.compensationY);
    if (cy > 0 && cy < h) {
      ctx.strokeStyle = 'rgba(240, 200, 90, 0.22)';
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([6 * dpr, 8 * dpr]);
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, 'compensation depth — below this, holding still loses',
        10 * dpr, cy - 6 * dpr, 'rgba(240, 200, 90, 0.45)', 10, dpr);
    }
  }

  // Drifting dust.
  const i0 = Math.floor(camX / TILE_UM), i1 = Math.floor((camX + w / pxPerUm) / TILE_UM);
  const j0 = Math.floor(camY / TILE_UM), j1 = Math.floor((camY + h / pxPerUm) / TILE_UM);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      for (const p of DUST) {
        const px = toX((i + p.x) * TILE_UM), py = toY((j + p.y) * TILE_UM);
        if (px < -4 || px > w + 4 || py < -4 || py > h + 4) continue;
        ctx.fillStyle = `rgba(200, 230, 245, ${p.a})`;
        ctx.beginPath(); ctx.arc(px, py, p.r * dpr, 0, TWO_PI); ctx.fill();
      }
    }
  }

  // Wake.
  if (cell.trail.length > 1) {
    ctx.lineWidth = 1.2 * dpr;
    for (let i = 1; i < cell.trail.length; i++) {
      const age = i / cell.trail.length;
      const a = cell.trail[i - 1], b = cell.trail[i];
      ctx.strokeStyle = `rgba(140, 210, 235, ${(0.02 + 0.16 * age * age).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(toX(a.x), toY(a.y)); ctx.lineTo(toX(b.x), toY(b.y));
      ctx.stroke();
    }
  }

  // Prey.
  for (const p of ocean.prey) {
    const px = toX(p.x), py = toY(p.y);
    if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
    const r = Math.max(2 * dpr, p.spec.r * pxPerUm);
    if (p.kind === 'swarmer') {
      // A little flagellate, leaning the way it is going.
      const a = Math.atan2(p.vy, p.vx);
      ctx.save(); ctx.translate(px, py); ctx.rotate(a);
      ctx.fillStyle = p.spec.color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.62, 0, 0, TWO_PI); ctx.fill();
      ctx.strokeStyle = p.spec.color; ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(-r * 2.6, r * 0.5); ctx.stroke();
      ctx.restore(); ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = p.spec.color;
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.arc(px, py, r, 0, TWO_PI); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Predators.
  for (const q of ocean.predators) {
    const px = toX(q.x), py = toY(q.y);
    if (px < -90 || px > w + 90 || py < -90 || py > h + 90) continue;
    const r = q.spec.r * pxPerUm;
    if (q.alerted > 0) {
      ctx.strokeStyle = `rgba(240, 90, 90, ${0.10 + 0.22 * Math.min(1, q.alerted / q.spec.patience)})`;
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); ctx.arc(px, py, r * 2.3, 0, TWO_PI); ctx.stroke();
    }
    ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(q.vy, q.vx));
    ctx.fillStyle = q.spec.color; ctx.globalAlpha = 0.85;
    if (q.kind === 'medusa') {
      const pulse = 1 + 0.12 * Math.sin(game.elapsed * 3 + q.phase);
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.ellipse(0, 0, r * pulse, r * 0.82 * pulse, 0, 0, TWO_PI); ctx.fill();
      ctx.strokeStyle = q.spec.color; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.4 * dpr;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * r * 0.3);
        ctx.quadraticCurveTo(-r, i * r * 0.4, -r * 1.8, i * r * 0.35);
        ctx.stroke();
      }
    } else if (q.kind === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(r * 2.2, 0); ctx.lineTo(-r * 1.4, r * 0.7);
      ctx.lineTo(-r * 0.8, 0); ctx.lineTo(-r * 1.4, -r * 0.7);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.62, 0, 0, TWO_PI); ctx.fill();
      ctx.strokeStyle = q.spec.color; ctx.lineWidth = 1.3 * dpr;
      const flick = Math.sin(game.elapsed * 9 + q.phase) * 0.5;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(r * 0.5, sgn * r * 0.3);
        ctx.lineTo(r * 0.5 - r * 1.6, sgn * r * (1.1 + flick * 0.4));
        ctx.stroke();
      }
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  drawCell(ctx, game, toX, toY, pxPerUm, dpr);

  // How far you can be heard, same as /qwop/ and meaning the same thing.
  if (cell.signature > 0.04 && !game.over) {
    const reach = KEENEST_HEARING * (0.16 + 0.84 * cell.signature) * pxPerUm;
    ctx.strokeStyle = `rgba(240, 170, 90, ${0.06 + 0.18 * cell.signature})`;
    ctx.lineWidth = 1.2 * dpr;
    ctx.setLineDash([4 * dpr, 6 * dpr]);
    ctx.beginPath(); ctx.arc(toX(cell.x), toY(cell.y), reach, 0, TWO_PI); ctx.stroke();
    ctx.setLineDash([]);
  }

  drawHud(ctx, game, w, h, dpr, opts);
}

function drawCell(ctx, game, toX, toY, pxPerUm, dpr) {
  const cell = game.cell;
  const bx = toX(cell.x), by = toY(cell.y);

  cell.cilia.forEach((c, i) => {
    const path = ciliumPath(cell, c, pxPerUm);
    ctx.strokeStyle = CILIUM_COLOR[i];
    ctx.globalAlpha = 0.28 + 0.62 * c.drive;
    ctx.lineWidth = (1 + 1.5 * c.drive) * dpr;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    for (let j = 0; j < path.length; j += 2) ctx.lineTo(bx + path[j], by + path[j + 1]);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  if (game.over) {
    ctx.strokeStyle = game.cause === 'starved'
      ? 'rgba(150, 170, 190, 0.8)' : 'rgba(240, 120, 110, 0.85)';
    ctx.lineWidth = 2 * dpr;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TWO_PI;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(a) * 6 * dpr, by + Math.sin(a) * 6 * dpr);
      ctx.lineTo(bx + Math.cos(a) * 15 * dpr, by + Math.sin(a) * 15 * dpr);
      ctx.stroke();
    }
    return;
  }

  // The body swells visibly as the bucket fills — you can see a cell that is
  // nearly ready to divide without looking at the bar.
  const fill = 0.72 + 0.42 * game.energy;
  const a = PTEROSPERMA.bodyLongUm * 0.5 * pxPerUm * BODY_EXAGGERATION * fill;
  const b = PTEROSPERMA.bodyShortUm * 0.5 * pxPerUm * BODY_EXAGGERATION * fill;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(cell.heading);
  if (game.justDivided > 0) {
    ctx.shadowColor = 'rgba(255, 255, 220, 0.95)';
    ctx.shadowBlur = 26 * dpr * game.justDivided;
  } else if (cell.bundle > 0.25) {
    ctx.shadowColor = 'rgba(140, 240, 200, 0.85)';
    ctx.shadowBlur = 13 * dpr * cell.bundle;
  }
  const grad = ctx.createRadialGradient(-a * 0.3, 0, 0, 0, 0, Math.max(a, b));
  // Green when fed, grey when running on empty.
  const e = game.energy;
  grad.addColorStop(0, e > 0.15 ? '#b6efd4' : '#c8cdd2');
  grad.addColorStop(1, e > 0.15 ? '#3f8f80' : '#5a6166');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.ellipse(0, 0, a, b, 0, 0, TWO_PI); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(210, 255, 235, 0.7)';
  ctx.lineWidth = 1.1 * dpr;
  ctx.stroke();
  ctx.restore();

  if (game.justAte > 0) {
    ctx.strokeStyle = `rgba(160, 240, 190, ${game.justAte})`;
    ctx.lineWidth = 1.6 * dpr;
    ctx.beginPath();
    ctx.arc(bx, by, (1 - game.justAte) * 34 * pxPerUm + 8 * dpr, 0, TWO_PI);
    ctx.stroke();
  }
}

function drawHud(ctx, game, w, h, dpr, opts) {
  const { cell } = game;
  const pad = 14 * dpr;

  text(ctx, `${game.divisions} ${game.divisions === 1 ? 'division' : 'divisions'}`,
    pad, 26 * dpr, INK, 18, dpr);
  text(ctx, `best ${Math.max(game.best, game.divisions)}   ${game.elapsed.toFixed(0)}s alive`,
    pad, 44 * dpr, DIM, 11, dpr);

  // The bucket. Wide, because it is the thing the whole game is about, with a
  // live arrow for whether the balance is running up or down.
  const bw = Math.min(230 * dpr, w * 0.36), bx = w - pad - bw, by = 18 * dpr;
  const net = game.gain - game.burn;
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  ctx.fillRect(bx, by, bw, 13 * dpr);
  const e = Math.max(0, Math.min(1, game.energy));
  ctx.fillStyle = e < 0.18 ? '#f0655a' : (net >= 0 ? '#78e6bc' : '#f0b03c');
  ctx.fillRect(bx, by, bw * e, 13 * dpr);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1 * dpr;
  ctx.strokeRect(bx, by, bw, 13 * dpr);
  text(ctx, 'ATP', bx - 8 * dpr, by + 11 * dpr, DIM, 10, dpr, 'right');
  text(ctx, `${net >= 0 ? '▲' : '▼'} ${(Math.abs(net) * 1000).toFixed(1)}e-3/s`,
    bx + bw, by + 26 * dpr, net >= 0 ? '#78e6bc' : '#f0b03c', 10, dpr, 'right');

  // Noise, same colour language as /qwop/.
  const ny = by + 34 * dpr;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(bx, ny, bw, 8 * dpr);
  ctx.fillStyle = cell.signature > 0.6 ? '#f0655a' : '#f0b03c';
  ctx.fillRect(bx, ny, bw * Math.max(0, Math.min(1, cell.signature)), 8 * dpr);
  text(ctx, 'noise', bx - 8 * dpr, ny + 7 * dpr, DIM, 10, dpr, 'right');

  if (game.starveFor > 0) {
    text(ctx, `STARVING — ${(opts.starveSecs - game.starveFor).toFixed(0)}s`,
      w * 0.5, 30 * dpr, '#f0655a', 14, dpr, 'center');
  }

  // Phase dials, as in /qwop/: the part the buttons cannot show.
  const kw = 34 * dpr, gap = 8 * dpr;
  let kx = (w - (kw * 4 + gap * 3)) * 0.5;
  const ky = h - pad - 20 * dpr;
  cell.cilia.forEach((c, i) => {
    const cxp = kx + kw * 0.5, rr = 9 * dpr;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.arc(cxp, ky, rr, 0, TWO_PI); ctx.stroke();
    const ph = c.fl.phase * TWO_PI;
    ctx.strokeStyle = CILIUM_COLOR[i];
    ctx.globalAlpha = 0.35 + 0.65 * c.drive;
    ctx.lineWidth = 1.8 * dpr;
    ctx.beginPath();
    ctx.moveTo(cxp, ky);
    ctx.lineTo(cxp + Math.cos(ph) * rr, ky + Math.sin(ph) * rr);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (!opts.compactKeys) {
      text(ctx, KEYS[i].toUpperCase(), cxp, ky - 16 * dpr, CILIUM_COLOR[i], 11, dpr, 'center');
    }
    kx += kw + gap;
  });
}
