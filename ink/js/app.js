// The roller, wired up. Roll -> the gate considers up to three candidate pairs
// -> the survivor paints itself onto the sheet while you watch.
//
// THE STROKE LOG. Every segment the simulation emits is kept, not just drawn.
// That is what makes the pen sliders usable: nib angle, contrast, weight,
// bleed and grain are all decisions about how to DRAW a stroke, so moving them
// repaints the same marks rather than re-running the organism. Only the ink
// slider touches the simulation, because reserve decides how far a brush
// travels before it stops — and even that cannot change the gate's verdict,
// since ink provably does not touch the dynamics (see sim.js).

import { Rand } from './prng.js';
import { roll, prepare, PAINT_MAX, PAINT_QUIET, MAX_TRIES } from './roll.js';
import {
  Paper, pickPair, nibBase, DEFAULT_STYLE, STYLE_KEYS, STYLE_SPEC,
  encodeStyle, decodeStyle, quantizeStyle,
} from './paper.js';
import { encodePair, decodePair } from './genome.js';
import { InkSim, SEG_STRIDE } from './sim.js';

const $ = (s) => document.querySelector(s);
const cv = $('#sheet');

const archive = [];
let style = loadStyle();
let cur = null;              // { pops, seed, pair, nibs, res }
let raf = 0, anim = null;

// ------------------------------------------------------------ stroke log ---
// Grown by doubling. The cap is a memory backstop: at the default reserve a
// sheet is ~600k segments (19MB) and at the maximum ~1.4M (43MB), so this only
// bites on an organism that wanders far longer than any measured one.
const LOG_CAP = 1_600_000;
let log = new Float32Array(1 << 20);
let logCount = 0, logTruncated = false;

function resetLog() { logCount = 0; logTruncated = false; }

function appendLog(src, count) {
  if (!count || logTruncated) return;
  if (logCount + count > LOG_CAP) { count = LOG_CAP - logCount; logTruncated = true; }
  const need = (logCount + count) * SEG_STRIDE;
  if (need > log.length) {
    let n = log.length;
    while (n < need) n *= 2;
    const bigger = new Float32Array(n);
    bigger.set(log.subarray(0, logCount * SEG_STRIDE));
    log = bigger;
  }
  log.set(src.subarray(0, count * SEG_STRIDE), logCount * SEG_STRIDE);
  logCount += count;
}

// ---------------------------------------------------------------- helpers --
const VERDICT_TONE = {
  alive: 'good', boiling: 'warn', sparse: 'warn', frozen: 'warn',
  dead: 'bad', 'blown out': 'bad',
};

function sheetSize() {
  const wide = Math.min(window.innerWidth - 32, 560);
  const tall = window.innerHeight - 250;
  return Math.max(232, Math.floor(Math.min(wide, tall)));
}

const newSeed = () => Math.random().toString(36).slice(2, 10);
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

function loadStyle() {
  const q = new URLSearchParams(location.search).get('y');
  const fromUrl = q && decodeStyle(q);
  if (fromUrl) return fromUrl;             // already on the grid, by construction
  try {
    const raw = localStorage.getItem('ink.style');
    if (raw) return quantizeStyle({ ...DEFAULT_STYLE, ...JSON.parse(raw) });
  } catch { /* private window, blocked storage — the defaults are fine */ }
  return quantizeStyle(DEFAULT_STYLE);
}
function saveStyle() {
  try { localStorage.setItem('ink.style', JSON.stringify(style)); } catch { /* ignore */ }
}

function setBusy(on, msg) {
  document.body.classList.toggle('busy', on);
  $('#status').textContent = msg || '';
  $('#roll').disabled = on;
  $('#rerollA').disabled = on;
  $('#rerollB').disabled = on;
}

// ---------------------------------------------------------------- painting --
function makePaper() {
  return new Paper(cv, sheetSize(), cur.pair, new Rand(cur.seed + '::paper'), style, cur.nibs);
}

// One animation loop serves both jobs: producing segments from a live sim, and
// consuming the log onto the sheet. A repaint is just the same loop with the
// producer switched off and the cursor rewound.
function runAnim(sim) {
  cancelAnimationFrame(raf);
  // A fresh Paper repaints the ground and rewinds the draw cursor to zero; the
  // log itself is untouched, which is the whole point — a repaint redraws the
  // same strokes with different pen settings.
  anim = { paper: makePaper(), sim, drawn: 0, quiet: 0, spf: 6 };
  $('#sheetwrap').classList.add('wet');
  tick();
}

