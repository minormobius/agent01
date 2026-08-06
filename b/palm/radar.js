// palm/radar.js — the shareable card.
//
// An SVG string built by hand (no dependencies, and `packages/dataviz` has no
// radar to borrow), then rasterised through a canvas so it can be attached to a
// post. Deliberately a single dark look rather than theme-aware: this is an
// image that leaves the site, and it should look the same wherever it lands.
//
// The card's colour IS the verdict — hue runs from teal at the animal end to
// amber at the machine end — so it reads at thumbnail size, before any label.

// THE HEADLINE SITS UNDER THE PLOT, NOT IN IT. The composite used to live in a
// disc at the centre, which was not merely busy — it OCCLUDED DATA. Every axis
// below about the 35th percentile plots inside that radius, so the readings a
// low scorer most wants to see were the ones hidden behind their own score.
// (minormobius: Lexicon 10 and Cadence 28, both underneath it.)
//
// So the card now reads top to bottom — chart, verdict, archetype, identity —
// and the polygon is drawn on nothing but its own web.
const SIZE = 1080;
const CX = SIZE / 2, CY = 392;
const R = 236;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Teal (animal) → amber (machine). */
function accent(score) {
  const h = 168 - (168 - 32) * (score / 100);
  return { hue: h, mid: `hsl(${h} 78% 58%)`, dim: `hsl(${h} 62% 40%)`, glow: `hsl(${h} 90% 70%)` };
}

function point(i, n, frac) {
  const a = (-Math.PI / 2) + (i / n) * Math.PI * 2;
  return [CX + Math.cos(a) * R * frac, CY + Math.sin(a) * R * frac];
}

function polygon(vals, n) {
  return vals.map((v, i) => point(i, n, v).map((x) => x.toFixed(1)).join(',')).join(' ');
}

/**
 * @param {object} scored  the result of baseline.score()
 * @param {object} opts    { handle, subtitle }
 */
