// govern/inkblot.js — the GOVERN room's principal fixture UI: THE SEAL-STAND.
//
// A self-contained overlay (builds its own DOM + scoped CSS on first open). The player flips through
// seeded Rorschach blots (wars/ink, loaded as classic globals: INKENGINE/INKJUDGE/…), reads each blot's
// archetype, and when one rings true adds an optional line of "colour" and STAMPS it — published as a
// kind:'inkblot' rumor (archetype profile + their colour) to their own repo.
//
// The blot generation + render needs canvas, so it lives here (not in the pure inkblot-rumor.js builder).
// Host contract: open({ world, signedIn, publishRumor, toast }).

import { inkblotRumor } from './inkblot-rumor.js';

let root = null, ctx = null, open = false;
let canvas = null, archEl = null, colorInput = null, stampBtn = null;
let stack = [], idx = -1, nonce = '0', cur = null;

const ENGINE = () => (typeof globalThis !== 'undefined' ? globalThis : window).INKENGINE;
const JUDGE = () => (typeof globalThis !== 'undefined' ? globalThis : window).INKJUDGE;

function ensureDom() {
  if (root) return;
  const css = document.createElement('style');
  css.textContent = `
  .ink-ov{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(6,8,12,.78);backdrop-filter:blur(3px);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  .ink-ov.on{display:flex}
  .ink-card{width:min(540px,94vw);max-height:94vh;overflow:auto;background:linear-gradient(180deg,#14151b,#0c0d11);border:1px solid #39404e;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6);padding:20px 22px;color:#e6e8ee}
  .ink-head{display:flex;align-items:baseline;gap:10px;margin-bottom:8px}
  .ink-head b{font-size:17px;letter-spacing:.1em;color:#cdd4e2}
  .ink-kick{color:#9aa7c0;letter-spacing:.22em;font-size:11px;text-transform:uppercase}
  .ink-close{margin-left:auto;cursor:pointer;color:#7e8598;border:1px solid #353b48;border-radius:7px;padding:4px 9px;font:inherit;background:none}
  .ink-close:hover{color:#e6e8ee;border-color:#525a6c}
  .ink-stage{display:flex;flex-direction:column;align-items:center;gap:10px;margin:6px 0}
  .ink-blot{width:min(320px,78vw);aspect-ratio:1;border-radius:10px;background:#f4efe4;box-shadow:inset 0 0 0 1px #2a2f3a, 0 2px 14px rgba(0,0,0,.4)}
  .ink-flip{display:flex;gap:8px;align-items:center}
  .ink-btn{cursor:pointer;border:1px solid #4a5263;background:rgba(154,167,192,.12);color:#cdd4e2;border-radius:8px;padding:8px 14px;font:inherit;font-size:13px}
  .ink-btn:hover{border-color:#9aa7c0;color:#fff}
  .ink-btn.primary{background:rgba(244,191,98,.13);border-color:#d8b25a;color:#f4bf62}
  .ink-btn:disabled{opacity:.45;cursor:default}
  .ink-seedno{color:#6f7686;font-size:11px;min-width:74px;text-align:center}
  .ink-arch{margin:10px 0;padding:13px 15px;border:1px solid #2b303b;border-radius:10px;background:#0a0b0f}
  .ink-arch .title{font-size:16px;color:#d8b25a;margin-bottom:3px}
  .ink-arch .blurb{color:#c2c8d6}
  .ink-arch .axes{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
  .ink-arch .ax{font-size:11px;color:#9aa7c0;border:1px solid #2b303b;border-radius:6px;padding:2px 7px}
  .ink-colour{width:100%;box-sizing:border-box;margin-top:10px;background:#0a0b0f;border:1px solid #353b48;border-radius:8px;color:#e6e8ee;padding:9px 11px;font:inherit;font-size:13px}
  .ink-colour:focus{outline:none;border-color:#9aa7c0}
  .ink-acts{display:flex;gap:9px;margin-top:11px}
  .ink-foot{color:#6a7080;font-size:11px;margin-top:12px;text-align:center}`;
  document.head.appendChild(css);
  root = document.createElement('div');
  root.className = 'ink-ov';
  root.innerHTML = `<div class="ink-card" role="dialog" aria-label="The Seal-stand">
    <div class="ink-head"><span class="ink-kick">govern · the seal-stand</span><b>❦ read a seal</b><button class="ink-close" data-ink-close>close ⏎</button></div>
    <div class="ink-stage">
      <canvas class="ink-blot" data-ink-canvas width="320" height="320"></canvas>
      <div class="ink-flip"><button class="ink-btn" data-ink-prev>‹ prev</button><span class="ink-seedno" data-ink-seed></span><button class="ink-btn" data-ink-next>another ›</button></div>
    </div>
    <div class="ink-arch" data-ink-arch></div>
    <input class="ink-colour" data-ink-colour maxlength="280" placeholder="add your colour (optional) — what do you see?" />
    <div class="ink-acts"><button class="ink-btn primary" data-ink-stamp>⊚ stamp &amp; spread</button></div>
    <div class="ink-foot">the seal's archetype + your colour are spread to the ship as a rumor</div>
  </div>`;
  document.body.appendChild(root);
  canvas = root.querySelector('[data-ink-canvas]');
  archEl = root.querySelector('[data-ink-arch]');
  colorInput = root.querySelector('[data-ink-colour]');
  stampBtn = root.querySelector('[data-ink-stamp]');
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-ink-close]') || e.target === root) return close();
    if (e.target.closest('[data-ink-prev]')) return flip(-1);
    if (e.target.closest('[data-ink-next]')) return flip(1);
    if (e.target.closest('[data-ink-stamp]')) return stamp(e.target.closest('[data-ink-stamp]'));
  });
  document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { e.preventDefault(); close(); } });
}