function tick() {
  const a = anim;
  if (!a) return;

  if (a.sim) {
    if (a.sim.frame < PAINT_MAX && a.quiet < PAINT_QUIET) {
      const n = a.sim.step(a.spf);
      a.quiet = n ? 0 : a.quiet + a.spf;
      appendLog(a.sim.seg, n);
      // Ramp the step rate: slow enough at the start that you watch the sheet
      // block in, fast enough by the end that the long dry tail is not a wait.
      if (a.spf < 80) a.spf += 4;
    } else {
      a.sim = null;
    }
  }

  if (a.drawn < logCount) {
    const chunk = Math.max(4000, Math.ceil(logCount / 30));
    const n = Math.min(chunk, logCount - a.drawn);
    a.paper.draw(log.subarray(a.drawn * SEG_STRIDE, (a.drawn + n) * SEG_STRIDE), n);
    a.drawn += n;
  } else if (!a.sim) {
    $('#sheetwrap').classList.remove('wet');
    $('#status').textContent = '';
    $('#strokes').textContent = logCount.toLocaleString() + (logTruncated ? '+' : '');
    anim = null;
    return;
  }
  raf = requestAnimationFrame(tick);
}

// Re-render the existing strokes with the current style. No simulation.
function repaint() {
  if (!cur || !logCount) return;
  runAnim(null);
}

// Re-run the simulation for the current genomes at the current reserve. The
// gate's verdict still stands: ink cannot change the field, only how much of
// the organism's path gets drawn.
function rerun() {
  if (!cur) return;
  resetLog();
  const sim = new InkSim({ field: 128, agents: 192 });
  sim.load(cur.pops, new Rand('ink::' + encodePair(cur.pops)), style.ink);
  runAnim(sim);
}

// ---------------------------------------------------------------- readout ---
function report(res, pair) {
  const tone = VERDICT_TONE[res.verdict] || 'warn';
  $('#verdict').textContent = res.verdict;
  $('#verdict').className = 'verdict ' + tone;
  $('#fit').textContent = res.fit.toFixed(2);
  $('#pigment').textContent = pair.name;
  $('#swatchA').style.background = pair.a;
  $('#swatchB').style.background = pair.b;

  let how;
  if (res.given) how = 'opened from a link — not rolled';
  else if (res.settled) how = `no candidate cleared the gate in ${MAX_TRIES}; this was the best of them`;
  else if (res.tries === 1) how = `cleared the gate on the first candidate of ${MAX_TRIES}`;
  else how = `cleared the gate on candidate ${res.tries} of ${MAX_TRIES}`;
  $('#how').textContent = how;

  const rej = $('#rejected');
  rej.textContent = !res.rejected.length ? ''
    : 'passed over: ' + res.rejected.map((r) => `${r.reason} (${r.fit.toFixed(2)})`).join(', ');

  $('#genomes').innerHTML = res.pops.map((p, i) => `
    <div class="hand">
      <span class="chip" style="background:${i ? pair.b : pair.a}"></span>
      <b>${i ? 'second' : 'first'} hand</b>
      <span>${p.cohorts} cohorts</span>
      <span>gain ${p.sensor_gain.toFixed(1)}</span>
      <span>turn ${(p.sensor_angle * 180).toFixed(0)}&deg;</span>
      <span>nib ${(nibBase(p) * 180 / Math.PI).toFixed(0)}&deg;</span>
      <span>diffusion ${p.trail_diffusion.toFixed(2)}</span>
    </div>`).join('');
}

// ------------------------------------------------------------------- rolls --
async function doRoll(seed, fix) {
  setBusy(true, 'considering…');
  await frame();
  const t0 = performance.now();
  const res = roll(seed, archive, fix, style.ink);
  finish(res, seed, Math.round(performance.now() - t0));
}

async function doOpen(pops, seed) {
  setBusy(true, 'opening…');
  await frame();
  finish(prepare(pops, seed, style.ink), seed, null);
}

