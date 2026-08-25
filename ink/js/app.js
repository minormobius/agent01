// The roller, wired up. Roll -> the gate considers up to three candidate pairs
// -> the survivor paints itself onto the sheet while you watch.

import { Rand } from './prng.js';
import { roll, prepare, PAINT_MAX, PAINT_QUIET, MAX_TRIES } from './roll.js';
import { Paper, pickPair } from './paper.js';
import { encodePair, decodePair } from './genome.js';
import { SEG_STRIDE } from './sim.js';
import { PROBE_STEPS } from './probe.js';

const $ = (s) => document.querySelector(s);
const cv = $('#sheet');

const archive = [];          // this session's accepted rolls, for novelty
let current = null;          // { pops, seed, pair, report }
let raf = 0;

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

function setBusy(on, msg) {
  document.body.classList.toggle('busy', on);
  $('#status').textContent = msg || '';
  for (const b of document.querySelectorAll('button')) b.disabled = on;
}

// ---------------------------------------------------------------- painting --
function beginPaint(res, seed, pair) {
  cancelAnimationFrame(raf);
  const size = sheetSize();
  const paper = new Paper(cv, size, pair, new Rand(seed + '::paper'));

  // The probe's own strokes, replayed. They are not a preview of the painting;
  // they ARE the first 120 steps of it, which is why nothing here is re-run.
  const CHUNKS = 18;
  const chunk = Math.ceil(res.bufCount / CHUNKS);
  let at = 0, quiet = 0;

  const tick = () => {
    if (at < res.bufCount) {
      const n = Math.min(chunk, res.bufCount - at);
      paper.draw(res.buf.subarray(at * SEG_STRIDE, (at + n) * SEG_STRIDE), n);
      at += n;
    } else if (res.sim.frame < PAINT_MAX && quiet < PAINT_QUIET) {
      const n = res.sim.step(8);
      quiet = n ? 0 : quiet + 8;
      paper.draw(res.sim.seg, n);
    } else {
      $('#sheetwrap').classList.remove('wet');
      $('#status').textContent = '';
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  $('#sheetwrap').classList.add('wet');
  tick();
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
  if (!res.rejected.length) rej.textContent = '';
  else rej.textContent = 'passed over: ' + res.rejected
    .map((r) => `${r.reason} (${r.fit.toFixed(2)})`).join(', ');

  const g = res.pops;
  $('#genomes').innerHTML = g.map((p, i) => `
    <div class="hand">
      <span class="chip" style="background:${i ? pair.b : pair.a}"></span>
      <b>${i ? 'second' : 'first'} hand</b>
      <span>${p.cohorts} cohorts</span>
      <span>gain ${p.sensor_gain.toFixed(1)}</span>
      <span>turn ${(p.sensor_angle * 180).toFixed(0)}&deg;</span>
      <span>drag ${p.drag.toFixed(3)}</span>
      <span>diffusion ${p.trail_diffusion.toFixed(2)}</span>
    </div>`).join('');
}

// ------------------------------------------------------------------- rolls --
async function doRoll(seed, fix) {
  setBusy(true, 'considering…');
  await frame();                       // let the label paint before we block
  const t0 = performance.now();
  const res = roll(seed, archive, fix);
  const ms = Math.round(performance.now() - t0);
  finish(res, seed, ms);
}

async function doOpen(pops, seed) {
  setBusy(true, 'opening…');
  await frame();
  finish(prepare(pops, seed), seed, null);
}

function finish(res, seed, ms) {
  const pair = pickPair(res.pops[0].hue, res.pops[1].hue);
  current = { pops: res.pops, seed, pair };
  archive.push({ vv: res.vv, pops: res.pops });
  report(res, pair);
  $('#cost').textContent = ms == null ? '' : `${ms} ms`;
  setBusy(false);
  beginPaint(res, seed, pair);
  const url = new URL(location.href);
  url.searchParams.delete('g');
  url.searchParams.set('s', seed);
  history.replaceState(null, '', url);
}

// ------------------------------------------------------------------- wiring --
$('#roll').addEventListener('click', () => doRoll(newSeed(), null));
$('#rerollA').addEventListener('click', () => current && doRoll(newSeed(), [null, current.pops[1]]));
$('#rerollB').addEventListener('click', () => current && doRoll(newSeed(), [current.pops[0], null]));

$('#save').addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `ink-${current ? current.seed : 'sheet'}.png`;
  a.href = cv.toDataURL('image/png');
  a.click();
});

$('#share').addEventListener('click', async () => {
  if (!current) return;
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('g', encodePair(current.pops));
  url.searchParams.set('s', current.seed);
  try {
    await navigator.clipboard.writeText(url.toString());
    const b = $('#share'); const t = b.textContent;
    b.textContent = 'copied'; setTimeout(() => { b.textContent = t; }, 1200);
  } catch {
    prompt('copy this link', url.toString());
  }
});

// Re-paint at the new size rather than stretching the old bitmap: the sheet is
// vector strokes, so it can just be painted again at the right resolution.
let resizeTimer = 0;
addEventListener('resize', () => {
  if (!current) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (Math.abs(sheetSize() - parseInt(cv.style.width, 10)) < 24) return;
    doOpen(current.pops, current.seed);
  }, 300);
});

// ------------------------------------------------------------------- boot ---
{
  const q = new URLSearchParams(location.search);
  const g = q.get('g');
  const pops = g && decodePair(g);
  if (pops) doOpen(pops, q.get('s') || 'shared');
  else doRoll(q.get('s') || newSeed(), null);
}
