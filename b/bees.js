// b/ bee swarm — every bee is a fluoddity particle AND a website link.
// The real FluoddityEngine runs the swarm; we read back the first BEES.length
// particle positions each frame and pin a DOM <a> (a bee) on each one.
// Sliders drive the engine's genome (PARAMS) live; mutate/randomize reuse the
// engine's own genome operators. Tune freely — none of these numbers are sacred.
import { FluoddityEngine, defaultConfig, PARAMS, mutate, randomConfig } from './engine.js';

// One bee per Bluesky-tagged site (the Bluesky corner). Generated from the
// constellation catalogue; edit freely.
const BEES = [
  { n:"airchat", u:"https://airchat.mino.mobi" },
  { n:"zoom", u:"https://zoom.mino.mobi" },
  { n:"weft", u:"https://mino.mobi/weft/" },
  { n:"bisk", u:"https://bisk.mino.mobi" },
  { n:"empathy", u:"https://empath.mino.mobi" },
  { n:"photo", u:"https://photo.mino.mobi" },
  { n:"thread", u:"https://photo.mino.mobi/#/thread" },
  { n:"astro", u:"https://photo.mino.mobi/astro/" },
  { n:"prism", u:"https://photo.mino.mobi/prism/" },
  { n:"ternary", u:"https://mino.mobi/ternary/" },
  { n:"judge", u:"https://mino.mobi/judge/" },
  { n:"novelty", u:"https://mino.mobi/novelty/" },
  { n:"echo", u:"https://mino.mobi/echo/" },
  { n:"density", u:"https://mino.mobi/density/" },
  { n:"seek", u:"https://mino.mobi/seek/" },
  { n:"cluster", u:"https://mino.mobi/cluster/" },
  { n:"wild", u:"https://mino.mobi/wild/" },
  { n:"disk", u:"https://b.mino.mobi/disk/" },
  { n:"answers", u:"https://mino.mobi/answers/" },
  { n:"rite", u:"https://rite.mino.mobi" },
  { n:"fodder", u:"https://rite.mino.mobi/fodder/" },
  { n:"redact", u:"https://rite.mino.mobi/redact/" },
  { n:"ask", u:"https://rite.mino.mobi/ask/" },
  { n:"atlas", u:"https://rite.mino.mobi/atlas/" },
  { n:"lexicon", u:"https://rite.mino.mobi/lexicon/" },
  { n:"list", u:"https://rite.mino.mobi/list/" },
  { n:"web", u:"https://rite.mino.mobi/web/" },
  { n:"signal", u:"https://rite.mino.mobi/signal/" },
  { n:"atmosphere", u:"https://b.mino.mobi" },
  { n:"cat", u:"https://cat.mino.mobi" },
  { n:"track", u:"https://mino.mobi/track/" },
  { n:"orb", u:"https://photo.mino.mobi/orb/" },
  { n:"fractal", u:"https://photo.mino.mobi/fractal/" },
  { n:"ternary2", u:"https://mino.mobi/ternary2/" },
  { n:"ternary3", u:"https://mino.mobi/ternary3/" },
];

// Total particles: the first BEES.length are the visible/linked bees; the rest
// are an invisible swarm that enriches the shared pheromone field they steer by.
const SWARM = 2000;

const stage = document.getElementById('bee-stage');
const field = document.getElementById('bee-field');
const layer = document.getElementById('bee-layer');
const host  = document.getElementById('bee-controls');

let eng, ctx, beeEls = [], dpr = 1, fieldAlpha = 0.5, steps = 1, running = false, raf = 0;

function fail(msg) { if (stage) { stage.classList.add('bee-off'); stage.setAttribute('data-reason', msg || ''); } }

function init() {
  if (!stage) return;
  try { eng = new FluoddityEngine(384, SWARM); }
  catch (e) { return fail(e && e.message || 'WebGL2 unavailable'); }
  eng.cfg = defaultConfig();
  try { eng.reset(eng.cfg); } catch (_) {}
  ctx = field.getContext('2d');
  makeBees();
  makePanel();
  resize();
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  start();
}

