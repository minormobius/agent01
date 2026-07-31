// worship/sand.js — geomancy cast IN SAND, ported from clock/geocast/index.html.
//
// Geomancy is earth-divination: you STAB dots into damp sand, sixteen bracketed lines (four to a Mother,
// four Mothers); the parity of each line's dot-count (odd → single •, even → double ••) builds the four
// Mothers → the shield → the Judge. This is the tactile sand engine the user asked for, not a roll.
//
// PORTED VERBATIM (the soil Field poke/measure, countDots/rawCounts peak-detection, the bracket overlay,
// the drag-to-stroke poking) with the page's element-ids replaced by two injected canvases (the sand +
// its overlay) + callbacks. Engines vendored under worship/lib/ (re-sync, never fork): soil.js (the
// height-field + mass-conserving poke), soil-render.js (WebGPU→canvas2d shaded render), geomancy.js.

import { soilProps, Field } from './lib/soil.js';
import { makeRenderer } from './lib/soil-render.js';
import { mothersFromCounts, shield } from './lib/geomancy.js';

export function createSand({ soil, overlay, onStatus = () => {}, onCast = () => {} }) {
  const octx = overlay.getContext('2d');
  const N = 320;
  const field = new Field(N);
  const props = soilProps(0.82, 0.13, 0.05, 0.40);   // damp pale sand — holds a crisp dot
  const ZSCALE = N * 0.0135;
  let tool = { R: 2, depth: 3 };
  let renderer = null, dirty = true, rafId = 0, phase = 'casting', SH = null, running = false;

  // 16 bracketed lines, in four Mother groups — VERBATIM geometry.
  const NLINES = 16, PERGROUP = 4, GROUPS = 4, GAPF = 0.7, mY = 0.07, mX = 0.135;
  const parenR = 3, parenDepth = 4, EX = parenR + 6;
  const BAND = 5, THRESH = 1.0, SEP = 6;
  const maxBase = (NLINES - 1) + (GROUPS - 1) * GAPF;
  const LINES = [];
  for (let i = 0; i < NLINES; i++) {
    const group = Math.floor(i / PERGROUP), row = i % PERGROUP;
    const base = i + group * GAPF, yn = mY + (base / maxBase) * (1 - 2 * mY);
    const yc = Math.round(yn * (N - 1));
    const xLn = mX, xRn = 1 - mX;
    const xLi = Math.round(xLn * (N - 1)) + EX, xRi = Math.round(xRn * (N - 1)) - EX;
    LINES.push({ i, group, row, yn, xLn, xRn, yc, xLi, xRi });
  }

  function requestRender() { if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; if (dirty && renderer) { renderer.render(field, props); dirty = false; } }); }

  function freshSand() {
    field.h.fill(0); field._d.fill(0);
    for (const L of LINES) { field.poke(L.xLn, L.yn, parenR, parenDepth, props.heave); field.poke(L.xRn, L.yn, parenR, parenDepth, props.heave); }
    dirty = true; requestRender();
    SH = null; phase = 'casting';
    measureCounts();
  }

  // measurement: read the dots along each line, between its brackets — VERBATIM.
  function countDots(prof) {
    let count = 0, last = -1e9;
    for (let x = 1; x < prof.length - 1; x++) if (prof[x] >= THRESH && prof[x] >= prof[x - 1] && prof[x] > prof[x + 1] && (x - last) >= SEP) { count++; last = x; }
    return count;
  }
  function rawCounts() {
    const h = field.h, counts = [];
    for (const L of LINES) {
      const y0 = Math.max(0, L.yc - BAND), y1 = Math.min(N - 1, L.yc + BAND);
      const prof = new Array(L.xRi - L.xLi + 1);
      for (let x = L.xLi; x <= L.xRi; x++) { let d = 0; for (let y = y0; y <= y1; y++) { const v = -h[y * N + x]; if (v > d) d = v; } prof[x - L.xLi] = d; }
      counts.push(countDots(prof));
    }
    return counts;
  }
  function measureCounts() {
    const counts = rawCounts(); drawOverlay(counts);
    const marked = counts.filter((n) => n > 0).length;
    onStatus({ text: marked ? `${marked} of 16 lines marked — read the cast when ready.` : 'The sand is fresh — stab your lines.', ready: marked > 0, phase });
    return counts;
  }
  function submit() {
    if (phase !== 'casting') return SH;
    const counts = rawCounts();
    SH = shield(mothersFromCounts(counts));
    drawOverlay(counts);
    phase = 'cast';
    onStatus({ text: 'The cast is read and fixed.', ready: true, phase });
    onCast(SH, counts);
    return SH;
  }

  // overlay: brackets, the implied line, group numerals, live counts — VERBATIM.
  function drawOverlay(counts) {
    const W = overlay.width, H = overlay.height; if (!W) return;
    octx.clearRect(0, 0, W, H);
    const lineGapPx = (LINES.length > 1 ? (LINES[1].yn - LINES[0].yn) : 0.05) * H;
    const fs = Math.max(11, lineGapPx * 1.05);
    octx.textBaseline = 'middle';
    const roman = ['I', 'II', 'III', 'IV'];
    octx.fillStyle = 'rgba(231,196,106,.5)'; octx.textAlign = 'center';
    octx.font = `${Math.max(12, fs * 0.9)}px ui-serif,Georgia,serif`;
    for (let g = 0; g < GROUPS; g++) { const first = LINES[g * PERGROUP], last = LINES[g * PERGROUP + PERGROUP - 1]; const yc = ((first.yn + last.yn) / 2) * H; octx.fillText(roman[g], mX * 0.42 * W, yc); }
    for (const L of LINES) {
      const y = L.yn * H, xL = L.xLn * W, xR = L.xRn * W;
      octx.strokeStyle = 'rgba(231,196,106,.16)'; octx.lineWidth = 1; octx.setLineDash([2, 5]);
      octx.beginPath(); octx.moveTo(xL + fs * 0.4, y); octx.lineTo(xR - fs * 0.4, y); octx.stroke(); octx.setLineDash([]);
      octx.fillStyle = 'rgba(231,196,106,.62)'; octx.font = `${fs}px ui-monospace,monospace`;
      octx.textAlign = 'center'; octx.fillText('(', xL, y); octx.fillText(')', xR, y);
      const n = counts[L.i], par = (n % 2 === 1) ? '•' : '••';
      octx.fillStyle = n > 0 ? 'rgba(236,220,192,.7)' : 'rgba(140,124,99,.5)';
      octx.font = `${Math.max(9, fs * 0.5)}px ui-monospace,monospace`; octx.textAlign = 'left';
      octx.fillText(`${n} ${par}`, xR + fs * 0.5, y);
    }
  }

  // stabbing dots (between the brackets); connect on a drag — VERBATIM.
  const stamp = (nx, ny) => field.poke(nx, ny, tool.R, tool.depth, props.heave);
  let drawing = false, lnx = 0, lny = 0;
  const fieldXY = (ev) => { const r = soil.getBoundingClientRect(); return [Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))]; };
  const after = () => { dirty = true; requestRender(); if (phase === 'casting') measureCounts(); };
  function strokeTo(nx, ny) {
    const dx = nx - lnx, dy = ny - lny, dist = Math.hypot(dx, dy) * (N - 1);
    if (dist < 1e-3) return;
    if (dist > 0.5 * (N - 1)) { stamp(nx, ny); }
    else { const step = Math.max(1, tool.R * 0.5), steps = Math.min(500, Math.max(1, Math.ceil(dist / step))); for (let s = 1; s <= steps; s++) { const t = s / steps; stamp(lnx + dx * t, lny + dy * t); } }
    after();
  }
  const onDown = (e) => { if (phase === 'cast') return; drawing = true; try { soil.setPointerCapture(e.pointerId); } catch (_) {} const [x, y] = fieldXY(e); lnx = x; lny = y; stamp(x, y); after(); e.preventDefault(); };
  const onMove = (e) => { if (!drawing) return; const [x, y] = fieldXY(e); strokeTo(x, y); lnx = x; lny = y; };
  const onUp = () => { drawing = false; };

  // a quick, uncounted hand (the "random" affordance) — VERBATIM intent.
  function randomCast() {
    freshSand();
    for (const L of LINES) { const n = Math.floor(Math.random() * 6); for (let k = 0; k < n; k++) { const t = (k + 1) / (n + 1) + (Math.random() - 0.5) * 0.02; stamp(L.xLn + (L.xRn - L.xLn) * t, L.yn + (Math.random() - 0.5) * 0.004); } }
    dirty = true; requestRender();
    return submit();
  }

  function sizeCanvas() {
    const r = soil.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (renderer) renderer.resize(w, h);
    overlay.width = w; overlay.height = h;
    dirty = true; requestRender(); drawOverlay(rawCounts());
  }

  return {
    async start() {
      running = true;
      renderer = await makeRenderer(soil, { N, zScale: ZSCALE, crackFreq: 9, crackMask: null });
      if (!running) return;   // closed before the renderer booted
      soil.addEventListener('pointerdown', onDown);
      soil.addEventListener('pointermove', onMove);
      soil.addEventListener('pointerup', onUp);
      soil.addEventListener('pointercancel', onUp);
      addEventListener('resize', sizeCanvas);
      sizeCanvas(); freshSand();
    },
    reset: freshSand,
    submit,
    randomCast,
    setTool(R, depth) { if (R != null) tool.R = R; if (depth != null) tool.depth = depth; },
    phase: () => phase,
    shield: () => SH,
    stop() {
      running = false; if (rafId) cancelAnimationFrame(rafId); rafId = 0;
      soil.removeEventListener('pointerdown', onDown); soil.removeEventListener('pointermove', onMove);
      soil.removeEventListener('pointerup', onUp); soil.removeEventListener('pointercancel', onUp);
      removeEventListener('resize', sizeCanvas);
      try { renderer && renderer.destroy && renderer.destroy(); } catch (_) {}
    },
  };
}
