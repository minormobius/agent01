// draw.js — rendering for /griddle/. No simulation happens here.
//
// The single most important rule in this file: THE COOKING FACE IS NEVER
// DRAWN. What you see on the griddle is the cake's UP face, which before the
// flip is raw batter and tells you nothing directly about the browning
// underneath. Everything the player knows about the hidden side has to come
// through the two indirect cues — craters opening on the surface, and the rim
// going from wet-glossy to matte — plus the temperature gauge, which is what
// tells you how much to trust them.
//
// If this file ever draws the underside, the game stops existing.

import {
  GRIDDLE, POUR, SPATULA, RAIL, COUNTER_STANDARD,
  cakeRadiusMm, cakeThicknessMm, judge,
} from './game.js';

const TWO_PI = Math.PI * 2;

export const INK = '#e8dfd0';
export const DIM = '#7a6f60';
const IRON = '#1c1a19';

// Batter -> golden -> dark -> carbon. Browning 0..1.4ish.
export function crustColour(b) {
  const stops = [
    [0.00, [242, 231, 203]],   // raw batter
    [0.28, [226, 196, 132]],
    [0.50, [199, 138, 62]],    // golden
    [0.75, [140, 84, 34]],
    [1.00, [82, 45, 20]],      // too dark
    [1.40, [38, 26, 20]],      // carbon
  ];
  let a = stops[0], c = stops[stops.length - 1];
  for (let i = 1; i < stops.length; i++) {
    if (b <= stops[i][0]) { a = stops[i - 1]; c = stops[i]; break; }
  }
  const t = c[0] === a[0] ? 0 : Math.min(1, Math.max(0, (b - a[0]) / (c[0] - a[0])));
  const m = a[1].map((v, i) => Math.round(v + (c[1][i] - v) * t));
  return `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
}

// The iron's own glow. Cold is dead grey; hot enough to scorch is visibly red.
function ironColour(T) {
  const heat = Math.max(0, Math.min(1, (T - 120) / 145));
  const r = Math.round(28 + 92 * heat * heat);
  const g = Math.round(26 + 26 * heat * heat);
  const b = Math.round(25 + 14 * heat * heat);
  return `rgb(${r}, ${g}, ${b})`;
}

function fit(cnv) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(cnv.clientWidth * dpr));
  const h = Math.max(1, Math.round(cnv.clientHeight * dpr));
  if (cnv.width !== w || cnv.height !== h) { cnv.width = w; cnv.height = h; }
  const ctx = cnv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: cnv.clientWidth, h: cnv.clientHeight, dpr };
}

function text(ctx, s, x, y, col, size, weight = 400, align = 'left') {
  ctx.fillStyle = col;
  ctx.font = `${weight} ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
}

// Crater positions are fixed per cake so they do not swim about between
// frames; only how many are open changes.
const CRATER_SPOTS = (() => {
  const out = [];
  let s = 1337;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < 90; i++) {
    // Even-ish disc coverage, biased slightly inward — the rim sets first, so
    // bubbles survive longest in the middle.
    const r = Math.sqrt(rnd()) * 0.82;
    const a = rnd() * TWO_PI;
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, s: 0.5 + rnd() * 0.9 });
  }
  return out;
})();

