// rings-app.js — the analytic schematic of the ring weave (ringweave.js). Pure 2D canvas: the two
// rings, the 12 counter-woven radial threads (6 above · 6 below), the K(6,6) crossings, the ring
// contacts, and the fulfillment nexus at the core. Hover a thread or a ring to trace its contacts.
import { buildRingWeave, ABOVE, BELOW } from './ringweave.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0, scale = 1;
const W = buildRingWeave();
const state = { hoverThread: null, hoverRing: null, flow: true, labels: true, cross: true, frame: 0 };

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h, a) => { const c = hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
const P = (x, y) => [CW / 2 + x * scale, CH / 2 + y * scale];

function resize() { const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1); CW = r.width; CH = r.height; cv.width = CW * DPR | 0; cv.height = CH * DPR | 0; scale = Math.min(CW, CH) * 0.43; }
addEventListener('resize', resize);

const active = (kind, id) => {
  if (!state.hoverThread && !state.hoverRing) return 1;            // nothing hovered → all bright
  if (kind === 'thread') return state.hoverThread === id ? 1 : (state.hoverRing ? 0.5 : 0.12);
  if (kind === 'ring') return state.hoverRing === id ? 1 : (state.hoverThread ? 0.4 : 0.8);
  return 1;
};

function drawRing(ring, emph) {
  ctx.beginPath(); ctx.arc(CW / 2, CH / 2, ring.r * scale, 0, 7);
  ctx.strokeStyle = rgba(ring.color, emph); ctx.lineWidth = ring.key === 'outer' ? 4 : 3.4; ctx.stroke();
  ctx.strokeStyle = rgba(ring.color, emph * 0.25); ctx.lineWidth = ring.key === 'outer' ? 9 : 8; ctx.stroke();   // glow
}
function strokeThread(th, a, wdt) {
  ctx.beginPath(); th.line.forEach((p, i) => { const [x, y] = P(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = rgba(th.color, a); ctx.lineWidth = wdt; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
}

function render() {
  state.frame++;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, CW, CH);

  // the rim + core discs (faint)
  ctx.beginPath(); ctx.arc(CW / 2, CH / 2, scale, 0, 7); ctx.setLineDash([3, 6]); ctx.strokeStyle = 'rgba(127,216,208,0.14)'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);

  // rings under the threads (so contacts read on top)
  drawRing(W.rings.outer, active('ring', 'reclaim'));
  drawRing(W.rings.inner, active('ring', 'assembly'));

  // nexus spokes — assembly (inner ring) is bonded to the fulfillment nexus at the core
  const nexA = active('ring', 'assembly');
  for (const c of W.contacts) if (c.ringKey === 'inner') { const [x, y] = P(c.x, c.y); ctx.beginPath(); ctx.moveTo(CW / 2, CH / 2); ctx.lineTo(x, y); ctx.strokeStyle = rgba('#d9b24a', 0.12 * nexA); ctx.lineWidth = 1; ctx.stroke(); }

  // threads: BELOW first (lower layer), then ABOVE over them — the "6 above · 6 below"
  for (const th of W.threads) if (th.layer === 'below') { const a = active('thread', th.id); strokeThread(th, a * 0.9, a > 0.6 ? 2.4 : 1.3); }
  for (const th of W.threads) if (th.layer === 'above') { const a = active('thread', th.id); strokeThread(th, a, a > 0.6 ? 2.6 : 1.4); }

  // crossings (K(6,6)) — the woven contacts; when a thread is hovered, only its own light up
  if (state.cross) for (const c of W.crossings) {
    const on = state.hoverThread ? (c.white === state.hoverThread || c.prod === state.hoverThread) : !state.hoverRing;
    const [x, y] = P(c.x, c.y); ctx.beginPath(); ctx.arc(x, y, on ? 2.4 : 1.4, 0, 7);
    ctx.fillStyle = rgba(c.whiteColor, on ? 0.9 : 0.18); ctx.fill();
  }

  // ring contacts — a node per (thread, ring); highlighted when its thread or ring is hovered
  for (const c of W.contacts) {
    const ringHot = state.hoverRing === c.ring, threadHot = state.hoverThread === c.thread;
    const on = ringHot || threadHot || (!state.hoverRing && !state.hoverThread);
    const [x, y] = P(c.x, c.y);
    ctx.beginPath(); ctx.arc(x, y, on ? 4.2 : 2.2, 0, 7);
    ctx.fillStyle = rgba(c.threadColor, on ? 1 : 0.22); ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(c.ringKey === 'outer' ? '#cf6b4a' : '#d9b24a', on ? 0.9 : 0.2); ctx.stroke();
  }

  // the fulfillment nexus at the core
  const pulse = 0.5 + 0.5 * Math.sin(state.frame * 0.05);
  ctx.beginPath(); ctx.arc(CW / 2, CH / 2, 15 + pulse * 3, 0, 7); ctx.fillStyle = rgba('#d9b24a', 0.10); ctx.fill();
  ctx.beginPath(); ctx.arc(CW / 2, CH / 2, 9, 0, 7); ctx.fillStyle = rgba('#cbd3e0', 0.9); ctx.fill();
  ctx.fillStyle = '#04050a'; ctx.font = '12px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⇅', CW / 2, CH / 2);

  // the radial metabolism arrows
  if (state.flow) drawFlow();
  if (state.labels) drawLabels();
}

