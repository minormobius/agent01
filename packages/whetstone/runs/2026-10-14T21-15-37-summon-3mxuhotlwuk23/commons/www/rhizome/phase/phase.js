// Rhizome phase map (Mozzie, 2026-10-14). Draws data.json (folded from Morphyx's sweep); computes nothing new.
const $ = id => document.getElementById(id);
const RED = [192, 57, 43], BLUE = [36, 87, 197], MID = [238, 236, 228], DEAD = '#555';
const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
const ramp = (t, lo, hi) => t < .5 ? mix(lo, MID, t * 2) : mix(MID, hi, (t - .5) * 2);
const lab = (p, s, h, L = 100) => `../lab/#g=sq4_1_${Math.min(L, 140)}_${p}_${s}_0_1007&l=25_25_0_0_${h}_clamp_5`;
const KEYS = {
  share: `<span class="sw" style="background:${mix(BLUE, BLUE, 0)}"></span> integrator holds it · <span class="sw" style="background:${mix(MID, MID, 0)}"></span> even · <span class="sw" style="background:${mix(RED, RED, 0)}"></span> splitter holds it · <span class="sw" style="background:${DEAD}"></span> all died`,
  both: `<span class="sw" style="background:${mix(MID, MID, 0)}"></span> in no run · <span class="sw" style="background:rgb(46,139,87)"></span> in all 10 runs, both kinds alive at step 500 (not the same as coexisting: see below) · <span class="sw" style="background:${DEAD}"></span> all died`,
  cover: `<span class="sw" style="background:${mix(MID, MID, 0)}"></span> almost nothing alive · <span class="sw" style="background:#222"></span> the whole field (% of squares, both kinds)`,
};
let mode = 'share', D, sel = null;
const fill = c => {
  if (c.dead === c.n) return DEAD;
  if (mode === 'share') return c.share == null ? DEAD : ramp(c.share, BLUE, RED);
  if (mode === 'both') return mix(MID, [46, 139, 87], c.both / c.n);
  return mix(MID, [34, 34, 34], Math.min(1, (c.S + c.I) / 100));
};
const r2 = x => Math.round(x * 100) / 100;
const PAD = { l: 34, b: 30, t: 6, r: 6 };

function maps() {
  const box = $('maps'); box.innerHTML = '';
  for (const s of [1, 2, 5, 10]) {
    const cells = D.sweep.filter(c => c.s === s), P = [...new Set(cells.map(c => c.p))].sort((a, b) => a - b), H = [...new Set(cells.map(c => c.h))].sort((a, b) => a - b);
    const cw = 20, ch = 22, cv = document.createElement('canvas'); cv.width = PAD.l + P.length * cw + PAD.r; cv.height = PAD.t + H.length * ch + PAD.b;
    const x = c => PAD.l + P.indexOf(c.p) * cw, y = c => PAD.t + (H.length - 1 - H.indexOf(c.h)) * ch, cx = cv.getContext('2d');
    cx.font = '10px system-ui'; cx.fillStyle = '#444';
    for (const c of cells) { cx.fillStyle = fill(c); cx.fillRect(x(c), y(c), cw - 1, ch - 1); }
    if (sel && sel.s === s) { cx.strokeStyle = '#000'; cx.lineWidth = 2; cx.strokeRect(x(sel) - 1, y(sel) - 1, cw + 1, ch + 1); }
    cx.fillStyle = '#444'; cx.textAlign = 'right';
    H.forEach((h, i) => cx.fillText(h.toFixed(1), PAD.l - 4, PAD.t + (H.length - 1 - i) * ch + ch / 2 + 3));
    cx.textAlign = 'center'; P.forEach((p, i) => { if (i % 2 === 1) cx.fillText(p.toFixed(1), PAD.l + i * cw + cw / 2, cv.height - PAD.b + 13); });
    cx.fillText('p (good fraction) →', PAD.l + P.length * cw / 2, cv.height - 3);
    cx.save(); cx.translate(9, PAD.t + H.length * ch / 2); cx.rotate(-Math.PI / 2); cx.fillText('h →', 0, 0); cx.restore();
    cv.onclick = ev => { const r = cv.getBoundingClientRect(), mx = (ev.clientX - r.left) * cv.width / r.width, my = (ev.clientY - r.top) * cv.height / r.height;
      const i = Math.floor((mx - PAD.l) / cw), j = H.length - 1 - Math.floor((my - PAD.t) / ch); if (i < 0 || i >= P.length || j < 0 || j >= H.length) return;
      const c = cells.find(c => c.p === P[i] && c.h === H[j]); if (c) pick(c); };
    const f = document.createElement('figure'); f.append(cv); const fc = document.createElement('figcaption'); fc.textContent = `blocks of ${s}×${s}`; f.append(fc); box.append(f);
  }
  $('key').innerHTML = KEYS[mode];
}
function pick(c) { sel = c; maps();
  $('out').innerHTML = `p ${c.p}, blocks ${c.s}, h ${c.h} · ${c.n} runs at L ${c.L}, step ${c.T}\n` +
    `cover at the end (mean % of squares): splitter ${r2(c.S)}, integrator ${r2(c.I)} · splitter share ${c.share == null ? '—' : c.share}\n` +
    `runs where both are alive ${c.both} · splitter alone ${c.sOnly} · integrator alone ${c.iOnly} · all dead ${c.dead}\n` +
    `<a class="go" href="${lab(c.p, c.s, c.h)}">Run it in the lab →</a> (the same ground and seeds as the first of the 10; press Run in pane 2, and run it past 500 to see whether it holds)`;
  location.hash = `p=${c.p}&s=${c.s}&h=${c.h}`; }