export function radarSvg(scored, { handle = '', subtitle = '', arch = null } = {}) {
  const axes = scored.axes;
  const n = axes.length;
  const c = accent(scored.composite ?? 50);
  const vals = axes.map((a) => (a.pct === null ? 0 : a.pct / 100));

  const rings = [0.25, 0.5, 0.75, 1].map((f) =>
    `<polygon points="${polygon(new Array(n).fill(f), n)}" fill="none" stroke="#ffffff" stroke-opacity="${f === 1 ? 0.22 : 0.09}" stroke-width="1.5"/>`
  ).join('');

  const spokes = axes.map((_, i) => {
    const [x, y] = point(i, n, 1);
    return `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#ffffff" stroke-opacity="0.12" stroke-width="1.5"/>`;
  }).join('');

  // The pool's midpoint, so the shape has something to be a shape against.
  const midline = `<polygon points="${polygon(new Array(n).fill(0.5), n)}" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="2" stroke-dasharray="5 7"/>`;

  const dots = axes.map((a, i) => {
    const [x, y] = point(i, n, vals[i]);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${a.soft ? 5 : 8}" fill="${a.soft ? 'none' : c.glow}" stroke="${c.glow}" stroke-width="2.5"/>`;
  }).join('');

  const labels = axes.map((a, i) => {
    const [lx, ly] = point(i, n, 1.17);
    const anchor = Math.abs(lx - CX) < 6 ? 'middle' : (lx > CX ? 'start' : 'end');
    const pct = a.pct === null ? '—' : Math.round(a.pct);
    return `<g>
      <text x="${lx.toFixed(0)}" y="${(ly - 6).toFixed(0)}" text-anchor="${anchor}" fill="#f4f1ea" font-size="30" font-weight="600" letter-spacing="1">${esc(a.label.toUpperCase())}</text>
      <text x="${lx.toFixed(0)}" y="${(ly + 24).toFixed(0)}" text-anchor="${anchor}" fill="${c.mid}" font-size="26" font-weight="700">${pct}${a.soft ? '' : '<tspan fill="#8a8578" font-size="18" font-weight="400">th</tspan>'}</text>
      <text x="${lx.toFixed(0)}" y="${(ly + 48).toFixed(0)}" text-anchor="${anchor}" fill="#8a8578" font-size="19">${esc(a.gloss)}</text>
    </g>`;
  }).join('');

  const score = scored.composite ?? '—';
  const bandName = scored.band ? scored.band.name : 'Unread';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" font-family="Georgia, 'Iowan Old Style', 'Times New Roman', serif">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="72%">
      <stop offset="0%" stop-color="hsl(${c.hue.toFixed(0)} 26% 13%)"/>
      <stop offset="100%" stop-color="#0a0a0c"/>
    </radialGradient>
    <radialGradient id="core" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${c.glow}" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="${c.glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <circle cx="${CX}" cy="${CY}" r="${R * 1.05}" fill="url(#core)"/>
  ${rings}${spokes}${midline}
  <polygon points="${polygon(vals, n)}" fill="${c.mid}" fill-opacity="0.30" stroke="${c.glow}" stroke-width="4" stroke-linejoin="round"/>
  ${dots}${labels}
  <line x1="${CX - 190}" y1="756" x2="${CX + 190}" y2="756" stroke="${c.dim}" stroke-opacity="0.5" stroke-width="1.5"/>
  <text x="${CX}" y="836" text-anchor="middle" fill="#f4f1ea" font-size="86" font-weight="700">${score}</text>
  <text x="${CX}" y="872" text-anchor="middle" fill="${c.mid}" font-size="22" font-weight="600" letter-spacing="4">${esc(bandName.toUpperCase())}</text>
  ${arch ? `<text x="${CX}" y="930" text-anchor="middle" fill="${c.glow}" font-size="42" font-weight="700">${esc(arch.name)}</text>
  <text x="${CX}" y="962" text-anchor="middle" fill="#a8a294" font-size="21" font-style="italic">${esc(arch.read)}</text>` : ''}
  <text x="${CX}" y="${SIZE - 62}" text-anchor="middle" fill="#f4f1ea" font-size="27">${esc(handle)}</text>
  <text x="${CX}" y="${SIZE - 37}" text-anchor="middle" fill="#8a8578" font-size="18">${esc(subtitle)}</text>
  <text x="${CX}" y="${SIZE - 13}" text-anchor="middle" fill="#5c584f" font-size="16" letter-spacing="1">b.mino.mobi/palm · percentile among ${scored.pool} accounts, not a probability</text>
</svg>`;
}

// ── the corpus tile ──────────────────────────────────────────────────────────
// The same hexagon at a fraction of the size, for showing the whole reference
// pool at once. No labels: at 150px a six-word ring is illegible noise, and the
// SHAPE is the readable thing — a spiky tile and a round one are different
// people at a glance, which is the entire point of tiling them.
//
// Takes plain numbers rather than a scored object so the browser can render 90
// tiles from a small JSON file without recomputing anything.
export function miniCard({ pcts, score: s = 50, size = 150 }) {
  const c = accent(s);
  const cx = size / 2, cy = size / 2, r = size * 0.40;
  const n = pcts.length;
  const pt = (i, frac) => {
    const a = (-Math.PI / 2) + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r * frac, cy + Math.sin(a) * r * frac];
  };
  const poly = (vals) => vals.map((v, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');

  const web = [0.5, 1].map((f) =>
    `<polygon points="${poly(new Array(n).fill(f))}" fill="none" stroke="#ffffff" stroke-opacity="${f === 1 ? 0.20 : 0.10}" stroke-width="1"/>`
  ).join('');
  const spokes = pcts.map((_, i) => {
    const [x, y] = pt(i, 1);
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#ffffff" stroke-opacity="0.10" stroke-width="1"/>`;
  }).join('');

  return `<svg viewBox="0 0 ${size} ${size}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="${size}" height="${size}" fill="hsl(${c.hue.toFixed(0)} 24% 10%)"/>
  ${web}${spokes}
  <polygon points="${poly(pcts.map((p) => (p === null ? 0 : p / 100)))}" fill="${c.mid}" fill-opacity="0.34" stroke="${c.glow}" stroke-width="2" stroke-linejoin="round"/>
</svg>`;
}

/** Rasterise for attaching to a post. Browser only. */
export function svgToPng(svg, size = SIZE) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = size; cv.height = size;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas produced no image'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not rasterise the card')); };
    img.src = url;
  });
}
