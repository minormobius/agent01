// tjs/brut/structdraw.js — the engineer's sheets. Pure SVG strings over a
// report from struct.js, in the same idiom as blueprint.js: take the object,
// return a string, no DOM.
//
// These are the drawings an engineer would hand back with the architecture: the
// verification schedule with a margin on every line, the storey shear and drift
// diagrams, the mode shapes the periods came from, the design spectrum with the
// building's own periods marked on it, and a framing plan with every column
// coloured by how hard it is working.

import { rect as R } from './arch.js';
import { Sa, SFRS, G } from './struct.js';
import { PALETTES } from './blueprint.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n2 = (v) => Math.round(v * 100) / 100;
const eng = (v, unit) => {
  const a = Math.abs(v);
  if (unit === 'N') return a >= 1e6 ? (v / 1e6).toFixed(2) + ' MN' : a >= 1e3 ? (v / 1e3).toFixed(1) + ' kN' : v.toFixed(0) + ' N';
  if (unit === 'N·m') return a >= 1e6 ? (v / 1e6).toFixed(1) + ' MN·m' : (v / 1e3).toFixed(0) + ' kN·m';
  if (unit === '—') return v < 0.02 ? '1/' + Math.round(1 / Math.max(1e-9, v)) : v.toFixed(4);
  return v.toFixed(2) + (unit && unit !== '—' ? ' ' + unit : '');
};

// One ramp for utilisation everywhere — the plan, the table and the 3D bench all
// use it, so "amber" means the same thing in all three.
export function utilColour(u) {
  if (u <= 0.5) return '#3fbf7f';
  if (u <= 0.75) return '#8fc44a';
  if (u <= 0.9) return '#e8c341';
  if (u <= 1.0) return '#e88f3c';
  return '#e2564a';
}

const frame = (W, H, P, id, body) =>
  `<svg class="bp" viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace,SFMono-Regular,Menlo,monospace">
<rect width="${W}" height="${H}" fill="${P.paper}"/>
${body}
</svg>`;

const label = (x, y, t, P, size = 9, anchor = 'start', fill) =>
  `<text x="${n2(x)}" y="${n2(y)}" font-size="${size}" fill="${fill || P.text}" text-anchor="${anchor}">${esc(t)}</text>`;

/* ─────────────────────── the verification schedule ─────────────────────── */