$('modes').onclick = e => { const m = e.target.dataset?.m; if (!m) return; mode = m; [...$('modes').querySelectorAll('button')].forEach(b => b.classList.toggle('on', b.dataset.m === m)); maps(); };

// ---------- the edge ----------
let along = 'p';
const SER = [['L 50, step 500', 50, 500, '#999'], ['L 100, step 500', 100, 500, '#555'], ['L 200, step 500', 200, 500, '#000'], ['L 50, step 250', 50, 250, '#e3a33b'], ['L 200, step 1000', 200, 1000, '#b03a8c']];
function edge() {
  const cv = $('edge'), cx = cv.getContext('2d'), W = cv.width, Hh = cv.height, pl = 50, pr = 170, pt = 14, pb = 40;
  const rows = D.fs.filter(c => c.along === along), xs = [...new Set(rows.map(c => c[along]))].sort((a, b) => a - b), x0 = xs[0], x1 = xs[xs.length - 1];
  const X = v => pl + (v - x0) / (x1 - x0) * (W - pl - pr), Y = v => Hh - pb - v * (Hh - pt - pb);
  cx.clearRect(0, 0, W, Hh); cx.font = '13px system-ui'; cx.strokeStyle = '#ccc'; cx.fillStyle = '#444'; cx.lineWidth = 1;
  for (const v of [0, .5, 1]) { cx.beginPath(); cx.moveTo(pl, Y(v)); cx.lineTo(W - pr, Y(v)); cx.stroke(); cx.textAlign = 'right'; cx.fillText(v, pl - 6, Y(v) + 4); }
  cx.textAlign = 'center'; xs.forEach((v, i) => { if (xs.length < 16 || i % 2 === 0) cx.fillText(v, X(v), Hh - pb + 16); });
  cx.fillText(along === 'p' ? 'p, good fraction (h 0.9, blocks 1)' : 'h, pay on good ground (p 0.5, blocks 1)', (pl + W - pr) / 2, Hh - 6);
  cx.save(); cx.translate(14, (pt + Hh - pb) / 2); cx.rotate(-Math.PI / 2); cx.fillText('splitter share of the living', 0, 0); cx.restore();
  const pts = [];
  SER.forEach(([name, L, T, col], k) => { const ser = rows.filter(c => c.L === L && c.T === T && c.share != null).sort((a, b) => a[along] - b[along]); if (!ser.length) return;
    cx.strokeStyle = cx.fillStyle = col; cx.lineWidth = 2; cx.beginPath(); ser.forEach((c, i) => i ? cx.lineTo(X(c[along]), Y(c.share)) : cx.moveTo(X(c[along]), Y(c.share))); cx.stroke();
    ser.forEach(c => { cx.beginPath(); cx.arc(X(c[along]), Y(c.share), 3.5, 0, 7); cx.fill(); pts.push([X(c[along]), Y(c.share), c]); });
    cx.textAlign = 'left'; cx.fillRect(W - pr + 12, pt + 6 + k * 20, 14, 3); cx.fillText(name, W - pr + 32, pt + 11 + k * 20); });
  cv.onclick = ev => { const r = cv.getBoundingClientRect(), mx = (ev.clientX - r.left) * W / r.width, my = (ev.clientY - r.top) * Hh / r.height;
    let best = null, bd = 400; for (const [px, py, c] of pts) { const d = (px - mx) ** 2 + (py - my) ** 2; if (d < bd) { bd = d; best = c; } } if (!best) return;
    const c = best; $('edgeOut').innerHTML = `${along} ${c[along]} · L ${c.L}, step ${c.T}, ${c.n} runs · splitter share ${c.share} · integrator gone in ${c.sOnly} · splitter gone in ${c.iOnly} · both alive in ${c.both} · all dead in ${c.dead}\n` +
      `<a class="go" href="${lab(c.p, c.s, c.h, c.L)}">Open p ${c.p}, h ${c.h} in the lab →</a>${c.L > 140 ? ' (at L 100: the lab stops at 140)' : ''}`; };
  $('edgeNote').textContent = along === 'p'
    ? 'Read it yourself first. What Morphyx predicted, before the runs: a narrow step near the lattice threshold 0.593, narrowing as L grows. In these runs the step moves right and spreads as L grows, at a fixed 500 steps and 50 seeds at every size. Bigger fields take longer to fill, so the purple (L 200 at step 1,000) is the check on whether the drift is only time. Not settled. It is his to call.'
    : 'This sweep covers only h 0.40 to 0.50 at p 0.5. At L 50 and 100 the integrator is gone by step 500 in every run; at L 200 a few runs (up to 4 of 10 at h 0.5) still hold both. Where the integrator\'s low edge sits is not mapped yet.';
}
$('edgeModes').onclick = e => { const m = e.target.dataset?.e; if (!m) return; along = m; [...$('edgeModes').querySelectorAll('button')].forEach(b => b.classList.toggle('on', b.dataset.e === m)); $('edgeOut').textContent = ''; edge(); };

D = await (await fetch('data.json')).json();
maps(); edge();
const q = new URLSearchParams(location.hash.slice(1)); if (q.get('p')) { const c = D.sweep.find(c => c.p === +q.get('p') && c.s === +q.get('s') && c.h === +q.get('h')); if (c) pick(c); }
