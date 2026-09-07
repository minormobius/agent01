// draw.js — everything you see. No physics lives here.
//
// One rule throughout: each cilium has a colour, and that colour is on its key
// badge, on its meter, and on the filament itself. A player learning which key
// does what should be able to read it off the screen rather than off the
// manual, because the manual is a paragraph and the filament is right there
// bending the wrong way.

import { PTEROSPERMA } from '../proteus/flagella.js';
import { ciliumPath, KEYS, PREDATOR_KINDS } from './game.js';

const TWO_PI = Math.PI * 2;

// Q W O P, left to right across the groove.
export const CILIUM_COLOR = ['#f0655a', '#f0b03c', '#4fc6a0', '#6aa8f0'];

const INK = '#d8dde2';
const DIM = '#6a727b';

// The body is drawn larger than true scale relative to the cilia. At true
// proportion a 9 um body against 67 um cilia is a four-pixel dot at the zoom
// that fits the corridor on screen, and you cannot see which way it is
// pointing — which is the one thing you most need to see.
const BODY_EXAGGERATION = 2.6;

// The longest detection range any predator has, read off the table so the
// player-facing ring and the actual detection check cannot drift apart.
const KEENEST_HEARING = Math.max(...Object.values(PREDATOR_KINDS).map((k) => k.hearing));

export function fitCanvas(cnv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = cnv.getBoundingClientRect();
  const w = Math.max(2, Math.round(r.width * dpr));
  const h = Math.max(2, Math.round(r.height * dpr));
  if (cnv.width !== w || cnv.height !== h) { cnv.width = w; cnv.height = h; }
  const ctx = cnv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return { ctx, w, h, dpr };
}

