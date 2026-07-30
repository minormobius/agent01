// worship/yarrow.js — the FULL yarrow-stalk I Ching ritual, ported from clock/yijing/index.html
// (the cast the user spent a long time getting to feel right). Self-contained: an injected canvas + a
// physical sim of 49 persistent stalks, the three-changes-per-line division, tap-to-split the bundle.
//
// PORTED VERBATIM where possible (splitFromMarker / computeChange / buildSeq / the stalk physical sim /
// the marker sweep), with the page's DOM couplings (#narr/#cast/#tally/element ids) replaced by an
// injected canvas + callbacks. Practice mode only (no Loft "cured set"): USE_SET=false, PACE=1.
//
// Flow: act() once → a line begins (49 stalks gathered, first change aiming). A marker sweeps; act()
// again taps to split; the stalks physically divide, a stalk is lifted, the fours are counted off and
// set aside, the rest gather. Three changes → one line value (6/7/8/9) via onLine. Six lines → onComplete.
//
// drawStalk is the vendored stalk renderer (worship/lib/stalk-render.js — re-sync, never fork).

import { drawStalk } from './lib/stalk-render.js';

// the yarrow division — VERBATIM from clock/yijing/index.html. The right heap must keep ≥2 stalks (one
// lifted, ≥1 to count by fours), so left is clamped to [1, stalks-2]. A casual tap lands ~uniformly, so
// the classic yarrow odds (moving yin 1/16 … moving yang 3/16) are preserved — the hand is now yours.
function splitFromMarker(stalks, marker) { return Math.max(1, Math.min(stalks - 2, 1 + Math.round(marker * (stalks - 3)))); }
function computeChange(stalks, left) {
  left = Math.max(1, Math.min(stalks - 2, left));
  const right = stalks - left;
  const rRem = (right - 1) % 4 || 4;     // one stalk lifted from the right heap first
  const lRem = left % 4 || 4;
  const held = 1 + lRem + rRem;          // the lifted stalk + both remainders
  return { total: stalks, left, right, lRem, rRem, held, after: stalks - held };
}

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const now = () => performance.now();
const NAMES = ['First', 'Second', 'Third'];