export function verificationSVG(v, opts = {}) {
  const P = opts.palette || PALETTES.blueprint;
  const W = opts.width || 980;
  const rows = v.checks;
  const H = 108 + rows.length * 34 + 46;
  const out = [`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${P.ink}" stroke-width="1.6"/>`];

  out.push(label(16, 26, 'STRUCTURAL VERIFICATION', P, 11, 'start', P.accent));
  const vc = v.verdict === 'pass' ? '#3fbf7f' : v.verdict === 'marginal' ? '#e8c341' : '#e2564a';
  out.push(`<rect x="${W - 132}" y="12" width="116" height="22" rx="5" fill="${vc}" fill-opacity=".18" stroke="${vc}"/>`);
  out.push(label(W - 74, 27, v.verdict.toUpperCase(), P, 11, 'middle', vc));

  const hz = `${v.site.label}, site class ${v.site.siteClass} · SDS ${v.site.SDS.toFixed(2)}g · wind ${v.windV} m/s, exposure ${v.opts.exposure}`;
  out.push(label(16, 44, hz, P, 8.5));
  out.push(label(16, 58, `T₁ = ${v.summary.T1x.toFixed(2)} s (x) / ${v.summary.T1z.toFixed(2)} s (z) · ${v.summary.massTonnes.toLocaleString('en-GB')} t seismic mass · governing: ${v.governing.name}`, P, 8.5));
  out.push(`<line x1="10" y1="70" x2="${W - 10}" y2="70" stroke="${P.line}" stroke-width=".9"/>`);

  const cols = [16, W * 0.36, W * 0.50, W * 0.62, W * 0.70];
  out.push(label(cols[0], 86, 'CHECK', P, 8, 'start', P.soft || P.text));
  out.push(label(cols[1], 86, 'DEMAND', P, 8, 'end', P.text));
  out.push(label(cols[2], 86, 'CAPACITY', P, 8, 'end', P.text));
  out.push(label(cols[3], 86, 'MARGIN', P, 8, 'end', P.text));
  out.push(label(cols[4] + 8, 86, 'UTILISATION', P, 8, 'start', P.text));

  rows.forEach((c, i) => {
    const y = 108 + i * 34;
    const col = utilColour(c.util);
    out.push(label(cols[0], y, c.name, P, 9.5, 'start', P.ink));
    out.push(label(cols[0], y + 12, c.note || '', P, 7.5));
    out.push(label(cols[1], y, eng(c.demand, c.unit), P, 9, 'end', P.ink));
    out.push(label(cols[2], y, eng(c.capacity, c.unit), P, 9, 'end', P.ink));
    out.push(label(cols[3], y, (c.margin * 100).toFixed(0) + '%', P, 9.5, 'end', col));
    // the bar: full width is 100% utilisation, and it keeps going past it
    const bw = W - cols[4] - 74;   // leave room for the number past the 1.00 mark
    out.push(`<rect x="${n2(cols[4] + 8)}" y="${n2(y - 9)}" width="${n2(bw)}" height="11" fill="${P.faint}" fill-opacity=".35"/>`);
    out.push(`<rect x="${n2(cols[4] + 8)}" y="${n2(y - 9)}" width="${n2(Math.min(1.4, c.util) * bw)}" height="11" fill="${col}"/>`);
    out.push(`<line x1="${n2(cols[4] + 8 + bw)}" y1="${n2(y - 12)}" x2="${n2(cols[4] + 8 + bw)}" y2="${n2(y + 5)}" stroke="${P.ink}" stroke-width="1.2"/>`);
    out.push(label(cols[4] + 14 + bw, y, c.util.toFixed(2), P, 9, 'start', col));
    if (i < rows.length - 1) out.push(`<line x1="10" y1="${y + 18}" x2="${W - 10}" y2="${y + 18}" stroke="${P.faint}" stroke-width=".4"/>`);
  });

  out.push(label(16, H - 26, 'ASCE 7-16 (seismic ch. 11–12, wind ch. 26–27) · ACI 318-19 · sections CHECKED, not sized.', P, 7.5));
  out.push(label(16, H - 14, 'Not covered: foundations, torsion, P-Δ, beam and slab design, diaphragm and connection design.', P, 7.5));
  return frame(W, H, P, 'ver', out.join('\n'));
}

/* ───────────────── storey shear + drift, side by side ──────────────────── */