function makeBees() {
  layer.textContent = '';
  beeEls = BEES.map((b) => {
    const a = document.createElement('a');
    a.className = 'bee';
    a.href = b.u;
    a.title = b.n;
    a.innerHTML = `<span class="bee-glyph">🐝</span><span class="bee-name">${b.n}</span>`;
    layer.appendChild(a);
    return a;
  });
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = stage.getBoundingClientRect();
  field.width = Math.max(1, Math.round(r.width * dpr));
  field.height = Math.max(1, Math.round(r.height * dpr));
}

function loop() {
  if (!running) return;
  eng.step(steps);
  eng.render();
  ctx.clearRect(0, 0, field.width, field.height);
  if (fieldAlpha > 0.001) {
    ctx.globalAlpha = fieldAlpha;
    try { ctx.drawImage(eng.cv, 0, 0, field.width, field.height); } catch (_) {}
    ctx.globalAlpha = 1;
  }
  const ps = eng.readEntities(BEES.length);
  const W = stage.clientWidth, H = stage.clientHeight;
  for (let i = 0; i < BEES.length; i++) {
    const px = ps[i * 2], py = ps[i * 2 + 1];
    if (!isFinite(px) || !isFinite(py)) continue;
    const sx = (px * 0.5 + 0.5) * W;
    const sy = (1 - (py * 0.5 + 0.5)) * H;
    beeEls[i].style.transform = `translate(${sx}px, ${sy}px)`;
  }
  raf = requestAnimationFrame(loop);
}

function start() { if (running) return; running = true; raf = requestAnimationFrame(loop); }
function stop() { running = false; if (raf) cancelAnimationFrame(raf), raf = 0; }

// ── controls ──────────────────────────────────────────────────────────────
function slider(name, lo, hi, val, onset, get) {
  const wrap = document.createElement('label');
  wrap.className = 'bee-slider';
  const out = document.createElement('output');
  const inp = document.createElement('input');
  inp.type = 'range'; inp.min = lo; inp.max = hi; inp.step = (hi - lo) / 240; inp.value = val;
  out.textContent = (+val).toFixed(2);
  inp.addEventListener('input', () => { const v = parseFloat(inp.value); onset(v); out.textContent = v.toFixed(2); });
  wrap.append(Object.assign(document.createElement('span'), { className: 'bee-slider-name', textContent: name }), inp, out);
  return { el: wrap, sync: () => { const v = get(); inp.value = v; out.textContent = (+v).toFixed(2); } };
}

function makePanel() {
  const p = document.createElement('div');
  p.className = 'bee-panel';
  p.innerHTML = `<button class="bee-toggle" type="button" aria-expanded="false">tune ▾</button><div class="bee-body"></div>`;
  const body = p.querySelector('.bee-body');

  const row = document.createElement('div');
  row.className = 'bee-btns';
  row.innerHTML = `
    <button type="button" data-act="mutate">🎲 mutate</button>
    <button type="button" data-act="random">↻ randomize</button>
    <button type="button" data-act="respawn">respawn</button>
    <button type="button" data-act="pause">❚❚ pause</button>`;
  body.appendChild(row);

  const sl = {};
  body.appendChild(slider('field haze', 0, 1, fieldAlpha, (v) => { fieldAlpha = v; }, () => fieldAlpha).el);
  for (const k in PARAMS) {
    const [lo, hi] = PARAMS[k];
    sl[k] = slider(k, lo, hi, eng.cfg[k], (v) => { eng.cfg[k] = v; }, () => eng.cfg[k]);
    body.appendChild(sl[k].el);
  }
  const sync = () => { for (const k in sl) sl[k].sync(); };

  row.addEventListener('click', (e) => {
    const act = e.target.getAttribute('data-act');
    if (!act) return;
    if (act === 'mutate') { eng.cfg = mutate(eng.cfg); sync(); }
    else if (act === 'random') { eng.cfg = randomConfig(); try { eng.reset(eng.cfg); } catch (_) {} sync(); }
    else if (act === 'respawn') { try { eng.reset(eng.cfg); } catch (_) {} }
    else if (act === 'pause') { running ? stop() : start(); e.target.textContent = running ? '❚❚ pause' : '▶ play'; }
  });
  const tog = p.querySelector('.bee-toggle');
  tog.addEventListener('click', () => { const open = p.classList.toggle('open'); tog.setAttribute('aria-expanded', open); tog.textContent = open ? 'tune ▴' : 'tune ▾'; });

  host.appendChild(p);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