function finish(res, seed, ms) {
  const pair = pickPair(res.pops[0].hue, res.pops[1].hue);
  cur = { pops: res.pops, seed, pair, nibs: res.pops.map(nibBase), res };
  archive.push({ vv: res.vv, pops: res.pops });
  report(res, pair);
  $('#cost').textContent = ms == null ? '—' : `${ms} ms`;
  setBusy(false);
  resetLog();
  appendLog(res.buf, res.bufCount);
  runAnim(res.sim);
  pushUrl(seed, false);
}

function pushUrl(seed, withGenomes) {
  const url = new URL(location.href);
  url.search = '';
  if (withGenomes) url.searchParams.set('g', encodePair(cur.pops));
  url.searchParams.set('s', seed);
  url.searchParams.set('y', encodeStyle(style));
  history.replaceState(null, '', url);
  return url;
}

// ------------------------------------------------------------------ sliders --
function buildSliders() {
  const host = $('#sliders');
  host.innerHTML = STYLE_KEYS.map((k) => {
    const sp = STYLE_SPEC[k];
    return `<label class="slider" title="${sp.hint}">
      <span class="sl-name">${sp.label}</span>
      <input type="range" id="sl-${k}" min="${sp.min}" max="${sp.max}" step="${sp.step}" value="${style[k]}">
      <output id="out-${k}"></output>
    </label>`;
  }).join('');

  // One debounce timer for every slider, but the "this needs a re-run" flag is
  // STICKY. It has to be: with a plain `clearTimeout` per slider, nudging any
  // render slider inside the debounce window silently cancelled a pending ink
  // re-run and repainted the old strokes instead — the sheet then showed a
  // reserve you were no longer asking for, and nothing said so.
  let pending = 0, needsRerun = false;
  const flush = () => {
    const f = needsRerun ? rerun : repaint;
    needsRerun = false;
    f();
  };
  for (const k of STYLE_KEYS) {
    const el = $('#sl-' + k), out = $('#out-' + k);
    const show = () => { out.textContent = k === 'nibAngle' ? Math.round(style[k]) + '°' : (+style[k]).toFixed(2); };
    show();
    el.addEventListener('input', () => {
      style = quantizeStyle({ ...style, [k]: parseFloat(el.value) });
      show();
      saveStyle();
      // `ink` is the only one that has to re-run the organism; everything else
      // is a decision about how to draw strokes we already have.
      if (k === 'ink') needsRerun = true;
      clearTimeout(pending);
      pending = setTimeout(flush, needsRerun ? 260 : 90);
      pushUrl(cur ? cur.seed : '', false);
    });
  }
  $('#reset').addEventListener('click', () => {
    style = quantizeStyle(DEFAULT_STYLE);
    saveStyle();
    for (const k of STYLE_KEYS) {
      $('#sl-' + k).value = style[k];
      $('#out-' + k).textContent = k === 'nibAngle' ? Math.round(style[k]) + '°' : (+style[k]).toFixed(2);
    }
    rerun();
  });
}

// ------------------------------------------------------------------- wiring --
$('#roll').addEventListener('click', () => doRoll(newSeed(), null));
$('#rerollA').addEventListener('click', () => cur && doRoll(newSeed(), [null, cur.pops[1]]));
$('#rerollB').addEventListener('click', () => cur && doRoll(newSeed(), [cur.pops[0], null]));

$('#save').addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `ink-${cur ? cur.seed : 'sheet'}.png`;
  a.href = cv.toDataURL('image/png');
  a.click();
});

$('#share').addEventListener('click', async () => {
  if (!cur) return;
  const url = pushUrl(cur.seed, true);
  try {
    await navigator.clipboard.writeText(url.toString());
    const b = $('#share'), t = b.textContent;
    b.textContent = 'copied'; setTimeout(() => { b.textContent = t; }, 1200);
  } catch { prompt('copy this link', url.toString()); }
});

let resizeTimer = 0;
addEventListener('resize', () => {
  if (!cur) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (Math.abs(sheetSize() - parseInt(cv.style.width, 10)) < 24) return;
    repaint();
  }, 300);
});

// ------------------------------------------------------------------- boot ---
buildSliders();
{
  const q = new URLSearchParams(location.search);
  const g = q.get('g');
  const pops = g && decodePair(g);
  if (pops) doOpen(pops, q.get('s') || 'shared');
  else doRoll(q.get('s') || newSeed(), null);
}