export function drawStation(cnv, st, opts = {}) {
  const { ctx, w: W, h: H, dpr } = fit(cnv);
  const flash = opts.flash || 0;

  ctx.fillStyle = '#0b0a09';
  ctx.fillRect(0, 0, W, H);

  const pad = Math.min(W, H) * 0.045;
  const railW = Math.min(190, W * 0.24);
  const stageW = W - railW - pad * 2;

  // ---- the griddle -------------------------------------------------------
  const gx = pad + stageW * 0.5;
  const gy = H * 0.47;
  const gr = Math.min(stageW * 0.36, H * 0.34);

  // Heat haze under the iron when it is hot.
  const heat = Math.max(0, Math.min(1, (st.griddleC - 150) / 110));
  if (heat > 0.02) {
    const glow = ctx.createRadialGradient(gx, gy, gr * 0.7, gx, gy, gr * 1.55);
    glow.addColorStop(0, `rgba(220, 90, 30, ${0.30 * heat})`);
    glow.addColorStop(1, 'rgba(220, 90, 30, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(gx, gy, gr * 1.55, 0, TWO_PI); ctx.fill();
  }

  ctx.fillStyle = ironColour(st.griddleC);
  ctx.beginPath(); ctx.arc(gx, gy, gr, 0, TWO_PI); ctx.fill();
  ctx.strokeStyle = '#3a3532';
  ctx.lineWidth = 2 * dpr;
  ctx.stroke();

  // ---- the cake ----------------------------------------------------------
  const cake = st.cake;
  if (cake) {
    // Radius in canvas units. A target cake fills a bit over half the iron.
    const rr = gr * 0.62 * (cakeRadiusMm(cake.ml) / cakeRadiusMm(POUR.targetMl));

    // THE FACE YOU CAN SEE. Before the flip this is raw batter; after it, the
    // side that was cooking. That reveal is the whole payoff of a flip.
    const lift = st.loaded && st.lifting > 0 ? Math.min(1, st.lifting / SPATULA.carrySecs) : 0;
    const cy = gy - lift * gr * 0.55;
    const scale = 1 + lift * 0.10;

    ctx.save();
    ctx.translate(gx, cy);
    ctx.scale(scale, scale);

    if (lift > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, gr * 0.55 * (lift / scale), rr * 0.9, rr * 0.28, 0, 0, TWO_PI);
      ctx.fill();
    }

    ctx.fillStyle = crustColour(cake.up);
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, TWO_PI); ctx.fill();

    // The rim. Wet batter is glossy and pale at the edge; as the cake sets the
    // rim goes matte and lifts slightly. This is the second cue and it is
    // monotone, which is what makes it usable alongside the bubbling.
    const dry = cake.edgeDry;
    ctx.lineWidth = Math.max(1.5, rr * 0.10);
    ctx.strokeStyle = `rgba(${Math.round(250 - 60 * dry)}, ${Math.round(238 - 70 * dry)}, ${Math.round(212 - 80 * dry)}, ${0.30 + 0.55 * dry})`;
    ctx.beginPath(); ctx.arc(0, 0, rr * 0.94, 0, TWO_PI); ctx.stroke();

    // Wet sheen while the top is still liquid — it fades as the cake sets.
    const wet = Math.max(0, 1 - cake.set * 1.25);
    if (wet > 0.02 && cake.flips === 0) {
      const sh = ctx.createRadialGradient(-rr * 0.3, -rr * 0.35, 0, -rr * 0.3, -rr * 0.35, rr * 1.1);
      sh.addColorStop(0, `rgba(255, 252, 240, ${0.34 * wet})`);
      sh.addColorStop(1, 'rgba(255,252,240,0)');
      ctx.fillStyle = sh;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TWO_PI); ctx.fill();
    }

    // CRATERS — the cue. Only on the uncooked side; once flipped there is no
    // more gas to come and the surface is closed.
    if (cake.flips === 0) {
      const n = Math.round(cake.craters * 46);
      for (let i = 0; i < n && i < CRATER_SPOTS.length; i++) {
        const p = CRATER_SPOTS[i];
        const cr = rr * 0.055 * p.s;
        ctx.fillStyle = 'rgba(120, 96, 62, 0.85)';
        ctx.beginPath(); ctx.arc(p.x * rr, p.y * rr, cr, 0, TWO_PI); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 246, 226, 0.5)';
        ctx.lineWidth = Math.max(0.6, cr * 0.42);
        ctx.beginPath(); ctx.arc(p.x * rr, p.y * rr, cr * 1.12, 0, TWO_PI); ctx.stroke();
      }
    }

    if (cake.torn >= 1) {
      ctx.strokeStyle = 'rgba(210, 80, 60, 0.9)';
      ctx.lineWidth = 2.5 * dpr;
      for (let i = 0; i < 3; i++) {
        const a = i * 1.9;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * rr * 0.2, Math.sin(a) * rr * 0.2);
        ctx.lineTo(Math.cos(a + 0.5) * rr * 0.95, Math.sin(a + 0.5) * rr * 0.95);
        ctx.stroke();
      }
    }
    ctx.restore();

    // The hidden face, stated as a question rather than an answer.
    if (cake.flips === 0 && !opts.compact) {
      text(ctx, 'underside: ?', gx, gy + gr + 20, DIM, 11, 400, 'center');
    }
  } else if (st.pouring > 0) {
    // Batter arriving.
    const rr = gr * 0.62 * Math.sqrt(Math.max(st.pouring, 1) / POUR.targetMl);
    ctx.fillStyle = crustColour(0);
    ctx.beginPath(); ctx.arc(gx, gy, Math.max(2, rr), 0, TWO_PI); ctx.fill();
  }

  // ---- the spatula -------------------------------------------------------
  if (st.under > 0 || st.loaded) {
    const depth = st.loaded ? 1 : st.under;
    const bw = gr * 1.05, bh = gr * 0.34;
    const by = gy + gr * 0.72 - depth * gr * 0.95;
    ctx.fillStyle = '#8c9096';
    ctx.beginPath();
    ctx.roundRect(gx - bw / 2, by, bw, bh, 4 * dpr);
    ctx.fill();
    ctx.fillStyle = '#5a5e63';
    ctx.fillRect(gx - bw * 0.06, by + bh, bw * 0.12, gr * 0.9);
  }

  // ---- the squeeze bottle ------------------------------------------------
  const bx = pad + stageW * 0.10;
  const byy = H * 0.16;
  ctx.fillStyle = st.pouring > 0 ? '#d8cbb0' : '#4a443c';
  ctx.beginPath();
  ctx.roundRect(bx - 13, byy, 26, 46, 5);
  ctx.fill();
  ctx.fillStyle = '#2c2822';
  ctx.beginPath(); ctx.moveTo(bx - 5, byy + 46); ctx.lineTo(bx + 5, byy + 46); ctx.lineTo(bx + 2, byy + 58); ctx.lineTo(bx - 2, byy + 58); ctx.fill();
  if (st.pouring > 0 && !st.cake) {
    ctx.strokeStyle = crustColour(0);
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(bx, byy + 58); ctx.lineTo(gx, gy - gr * 0.1); ctx.stroke();
  }
  if (!opts.compact) text(ctx, 'Q', bx, byy - 8, DIM, 11, 600, 'center');

  // ---- the temperature gauge --------------------------------------------
  const tw = stageW * 0.72, tx = pad + (stageW - tw) / 2, ty = H - pad - 26;
  ctx.fillStyle = '#191715';
  ctx.beginPath(); ctx.roundRect(tx, ty, tw, 12, 6); ctx.fill();
  // The band where a pancake actually works.
  const tAt = (T) => tx + tw * Math.max(0, Math.min(1, (T - 120) / (GRIDDLE.maxC - 120)));
  ctx.fillStyle = 'rgba(120, 200, 130, 0.20)';
  ctx.fillRect(tAt(178), ty, tAt(200) - tAt(178), 12);
  const px = tAt(st.griddleC);
  ctx.fillStyle = ironColour(st.griddleC);
  ctx.fillRect(tx, ty, px - tx, 12);
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(px, ty - 4); ctx.lineTo(px, ty + 16); ctx.stroke();
  text(ctx, `${st.griddleC.toFixed(0)}°C`, px, ty - 8, INK, 11, 600, 'center');
  // The flame the burner is actually running, which lags the key.
  ctx.fillStyle = 'rgba(240, 150, 60, 0.85)';
  ctx.fillRect(tx, ty + 15, tw * st.burner, 3);
  if (!opts.compact) text(ctx, 'W', tx - 12, ty + 11, DIM, 11, 600, 'center');

  // ---- the order rail ----------------------------------------------------
  const rx = W - railW - pad * 0.4;
  text(ctx, 'ORDERS', rx, pad + 10, DIM, 10, 600);
  const maxShow = Math.min(st.tickets.length, RAIL.maxOpen);
  for (let i = 0; i < maxShow; i++) {
    const t = st.tickets[i];
    const yy = pad + 22 + i * 26;
    const urgency = Math.min(1, t.age / RAIL.patienceSecs);
    ctx.fillStyle = `rgba(${Math.round(60 + 150 * urgency)}, ${Math.round(56 - 20 * urgency)}, ${Math.round(48 - 20 * urgency)}, 0.9)`;
    ctx.beginPath(); ctx.roundRect(rx, yy, railW - 14, 20, 3); ctx.fill();
    ctx.fillStyle = urgency > 0.7 ? '#ffd9c8' : '#cfc4b2';
    ctx.font = `600 10px ui-monospace, Menlo, monospace`;
    ctx.fillText('1 short stack', rx + 7, yy + 14);
    // The time bar draining.
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(rx, yy + 18, (railW - 14) * (1 - urgency), 2);
  }
  if (st.tickets.length > RAIL.maxOpen) {
    text(ctx, `+${st.tickets.length - RAIL.maxOpen} more`, rx, pad + 30 + maxShow * 26, '#e08060', 10, 600);
  }

  // ---- the ledger --------------------------------------------------------
  const ly = H - pad - 74;
  text(ctx, `${st.served} served`, rx, ly, INK, 15, 600);
  text(ctx, `quality ${st.quality.toFixed(1)}`, rx, ly + 16, DIM, 10);
  text(ctx, `${st.rejected} sent back`, rx, ly + 30, st.rejected ? '#d08a70' : DIM, 10);
  if (st.walked) text(ctx, `${st.walked} walked out`, rx, ly + 44, '#d08a70', 10);

  // The last verdict from the counter — the only feedback on a face that was
  // hidden the whole time it mattered.
  if (st.lastVerdict) {
    const v = st.lastVerdict;
    const good = v.q >= COUNTER_STANDARD;
    text(ctx, good ? `sent out · ${v.q.toFixed(2)}` : `back · ${v.why}`,
      gx, H - pad - 46, good ? '#8fd0a0' : '#e08a70', 12, 600, 'center');
    if (!opts.compact) {
      text(ctx, `faces ${v.down.toFixed(2)} / ${v.up.toFixed(2)}`, gx, H - pad - 32, DIM, 10, 400, 'center');
    }
  }

  if (flash > 0) {
    ctx.fillStyle = `rgba(255, 236, 200, ${0.16 * flash})`;
    ctx.fillRect(0, 0, W, H);
  }
}