function text(ctx, s, x, y, color, size, dpr, align = 'left') {
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.font = `${size * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
}

// Deterministic marine snow, in two parallax layers.
const SNOW = (() => {
  const pts = [];
  let s = 0x51f00d;
  const rnd = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 150; i++) {
    pts.push({ x: rnd(), y: rnd(), r: 0.5 + rnd() * 1.8, a: 0.05 + rnd() * 0.2, layer: rnd() < 0.5 ? 0.45 : 1 });
  }
  return pts;
})();
const TILE_UM = 700;

export function drawGame(cnv, game, opts = {}) {
  const { ctx, w, h, dpr } = fitCanvas(cnv);
  const { cell, world } = game;

  // Fit the corridor to the canvas height, with a margin.
  const pxPerUm = (h * 0.92) / (world.laneHalf * 2);
  // The cell sits a third of the way in, so you can see what is coming.
  const camX = cell.x - (w * 0.34) / pxPerUm;
  const toX = (ux) => (ux - camX) * pxPerUm;
  const toY = (uy) => h * 0.5 + uy * pxPerUm;

  // Water.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#06131d');
  g.addColorStop(0.5, '#081a26');
  g.addColorStop(1, '#050f18');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Snow, two layers, parallaxed by scrolling each at its own rate.
  for (const layer of [0.45, 1]) {
    const cx = camX * layer;
    const i0 = Math.floor(cx / TILE_UM), i1 = Math.floor((cx + w / pxPerUm) / TILE_UM);
    const j0 = -2, j1 = 2;
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        for (const p of SNOW) {
          if (p.layer !== layer) continue;
          const px = ((i + p.x) * TILE_UM - cx) * pxPerUm;
          const py = toY((j + p.y) * TILE_UM - TILE_UM);
          if (px < -6 || px > w + 6 || py < -6 || py > h + 6) continue;
          ctx.fillStyle = `rgba(190, 220, 240, ${p.a * layer})`;
          ctx.beginPath();
          ctx.arc(px, py, p.r * dpr * layer, 0, TWO_PI);
          ctx.fill();
        }
      }
    }
  }

  // Corridor walls.
  ctx.fillStyle = 'rgba(10, 30, 24, 0.85)';
  const top = toY(-world.laneHalf), bot = toY(world.laneHalf);
  ctx.fillRect(0, 0, w, top);
  ctx.fillRect(0, bot, w, h - bot);
  ctx.strokeStyle = 'rgba(90, 150, 130, 0.35)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(0, top); ctx.lineTo(w, top);
  ctx.moveTo(0, bot); ctx.lineTo(w, bot);
  ctx.stroke();

  // Distance markers every millimetre.
  const mm0 = Math.floor(camX / 1000), mm1 = Math.ceil((camX + w / pxPerUm) / 1000);
  for (let m = mm0; m <= mm1; m++) {
    if (m <= 0) continue;
    const x = toX(m * 1000);
    ctx.strokeStyle = 'rgba(120, 190, 165, 0.16)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, top); ctx.lineTo(x, bot);
    ctx.stroke();
    // Along the bottom of the corridor, clear of the meters in the top right.
    text(ctx, `${m} mm`, x + 4 * dpr, bot - 6 * dpr, 'rgba(120, 190, 165, 0.35)', 10, dpr);
  }

  // The cell's wake.
  if (cell.trail.length > 1) {
    ctx.lineWidth = 1.3 * dpr;
    for (let i = 1; i < cell.trail.length; i++) {
      const age = i / cell.trail.length;
      const a = cell.trail[i - 1], b = cell.trail[i];
      ctx.strokeStyle = `rgba(120, 200, 230, ${(0.02 + 0.20 * age * age).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(toX(a.x), toY(a.y));
      ctx.lineTo(toX(b.x), toY(b.y));
      ctx.stroke();
    }
  }

  // Predators. An alerted one shows the ring it is homing on, so being hunted
  // is legible before it is fatal.
  for (const p of world.predators) {
    const px = toX(p.x), py = toY(p.y);
    if (px < -80 * dpr || px > w + 80 * dpr) continue;
    const r = p.spec.r * pxPerUm;
    if (p.alerted > 0) {
      ctx.strokeStyle = `rgba(240, 90, 90, ${0.10 + 0.20 * Math.min(1, p.alerted / p.spec.patience)})`;
      ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath();
      ctx.arc(px, py, r * 2.4, 0, TWO_PI);
      ctx.stroke();
    }
    drawPredator(ctx, p, px, py, r, dpr, game.cell.elapsed);
  }

  // The cell.
  drawCell(ctx, cell, toX, toY, pxPerUm, dpr);

  // Hearing overlay: how far the cell's own flow signature currently reaches.
  // Drawn last so it sits over everything, and only when it is worth knowing.
  // The radius is the sharpest ear in the ocean scaled by how loud you are —
  // taken from the predator table rather than written down twice, so it cannot
  // quietly stop matching what actually hears you.
  if (cell.signature > 0.04 && cell.alive) {
    const reach = KEENEST_HEARING * (0.16 + 0.84 * cell.signature) * pxPerUm;
    ctx.strokeStyle = `rgba(240, 170, 90, ${0.06 + 0.18 * cell.signature})`;
    ctx.lineWidth = 1.2 * dpr;
    ctx.setLineDash([4 * dpr, 6 * dpr]);
    ctx.beginPath();
    ctx.arc(toX(cell.x), toY(cell.y), reach, 0, TWO_PI);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawHud(ctx, game, w, h, dpr, opts);
}

function drawPredator(ctx, p, px, py, r, dpr, t) {
  ctx.save();
  ctx.translate(px, py);
  const heading = Math.atan2(p.vy, p.vx);
  ctx.rotate(heading);
  ctx.fillStyle = p.spec.color;
  if (p.kind === 'medusa') {
    // A bell with trailing tentacles, pulsing.
    const pulse = 1 + 0.12 * Math.sin(t * 3 + p.phase);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * pulse, r * 0.82 * pulse, 0, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = p.spec.color;
    ctx.lineWidth = 1.4 * dpr;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * r * 0.3);
      ctx.quadraticCurveTo(-r * 1.0, i * r * 0.4 + Math.sin(t * 4 + i) * r * 0.18, -r * 1.8, i * r * 0.35);
      ctx.stroke();
    }
  } else if (p.kind === 'arrow') {
    // A chaetognath: a dart with fins.
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(r * 2.2, 0);
    ctx.lineTo(-r * 1.4, r * 0.7);
    ctx.lineTo(-r * 0.8, 0);
    ctx.lineTo(-r * 1.4, -r * 0.7);
    ctx.closePath();
    ctx.fill();
  } else {
    // A copepod: teardrop body, long antennae, flicking.
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.62, 0, 0, TWO_PI);
    ctx.fill();
    ctx.strokeStyle = p.spec.color;
    ctx.lineWidth = 1.3 * dpr;
    const flick = Math.sin(t * 9 + p.phase) * 0.5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(r * 0.5, s * r * 0.3);
      ctx.lineTo(r * 0.5 - r * 1.6, s * r * (1.1 + flick * 0.4));
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawCell(ctx, cell, toX, toY, pxPerUm, dpr) {
  const bx = toX(cell.x), by = toY(cell.y);

  // Cilia first, so the body sits on top of where they anchor.
  cell.cilia.forEach((c, i) => {
    const path = ciliumPath(cell, c, pxPerUm);
    const col = CILIUM_COLOR[i];
    // A driven cilium is bright and thick; an idle one is thin and dim.
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.30 + 0.65 * c.drive;
    ctx.lineWidth = (1.1 + 1.6 * c.drive) * dpr;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    for (let j = 0; j < path.length; j += 2) ctx.lineTo(bx + path[j], by + path[j + 1]);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  if (!cell.alive) {
    // Eaten: a small burst where the cell was.
    ctx.strokeStyle = 'rgba(240, 120, 110, 0.8)';
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

  const a = PTEROSPERMA.bodyLongUm * 0.5 * pxPerUm * BODY_EXAGGERATION;
  const b = PTEROSPERMA.bodyShortUm * 0.5 * pxPerUm * BODY_EXAGGERATION;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(cell.heading);
  // Bundling glow: the visible reward for keeping the cilia in phase.
  if (cell.bundle > 0.25) {
    ctx.shadowColor = 'rgba(140, 240, 200, 0.9)';
    ctx.shadowBlur = 14 * dpr * cell.bundle;
  }
  const grad = ctx.createRadialGradient(-a * 0.3, 0, 0, 0, 0, Math.max(a, b));
  grad.addColorStop(0, '#b6efd4');
  grad.addColorStop(1, '#3f8f80');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 0, a, b, 0, 0, TWO_PI);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(210, 255, 235, 0.7)';
  ctx.lineWidth = 1.1 * dpr;
  ctx.stroke();
  ctx.restore();
}

function drawHud(ctx, game, w, h, dpr, opts = {}) {
  const { cell } = game;
  const pad = 14 * dpr;

  text(ctx, `${(cell.progressUm / 1000).toFixed(2)} mm`, pad, 26 * dpr, INK, 18, dpr);
  text(ctx, `best ${(Math.max(game.best, cell.progressUm) / 1000).toFixed(2)} mm`,
    pad, 44 * dpr, DIM, 11, dpr);

  // Two meters that explain the game: how bundled you are, how loud you are.
  const meter = (label, v, y, color) => {
    const mw = 128 * dpr, mx = w - pad - mw;
    text(ctx, label, mx - 8 * dpr, y + 8 * dpr, DIM, 10, dpr, 'right');
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(mx, y, mw, 9 * dpr);
    ctx.fillStyle = color;
    ctx.fillRect(mx, y, mw * Math.max(0, Math.min(1, v)), 9 * dpr);
  };
  meter('bundle', cell.bundle, 18 * dpr, '#78e6bc');
  meter('noise', cell.signature, 36 * dpr,
    cell.signature > 0.6 ? '#f0655a' : '#f0b03c');

  // Key badges, coloured to match the filaments they drive. When real touch
  // buttons are on screen below the canvas these would just say the same thing
  // twice, so `compactKeys` drops the lettered boxes and keeps only the phase
  // dials — which are the part the buttons cannot show, and the part you
  // actually read to tell whether you are in phase.
  const compact = !!opts.compactKeys;
  const bw = 34 * dpr, gap = 8 * dpr;
  const totalW = bw * 4 + gap * 3;
  let kx = (w - totalW) * 0.5;
  const ky = h - pad - 34 * dpr;
  cell.cilia.forEach((c, i) => {
    const on = c.held;
    if (!compact) {
      ctx.fillStyle = on ? CILIUM_COLOR[i] : 'rgba(255,255,255,0.07)';
      ctx.fillRect(kx, ky, bw, 30 * dpr);
      ctx.strokeStyle = CILIUM_COLOR[i];
      ctx.globalAlpha = on ? 1 : 0.45;
      ctx.lineWidth = 1.4 * dpr;
      ctx.strokeRect(kx, ky, bw, 30 * dpr);
      ctx.globalAlpha = 1;
      text(ctx, KEYS[i].toUpperCase(), kx + bw * 0.5, ky + 20 * dpr,
        on ? '#0a0f14' : CILIUM_COLOR[i], 15, dpr, 'center');
    }
    // A little phase dial under each key: where that cilium is in its stroke.
    // Four dials converging is what "in phase" looks like.
    const cxp = kx + bw * 0.5, cyp = ky + (compact ? 16 : 42) * dpr, rr = (compact ? 9 : 7) * dpr;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.arc(cxp, cyp, rr, 0, TWO_PI); ctx.stroke();
    const ph = c.fl.phase * TWO_PI;
    ctx.strokeStyle = CILIUM_COLOR[i];
    ctx.lineWidth = 1.8 * dpr;
    ctx.beginPath();
    ctx.moveTo(cxp, cyp);
    ctx.lineTo(cxp + Math.cos(ph) * rr, cyp + Math.sin(ph) * rr);
    ctx.stroke();
    kx += bw + gap;
  });
}
