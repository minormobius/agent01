// instrument.js — the free swimmer and the five read-outs around it.
//
// Nothing here models anything. Every number comes out of
// ../proteus/flagella.js, which is the model; this file swims a body with it
// and draws what it is doing. If a panel and the model ever disagree, the
// panel is wrong.
//
// The swimmer is the honest part. At Pterosperma's Reynolds number (~1e-3)
// there is no inertia and nothing coasts: velocity IS thrust over drag, which
// the model already reports as fl.speedUmS. So the whole integration is
//
//     position += thrustDirection * speedUmS * dt
//
// with no force accumulator, no damping constant, and no tuning. That is the
// one advantage this page has over the amoeba, which has to push its cilium
// against a spring-mass cortex and needs a fudge factor to do it.

import {
  PTEROSPERMA, WAVE_SPEED_UM_S, wavenumber,
  advanceFlagellum, thrustDirection, filamentPaths, swimSpeed, synthesize, thrust,
  createFlagellation, steadyState, STOP, SWIM, REORIENT, STATE_NAMES,
} from '../proteus/flagella.js';

const TWO_PI = Math.PI * 2;

export const STATE_COLOR = {
  [STOP]: '#6e96d2',
  [SWIM]: '#f0c85a',
  [REORIENT]: '#f06e5a',
};
const INK = '#d8d8d8';
const DIM = '#6a727b';
const GRID = 'rgba(255,255,255,0.08)';

// ------------------------------------------------------------- the swimmer --

export function createSwimmer(opts = {}) {
  const fl = createFlagellation(null, {
    seed: opts.seed ?? 20260818,
    beatScale: opts.beatScale ?? 12,
    stateScale: opts.stateScale ?? 3,
  });
  return {
    fl,
    // Position in um. The field is unbounded; the camera follows.
    x: 0, y: 0,
    // Trail of past positions, in um, for the track.
    trail: [{ x: 0, y: 0 }],
    trailMax: 1400,
    // Ethogram: [state, seconds] runs, most recent last.
    runs: [[fl.ctl.state, 0]],
    runsSpan: 60,          // seconds of history kept
    // Odometer.
    distanceUm: 0,
    elapsed: 0,
    // Occupancy measured on this run, to sit next to the paper's.
    occupancy: [0, 0, 0],
  };
}

// One step. dt is wall-clock seconds.
//
// Translation is divided by beatScale along with the beat, which keeps the
// distance covered per beat cycle exactly right — a cycle of the waveform you
// can see carries the cell exactly as far as it should. What it cannot keep
// right at the same time is the number of cycles in a swim bout, because the
// behaviour chain is compressed by a different factor. That conflict is not a
// bug to fix, it is the paper's four-orders-of-magnitude problem arriving in a
// browser, and the timescale panel says so out loud.
export function tickSwimmer(sw, dt) {
  const fl = sw.fl;
  const state = advanceFlagellum(fl, dt);

  const dir = thrustDirection(fl);
  const shown = fl.speedUmS / fl.beatScale;      // um/s, as displayed
  const step = shown * dt;
  sw.x += dir.x * step;
  sw.y += dir.y * step;
  sw.distanceUm += step;
  sw.elapsed += dt;
  sw.occupancy[state] += dt;

  const last = sw.trail[sw.trail.length - 1];
  if (Math.hypot(sw.x - last.x, sw.y - last.y) > 1.2) {
    sw.trail.push({ x: sw.x, y: sw.y });
    if (sw.trail.length > sw.trailMax) sw.trail.shift();
  }

  const tail = sw.runs[sw.runs.length - 1];
  if (tail[0] === state) tail[1] += dt;
  else sw.runs.push([state, dt]);
  let total = 0;
  for (let i = sw.runs.length - 1; i >= 0; i--) {
    total += sw.runs[i][1];
    if (total > sw.runsSpan) { sw.runs.splice(0, i); break; }
  }
  return state;
}

// ------------------------------------------------------------- canvas prep --

export function fitCanvas(cnv) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = cnv.getBoundingClientRect();
  const w = Math.max(2, Math.round(r.width * dpr));
  const h = Math.max(2, Math.round(r.height * dpr));
  if (cnv.width !== w || cnv.height !== h) { cnv.width = w; cnv.height = h; }
  const ctx = cnv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h, dpr };
}