export function storeySVG(v, dir, opts = {}) {
  const P = opts.palette || PALETTES.blueprint;
  const W = opts.width || 640, H = opts.height || 420, pad = 46;
  const d = v.dirs[dir], M = d.M;
  const n = M.n;
  const topY = M.height;
  const half = (W - pad * 3) / 2;
  const out = [];

  const Y = (y) => n2(H - 46 - (y / topY) * (H - 92));
  const panels = [
    { x0: pad, title: 'storey shear', eq: d.eq.shear, wd: d.wd.shear, unit: 'MN', scale: 1e6, limit: null },
    { x0: pad * 2 + half, title: 'storey drift ratio', eq: d.eq.driftRatio, wd: d.wd.driftRatio, unit: '', scale: 1, limit: SFRS.driftLimit },
  ];

  for (const pan of panels) {
    const maxV = Math.max(1e-9, ...pan.eq, ...pan.wd, pan.limit || 0) * 1.12;
    const X = (val) => n2(pan.x0 + (Math.abs(val) / maxV) * half);
    // axes
    out.push(`<line x1="${pan.x0}" y1="${Y(0)}" x2="${pan.x0}" y2="${Y(topY)}" stroke="${P.ink}" stroke-width="1.4"/>`);
    out.push(`<line x1="${pan.x0}" y1="${Y(0)}" x2="${n2(pan.x0 + half)}" y2="${Y(0)}" stroke="${P.ink}" stroke-width="1.4"/>`);
    // the code limit, where there is one
    if (pan.limit) {
      out.push(`<line x1="${X(pan.limit)}" y1="${Y(0)}" x2="${X(pan.limit)}" y2="${Y(topY)}" stroke="#e2564a" stroke-width="1" stroke-dasharray="5 3"/>`);
      out.push(label(X(pan.limit) + 3, Y(topY) + 12, `limit ${pan.limit}`, P, 7.5, 'start', '#e2564a'));
    }
    // stepped profiles — a storey quantity is constant over its storey
    for (const [series, colour, name] of [[pan.eq, P.accent, 'earthquake'], [pan.wd, '#7fb4e0', 'wind']]) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const yb = i === 0 ? 0 : M.y[i - 1], yt = M.y[i];
        pts.push(`${X(series[i])},${Y(yb)}`, `${X(series[i])},${Y(yt)}`);
      }
      out.push(`<polyline points="${pan.x0},${Y(0)} ${pts.join(' ')} ${pan.x0},${Y(topY)}" fill="${colour}" fill-opacity=".14" stroke="${colour}" stroke-width="1.5"/>`);
    }
    out.push(label(pan.x0, Y(topY) - 14, pan.title, P, 9, 'start', P.ink));
    const peak = Math.max(...pan.eq, ...pan.wd);
    out.push(label(pan.x0 + half, Y(0) + 14, pan.unit ? (peak / pan.scale).toFixed(1) + ' ' + pan.unit : peak.toFixed(4), P, 8, 'end'));
  }

  // storey datums down the left
  for (let i = 0; i < n; i++) {
    out.push(`<line x1="${pad - 8}" y1="${Y(M.y[i])}" x2="${pad}" y2="${Y(M.y[i])}" stroke="${P.faint}"/>`);
    if (n <= 14 || i % 2 === 0) out.push(label(pad - 10, Y(M.y[i]) + 3, String(i), P, 7, 'end'));
  }
  out.push(label(pad, 22, `Storey response — sway in ${dir}`, P, 10, 'start', P.ink));
  out.push(`<rect x="${W - 150}" y="12" width="10" height="8" fill="${P.accent}" fill-opacity=".5" stroke="${P.accent}"/>`);
  out.push(label(W - 136, 20, 'earthquake', P, 8));
  out.push(`<rect x="${W - 74}" y="12" width="10" height="8" fill="#7fb4e0" fill-opacity=".5" stroke="#7fb4e0"/>`);
  out.push(label(W - 60, 20, 'wind', P, 8));
  return frame(W, H, P, 'st' + dir, out.join('\n'));
}

/* ───────────────────────────── mode shapes ─────────────────────────────── */

export function modesSVG(v, dir, opts = {}) {
  const P = opts.palette || PALETTES.blueprint;
  const W = opts.width || 640, H = opts.height || 420;
  const d = v.dirs[dir], M = d.M;
  const show = Math.min(3, d.md.modes.length);
  const cellW = W / show, pad = 34;
  const out = [];
  const Y = (y) => n2(H - 56 - (y / M.height) * (H - 104));

  for (let j = 0; j < show; j++) {
    const mo = d.md.modes[j];
    const cx = cellW * j + cellW / 2;
    const amp = (cellW / 2 - pad) / Math.max(...mo.phi.map(Math.abs));
    out.push(`<line x1="${n2(cx)}" y1="${Y(0)}" x2="${n2(cx)}" y2="${Y(M.height)}" stroke="${P.faint}" stroke-width=".6" stroke-dasharray="3 4"/>`);
    const pts = [`${n2(cx)},${Y(0)}`];
    for (let i = 0; i < M.n; i++) pts.push(`${n2(cx + mo.phi[i] * amp)},${Y(M.y[i])}`);
    out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${j === 0 ? P.accent : P.line}" stroke-width="2"/>`);
    for (let i = 0; i < M.n; i++) {
      out.push(`<circle cx="${n2(cx + mo.phi[i] * amp)}" cy="${Y(M.y[i])}" r="2" fill="${j === 0 ? P.accent : P.line}"/>`);
    }
    out.push(label(cx, H - 32, `mode ${j + 1}`, P, 9, 'middle', P.ink));
    out.push(label(cx, H - 20, `T = ${mo.T.toFixed(2)} s`, P, 8.5, 'middle'));
    out.push(label(cx, H - 9, `${(mo.massRatio * 100).toFixed(0)}% of mass`, P, 7.5, 'middle'));
  }
  out.push(label(16, 22, `Mode shapes — sway in ${dir}`, P, 10, 'start', P.ink));
  const a = v.summary.alpha;
  out.push(label(W - 16, 22, `α = H√(GA/EI) = ${a.toFixed(1)} — ${a < 1.5 ? 'bending like a cantilever wall' : a > 5 ? 'racking like a frame' : 'both at once'}`, P, 8, 'end'));
  return frame(W, H, P, 'mo' + dir, out.join('\n'));
}

