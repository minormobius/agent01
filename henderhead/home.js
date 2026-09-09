// home.js — renders the shelf and the queue from demos.js, and runs the small
// hero curve. Everything on this page is data-driven from demos.js so that the
// front page cannot drift out of step with what is actually built.

import { DEMOS, BUILT, QUEUED, postURL } from './demos.js';
import { loadEngine } from './cf/engine.js';
import { resolve } from './cf/numbers.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------- shelf --

$('shelf').innerHTML = BUILT.map((d) => `
  <a class="built" href="${esc(d.href)}">
    <div>
      <h3>${esc(d.title)}</h3>
      <div class="from">after ${esc(d.date)} · ${esc(d.tags.join(' · '))}</div>
    </div>
    <p>${esc(d.what)}</p>
    <p style="color:var(--dim)">${esc(d.built)}</p>
    <p class="go">open the toy →</p>
  </a>
`).join('') || '<p style="color:var(--dim)">nothing built yet</p>';

// the link to his original goes outside the card, so that clicking the card
// never takes someone somewhere they did not choose to go
$('shelf').insertAdjacentHTML('beforeend', BUILT.map((d) => `
  <p style="margin:.6rem 0 0;font-size:.9rem;color:var(--dim)">
    His original: <a href="${postURL(d.post)}">“${esc(d.title)}”</a>${d.quote ? ` — <em>${esc(d.quote)}</em>` : ''}
  </p>
`).join(''));

// ------------------------------------------------------------------- queue --

$('queue').innerHTML = QUEUED.map((d) => `
  <li>
    <div class="top">
      <span class="t"><a href="${postURL(d.post)}">${esc(d.title)}</a></span>
      ${d.tags.map((t) => `<span class="pill">${esc(t)}</span>`).join('')}
      <span class="d">${esc(d.date)}</span>
    </div>
    <p class="why"><b>${esc(d.what)}</b> ${esc(d.why || '')}</p>
  </li>
`).join('');

// -------------------------------------------------------------------- hero --

const HERO = [
  ['phi', 0.5, 'φ at α = ½ — the roughest number there is'],
  ['pi', 1, 'π at α = 1 — seven lobes, then 113 ripples'],
  ['sqrt2', 0.5, '√2 at α = ½ — period 1, forever'],
  ['355/113', 1, '355/113 — a rational, so it stops'],
  ['e', 0.5, 'e at α = ½ — Euler’s 1,2,1 · 1,4,1 · 1,6,1 …'],
  ['liouville', 1, 'Liouville’s constant — one huge term ends it'],
];

(async function hero() {
  const cv = $('hero-canvas');
  const cap = $('hero-cap');
  let eng;
  try {
    eng = await loadEngine(new URL('./cf/cffourier.wasm', import.meta.url));
  } catch {
    cap.textContent = '';
    return;
  }
  const ctx = cv.getContext('2d', { alpha: false });
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const size = Math.round(Math.min(cv.clientWidth, 420) * dpr) || 720;
  cv.width = cv.height = size;

  let i = -1;
  const next = () => {
    i = (i + 1) % HERO.length;
    const [name, alpha, caption] = HERO[i];
    const spec = resolve(name);
    const e = eng.setNumber(spec, 96);
    if (!e) return;
    const k = e.qs.filter((q) => q <= 6000).length || 1;
    const { xy, bbox } = eng.build(k, alpha, { perCycle: 28, floor: size * 3, cap: 1 << 19 });
    const w = Math.max(bbox[2] - bbox[0], 1e-6), h = Math.max(bbox[3] - bbox[1], 1e-6);
    const s = Math.min(size / w, size / h) * 0.84;
    const mx = (bbox[0] + bbox[2]) / 2, my = (bbox[1] + bbox[3]) / 2;
    ctx.fillStyle = '#071624';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#9fc9ee';
    ctx.lineWidth = Math.max(1, size / 620);
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(size / 2 + (xy[0] - mx) * s, size / 2 - (xy[1] - my) * s);
    for (let j = 1; j < xy.length / 2; j++) {
      ctx.lineTo(size / 2 + (xy[j * 2] - mx) * s, size / 2 - (xy[j * 2 + 1] - my) * s);
    }
    ctx.closePath();
    ctx.stroke();
    cap.textContent = caption;
  };
  next();
  const timer = setInterval(next, 4200);
  // a tab nobody is looking at should not be recomputing curves
  addEventListener('pagehide', () => clearInterval(timer));
  cv.style.cursor = 'pointer';
  cv.addEventListener('click', next);
})();