function label(ctx, text, x, y, color = DIM, size = 11, dpr = 1) {
  ctx.fillStyle = color;
  ctx.font = `${size * dpr}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.fillText(text, x, y);
}

// ------------------------------------------------------------- panel: cell --
// Camera locked to the swimmer. Marine snow drifting past is the only way to
// see that a cell in an empty field is moving at all.

const SNOW = (() => {
  // Deterministic scatter, generated once in a large tile that the camera
  // wraps around modulo the tile size.
  const pts = [];
  let s = 0x2f6e2b1;
  const rnd = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 260; i++) pts.push({ x: rnd(), y: rnd(), r: 0.4 + rnd() * 1.6, a: 0.05 + rnd() * 0.22 });
  return pts;
})();
const SNOW_TILE_UM = 420;

export function drawCell(cnv, sw, { pxPerUm = 3.0 } = {}) {
  const { ctx, w, h, dpr } = fitCanvas(cnv);
  const fl = sw.fl;
  ctx.fillStyle = '#070b10';
  ctx.fillRect(0, 0, w, h);

  const s = pxPerUm * dpr;
  const camX = sw.x, camY = sw.y;
  const toX = (ux) => w * 0.5 + (ux - camX) * s;
  const toY = (uy) => h * 0.5 + (uy - camY) * s;

  // Marine snow, tiled.
  const tile = SNOW_TILE_UM;
  const i0 = Math.floor((camX - (w * 0.5) / s) / tile);
  const i1 = Math.floor((camX + (w * 0.5) / s) / tile);
  const j0 = Math.floor((camY - (h * 0.5) / s) / tile);
  const j1 = Math.floor((camY + (h * 0.5) / s) / tile);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      for (const p of SNOW) {
        const px = toX((i + p.x) * tile), py = toY((j + p.y) * tile);
        if (px < -4 || py < -4 || px > w + 4 || py > h + 4) continue;
        ctx.fillStyle = `rgba(200, 225, 240, ${p.a})`;
        ctx.beginPath();
        ctx.arc(px, py, p.r * dpr, 0, TWO_PI);
        ctx.fill();
      }
    }
  }

  // Wake. Faded toward the past so it reads as a track rather than as stray
  // lines ruled across the field; the straight runs joined by sharp corners are
  // the run-and-tumble signature, and are the thing worth seeing.
  if (sw.trail.length > 1) {
    ctx.lineWidth = 1.4 * dpr;
    ctx.lineCap = 'round';
    for (let i = 1; i < sw.trail.length; i++) {
      const age = i / sw.trail.length;          // 0 oldest, 1 newest
      const a = sw.trail[i - 1], b = sw.trail[i];
      ctx.strokeStyle = `rgba(240, 200, 90, ${(0.03 + 0.32 * age * age).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(toX(a.x), toY(a.y));
      ctx.lineTo(toX(b.x), toY(b.y));
      ctx.stroke();
    }
  }

  // The cilia. filamentPaths works in the flagellum's own px units, so plant
  // the anchor at the body and hand it this view's scale for the duration.
  const savedPx = fl.pxPerUm;
  fl.pxPerUm = s;
  fl.anchorX = toX(sw.x);
  fl.anchorY = toY(sw.y);
  const paths = filamentPaths(fl);
  const col = STATE_COLOR[fl.ctl.state];
  ctx.strokeStyle = col;
  ctx.lineWidth = (fl.bundle > 0.985 ? 2.6 : 1.5) * dpr;
  ctx.lineCap = 'round';
  for (const p of paths) {
    ctx.beginPath();
    ctx.moveTo(fl.anchorX, fl.anchorY);
    for (let k = 0; k < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]);
    ctx.stroke();
  }
  fl.pxPerUm = savedPx;

  // The body: an ellipse at true proportion to the cilia, 9 x 7.1 um, its long
  // axis along the heading.
  const a = PTEROSPERMA.bodyLongUm * 0.5 * s;
  const b = PTEROSPERMA.bodyShortUm * 0.5 * s;
  ctx.save();
  ctx.translate(toX(sw.x), toY(sw.y));
  ctx.rotate(fl.heading);
  ctx.translate(-a * 0.9, 0);              // cilia emerge from the anterior groove
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(a, b));
  g.addColorStop(0, 'rgba(150, 210, 180, 0.95)');
  g.addColorStop(1, 'rgba(60, 120, 110, 0.75)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, a, b, 0, 0, TWO_PI);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190, 240, 220, 0.6)';
  ctx.lineWidth = 1 * dpr;
  ctx.stroke();
  ctx.restore();

  // Scale bar: 50 um.
  const barUm = 50;
  const bx = 16 * dpr, by = h - 20 * dpr;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(bx, by); ctx.lineTo(bx + barUm * s, by);
  ctx.moveTo(bx, by - 4 * dpr); ctx.lineTo(bx, by + 4 * dpr);
  ctx.moveTo(bx + barUm * s, by - 4 * dpr); ctx.lineTo(bx + barUm * s, by + 4 * dpr);
  ctx.stroke();
  label(ctx, `${barUm} µm`, bx + barUm * s + 8 * dpr, by + 4 * dpr, DIM, 10, dpr);

  // State + speed, top left.
  label(ctx, STATE_NAMES[fl.ctl.state].toUpperCase(), 16 * dpr, 24 * dpr, col, 13, dpr);
  label(ctx,
    `${fl.freqHz.toFixed(0)} Hz   ${fl.speedUmS.toFixed(0)} µm/s   ${(sw.distanceUm / 1000).toFixed(2)} mm travelled`,
    16 * dpr, 42 * dpr, DIM, 11, dpr);
}