function seedFor(i) { return `${(ctx && ctx.world) || '0'}:seal:${nonce}:${i}`; }

function flip(d) {
  idx = Math.max(0, idx + d);
  if (idx >= stack.length) { stack.push(seedFor(stack.length)); }
  show(stack[idx]);
}

function show(seed) {
  const eng = ENGINE();
  const seedEl = root.querySelector('[data-ink-seed]');
  if (!eng) { archEl.innerHTML = `<div class="blurb">the ink is dry — the seal engine didn’t load.</div>`; cur = null; return; }
  let blot;
  try { blot = eng.generate(seed, { RES: 320 }); } catch (e) { archEl.innerHTML = `<div class="blurb">the seal smeared — try another.</div>`; cur = null; return; }
  // paint the blot onto our canvas (the engine returns its own offscreen canvas)
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#f4efe4'; g.fillRect(0, 0, canvas.width, canvas.height);
  if (blot.canvas) { g.save(); g.globalCompositeOperation = 'multiply'; g.drawImage(blot.canvas, 0, 0, canvas.width, canvas.height); g.restore(); }
  const tv = {}; for (const t of blot.traits) tv[t.key] = t.value;
  let portrait = null;
  try { portrait = JUDGE() ? JUDGE().portrait(JUDGE().scoreBlot(tv)) : null; } catch (e) { portrait = null; }
  cur = { seed, traits: blot.traits, portrait };
  if (seedEl) seedEl.textContent = `№ ${idx + 1}`;
  if (portrait) {
    archEl.innerHTML = `<div class="title">${esc(portrait.title)}</div><div class="blurb">${esc(portrait.blurb)}</div>`
      + `<div class="axes">${portrait.axes.map((a) => `<span class="ax">${esc(a.pole)}</span>`).join('')}</div>`;
  } else {
    archEl.innerHTML = `<div class="blurb">a figure without a name — stamp it anyway.</div>`;
  }
}

async function stamp(btn) {
  if (!cur) return;
  const signedIn = !!(ctx && ctx.signedIn);
  if (!signedIn) { if (ctx && ctx.toast) ctx.toast('sign in to stamp a seal', 2200); return; }
  btn.disabled = true; btn.textContent = '◌ stamping…';
  const rumor = inkblotRumor((ctx && ctx.world) || '0', { seed: cur.seed, portrait: cur.portrait, traits: cur.traits, color: colorInput.value });
  let okFlag = false;
  try { okFlag = await (ctx && ctx.publishRumor ? ctx.publishRumor(rumor) : false); } catch (e) { okFlag = false; }
  btn.textContent = okFlag ? '⊚ stamped' : '✕ not stamped';
  if (okFlag && ctx && ctx.toast) ctx.toast('❦ your seal is entered into the record', 2400);
  if (!okFlag) { btn.disabled = false; setTimeout(() => { btn.textContent = '⊚ stamp & spread'; }, 1600); }
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export function openInkblot(opts) {
  ctx = opts || {};
  ensureDom();
  stack = []; idx = -1; cur = null;
  nonce = Math.floor((typeof performance !== 'undefined' ? performance.now() : 0) * 1000 % 1e9).toString(36) + (Math.random() * 1e6 | 0).toString(36);
  colorInput.value = '';
  stampBtn.disabled = false; stampBtn.textContent = '⊚ stamp & spread';
  open = true; root.classList.add('on');
  flip(1);   // show the first seal
}
export function closeInkblot() { if (root) root.classList.remove('on'); open = false; }
const close = closeInkblot;
export function inkblotOpen() { return open; }
