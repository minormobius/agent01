// b/ bee swarm — every bee is a fluoddity particle AND a website link.
// The real FluoddityEngine runs the swarm; we read back the first BEES.length
// particle positions each frame and pin a colored, labeled DOM bee on each one.
// One button: "random hive" rolls a fresh genome (a new swarm personality).
import { FluoddityEngine, defaultConfig, randomConfig } from './engine.js';

// One bee per Bluesky-tagged site (the Bluesky corner). Edit freely.
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
// are an invisible swarm enriching the shared pheromone field they steer by.
const SWARM = 2000;
const FIELD_ALPHA = 0.45;  // how strongly the pheromone field shows behind the bees
const STEPS = 1;

const stage = document.getElementById('bee-stage');
const field = document.getElementById('bee-field');
const layer = document.getElementById('bee-layer');
const host  = document.getElementById('bee-controls');

let eng, ctx, beeEls = [], dpr = 1, running = false, raf = 0;

function fail(msg) { if (stage) { stage.classList.add('bee-off'); stage.setAttribute('data-reason', msg || ''); } }

// Spawn the whole swarm spread uniformly across the field (initial_conditions=1),
// so the bees start scattered rather than clumped.
function spread(cfg) { cfg.initial_conditions = 1; return cfg; }

function init() {
  if (!stage) return;
  try { eng = new FluoddityEngine(384, SWARM); }
  catch (e) { return fail(e && e.message || 'WebGL2 unavailable'); }
  eng.cfg = spread(defaultConfig());
  try { eng.reset(eng.cfg); } catch (_) {}
  ctx = field.getContext('2d');
  makeBees();
  makeButton();
  resize();
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  start();
}

function makeBees() {
  layer.textContent = '';
  beeEls = BEES.map((b, i) => {
    const a = document.createElement('a');
    a.className = 'bee';
    a.href = b.u;
    a.title = b.n;
    a.style.setProperty('--bee-hue', Math.round((i / BEES.length) * 360));
    a.innerHTML = `<span class="bee-body"></span><span class="bee-glyph">🐝</span><span class="bee-name">${b.n}</span>`;
    layer.appendChild(a);
    return a;
  });
}

function makeButton() {
  const btn = document.createElement('button');
  btn.className = 'hive-btn';
  btn.type = 'button';
  btn.textContent = '🎲 random hive';
  btn.addEventListener('click', randomHive);
  host.appendChild(btn);
}

// Roll a fresh genome: a new swarm personality. Keep the spread spawn.
function randomHive() {
  eng.cfg = spread(randomConfig());
  try { eng.reset(eng.cfg); } catch (_) {}
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = stage.getBoundingClientRect();
  field.width = Math.max(1, Math.round(r.width * dpr));
  field.height = Math.max(1, Math.round(r.height * dpr));
}

function loop() {
  if (!running) return;
  eng.step(STEPS);
  eng.render();
  ctx.clearRect(0, 0, field.width, field.height);
  ctx.globalAlpha = FIELD_ALPHA;
  try { ctx.drawImage(eng.cv, 0, 0, field.width, field.height); } catch (_) {}
  ctx.globalAlpha = 1;
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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