// ------------------------------------------------------------ panel: modes --
// Twenty signed bars. This is the entire state of the cilium — the shape drawn
// above is rebuilt from exactly these numbers every frame.

export function drawModes(cnv, sw) {
  const { ctx, w, h, dpr } = fitCanvas(cnv);
  const fl = sw.fl;
  const n = fl.modes.length;
  const pad = 22 * dpr;
  const mid = h * 0.56;
  const bw = (w - pad * 2) / n;

  // Autoscale. A stopped cilium beats at 10 Hz, so its wavenumber and therefore
  // its mode amplitudes are an order of magnitude below a swimming one's; on a
  // fixed axis the Stop state looks like a broken panel rather than a quiet
  // one. The peak tracks up instantly and decays slowly, and is printed, so the
  // axis is never silently lying about magnitude.
  let peak = 0;
  for (let i = 1; i < n; i++) peak = Math.max(peak, Math.abs(fl.modes[i]));
  sw.modePeak = Math.max(peak, (sw.modePeak || 0.05) * 0.995, 0.02);
  const scale = (h * 0.32) / sw.modePeak;

  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1 * dpr;
  ctx.beginPath();
  ctx.moveTo(pad, mid); ctx.lineTo(w - pad, mid);
  ctx.stroke();

  for (let i = 0; i < n; i++) {
    // Mode 0 is the mean orientation and swings a full turn; it would set the
    // scale for everything else on its own, so it is drawn clipped.
    const v = i === 0
      ? Math.max(-sw.modePeak, Math.min(sw.modePeak, fl.modes[0]))
      : fl.modes[i];
    const x = pad + i * bw;
    const bh = Math.max(-h * 0.32, Math.min(h * 0.32, v * scale));
    ctx.fillStyle = i === 0 ? 'rgba(240, 200, 90, 0.85)'
      : `rgba(150, 200, 240, ${(0.35 + 0.55 * Math.min(1, Math.abs(v) / sw.modePeak)).toFixed(2)})`;
    ctx.fillRect(x + bw * 0.15, mid - Math.max(bh, 0), bw * 0.7, Math.max(Math.abs(bh), dpr));
  }
  label(ctx, `θ̂ₙ  n = 0…19      axis ± ${sw.modePeak.toFixed(2)} rad`, pad, 15 * dpr, DIM, 10, dpr);
  label(ctx, 'the cilium above is rebuilt from exactly these 20 numbers',
    pad, h - 7 * dpr, DIM, 10, dpr);
}