/* ───────────────────── design spectrum + demand ─────────────────────────── */

export function spectrumSVG(v, opts = {}) {
  const P = opts.palette || PALETTES.blueprint;
  const W = opts.width || 640, H = opts.height || 300, pad = 46;
  const S = v.site;
  const Tmax = Math.max(3, v.summary.T1x * 1.6, v.summary.T1z * 1.6);
  const SaMax = S.SDS * 1.15;
  const X = (T) => n2(pad + (T / Tmax) * (W - pad - 20));
  const Y = (s) => n2(H - 40 - (s / SaMax) * (H - 74));
  const out = [];

  out.push(`<line x1="${pad}" y1="${Y(0)}" x2="${W - 20}" y2="${Y(0)}" stroke="${P.ink}" stroke-width="1.3"/>`);
  out.push(`<line x1="${pad}" y1="${Y(0)}" x2="${pad}" y2="${Y(SaMax)}" stroke="${P.ink}" stroke-width="1.3"/>`);
  const pts = [];
  for (let i = 0; i <= 240; i++) {
    const T = (i / 240) * Tmax;
    pts.push(`${X(T)},${Y(Sa(T, S))}`);
  }
  out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${P.accent}" stroke-width="2"/>`);
  // and the same spectrum divided by R — what the building is designed for
  const pts2 = [];
  for (let i = 0; i <= 240; i++) {
    const T = (i / 240) * Tmax;
    pts2.push(`${X(T)},${Y(Sa(T, S) / SFRS.R)}`);
  }
  out.push(`<polyline points="${pts2.join(' ')}" fill="none" stroke="${P.line}" stroke-width="1.2" stroke-dasharray="5 3"/>`);

  for (const [T, tag, colour] of [[v.summary.T1x, 'T₁ x', P.accent], [v.summary.T1z, 'T₁ z', '#7fb4e0']]) {
    out.push(`<line x1="${X(T)}" y1="${Y(0)}" x2="${X(T)}" y2="${Y(Sa(T, S))}" stroke="${colour}" stroke-width="1" stroke-dasharray="3 3"/>`);
    out.push(`<circle cx="${X(T)}" cy="${Y(Sa(T, S))}" r="3.5" fill="${colour}"/>`);
    out.push(label(X(T) + 5, Y(Sa(T, S)) - 5, `${tag} = ${T.toFixed(2)} s → ${Sa(T, S).toFixed(2)}g`, P, 8, 'start', colour));
  }
  for (const [T, name] of [[S.T0, 'T₀'], [S.Ts, 'Ts']]) {
    if (T < Tmax) out.push(label(X(T), Y(0) + 12, name, P, 7.5, 'middle'));
  }
  out.push(label(pad, 22, 'ASCE 7-16 design response spectrum', P, 10, 'start', P.ink));
  out.push(label(W - 20, 22, `SDS ${S.SDS.toFixed(2)}g · SD1 ${S.SD1.toFixed(2)}g · R = ${SFRS.R}`, P, 8, 'end'));
  out.push(label(pad, H - 8, 'solid: elastic demand   ·   dashed: ÷R, the design level', P, 7.5));
  return frame(W, H, P, 'spec', out.join('\n'));
}

/* ─────────────────── framing plan, columns by utilisation ───────────────── */