function arrow(x1, y1, x2, y2, col, a) {
  ctx.strokeStyle = rgba(col, a); ctx.fillStyle = rgba(col, a); ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - Math.cos(ang - 0.4) * 7, y2 - Math.sin(ang - 0.4) * 7); ctx.lineTo(x2 - Math.cos(ang + 0.4) * 7, y2 - Math.sin(ang + 0.4) * 7); ctx.closePath(); ctx.fill();
}
function drawFlow() {
  const ph = (state.frame * 0.004) % 1;
  // INWARD: raws born at the reclaim ring flow toward the assembly ring (a few animated chevrons on spokes)
  for (let s = 0; s < 6; s++) {
    const ang = (s + 0.5) / 6 * Math.PI * 2;
    const r1 = W.rings.outer.r, r2 = W.rings.inner.r;
    const t = ph, r = r1 + (r2 - r1) * t, r_ = r1 + (r2 - r1) * Math.min(1, t + 0.06);
    const [x1, y1] = P(Math.cos(ang) * r, Math.sin(ang) * r), [x2, y2] = P(Math.cos(ang) * r_, Math.sin(ang) * r_);
    arrow(x1, y1, x2, y2, '#cf6b4a', 0.55);
  }
  // UP at the nexus: product rides the lift (a rising glyph)
  const up = (state.frame * 0.03) % 1;
  ctx.fillStyle = rgba('#d9b24a', 0.7 * (1 - up)); ctx.font = '13px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.fillText('▲', CW / 2, CH / 2 - 14 - up * 16);
  // OUTWARD: waste back to the rim (fainter, offset spokes)
  for (let s = 0; s < 6; s++) {
    const ang = (s) / 6 * Math.PI * 2;
    const r1 = W.rings.inner.r, r2 = W.rings.outer.r;
    const t = ph, r = r1 + (r2 - r1) * t, r_ = r1 + (r2 - r1) * Math.min(1, t + 0.05);
    const [x1, y1] = P(Math.cos(ang) * r, Math.sin(ang) * r), [x2, y2] = P(Math.cos(ang) * r_, Math.sin(ang) * r_);
    arrow(x1, y1, x2, y2, '#556', 0.3);
  }
}
function drawLabels() {
  ctx.font = '10px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle';
  // ring labels
  const or = W.rings.outer.r * scale, ir = W.rings.inner.r * scale;
  ctx.textAlign = 'center';
  ctx.fillStyle = rgba('#cf6b4a', active('ring', 'reclaim')); ctx.fillText('RECLAIM · outer ring · touches 12', CW / 2, CH / 2 - or - 10);
  ctx.fillStyle = rgba('#d9b24a', active('ring', 'assembly')); ctx.fillText('assembly · inner · 12', CW / 2, CH / 2 - ir - 8);
  // thread labels at the rim
  for (const th of W.threads) {
    const end = th.line[th.line.length - 1], [x, y] = P(end[0], end[1]);
    const a = active('thread', th.id); if (a < 0.5) continue;
    const ux = end[0], uy = end[1], L = Math.hypot(ux, uy) || 1;
    ctx.textAlign = ux > 0.05 ? 'left' : ux < -0.05 ? 'right' : 'center';
    ctx.fillStyle = rgba(th.color, a);
    ctx.fillText(th.label, x + ux / L * 9, y + uy / L * 9);
  }
}