// ------------------------------------------------------------ panel: chain --
// Three boxes and four edges, with the measured rates on them, and two
// occupancy bars per state: what the paper measured, and what this run has
// actually done. Under drive they come apart, which is the point of the drive.

export function drawChain(cnv, sw) {
  const { ctx, w, h, dpr } = fitCanvas(cnv);
  const fl = sw.fl;
  const R = PTEROSPERMA.rates;
  const paper = steadyState();
  const tot = sw.occupancy[0] + sw.occupancy[1] + sw.occupancy[2];
  const mine = tot > 0.5 ? sw.occupancy.map((o) => o / tot) : null;

  const order = [STOP, SWIM, REORIENT];
  const bw = (w - 40 * dpr) / 3;
  const boxY = 30 * dpr, boxH = 34 * dpr;

  // Edges first, so the boxes sit on top. Stop-Swim and Swim-Reorient only:
  // the topology is linear and the picture has to show that.
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.4 * dpr;
  for (const i of [0, 1]) {
    const x0 = 20 * dpr + bw * (i + 0.85);
    const x1 = 20 * dpr + bw * (i + 1.15);
    ctx.beginPath();
    ctx.moveTo(x0, boxY + boxH * 0.5);
    ctx.lineTo(x1, boxY + boxH * 0.5);
    ctx.stroke();
  }

  order.forEach((st, i) => {
    const x = 20 * dpr + bw * i;
    const on = fl.ctl.state === st;
    ctx.fillStyle = on ? STATE_COLOR[st] : 'rgba(255,255,255,0.07)';
    ctx.fillRect(x + bw * 0.08, boxY, bw * 0.84, boxH);
    label(ctx, STATE_NAMES[st], x + bw * 0.16, boxY + 21 * dpr,
      on ? '#0a0d12' : INK, 12, dpr);

    // Occupancy bars.
    const by = boxY + boxH + 16 * dpr;
    const bwid = bw * 0.84, bx = x + bw * 0.08;
    const draw = (frac, yy, color, tag) => {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(bx, yy, bwid, 7 * dpr);
      ctx.fillStyle = color;
      // sqrt so the 0.0003 Reorient share is not an invisible sliver
      ctx.fillRect(bx, yy, bwid * Math.sqrt(Math.max(0, Math.min(1, frac))), 7 * dpr);
      label(ctx, tag, bx, yy - 3 * dpr, DIM, 9, dpr);
    };
    draw(paper[st], by, 'rgba(255,255,255,0.42)',
      `measured ${(paper[st] * 100).toFixed(paper[st] < 0.01 ? 2 : 1)}%`);
    if (mine) {
      draw(mine[st], by + 26 * dpr, STATE_COLOR[st],
        `here ${(mine[st] * 100).toFixed(mine[st] < 0.01 ? 2 : 1)}%`);
    }
  });

  label(ctx, `rates s⁻¹ — St→Sw ${R.stopToSwim}   Sw→St ${R.swimToStop}   Sw→R ${R.swimToReorient}   R→Sw ${R.reorientToSwim}`,
    20 * dpr, 15 * dpr, DIM, 10, dpr);
  label(ctx, 'no Stop↔Reorient edge — a stopped cell must swim before it can turn',
    20 * dpr, h - 20 * dpr, DIM, 10, dpr);
  // Bar lengths are square-rooted so a 0.03% share stays visible; say so
  // rather than let someone read proportions off it.
  label(ctx, 'bar length ∝ √occupancy', 20 * dpr, h - 7 * dpr, 'rgba(106,114,123,0.7)', 9, dpr);
}

// ------------------------------------------------------ panel: dispersion --
// f against k. The paper's headline measurement, and the reason one scalar
// fixes the whole waveform.

