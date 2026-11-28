// viz.js: draws a score as what it measures. (Modulo, 11-25)
// x = time (s). y = pitch on a log scale, so equal ratios are equal heights.
// Grid: the score's own fundamental is found (lowest note ÷ k that puts most notes on whole harmonics);
// a line for each harmonic some note uses, and each octave of the fundamental, labelled n.
// Colour: each note's offset from the nearest equal-tempered key, −50 c blue, 0 grey, +50 c red.
// A note on a harmonic line is a whole-number ratio; its colour says how far that ratio is from the piano's keys.
// While playing: a playhead, sounding notes lit, and each strike flashes for 120 ms.

const cents = (m) => Math.round((m - Math.round(m)) * 1000) / 10; // offset from nearest key, 0.1 c
function hue(c) { // −50..+50 c → blue..grey..red
  const t = Math.max(-1, Math.min(1, c / 50)), a = Math.abs(t);
  const g = [150, 150, 150], hot = t < 0 ? [40, 90, 220] : [215, 50, 40];
  return g.map((v, i) => Math.round(v + (hot[i] - v) * Math.pow(a, 0.6)));
}

export function makeViz(canvas, legend) {
  let used = new Set(), notes = [], tmax = 1, lo = 0, hi = 1, base = 0, playing = null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = () => canvas.clientWidth, H = () => canvas.clientHeight;
  const L = 34, R = 8, T = 8, B = 20;
  const x = (t) => L + (t / tmax) * (W() - L - R);
  const y = (m) => T + (1 - (m - lo) / (hi - lo)) * (H() - T - B);

  function load(score) {
    notes = [];
    for (const p of score.parts || []) for (const e of p.events || []) notes.push({ ...e, c: cents(e.midi) });
    notes.sort((a, b) => a.at - b.at);
    if (!notes.length) { tmax = 1; lo = 0; hi = 1; draw(0); return; }
    tmax = Math.max(...notes.map((n) => n.at + n.dur)) || 1;
    const low = Math.min(...notes.map((n) => n.midi)), top = Math.max(...notes.map((n) => n.midi));
    // Find the fundamental: lowest note ÷ k, k = 1..32, that puts the most notes within 0.5 c of a whole harmonic (≤ 512).
    const hn = (m, b) => { const r = Math.pow(2, (m - b) / 12), k = Math.round(r); return k >= 1 && k <= 512 && Math.abs(1200 * Math.log2(r / k)) < 0.5 ? k : 0; };
    let best = { k: 1, on: -1 };
    for (let k = 1; k <= 32; k++) { const b = low - 12 * Math.log2(k), on = notes.filter((n) => hn(n.midi, b)).length; if (on > best.on) best = { k, on }; }
    // Only claim a fundamental if ≥ 90% of notes fit it: with 32 divisors and 512 harmonics, a random score lands some notes on lines by chance.
    const found = best.on >= 0.9 * notes.length;
    if (!found) best = { k: 1, on: notes.filter((n) => hn(n.midi, low)).length };
    base = low - 12 * Math.log2(best.k);
    used = found ? new Set(notes.map((n) => hn(n.midi, base)).filter(Boolean)) : new Set();
    lo = low - 1; hi = Math.max(top, low + 1) + 1;
    if (legend) {
      const off = notes.filter((n) => Math.abs(n.c) >= 5).length, f0 = 440 * Math.pow(2, (base - 69) / 12);
      const hs = [...used].sort((a, b) => a - b);
      legend.textContent = !found ? `${notes.length} notes, ${tmax.toFixed(1)} s. No common fundamental: no divisor of the lowest note (1 to 32) puts 90% of the notes on whole harmonics (best ${Math.round(100 * Math.max(...[...Array(32)].map((_, i) => notes.filter((n) => hn(n.midi, low - 12 * Math.log2(i + 1))).length)) / notes.length)}%). Lines are octaves of the lowest note. ${off} notes are 5 c or more off the nearest piano key.` : `${notes.length} notes, ${tmax.toFixed(1)} s. Fundamental found: ${f0.toFixed(4)} Hz (lowest note ÷ ${best.k}). ` +
        `${best.on} of ${notes.length} notes sit within 0.5 c of a whole harmonic of it` + (hs.length ? ` (${hs.length > 24 ? hs.length + ' distinct' : hs.join(', ')})` : '') +
        `. ${off} are 5 c or more off the nearest piano key.`;
    }
    draw(0);
  }

  function draw(now) {
    const w = W(), h = H();
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
    const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#fbfaf7'; g.fillRect(0, 0, w, h);
    g.font = '10px ui-monospace,monospace'; g.textBaseline = 'middle';
    // harmonic grid over the lowest note; skip labels that would collide
    let lastY = 1e9;
    for (let n = 1; n <= 512; n++) {
      const m = base + 12 * Math.log2(n); if (m > hi) break; if (m < lo || !(used.has(n) || !(n & (n - 1)))) continue;
      const yy = y(m); g.strokeStyle = n & (n - 1) ? '#e4e0d8' : '#cfc9bd'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(L, yy); g.lineTo(w - R, yy); g.stroke();
      if (lastY - yy >= 10) { g.fillStyle = '#8a8378'; g.fillText(String(n), 4, yy); lastY = yy; }
    }
    // time axis, a tick every 10 s (or 1 s for short pieces)
    const step = tmax > 40 ? 10 : tmax > 8 ? 2 : 1; g.fillStyle = '#8a8378'; g.textBaseline = 'top';
    for (let t = 0; t <= tmax; t += step) g.fillText(`${t}`, x(t) - 4, h - B + 6);
    // notes
    const bh = Math.max(2, Math.min(6, (h - T - B) / (hi - lo) / 3));
    for (const n of notes) {
      const [r, gg, b] = hue(n.c), on = now >= n.at && now < n.at + n.dur, fresh = now >= n.at && now - n.at < 0.12;
      const a = playing === null ? 0.35 + 0.6 * (n.velocity ?? 0.5) : on ? 1 : now > n.at + n.dur ? 0.25 : 0.45;
      g.fillStyle = `rgba(${r},${gg},${b},${a})`;
      g.fillRect(x(n.at), y(n.midi) - bh / 2, Math.max(1.5, x(n.at + n.dur) - x(n.at)), bh);
      if (fresh) { g.fillStyle = `rgba(${r},${gg},${b},${1 - (now - n.at) / 0.12})`; g.beginPath(); g.arc(x(n.at), y(n.midi), bh * 1.8, 0, 7); g.fill(); }
    }
    if (playing !== null) { g.strokeStyle = '#222'; g.beginPath(); g.moveTo(x(now), T); g.lineTo(x(now), h - B); g.stroke(); }
  }

  function start(getNow) {
    playing = getNow;
    const loop = () => { if (playing !== getNow) return; draw(getNow()); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  function stop() { playing = null; draw(0); }
  addEventListener('resize', () => draw(0));
  return { load, start, stop };
}
