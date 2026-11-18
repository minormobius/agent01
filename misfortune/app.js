// misfortune/app.js — draw the wheel, spin it, ping the pegs, reveal the card.
import { WEDGES, ORDER, COLORS } from './data.js';
import { step, wedgeAt, launchSpeed, TAU, mod } from './wheel.js';
import { drawCard } from './card.js';

const $ = (id) => document.getElementById(id);
const byId = new Map(WEDGES.map((w) => [w.id, w]));
const wedges = ORDER.map((id) => byId.get(id));
const N = wedges.length, W = TAU / N;

// colour per wedge: reds for real, a fixed cycle for fiction, the furniture its own
const colourOf = (() => {
  const map = new Map();
  let r = 0, f = 0;
  for (const w of wedges) {
    if (w.kind === 'real') map.set(w.id, COLORS.real[r++ % COLORS.real.length]);
    else if (w.kind === 'special') map.set(w.id, COLORS.special[w.id]);
    else map.set(w.id, COLORS.fiction[f++ % COLORS.fiction.length]);
  }
  return (w) => map.get(w.id);
})();
const lum = (hex) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const inkOn = (hex) => (lum(hex) > 0.36 ? '#1b0233' : '#ffffff');

// ── state ────────────────────────────────────────────────────────────────────
const S = { theta: 0, omega: 0, needle: 0, needleV: 0 };
let spinning = false, dragging = null, size = 0, dpr = 1;