export function drawDispersion(cnv, sw) {
  const { ctx, w, h, dpr } = fitCanvas(cnv);
  const fl = sw.fl;
  const F = PTEROSPERMA.swimFreqHz;
  const L = 44 * dpr, R = 14 * dpr, T = 22 * dpr, B = 26 * dpr;
  const kMax = wavenumber(F.max);
  const fx = (k) => L + (k / kMax) * (w - L - R);
  const fy = (f) => h - B - (f / F.max) * (h - T - B);

  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1 * dpr;
  ctx.strokeRect(L, T, w - L - R, h - T - B);

  // The four quantized dynein bands.
  for (const band of PTEROSPERMA.bands) {
    const y = fy(band);
    ctx.strokeStyle = 'rgba(150, 200, 240, 0.28)';
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath();
    ctx.moveTo(L, y); ctx.lineTo(w - R, y);
    ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, String(band), L - 34 * dpr, y + 3 * dpr, 'rgba(150,200,240,0.6)', 9, dpr);
  }

  // The relation itself.
  ctx.strokeStyle = 'rgba(240, 200, 90, 0.85)';
  ctx.lineWidth = 1.8 * dpr;
  ctx.beginPath();
  ctx.moveTo(fx(wavenumber(F.min)), fy(F.min));
  ctx.lineTo(fx(kMax), fy(F.max));
  ctx.stroke();

  // x ticks.
  ctx.strokeStyle = GRID;
  for (const k of [0.1, 0.2, 0.3, 0.4]) {
    if (k > kMax) continue;
    ctx.beginPath();
    ctx.moveTo(fx(k), h - B); ctx.lineTo(fx(k), h - B + 3 * dpr);
    ctx.stroke();
    label(ctx, k.toFixed(1), fx(k) - 7 * dpr, h - B + 13 * dpr, DIM, 9, dpr);
  }

  // Where the cell is right now.
  const k = wavenumber(fl.freqHz);
  ctx.fillStyle = STATE_COLOR[fl.ctl.state];
  ctx.beginPath();
  ctx.arc(fx(k), fy(fl.freqHz), 4.5 * dpr, 0, TWO_PI);
  ctx.fill();

  label(ctx, 'f (Hz)', 6 * dpr, T - 8 * dpr, DIM, 10, dpr);
  label(ctx, 'k = 2π/λ (rad µm⁻¹)', L, h - 5 * dpr, DIM, 10, dpr);
  ctx.textAlign = 'right';
  label(ctx, `wave speed ${(WAVE_SPEED_UM_S / 1000).toFixed(1)} mm/s`, w - R, T - 8 * dpr, DIM, 10, dpr);
  ctx.textAlign = 'left';
}

// ----------------------------------------------------------- panel: speed --
// Swimming speed against beat frequency, computed by running the model's own
// resistive-force calculation — not a fitted curve — with the measured
// 646 +/- 326 um/s band drawn behind it.

let SPEED_CURVE = null;
export function speedCurve(fl) {
  if (SPEED_CURVE) return SPEED_CURVE;
  const F = PTEROSPERMA.swimFreqHz;
  const pts = [];
  for (let i = 0; i <= 28; i++) {
    const f = F.min + (F.max - F.min) * (i / 28);
    pts.push({ f, u: measureSpeed(fl, f) });
  }
  SPEED_CURVE = pts;
  return pts;
}

// Cycle-averaged force-free speed at one frequency. Same routine the selftest
// uses; kept here so the panel cannot drift from the model. The probe gets its
// own buffers because thrust() mutates xyPrev, and borrowing the live
// flagellum's would corrupt the beat on screen.
function measureSpeed(fl, freq) {
  const probe = {
    ...fl,
    modes: new Float64Array(fl.modes.length),
    theta: new Float64Array(fl.theta.length),
    xy: new Float64Array(fl.xy.length),
    xyPrev: new Float64Array(fl.xy.length),
    vel: new Float64Array(fl.vel.length),
    havePrev: false, bendAmp: 0, phase: 0, freqHz: freq,
  };
  const STEPS = 96;
  const dt = 1 / (freq * STEPS);
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < STEPS * 2; i++) {
    probe.phase = (probe.phase + freq * dt) % 1;
    synthesize(probe, SWIM);
    const t = thrust(probe, dt);
    if (i >= STEPS) { sx += t.fx; sy += t.fy; n++; }
  }
  return swimSpeed(probe, { fx: sx / n, fy: sy / n });
}