export function createYarrow({ canvas, onLine = () => {}, onComplete = () => {}, onStatus = () => {} }) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, SEED = (Math.random() * 1e9) | 0;
  let STICKS = [], LINES = [], anim = null, raf = 0, running = false;
  const PACE = 1, SWEEP = 1050;

  function resize() {
    const r = canvas.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height; canvas.width = W * DPR | 0; canvas.height = H * DPR | 0;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (STICKS.length) layoutAll(true);
  }
  const makeColour = (i) => { const r = mulberry32(((i * 2654435761) >>> 0) ^ SEED); return { h: 40 + r() * 16, s: 22 + r() * 30, l: 46 + r() * 26 }; };
  function newStick(i) { const r = mulberry32(((i * 40503 + 7) >>> 0) ^ SEED); return { id: i, x: 0, y: 0, ang: 0, tx: 0, ty: 0, tang: 0, w: 1.5 + r() * 1.1, bend: (r() - 0.5) * 0.5, jig: r(), col: makeColour(i), zone: 'pile' }; }
  function initSticks() { STICKS = []; for (let i = 0; i < 49; i++) STICKS.push(newStick(i)); layoutAll(true); }
  const geom = () => ({ baseY: H * 0.80, len: H * 0.30, cx: W * 0.42 });
  function place(s, tx, ty, tang, snap) { s.tx = tx; s.ty = ty; s.tang = tang; if (snap) { s.x = tx; s.y = ty; s.ang = tang; } }
  function layoutColumn(list, cx, baseY, spanW, len, snap) {
    const n = list.length;
    list.forEach((s, i) => {
      const f = n <= 1 ? 0.5 : i / (n - 1);
      const x = cx + (f - 0.5) * Math.min(spanW, 8 + n * 4.2);
      const lean = (f - 0.5) * 0.5 + s.bend * 0.18;
      s.len = len * (0.86 + 0.2 * s.jig);
      place(s, x, baseY, lean, snap);
    });
  }
  function layoutAside(snap) {
    const aside = STICKS.filter((s) => s.zone === 'aside');
    const ox = W * 0.5, oy = H * 0.165, len = geom().len * 0.62;
    aside.forEach((s, i) => {
      const col = i % 9, row = (i / 9) | 0;
      const x = ox + (col - 4) * W * 0.026 + (s.jig - 0.5) * 7;
      const y = oy + row * Math.max(9, H * 0.024) + (s.bend) * 6;
      s.len = len; place(s, x, y, 1.15 + (s.jig - 0.5) * 1.0, snap);
    });
  }
  function layoutAll(snap) {
    const g = geom();
    layoutColumn(STICKS.filter((s) => s.zone === 'pile'), g.cx, g.baseY, W * 0.46, g.len, snap);
    layoutColumn(STICKS.filter((s) => s.zone === 'left'), W * 0.20, g.baseY, W * 0.26, g.len, snap);
    layoutColumn(STICKS.filter((s) => s.zone === 'right'), W * 0.65, g.baseY, W * 0.26, g.len, snap);
    layoutAside(snap);
  }
  function easeSticks() { const k = 0.17; for (const s of STICKS) { s.x += (s.tx - s.x) * k; s.y += (s.ty - s.y) * k; s.ang += (s.tang - s.ang) * k; } }
  function drawStickObj(s) {
    drawStalk(ctx, { lenPx: s.len, diaPx: Math.max(2.6, s.w * 2.0), col: s.col, warp: Math.abs(s.bend) * 0.5, warpDir: s.bend >= 0 ? 1 : -1, nodes: Math.max(2, Math.round(s.len / 44)), grainSeed: ((s.id * 2654435761) >>> 0) || 1 }, { x: s.x, y: s.y, ang: s.ang, detail: 0.6, fuzz: false, ends: true });
  }
  function drawSticks() { for (const z of ['aside', 'left', 'right', 'pile']) for (const s of STICKS) if (s.zone === z) drawStickObj(s); }

  function drawHexagram(x, cy, vals, lineH, gap, full) {
    const total = 6 * lineH + 5 * gap; let y = cy + total / 2 - lineH / 2; const half = full * 0.42;
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const v = vals[i], drawn = v !== undefined && v !== null, yang = v === 7 || v === 9, moving = v === 6 || v === 9;
      ctx.lineWidth = lineH; ctx.lineCap = 'butt';
      ctx.strokeStyle = drawn ? (moving ? '#e7c46a' : 'rgba(231,196,106,.85)') : 'rgba(231,196,106,.12)';
      ctx.shadowColor = drawn ? 'rgba(231,196,106,.5)' : 'transparent'; ctx.shadowBlur = drawn ? 10 : 0;
      if (!drawn || yang) { ctx.beginPath(); ctx.moveTo(x - full * 0.5, y); ctx.lineTo(x + full * 0.5, y); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(x - full * 0.5, y); ctx.lineTo(x - full * 0.5 + half, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + full * 0.5 - half, y); ctx.lineTo(x + full * 0.5, y); ctx.stroke(); }
      ctx.shadowBlur = 0;
      if (moving) { ctx.fillStyle = v === 9 ? 'rgba(224,98,60,.9)' : 'rgba(224,98,60,.0)'; ctx.strokeStyle = '#e0623c'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, lineH * 0.5 + 2, 0, 7); if (v === 9) { ctx.fill(); } ctx.stroke(); }
      y -= lineH + gap;
    }
    ctx.restore();
  }

  function render() {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W * 0.5, H * 0.46, 10, W * 0.5, H * 0.46, W * 0.6);
    g.addColorStop(0, 'rgba(231,196,106,.05)'); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const hexX = W * 0.80, hexFull = W * 0.30, hexLineH = Math.max(4, H * 0.022), hexGap = Math.max(5, H * 0.026);
    drawHexagram(hexX, H * 0.46, LINES, hexLineH, hexGap, hexFull);
    ctx.save();
    ctx.fillStyle = 'rgba(233,214,168,.3)'; ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'center';
    ctx.fillText(LINES.length + ' / 6', hexX, H * 0.46 + (3 * hexLineH + 2.5 * hexGap) + 18);
    if (STICKS.some((s) => s.zone === 'aside')) { ctx.fillStyle = 'rgba(233,214,168,.30)'; ctx.fillText('set aside', W * 0.5, Math.max(12, H * 0.07)); }
    ctx.restore();
    if (anim && anim.phase === 'play') advancePlay();
    easeSticks(); drawSticks();
    if (anim && anim.phase === 'aim') {
      const G = geom(), baseY = G.baseY, len = G.len;
      const tt = (now() - anim.aimStart) % (2 * SWEEP);
      anim.marker = tt < SWEEP ? tt / SWEEP : 2 - tt / SWEEP;
      const bx0 = W * 0.18, bx1 = W * 0.66, mx = bx0 + (bx1 - bx0) * anim.marker, by = baseY + 18;
      ctx.strokeStyle = 'rgba(231,196,106,.18)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bx0, by); ctx.lineTo(bx1, by); ctx.stroke();
      ctx.strokeStyle = '#e7c46a'; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(231,196,106,.6)'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(mx, baseY - len * 0.95); ctx.lineTo(mx, by + 5); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#e7c46a'; ctx.beginPath(); ctx.moveTo(mx, by - 2); ctx.lineTo(mx - 5, by + 9); ctx.lineTo(mx + 5, by + 9); ctx.closePath(); ctx.fill();
      const left = splitFromMarker(anim.stalks, anim.marker), right = anim.stalks - left;
      ctx.font = '12px ui-monospace,monospace'; ctx.fillStyle = 'rgba(233,214,168,.7)';
      ctx.textAlign = 'right'; ctx.fillText(left, mx - 9, by + 24);
      ctx.textAlign = 'left'; ctx.fillText(right, mx + 9, by + 24);
    }
    raf = requestAnimationFrame(render);
  }

  function advancePlay() {
    const A = anim;
    if (now() - A.seqStart >= A.seq[A.seqI].ms) {
      A.seqI++;
      if (A.seqI >= A.seq.length) { endChange(); return; }
      A.seq[A.seqI].fn(); A.seqStart = now();
    }
  }
  const inZone = (z) => STICKS.filter((s) => s.zone === z);
  function buildSeq(step) {
    const P = PACE;
    return [
      { ms: 820 * P, fn: () => { const ps = inZone('pile').slice().sort((a, b) => a.x - b.x); ps.forEach((s, i) => s.zone = i < step.left ? 'left' : 'right'); layoutAll(); } },
      { ms: 560 * P, fn: () => { const r = inZone('right'); const s = r[r.length - 1]; if (s) s.zone = 'aside'; layoutAll(); } },
      { ms: 700 * P, fn: () => { const l = inZone('left'); for (let k = 0; k < step.lRem; k++) { const s = l[l.length - 1 - k]; if (s) s.zone = 'aside'; } layoutAll(); } },
      { ms: 700 * P, fn: () => { const r = inZone('right'); for (let k = 0; k < step.rRem; k++) { const s = r[r.length - 1 - k]; if (s) s.zone = 'aside'; } layoutAll(); } },
      { ms: 820 * P, fn: () => { STICKS.forEach((s) => { if (s.zone === 'left' || s.zone === 'right') s.zone = 'pile'; }); layoutAll(); } },
    ];
  }
  function endChange() {
    const A = anim; A.ci++;
    if (A.ci >= 3) { finishLine(); return; }
    A.stalks = A.curStep.after; A.phase = 'aim'; A.aimStart = now(); status();
  }
  function startLine() {
    if (LINES.length >= 6 || anim) return;
    STICKS.forEach((s) => s.zone = 'pile'); layoutAll();
    anim = { ci: 0, stalks: 49, phase: 'aim', aimStart: now(), marker: 0, curStep: null, seq: null, seqI: 0, seqStart: 0 };
    status();
  }
  function doSplit() {
    if (!anim || anim.phase !== 'aim') return;
    const left = splitFromMarker(anim.stalks, anim.marker);
    const step = computeChange(anim.stalks, left);
    anim.curStep = step; anim.phase = 'play';
    anim.seq = buildSeq(step); anim.seqI = 0; anim.seq[0].fn(); anim.seqStart = now();
    status();
  }
  function finishLine() {
    const value = anim.curStep.after / 4; anim = null; LINES.push(value);
    onLine(value, LINES.length);
    if (LINES.length >= 6) { status(); setTimeout(() => onComplete(LINES.slice()), 650); }
    else status();
  }

  // status text + the action label the panel shows on its button ('act' affordance).
  function status() {
    let label, text;
    if (LINES.length >= 6) { label = null; text = 'The six lines are cast.'; }
    else if (!anim) { label = LINES.length ? 'divide again' : 'divide the stalks'; text = LINES.length ? `Line ${LINES.length} cast — breathe, then divide again.` : 'Fifty stalks; one set aside. Forty-nine remain — divide them.'; }
    else if (anim.phase === 'aim') { label = 'split!'; text = `${NAMES[anim.ci]} change — ${anim.stalks} stalks in hand. Tap the bundle to split.`; }
    else { label = null; text = `${NAMES[anim.ci]} change — split ${anim.curStep.left} / ${anim.curStep.right}; lift one, count off fours, set ${anim.curStep.held} aside.`; }
    onStatus({ text, label, line: LINES.length, busy: !!(anim && anim.phase === 'play') });
  }

  // the single affordance: idle → begin a line; aiming → tap to split; counting → ignore.
  function act() {
    if (LINES.length >= 6) return;
    if (!anim) startLine();
    else if (anim.phase === 'aim') doSplit();
  }
  const onPointer = (e) => { e.preventDefault(); act(); };

  return {
    start() {
      LINES = []; anim = null; SEED = (Math.random() * 1e9) | 0;
      resize(); initSticks();
      canvas.addEventListener('pointerdown', onPointer);
      addEventListener('resize', resize);
      running = true; raf = requestAnimationFrame(render); status();
    },
    act,
    reset() { LINES = []; anim = null; SEED = (Math.random() * 1e9) | 0; initSticks(); status(); },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; canvas.removeEventListener('pointerdown', onPointer); removeEventListener('resize', resize); },
    lines: () => LINES.slice(),
    done: () => LINES.length >= 6,
  };
}