// ── hover detection ──
function pick(mx, my) {
  const wx = (mx - CW / 2) / scale, wy = (my - CH / 2) / scale, rr = Math.hypot(wx, wy);
  // ring?
  let ring = null, ringD = 0.05;
  for (const rk of ['outer', 'inner']) { const d = Math.abs(rr - W.rings[rk].r); if (d < ringD) { ringD = d; ring = W.rings[rk].id; } }
  // thread? (nearest polyline point)
  let thread = null, thD = 14 / scale;
  for (const th of W.threads) for (const p of th.line) { const d = Math.hypot(p[0] - wx, p[1] - wy); if (d < thD) { thD = d; thread = th.id; } }
  // prefer whichever is closer in screen space
  if (thread && (!ring || thD * scale < ringD * scale)) { state.hoverThread = thread; state.hoverRing = null; }
  else if (ring) { state.hoverRing = ring; state.hoverThread = null; }
  else { state.hoverThread = null; state.hoverRing = null; }
  updateNow();
}
function updateNow() {
  const el = $('now');
  if (state.hoverThread) {
    const th = W.threads.find((t) => t.id === state.hoverThread);
    const nc = W.crossings.filter((c) => c.white === th.id || c.prod === th.id).length;
    el.innerHTML = `<span class="t" style="color:${th.color}">${th.label}</span> <span class="s">· ${th.layer === 'above' ? 'ops thread (upper) · verb ' + th.verb : 'engine thread (lower)'}</span>`
      + `<div class="s">crosses ${nc} ${th.layer === 'above' ? 'engines' : 'ops threads'} (K), and meets both rings — reclaim at the rim, assembly at the core.</div>`;
  } else if (state.hoverRing) {
    const ring = state.hoverRing === 'reclaim' ? W.rings.outer : W.rings.inner;
    el.innerHTML = `<span class="t" style="color:${ring.color}">${ring.label}</span> <span class="s">· ${ring.key} ring · touches 12</span><div class="s">${ring.role}</div>`;
  } else {
    el.innerHTML = `<span class="t">the whole weave</span><div class="s">6 ops above × 6 engines below (K 6,6) + two rings that each touch all 12 · fulfillment nexus at the core</div>`;
  }
}
cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); pick(e.clientX - r.left, e.clientY - r.top); });
cv.addEventListener('pointerleave', () => { state.hoverThread = null; state.hoverRing = null; updateNow(); });

// ── legend ──
function legend(el, list, layer) {
  el.innerHTML = list.map((t) => `<div class="leg" data-id="${t.id}"><span class="sw" style="background:${t.color}"></span>${t.label}<span class="g">${t.verb || layer}</span></div>`).join('');
  for (const d of el.querySelectorAll('.leg')) {
    d.addEventListener('pointerenter', () => { state.hoverThread = d.dataset.id; state.hoverRing = null; updateNow(); });
    d.addEventListener('pointerleave', () => { state.hoverThread = null; updateNow(); });
  }
}
legend($('legAbove'), ABOVE, 'ops');
legend($('legBelow'), BELOW, 'engine');

// ── toggles ──
const tog = (id, key) => $(id).addEventListener('click', () => { state[key] = !state[key]; $(id).classList.toggle('on', state[key]); });
tog('bflow', 'flow'); tog('blabels', 'labels'); tog('bcross', 'cross');

// ── loop ──
resize(); updateNow();
(function loop() { render(); requestAnimationFrame(loop); })();
globalThis.__rings = { W, state };
