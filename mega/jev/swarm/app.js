// app.js — four swarms, one decider each, live.
//
// The three rule-based arms cost nothing and run client-side. Jev's arm costs
// ONE call per tick carrying every particle's reading and one question each,
// and every arm waits for it, so all four always show the same tick number. A
// side-by-side where the arms had run different lengths would not be a
// comparison of deciders.
import { makeSwarm, senseAll, step, advance, orderOf, ruleDecider, randomDecider,
  frozenDecider, TURN_RUNGS } from './swarm.mjs';
import { swarmDoc, swarmQuestions, FRAMINGS, turnFromScore } from './ask.mjs';
import { brainById } from './brains.mjs';

const $ = (id) => document.getElementById(id);
const ENDPOINT = '../api/ask';
const CONF = { dim: 480 };

// Particle colours: lightened variants of the four series hues. Identity is
// already carried by the card's top border, its name and its legend dot, so
// the canvas hue is reinforcement and never the only cue.
const PARTICLE_COL = { 1: [120, 185, 250], 2: [250, 160, 120], 3: [80, 225, 175], 4: [235, 140, 215] };

// The arms, in the fixed order the palette slots are assigned in. Colour never
// changes with rank or with which arm happens to be winning.
const ARMS = [
  { id: 'rule', slot: 1, name: 'the rule', what: "fluoddity's own brain", live: false },
  { id: 'jev', slot: 2, name: 'Jev', what: 'one typed question each', live: true },
  { id: 'random', slot: 3, name: 'random', what: 'the same five rungs', live: false },
  { id: 'frozen', slot: 4, name: 'frozen', what: 'no steering at all', live: false },
];

let state = null, running = false, stopFlag = false;

// ------------------------------------------------------------- rendering ----
/**
 * Draw the SWARM, not the field.
 *
 * The first version of this painted the trail field, and on the live page it
 * was black — correctly. At dim 480 with fluoddity's own brush and 256
 * particles the field's brightest pixel is 21.9 of 255 and only 2.4% of
 * channels survive rounding to a byte. That is the same fact this page already
 * publishes as a finding ("the field reads dead at the resolution the sensors
 * need") — so making that field the hero image was incoherent: a picture of
 * something already measured as empty.
 *
 * THAT FINDING IS RETRACTED AND THE FIELD IS BACK. It was empty because of
 * three faults at once, not because 256 particles cannot carry it: the canvas
 * held an invented colour instead of the velocity fluoddity deposits, the
 * brain was a seed nobody chose, and the brush was fluoddity's raw one rather
 * than fluoddity's own energy-matched one. Fixed, the same 256 particles give
 * fill 0.55 and struct 0.90 — the fullest reading in a sweep that runs to
 * 40,000. So the field is drawn straight through `FRAG_DISPLAY`, with no
 * auto-exposure to flatter it, and the particles ride on top as white heads
 * with short tails so you can still see WHO is painting it.
 */