export function drawSpeed(cnv, sw) {
  const { ctx, w, h, dpr } = fitCanvas(cnv);
  const fl = sw.fl;
  const F = PTEROSPERMA.swimFreqHz;
  const S = PTEROSPERMA.swimSpeedUmS;
  const pts = speedCurve(fl);
  const uMax = Math.max(S.mean + S.sd, ...pts.map((p) => p.u)) * 1.05;
  const L = 46 * dpr, R = 14 * dpr, T = 22 * dpr, B = 26 * dpr;
  const fx = (f) => L + (f / F.max) * (w - L - R);
  const fy = (u) => h - B - (u / uMax) * (h - T - B);

  // Measured band.
  ctx.fillStyle = 'rgba(112, 208, 136, 0.13)';
  ctx.fillRect(L, fy(S.mean + S.sd), w - L - R, fy(S.mean - S.sd) - fy(S.mean + S.sd));
  ctx.strokeStyle = 'rgba(112, 208, 136, 0.7)';
  ctx.lineWidth = 1.2 * dpr;
  ctx.beginPath();
  ctx.moveTo(L, fy(S.mean)); ctx.lineTo(w - R, fy(S.mean));
  ctx.stroke();

  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1 * dpr;
  ctx.strokeRect(L, T, w - L - R, h - T - B);

  // The model's own curve.
  ctx.strokeStyle = 'rgba(240, 200, 90, 0.9)';
  ctx.lineWidth = 1.8 * dpr;
  ctx.beginPath();
  pts.forEach((p, i) => { if (i === 0) ctx.moveTo(fx(p.f), fy(p.u)); else ctx.lineTo(fx(p.f), fy(p.u)); });
  ctx.stroke();

  // Ticks.
  ctx.strokeStyle = GRID;
  for (const f of [95, 190, 285]) {
    ctx.beginPath();
    ctx.moveTo(fx(f), h - B); ctx.lineTo(fx(f), h - B + 3 * dpr);
    ctx.stroke();
    label(ctx, String(f), fx(f) - 8 * dpr, h - B + 13 * dpr, DIM, 9, dpr);
  }
  for (const u of [S.mean, uMax * 0.5]) {
    label(ctx, u.toFixed(0), 8 * dpr, fy(u) + 3 * dpr, DIM, 9, dpr);
  }

  // Current beat.
  ctx.fillStyle = STATE_COLOR[fl.ctl.state];
  ctx.beginPath();
  ctx.arc(fx(fl.freqHz), fy(fl.ctl.state === STOP ? 0 : fl.speedUmS), 4.5 * dpr, 0, TWO_PI);
  ctx.fill();

  label(ctx, 'U (µm s⁻¹)', 6 * dpr, T - 8 * dpr, DIM, 10, dpr);
  label(ctx, 'beat frequency (Hz)', L, h - 5 * dpr, DIM, 10, dpr);
  ctx.textAlign = 'right';
  label(ctx, `measured ${S.mean} ± ${S.sd}`, w - R, T - 8 * dpr, 'rgba(112,208,136,0.85)', 10, dpr);
  ctx.textAlign = 'left';
}

// -------------------------------------------------------- panel: ethogram --
// The last minute of behaviour as a run-length strip. This is the only panel
// that shows the timescale separation directly: the Stops are slabs, the Swims
// are stripes, and the Reorients are hairlines you have to look for.

export function drawEthogram(cnv, sw) {
  const { ctx, w, h, dpr } = fitCanvas(cnv);
  const pad = 12 * dpr;
  const strip = h - 30 * dpr;
  let total = 0;
  for (const r of sw.runs) total += r[1];
  if (total <= 0) return;
  const span = Math.max(total, 4);
  let x = pad;
  for (const [st, secs] of sw.runs) {
    const ww = (secs / span) * (w - pad * 2);
    ctx.fillStyle = STATE_COLOR[st];
    // A 14 ms reorientation is a fraction of a pixel wide; floor it to one
    // device pixel so the rarest state is visible at all rather than aliasing
    // out of the record entirely.
    ctx.fillRect(x, 18 * dpr, Math.max(ww, dpr), strip - 6 * dpr);
    x += ww;
  }
  label(ctx, `behaviour, last ${total.toFixed(0)} s`, pad, 12 * dpr, DIM, 10, dpr);
  label(ctx, 'reorientations are one pixel wide — they are 41 ms against a 58 s stop',
    pad, h - 6 * dpr, DIM, 10, dpr);
}