export function framingSVG(b, v, levelIndex, opts = {}) {
  const P = opts.palette || PALETTES.blueprint;
  const W = opts.width || 640, H = opts.height || 460, pad = 36;
  const L = b.levels[levelIndex];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const lv of b.levels) for (const wg of lv.wings) {
    x0 = Math.min(x0, R.x0(wg)); x1 = Math.max(x1, R.x1(wg));
    z0 = Math.min(z0, R.z0(wg)); z1 = Math.max(z1, R.z1(wg));
  }
  const m = Math.max(2, (x1 - x0) * 0.05);
  x0 -= m; x1 += m; z0 -= m; z1 += m;
  const s = Math.min((W - 2 * pad) / (x1 - x0), (H - 2 * pad - 26) / (z1 - z0));
  const ox = pad + ((W - 2 * pad) - (x1 - x0) * s) / 2;
  const oy = pad + ((H - 2 * pad - 26) - (z1 - z0) * s) / 2;
  const X = (x) => n2(ox + (x - x0) * s), Y = (z) => n2(oy + (z - z0) * s);
  const out = [];

  for (const wg of L.wings) {
    out.push(`<rect x="${X(R.x0(wg))}" y="${Y(R.z0(wg))}" width="${n2(wg.w * s)}" height="${n2(wg.d * s)}" fill="${P.bg}" fill-opacity=".5" stroke="${P.ink}" stroke-width="1.8"/>`);
  }
  for (const c of L.cores) {
    out.push(`<rect x="${X(R.x0(c))}" y="${Y(R.z0(c))}" width="${n2(c.w * s)}" height="${n2(c.d * s)}" fill="${P.core}" fill-opacity=".55" stroke="${P.ink}" stroke-width="1.4"/>`);
    if (c.w * s > 30) out.push(label(X(c.x), Y(c.z) + 3, 'SHEAR CORE', P, 6.5, 'middle', P.ink));
  }
  // gridlines on the structural bays
  const bay = b.params.bay;
  for (let x = Math.ceil(x0 / bay) * bay; x <= x1; x += bay)
    out.push(`<line x1="${X(x)}" y1="${Y(z0)}" x2="${X(x)}" y2="${Y(z1)}" stroke="${P.faint}" stroke-width=".4" stroke-dasharray="2 5"/>`);
  for (let z = Math.ceil(z0 / bay) * bay; z <= z1; z += bay)
    out.push(`<line x1="${X(x0)}" y1="${Y(z)}" x2="${X(x1)}" y2="${Y(z)}" stroke="${P.faint}" stroke-width=".4" stroke-dasharray="2 5"/>`);

  const here = v.gravity.columns.filter((c) => c.level === levelIndex);
  const phiPn = v.gravity.phiPn;
  const rMax = Math.max(4, Math.min(11, s * 0.55));
  for (const c of here) {
    const u = c.P / phiPn;
    const col = utilColour(u);
    const r = 3 + rMax * Math.min(1, u);
    out.push(`<circle cx="${X(c.x)}" cy="${Y(c.z)}" r="${n2(r)}" fill="${col}" fill-opacity=".75" stroke="${P.ink}" stroke-width=".7"/>`);
  }
  const worst = here.reduce((a, c) => (c.P > (a ? a.P : -1) ? c : a), null);
  if (worst) {
    out.push(`<circle cx="${X(worst.x)}" cy="${Y(worst.z)}" r="${n2(rMax + 6)}" fill="none" stroke="#e2564a" stroke-width="1.4"/>`);
    out.push(label(X(worst.x), Y(worst.z) - rMax - 10, `${(worst.P / phiPn).toFixed(2)}`, P, 8, 'middle', '#e2564a'));
  }

  out.push(label(pad - 10, H - 10, `Framing — level ${levelIndex} · ${here.length} columns ${v.gravity.colSize * 1000} mm sq · φPn ${(phiPn / 1e6).toFixed(1)} MN`, P, 9, 'start', P.ink));
  // the utilisation ramp, so a colour means a number
  const lw = 120, lx = W - pad - lw;
  for (let i = 0; i < 40; i++) {
    out.push(`<rect x="${n2(lx + (i / 40) * lw)}" y="${H - 22}" width="${n2(lw / 40 + 0.6)}" height="7" fill="${utilColour((i / 40) * 1.2)}"/>`);
  }
  out.push(label(lx, H - 26, '0', P, 7));
  out.push(label(lx + lw * (1 / 1.2), H - 26, '1.0', P, 7, 'middle'));
  out.push(label(lx + lw, H - 26, 'utilisation', P, 7, 'end'));
  return frame(W, H, P, 'fr' + levelIndex, out.join('\n'));
}

/* ────────────────────── the whole engineering set ───────────────────────── */

export function structureSheet(b, v, opts = {}) {
  const parts = [verificationSVG(v, opts), spectrumSVG(v, opts)];
  for (const dir of ['x', 'z']) { parts.push(storeySVG(v, dir, opts)); parts.push(modesSVG(v, dir, opts)); }
  parts.push(framingSVG(b, v, 0, opts));
  return parts.join('\n');
}