function paint(cv, sw, col) {
  // A canvas with no width/height attributes is 300x150, not square, and the
  // old guard here read `cv.width || 300` and then asked whether it differed
  // from 300 — which it never did, so `cv.height` was never set and the
  // backing store stayed 150 tall. CSS then stretched that half-torus across a
  // square box: EIGHT of the sixteen cohorts were never drawn at all, and the
  // eight that were came out at double height. Found by counting the blobs in
  // a screenshot against the sixteen the simulation reports.
  const D = 300;
  if (cv.width !== D || cv.height !== D) { cv.width = D; cv.height = D; }
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(D, D);
  const out = img.data;

  // fluoddity's own display pass, at face value. No gain, no auto-exposure:
  // what you see is what `verdict` and `fitness2` are reading.
  const d = sw.field.dim, rgb = sw.field.displayRGB();
  const s = d / D;
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      const o = (Math.floor(y * s) * d + Math.floor(x * s)) * 3, i = (y * D + x) * 4;
      out[i] = Math.min(255, rgb[o] * 255);
      out[i + 1] = Math.min(255, rgb[o + 1] * 255);
      out[i + 2] = Math.min(255, rgb[o + 2] * 255);
      out[i + 3] = 255;
    }
  }
  const put = (px, py, r, g, b, a) => {
    px = ((px % D) + D) % D; py = ((py % D) + D) % D;
    const i = (py * D + px) * 4;
    out[i] = out[i] * (1 - a) + r * a;
    out[i + 1] = out[i + 1] * (1 - a) + g * a;
    out[i + 2] = out[i + 2] * (1 - a) + b * a;
  };
  const TAIL = 6;
  for (const p of sw.parts) {
    const px = (p.x * 0.5 + 0.5) * D, py = (p.y * 0.5 + 0.5) * D;
    const sp = Math.hypot(p.vx, p.vy) || 1e-9;
    const ux = p.vx / sp, uy = p.vy / sp;
    for (let k = TAIL; k >= 1; k--) {
      const a = 0.30 * (1 - k / TAIL) ** 1.4;
      put(Math.round(px - ux * k), Math.round(py - uy * k), col[0], col[1], col[2], a);
    }
    put(Math.round(px), Math.round(py), 255, 255, 255, 0.85);
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------- charts ----
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/**
 * The policy scatter — the chart the whole experiment is about.
 *
 * Two series, so a legend is present AND both are direct-labelled: the
 * fourth-slot magenta's tritan separation is below the band where colour may
 * carry identity by itself, and the same rule is applied here for consistency.
 */
function scatter(el, jev, rule) {
  const W = 620, H = 300, m = { l: 46, r: 92, t: 14, b: 34 };
  const all = [...jev, ...rule];
  if (!all.length) { el.innerHTML = '<p class="cap">press run — the dots appear as decisions are made</p>'; return; }
  const xs = all.map((p) => p.x);
  const lim = Math.max(1e-9, Math.max(...xs.map(Math.abs)));
  const X = (v) => m.l + ((v + lim) / (2 * lim)) * (W - m.l - m.r);
  const Y = (v) => m.t + ((1 - v) / 2) * (H - m.t - m.b);
  const dots = (pts, col) => pts.map((p) =>
    `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.6" fill="${col}" opacity="0.5"/>`).join('');
  const ticks = [-1, -0.5, 0, 0.5, 1].map((v) =>
    `<line class="gridline" x1="${m.l}" y1="${Y(v)}" x2="${W - m.r}" y2="${Y(v)}"/>` +
    `<text class="axlab" x="${m.l - 7}" y="${Y(v) + 3}" text-anchor="end">${v}</text>`).join('');
  const lastOf = (pts) => (pts.length ? pts[pts.length - 1] : null);
  const lab = (pts, col, txt, dy) => {
    const p = lastOf(pts);
    if (!p) return '';
    return `<text class="serieslab" x="${W - m.r + 8}" y="${Y(0) + dy}" fill="${col}">${esc(txt)}</text>`;
  };
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Turn chosen against sensor asymmetry, for Jev and for the rule">
    ${ticks}
    <line class="axis" x1="${X(0)}" y1="${m.t}" x2="${X(0)}" y2="${H - m.b}"/>
    ${dots(rule, 'var(--s1)')}${dots(jev, 'var(--s2)')}
    ${lab(rule, 'var(--s1)', `the rule  n=${rule.length}`, -12)}
    ${lab(jev, 'var(--s2)', `Jev  n=${jev.length}`, 6)}
    <text class="axlab" x="${(m.l + W - m.r) / 2}" y="${H - 8}" text-anchor="middle">more trail to the RIGHT  ←   sensor asymmetry   →  more trail to the LEFT</text>
    <text class="axlab" x="12" y="${m.t + 10}">turn</text>
    <text class="axlab" x="12" y="${H - m.b - 2}">left</text>
  </svg>`;
}

/**
 * DISPERSAL over time, not polarization.
 *
 * This chart used to plot polarization, the classical swarm order parameter,
 * and it was the wrong measure for this system: fluoddity spawns sixteen tight
 * cohorts that expand as starbursts, so headings cancel and every arm sits
 * near 0.2 whatever it does. Dispersal — how far a cohort has travelled from
 * where it spawned — is the axis these arms actually separate on. Its range
 * depends on how long you let it run, so the scale is fitted to the data
 * rather than pinned at 1.
 */
function polChart(el, series) {
  const W = 620, H = 238, m = { l: 46, r: 104, t: 26, b: 26 };   // t leaves room for the axis title
  const len = Math.max(...series.map((s) => s.v.length), 2);
  if (len < 2) { el.innerHTML = '<p class="cap">press run — dispersal is plotted as the swarms evolve</p>'; return; }
  const peak = Math.max(0.02, ...series.flatMap((s) => s.v));
  const top = Math.ceil(peak * 20) / 20;                 // a round 0.05 above the data
  const X = (i) => m.l + (i / (len - 1)) * (W - m.l - m.r);
  const Y = (v) => m.t + (1 - v / top) * (H - m.t - m.b);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top).map((v) =>
    `<line class="gridline" x1="${m.l}" y1="${Y(v)}" x2="${W - m.r}" y2="${Y(v)}"/>` +
    `<text class="axlab" x="${m.l - 6}" y="${Y(v) + 3}" text-anchor="end">${v.toFixed(2)}</text>`).join('');
  const lines = series.map((s) => s.v.length < 2 ? '' :
    `<polyline fill="none" stroke="${s.col}" stroke-width="2" stroke-linejoin="round"
      points="${s.v.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}"/>`).join('');
  // Direct labels, nudged apart so four of them never overlap into illegibility.
  const ends = series.filter((s) => s.v.length).map((s) => ({ s, y: Y(s.v[s.v.length - 1]) }))
    .sort((a, b) => a.y - b.y);
  let prev = -99;
  const labs = ends.map(({ s, y }) => {
    const yy = Math.max(y, prev + 12); prev = yy;
    return `<text class="serieslab" x="${W - m.r + 8}" y="${yy + 3}" fill="${s.col}">${esc(s.name)} ${s.v[s.v.length - 1].toFixed(3)}</text>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cohort dispersal over time for all four arms">
    ${grid}${lines}${labs}
    <text class="axlab" x="${m.l}" y="${H - 6}">tick 1</text>
    <text class="axlab" x="${W - m.r}" y="${H - 6}" text-anchor="end">tick ${len}</text>
    <text class="axlab" x="10" y="12">dispersal — how far a cohort has moved from where it spawned</text>
  </svg>`;
}

/** The table that makes identity legible without colour at all. */
function polTable(series) {
  const rows = series.map((s) => {
    const v = s.v;
    const last = v.length ? v[v.length - 1].toFixed(3) : '—';
    const peak = v.length ? Math.max(...v).toFixed(3) : '—';
    return `<tr><td><span class="sw-dot s${s.slot}"></span>${esc(s.name)}</td>` +
      `<td class="num">${last}</td><td class="num">${peak}</td><td class="num">${v.length}</td></tr>`;
  }).join('');
  $('poltable').innerHTML =
    `<thead><tr><th>arm</th><th>dispersal now</th><th>peak</th><th>ticks</th></tr></thead><tbody>${rows}</tbody>`;
}

// ------------------------------------------------------------- the model ----
async function askJev(senses) {
  const r = await fetch(ENDPOINT, { method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state: swarmDoc(senses, { note: FRAMINGS.mimic }),
      questions: swarmQuestions(senses) }) });
  const b = await r.json();
  if (!r.ok) throw new Error(b?.error || `jev ${r.status}`);
  return senses.map((_, i) => {
    const a = b.answers?.[`p${i}`];
    if (typeof a?.score !== 'number') throw new Error(`no answer for particle ${i}`);
    return turnFromScore(a.score, TURN_RUNGS);
  });
}

// --------------------------------------------------------------- the run ----
function build() {
  const n = Number($('n').value);
  const brain = brainById($('brain') ? $('brain').value : 'wurms01');
  const rnd = randomDecider(99);
  // Built ONCE and shared, so every arm runs the identical genome and the
  // identical measured turn scale. Rebuilding it per arm would let the
  // calibration differ between them, which is the one thing that must not.
  const ref = makeSwarm({ n, ...CONF, cfg: brain.cfg });
  state = {
    n, brain,
    arms: ARMS.map((a) => ({ ...a,
      sw: makeSwarm({ n, ...CONF, cfg: brain.cfg, turnScale: ref.turnScale }), pol: [] })),
    rnd, scatterJev: [], scatterRule: [], tick: 0,
  };
  $('arms').innerHTML = state.arms.map((a) => `
    <div class="arm a${a.slot}">
      <div class="armtop"><span class="sw-dot s${a.slot}"></span><h3>${esc(a.name)}</h3>
        <span class="what">${esc(a.what)}</span></div>
      <canvas id="cv_${a.id}"></canvas>
      <div class="armnums">
        <div>dispersal<b id="pol_${a.id}">—</b></div>
        <div>mean |turn|<b id="trn_${a.id}">—</b></div>
      </div>
    </div>`).join('');
  for (const a of state.arms) paint($(`cv_${a.id}`), a.sw, PARTICLE_COL[a.slot]);
  redraw();
}

function redraw() {
  const series = state.arms.map((a) => ({ name: a.name, slot: a.slot, col: `var(--s${a.slot})`, v: a.pol }));
  polChart($('polchart'), series);
  polTable(series);
  scatter($('scatter'), state.scatterJev, state.scatterRule);
}

async function oneTick() {
  for (const a of state.arms) {
    const senses = senseAll(a.sw);
    let turns;
    if (a.live) {
      turns = await askJev(senses);                       // the one call per tick
      // Sample the policy, thinned — a few thousand dots is a shape, a hundred
      // thousand is a smear that takes a second to draw.
      for (let i = 0; i < senses.length; i += 4) {
        state.scatterJev.push({ x: senses[i].s.sig[2] - senses[i].s.sig[0], y: turns[i] });
      }
      const det = ruleDecider(a.sw, senses);
      for (let i = 0; i < senses.length; i += 4) {
        state.scatterRule.push({ x: senses[i].s.sig[2] - senses[i].s.sig[0], y: det[i] });
      }
      if (state.scatterJev.length > 3000) {
        state.scatterJev = state.scatterJev.slice(-3000);
        state.scatterRule = state.scatterRule.slice(-3000);
      }
    } else if (a.id === 'rule') turns = ruleDecider(a.sw, senses);
    else if (a.id === 'random') turns = state.rnd(a.sw, senses);
    else turns = frozenDecider(a.sw, senses);

    // One decision, then fluoddity's own `substeps` physics steps with it held.
    // Every arm gets the same number, so the comparison is untouched.
    step(a.sw, senses, turns);
    const extra = Number($('sub').value) - 1;
    if (extra > 0) advance(a.sw, turns, extra);
    const o = orderOf(a.sw);
    a.pol.push(o.dispersal);
    if (a.pol.length > 240) a.pol.shift();
    paint($(`cv_${a.id}`), a.sw, PARTICLE_COL[a.slot]);
    $(`pol_${a.id}`).textContent = o.dispersal.toFixed(3);
    $(`trn_${a.id}`).textContent = (turns.reduce((x, y) => x + Math.abs(y), 0) / turns.length).toFixed(2);
  }
  state.tick++;
  redraw();
}

async function loop() {
  running = true; stopFlag = false;
  $('run').textContent = 'stop'; $('n').disabled = true;
  while (!stopFlag) {
    try {
      $('mode').textContent = `tick ${state.tick + 1} — asking (${state.n} questions in one call)…`;
      await oneTick();
      $('mode').textContent = `tick ${state.tick} — live jev`;
    } catch (e) {
      // Say the call failed and stop. A swarm page that quietly carried on with
      // three arms and a frozen fourth would look exactly like a result.
      $('mode').textContent = `tick ${state.tick + 1}: call failed — ${String(e.message).slice(0, 70)}`;
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  running = false; stopFlag = false;
  $('run').textContent = 'run all four'; $('n').disabled = false;
}

$('run').addEventListener('click', () => { if (running) { stopFlag = true; } else loop(); });
$('reset').addEventListener('click', () => { stopFlag = true; build(); $('mode').textContent = 'idle'; });
$('n').addEventListener('change', build);
$('sub').addEventListener('change', () => { stopFlag = true; build(); $('mode').textContent = 'idle'; });
$('brain').addEventListener('change', () => { stopFlag = true; build(); $('mode').textContent = 'idle'; });
build();

// The headless hook, the house `__foam` / `__jev` / `__composer` pattern.
window.__swarm = { state: () => state, oneTick, build, paint };