// ── drawing ──────────────────────────────────────────────────────────────────
function drawWheel() {
  const cv = $('wheel'), stage = $('stage');
  dpr = Math.min(2, window.devicePixelRatio || 1);
  size = stage.clientWidth;
  cv.width = cv.height = Math.round(size * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const c = size / 2, R = size * 0.44;
  ctx.clearRect(0, 0, size, size);

  wedges.forEach((wd, i) => {
    const a0 = -Math.PI / 2 + i * W, a1 = a0 + W, col = colourOf(wd);
    ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, R, a0, a1); ctx.closePath();
    const g = ctx.createRadialGradient(c, c, R * 0.15, c, c, R);
    g.addColorStop(0, shade(col, 0.82)); g.addColorStop(0.75, col); g.addColorStop(1, shade(col, 0.88));
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1.5, size * 0.004); ctx.strokeStyle = 'rgba(40,10,0,0.55)'; ctx.stroke();

    // label along the radius, reading outward
    ctx.save();
    ctx.translate(c, c); ctx.rotate(a0 + W / 2);
    const lines = wd.label.split('\n');
    const fs = Math.max(9, Math.min(size * 0.03, (R * 0.62) / Math.max(...lines.map((l) => [...l].length)) * 1.32));
    ctx.font = `${fs}px Bungee, "Arial Black", sans-serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    const ink = inkOn(col);
    ctx.lineJoin = 'round';
    lines.forEach((l, k) => {
      const y = (k - (lines.length - 1) / 2) * fs * 1.08;
      if (ink === '#ffffff') { ctx.lineWidth = fs * 0.22; ctx.strokeStyle = 'rgba(30,0,10,0.55)'; ctx.strokeText(l, R * 0.9, y); }
      ctx.fillStyle = ink; ctx.fillText(l, R * 0.9, y);
    });
    ctx.restore();
  });
  // glossy sweep
  const gl = ctx.createLinearGradient(0, 0, 0, size);
  gl.addColorStop(0, 'rgba(255,255,255,0.16)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.beginPath(); ctx.arc(c, c, R, 0, TAU); ctx.fillStyle = gl; ctx.fill();
  // pegs: the separation rods
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + i * W, px = c + Math.cos(a) * R * 0.95, py = c + Math.sin(a) * R * 0.95;
    const pg = ctx.createRadialGradient(px - 1.5, py - 1.5, 0, px, py, size * 0.013);
    pg.addColorStop(0, '#fffbd1'); pg.addColorStop(0.5, '#e0a400'); pg.addColorStop(1, '#6b3f00');
    ctx.beginPath(); ctx.arc(px, py, size * 0.012, 0, TAU); ctx.fillStyle = pg; ctx.fill();
  }
  setTransform();
}
function shade(hex, k) {
  const v = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k));
  return `rgb(${v.join(',')})`;
}

// the gold rim and its chasing bulbs: does not turn with the wheel
function drawRim(t) {
  const cv = $('rim');
  if (cv.width !== Math.round(size * dpr)) { cv.width = cv.height = Math.round(size * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const c = size / 2, R = size * 0.44;
  ctx.clearRect(0, 0, size, size);
  ctx.lineWidth = size * 0.05;
  const g = ctx.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#fff2b0'); g.addColorStop(0.3, '#e0a400'); g.addColorStop(0.55, '#7a4a00'); g.addColorStop(0.8, '#f2b81c'); g.addColorStop(1, '#8a5200');
  ctx.strokeStyle = g; ctx.beginPath(); ctx.arc(c, c, R + size * 0.025, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(60,20,0,.8)';
  ctx.beginPath(); ctx.arc(c, c, R + 1, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.arc(c, c, R + size * 0.05, 0, TAU); ctx.stroke();
  const bulbs = 36, phase = Math.floor(t / (spinning ? 70 : 260));
  for (let k = 0; k < bulbs; k++) {
    const a = k / bulbs * TAU, x = c + Math.cos(a) * (R + size * 0.025), y = c + Math.sin(a) * (R + size * 0.025);
    const lit = (k + phase) % 3 === 0;
    const r = size * (lit ? 0.014 : 0.009);
    const b = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
    b.addColorStop(0, '#fff'); b.addColorStop(0.35, lit ? '#fff3b5' : '#d8b25a'); b.addColorStop(1, 'rgba(255,210,80,0)');
    ctx.fillStyle = b; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, TAU); ctx.fill();
  }
}
const setTransform = () => {
  $('wheel').style.transform = `rotate(${S.theta}rad)`;
  $('needle').style.transform = `rotate(${S.needle}rad)`;
};

// ── sound ────────────────────────────────────────────────────────────────────
let audio = null, muted = false;
try { muted = localStorage.getItem('misfortune-muted') === '1'; } catch { /* private mode */ }
const ensureAudio = () => {
  if (muted) return null;
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (audio.state === 'suspended') audio.resume();
  return audio;
};
let lastClick = 0;
function click(intensity = 1) {
  const a = ensureAudio(); if (!a) return;
  const now = a.currentTime;
  if (now - lastClick < 0.018) return;            // a blur of pegs is one buzz, not a crackle
  lastClick = now;
  const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
  o.type = 'square'; o.frequency.setValueAtTime(1900 + Math.random() * 300, now);
  o.frequency.exponentialRampToValueAtTime(700, now + 0.03);
  f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 2.5;
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.22 * intensity, now + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
  o.connect(f).connect(g).connect(a.destination); o.start(now); o.stop(now + 0.05);
  if (navigator.vibrate) try { navigator.vibrate(4); } catch { /* fine */ }
}
function fanfare(sad) {
  const a = ensureAudio(); if (!a) return;
  const now = a.currentTime;
  const notes = sad ? [392, 370, 349, 330] : [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((hz, i) => {
    const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
    const t = now + i * (sad ? 0.42 : 0.11), dur = sad ? (i === notes.length - 1 ? 1.1 : 0.38) : (i === notes.length - 1 ? 0.9 : 0.16);
    o.type = sad ? 'sawtooth' : 'triangle'; o.frequency.setValueAtTime(hz, t);
    if (sad && i === notes.length - 1) { o.frequency.setValueAtTime(hz, t); for (let k = 0; k < 8; k++) o.frequency.setValueAtTime(hz * (k % 2 ? 0.97 : 1), t + 0.25 + k * 0.08); }
    f.type = 'lowpass'; f.frequency.value = sad ? 900 : 5000;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(sad ? 0.16 : 0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  });
}
const setMuteLabel = () => { $('mute').textContent = muted ? 'SOUND: OFF' : 'SOUND: ON'; $('mute').setAttribute('aria-pressed', String(muted)); };
$('mute').onclick = () => { muted = !muted; try { localStorage.setItem('misfortune-muted', muted ? '1' : '0'); } catch { /* fine */ } setMuteLabel(); };
setMuteLabel();

// ── the loop ─────────────────────────────────────────────────────────────────
let last = performance.now();
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  if (spinning) {
    const sub = Math.max(1, Math.ceil(dt * 240));
    let crossed = 0;
    for (let k = 0; k < sub; k++) crossed += step(S, dt / sub, N);
    if (crossed) click(Math.min(1, 0.45 + Math.abs(S.omega) / 14));
    if (S.omega === 0 && Math.abs(S.needle) < 0.004 && Math.abs(S.needleV) < 0.05) land();
  } else if (!dragging && (Math.abs(S.needle) > 1e-3 || Math.abs(S.needleV) > 1e-3)) {
    step(S, dt, N);
  }
  setTransform();
  drawRim(t);
  requestAnimationFrame(frame);
}

function spin(omega) {
  if (spinning) return;
  ensureAudio();
  hideReveal();
  S.omega = omega;
  spinning = true;
  $('spin').disabled = true;
  $('live').textContent = 'spinning';
}
function land() {
  spinning = false;
  $('spin').disabled = false;
  const wd = wedges[wedgeAt(S.theta, N)];
  $('live').textContent = 'landed on ' + wd.title;
  setTimeout(() => reveal(wd, true), 450);
}

// ── fling ────────────────────────────────────────────────────────────────────
const angleAt = (ev) => {
  const r = $('stage').getBoundingClientRect();
  return Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2));
};
$('stage').addEventListener('pointerdown', (ev) => {
  if (spinning || ev.target.closest('#spin')) return;
  ensureAudio();
  dragging = { a: angleAt(ev), theta0: S.theta, samples: [[performance.now(), S.theta]] };
  $('stage').setPointerCapture(ev.pointerId);
});
$('stage').addEventListener('pointermove', (ev) => {
  if (!dragging) return;
  let d = angleAt(ev) - dragging.a;
  d = mod(d + Math.PI, TAU) - Math.PI;
  const before = Math.floor(mod(-S.theta, TAU) / W);
  S.theta += d; dragging.a = angleAt(ev);
  if (Math.floor(mod(-S.theta, TAU) / W) !== before) { click(0.6); S.needleV -= Math.sign(d) * 8; }
  dragging.samples.push([performance.now(), S.theta]);
  if (dragging.samples.length > 8) dragging.samples.shift();
});
$('stage').addEventListener('pointerup', () => {
  if (!dragging) return;
  const sm = dragging.samples, now = performance.now();
  const recent = sm.filter(([t]) => now - t < 120);
  dragging = null;
  if (recent.length < 2) return;
  const [t0, a0] = recent[0], [t1, a1] = recent[recent.length - 1];
  const omega = (a1 - a0) / Math.max(0.016, (t1 - t0) / 1000);
  // a lazy nudge is not a spin; a real fling is clamped so nobody wins by physics
  if (Math.abs(omega) > 4) spin(Math.sign(omega) * Math.min(18, Math.max(8, Math.abs(omega))));
});
$('spin').addEventListener('click', () => spin(launchSpeed()));

// ── reveal & share ───────────────────────────────────────────────────────────
let current = null;
async function reveal(wd, celebrate) {
  current = wd;
  await fontsReady;
  drawCard($('card'), wd, { scale: 1, colour: colourOf(wd) });
  $('src').innerHTML = wd.kind === 'real'
    ? `This one is real: ${esc(wd.date)}, reported by <a href="${wd.url}" target="_blank" rel="noopener">${esc(wd.source)}</a>.`
    : wd.kind === 'fiction' ? 'Invented. Not a forecast. Please let it stay invented.' : 'House rules.';
  $('reveal').classList.remove('hidden');
  const u = new URL(location.href); u.searchParams.set('w', wd.id); history.replaceState(null, '', u);
  if (celebrate) {
    const sad = wd.kind === 'real' || wd.id === 'ransom' || wd.id === 'loseturn';
    fanfare(sad);
    if (!sad) confetti();
  }
  $('share').focus({ preventScroll: true });
}
function hideReveal() { $('reveal').classList.add('hidden'); }
$('again').onclick = () => { hideReveal(); spin(launchSpeed()); };
$('reveal').addEventListener('click', (ev) => { if (ev.target === $('reveal')) hideReveal(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hideReveal(); });

const linkFor = (wd) => `${location.origin}/misfortune/?w=${encodeURIComponent(wd.id)}`;
const blob = () => new Promise((res) => $('card').toBlob(res, 'image/png'));
$('share').onclick = async () => {
  if (!current) return;
  const text = `I spun the Wheel of Misfortune and landed on: ${current.title}`;
  try {
    const file = new File([await blob()], `misfortune-${current.id}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, url: linkFor(current) }); return; }
    if (navigator.share) { await navigator.share({ text, url: linkFor(current) }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  await copyLink(); $('share').textContent = 'LINK COPIED';
  setTimeout(() => { $('share').textContent = 'SHARE THE CARD'; }, 1800);
};
$('save').onclick = async () => {
  if (!current) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await blob()); a.download = `misfortune-${current.id}.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
async function copyLink() {
  try { await navigator.clipboard.writeText(linkFor(current)); return true; } catch { return false; }
}
$('copy').onclick = async () => { $('copy').textContent = (await copyLink()) ? 'COPIED' : 'COPY FAILED'; setTimeout(() => { $('copy').textContent = 'COPY LINK'; }, 1600); };

// ── confetti: gold glitter, 2.5 s ────────────────────────────────────────────
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('confetti'), ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const cols = ['#fff2b0', '#ffd84a', '#f2a900', '#ffffff', '#ff4d6d', '#7cdcff'];
  const ps = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 12, r: 2 + Math.random() * 5,
    c: cols[(Math.random() * cols.length) | 0], s: Math.random() * TAU, vs: (Math.random() - 0.5) * 0.4,
  }));
  const t0 = performance.now();
  (function tick(t) {
    const e = t - t0;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of ps) {
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.s += p.vs;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.s);
      ctx.globalAlpha = Math.max(0, 1 - e / 2500);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
      ctx.restore();
    }
    if (e < 2500) requestAnimationFrame(tick); else ctx.clearRect(0, 0, cv.width, cv.height);
  })(t0);
}

// ── the marquee's bulbs ──────────────────────────────────────────────────────
function marquee() {
  const box = $('bulbs'), m = $('marquee');
  const w = m.offsetWidth, h = m.offsetHeight, gap = 26;
  const pts = [];
  for (let x = gap / 2; x < w; x += gap) pts.push([x, 0], [x, h]);
  for (let y = gap; y < h - gap / 2; y += gap) pts.push([0, y], [w, y]);
  box.innerHTML = pts.map(([x, y], i) => `<i style="left:${x}px;top:${y}px;animation-delay:${(i % 2) * 0.45}s"></i>`).join('');
}

// ── the real list ────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
$('realList').innerHTML = WEDGES.filter((w) => w.kind === 'real').map((w) =>
  `<li><b>${esc(w.title)}</b> <span class="d">· ${esc(w.date)} · <a href="${w.url}" target="_blank" rel="noopener">${esc(w.source)}</a></span><br>${esc(w.line)}</li>`).join('');

// ── boot ─────────────────────────────────────────────────────────────────────
const fontsReady = Promise.race([
  Promise.all([document.fonts.load('40px Bungee'), document.fonts.load('40px "Bungee Shade"'), document.fonts.load('20px "Source Sans 3"'), document.fonts.load('600 20px "Source Sans 3"')]),
  new Promise((r) => setTimeout(r, 2500)),
]).catch(() => {});
fontsReady.then(() => { drawWheel(); marquee(); });
drawWheel(); marquee();
// the marquee changes size as fonts land and on resize: re-bulb it whenever it does
if ('ResizeObserver' in window) new ResizeObserver(() => marquee()).observe($('marquee'));
let rT;
addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { drawWheel(); marquee(); }, 120); });
requestAnimationFrame((t) => { last = t; frame(t); });

// deep link: ?w=<id> turns the wheel to it and shows its card
const want = new URLSearchParams(location.search).get('w');
if (want && byId.has(want)) {
  const i = ORDER.indexOf(want);
  S.theta = -(i + 0.5) * W;
  setTransform();
  reveal(byId.get(want), false);
} else {
  S.theta = -(Math.random() * N | 0) * W - W / 2;
}
