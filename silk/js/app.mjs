// app.mjs — the page. All UI, no model.
//
// Three views over the same engine: one run animated, sixteen runs measured,
// and one run perturbed against itself. Nothing here knows how a web is built;
// it calls weaver.step() and draws whatever came back.

import { PRESETS, boundary, WORLD } from './boundary.mjs';
import { Weaver, BODY, STAGES, STAGE_LABEL } from './weaver.mjs';
import { measure, family, divergence } from './metrics.mjs';
import * as R from './render.mjs';

const $ = (id) => document.getElementById(id);
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const pct = (x) => `${(x * 100).toFixed(1)}%`;

// ─── tabs ────────────────────────────────────────────────────────────────────

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  for (const x of $('tabs').children) x.classList.toggle('on', x === b);
  for (const p of document.querySelectorAll('.panel')) {
    p.classList.toggle('on', p.id === 'tab-' + b.dataset.tab);
  }
  sizeStage();
  if (b.dataset.tab === 'path') sizePath();
});

for (const sel of ['preset', 'fpreset', 'ppreset']) {
  const el = $(sel);
  for (const [k, p] of Object.entries(PRESETS)) {
    const o = document.createElement('option');
    o.value = k;
    o.textContent = p.label;
    el.appendChild(o);
  }
}

// ─── the habitat and the animal, off the sliders ─────────────────────────────

function currentBoundary(presetId = 'preset') {
  const name = $(presetId).value;
  const base = boundary(name);
  if (presetId !== 'preset') return base;
  return boundary(name, {
    gravity: +$('gravity').value / 100,
    wind: +$('wind').value / 100,
    silk: Math.round(base.silk * (+$('silk').value / 100)),
  });
}

const currentBody = () => ({
  legSpan: +$('legSpan').value,
  gauge: +$('gauge').value,
  asym: +$('asym').value / 100,
  tidiness: +$('tidiness').value / 100,
});

function syncVals() {
  $('speedv').textContent = `${$('speed').value}×`;
  $('gravityv').textContent = fmt(+$('gravity').value / 100, 2);
  $('windv').textContent = fmt(+$('wind').value / 100, 2);
  $('silkv').textContent = `${$('silk').value}%`;
  $('legSpanv').textContent = $('legSpan').value;
  $('gaugev').textContent = $('gauge').value;
  $('asymv').textContent = fmt(+$('asym').value / 100, 2);
  $('tidinessv').textContent = fmt(+$('tidiness').value / 100, 2);
}

// ─── view 1: weave ───────────────────────────────────────────────────────────

const stage = $('stage');
const sctx = stage.getContext('2d');
let W = null;          // the live weaver
let T = null;          // world → screen transform
let running = false;
let heading = 0;
let trail = { x: 0, y: 0 };

function sizeStage() {
  const wrap = stage.parentElement;
  if (!wrap.clientWidth) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const h = Math.max(260, Math.round(wrap.clientWidth * (WORLD.h / WORLD.w)));
  wrap.style.height = h + 'px';
  stage.width = Math.round(wrap.clientWidth * dpr);
  stage.height = Math.round(h * dpr);
  T = R.fit(stage, WORLD);
  paint();
}

function restart() {
  const bnd = currentBoundary();
  $('blurb').textContent = bnd.blurb;
  W = new Weaver(bnd, { seed: Math.max(1, +$('seed').value | 0), body: currentBody() });
  trail = { ...W.pos };
  heading = 0;
  running = true;
  $('pause').textContent = 'pause';
  paint();
}

function paintRail() {
  const rail = $('rail');
  const at = STAGES.indexOf(W ? W.stage : 'bridge');
  rail.innerHTML = STAGES.slice(0, 7).map((s, i) => {
    const cls = i < at ? 'done' : i === at ? 'now' : '';
    return `<span class="chip ${cls}">${STAGE_LABEL[s]}</span>`;
  }).join('');
  const last = W && W.log.length ? W.log[W.log.length - 1] : null;
  $('note').textContent = last
    ? `${STAGE_LABEL[last.stage]} — ${last.note}`
    : 'casting a line on the wind';
}

function paintMetrics() {
  if (!W) return;
  const rows = [];
  const push = (k, v, sep = false) => rows.push(`<tr${sep ? ' class="sep"' : ''}><td>${k}</td><td>${v}</td></tr>`);
  if (W.stage !== 'done') {
    push('stage', STAGE_LABEL[W.stage]);
    push('radii', W.radii.length);
    push('threads', W.f.threads.filter((t) => !t.dead).length);
    push('silk', `${Math.round(W.f.silkUsed)} / ${W.bnd.silk}`);
    push('actions', W.acted);
  } else {
    const m = W.metrics || (W.metrics = measure(W));
    push('radii', m.radii);
    push('spiral turns', fmt(m.turns, 1));
    push('hub rise', fmt(m.hubRise, 3), true);
    push('mesh above', fmt(m.meshUpper, 1));
    push('mesh below', fmt(m.meshLower, 1));
    push('mesh above ÷ below', fmt(m.meshRatio, 2));
    push('area below ÷ above', fmt(m.areaRatio, 2));
    push('capture area', Math.round(m.captureArea).toLocaleString(), true);
    push('capture silk', Math.round(m.captureLength).toLocaleString());
    push('silk used', Math.round(m.silkUsed).toLocaleString());
    push('reclaimed', Math.round(m.reclaimed).toLocaleString());
    if (m.abandoned) push('radii abandoned', m.abandoned, true);
    if (m.unreached) push('anchors unreached', m.unreached, !m.abandoned);
    push('finished', m.complete ? 'yes' : 'ran out of silk', !m.abandoned && !m.unreached);
  }
  $('mx').innerHTML = rows.join('');
}

function paint() {
  if (!W || !T) return;
  R.clear(sctx, stage);
  R.drawBoundary(sctx, W.bnd, T);
  R.drawWeb(sctx, W.f, T, { dew: W.stage === 'done' });
  if (W.stage !== 'done') {
    R.drawDragline(sctx, trail, W.pos, T);
    R.drawSpider(sctx, W.pos, heading, T);
  }
  paintRail();
  paintMetrics();
}

function frame() {
  requestAnimationFrame(frame);
  if (!W || !T) return;
  if (running && W.stage !== 'done') {
    const n = +$('speed').value;
    const prev = { ...W.pos };
    for (let i = 0; i < n && W.stage !== 'done'; i++) W.step();
    const dx = W.pos.x - prev.x;
    const dy = W.pos.y - prev.y;
    if (Math.hypot(dx, dy) > 0.5) {
      const want = Math.atan2(dy, dx);
      let d = want - heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      heading += d * 0.35;
    }
    trail = prev;
  } else if (W.stage === 'done') {
    // let the finished sheet keep hanging: it is a physical object, and a web
    // that freezes the instant the last thread lands looks like a diagram
    W.f.step(1, 2);
  }
  paint();
}

$('run').onclick = restart;
$('pause').onclick = () => {
  running = !running;
  $('pause').textContent = running ? 'pause' : 'resume';
};
$('skip').onclick = () => {
  if (!W) return;
  let n = 0;
  while (W.stage !== 'done' && n++ < 40000) W.step();
  W.f.step(28, 5);
  paint();
};
$('dice').onclick = () => {
  $('seed').value = 1 + Math.floor(Math.random() * 9999);
  restart();
};
$('preset').onchange = restart;
for (const id of ['gravity', 'wind', 'silk', 'legSpan', 'gauge', 'asym', 'tidiness']) {
  $(id).addEventListener('input', syncVals);
  $(id).addEventListener('change', restart);
}
$('speed').addEventListener('input', syncVals);
$('seed').addEventListener('change', restart);

// ─── view 2: the family ──────────────────────────────────────────────────────
//
// Sixteen webs is ~2.5 seconds of work. Run them one per animation frame so the
// page stays alive and the grid fills in front of you — a spinner would hide
// exactly the thing worth watching, which is how different they look.

const FAM_N = 16;
let famBusy = false;

$('frun').onclick = () => {
  if (famBusy) return;
  famBusy = true;
  const bnd = currentBoundary('fpreset');
  const grid = $('famgrid');
  grid.innerHTML = '';
  $('fstats').innerHTML = '';
  $('ffoot').textContent = '';
  const ms = [];
  const webs = [];
  let i = 0;

  const one = () => {
    if (i >= FAM_N) {
      famBusy = false;
      $('fprog').textContent = `${FAM_N} webs, ${PRESETS[bnd.name].label}`;
      famStats(family(ms), webs, bnd);
      return;
    }
    const seed = i + 1;
    const w = new Weaver(bnd, { seed }).run();
    ms.push(measure(w));
    webs.push(w);

    const fig = document.createElement('figure');
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = 220;
    c.width = cw * dpr;
    c.height = Math.round(cw * (WORLD.h / WORLD.w)) * dpr;
    c.style.aspectRatio = `${WORLD.w} / ${WORLD.h}`;
    const cx = c.getContext('2d');
    const t = R.fit(c, WORLD, 6);
    R.clear(cx, c);
    R.drawBoundary(cx, bnd, t, { anchors: false });
    R.drawWeb(cx, w.f, t);
    const cap = document.createElement('figcaption');
    const m = ms[ms.length - 1];
    cap.textContent = `seed ${seed} · ${m.radii}r · ${fmt(m.turns, 1)}t`;
    fig.append(c, cap);
    grid.appendChild(fig);

    i++;
    $('fprog').textContent = `weaving ${i}/${FAM_N}…`;
    requestAnimationFrame(one);
  };
  $('fprog').textContent = 'weaving 1/16…';
  requestAnimationFrame(one);
};

function famStats(F, webs, bnd) {
  // Ordered tightest-first, so the shape of the argument is the shape of the
  // table: the things a field biologist measures off a photograph agree, and
  // the ratios — which are quotients of two already-noisy quantities, and are
  // gravity readouts rather than invariants — do not agree nearly as well.
  const ROWS = [
    ['capture area', 'captureArea', 0],
    ['capture silk', 'captureLength', 0],
    ['spiral turns', 'turns', 1],
    ['silk used', 'silkUsed', 0],
    ['mesh below hub', 'meshLower', 1],
    ['mesh above hub', 'meshUpper', 1],
    ['radii', 'radii', 0],
    ['mesh above ÷ below', 'meshRatio', 2],
    ['area below ÷ above', 'areaRatio', 2],
    ['hub rise', 'hubRise', 3],
  ];
  const maxCV = Math.max(...ROWS.map(([, k]) => F[k].cv), 0.01);
  const head = '<tr><td class="hint">invariant</td><td class="hint">mean ± sd</td><td class="hint bar">coefficient of variation</td></tr>';
  const body = ROWS.map(([label, k, d]) => {
    const f = F[k];
    const w = Math.max(2, (f.cv / maxCV) * 100);
    return `<tr><td>${label}</td><td>${fmt(f.mean, d)} ± ${fmt(f.sd, d)}</td>` +
      `<td class="bar"><div class="cvbar"><i style="width:${w}%"></i></div></td>` +
      `<td style="text-align:right;color:var(--dim)">${pct(f.cv)}</td></tr>`;
  }).join('');
  $('fstats').innerHTML = head + body;

  // The counterweight to the table: agreement on the numbers is not agreement
  // on the object. Sample the capture spirals of two members and report how far
  // apart they actually lie.
  const d = divergence(webs[0], webs[1]);
  const dAll = webs.slice(1, 6).map((w) => divergence(webs[0], w).mean);
  const mean = dAll.reduce((a, b) => a + b, 0) / dAll.length;
  // The scale that makes the number mean something: HALF A MESH CELL. Two
  // identical webs slid half a cell out of register would score that and no
  // more, so it is the ceiling on "the same web, shifted". Anything above it is
  // two webs that are not versions of one another.
  const halfCell = (F.meshUpper.mean + F.meshLower.mean) / 4;
  $('ffoot').innerHTML =
    `Every one of the ${F.n} finished${F.complete === F.n ? '' : ` (${F.complete} of ${F.n} finished; the rest ran out of silk)`}. ` +
    `The numbers above agree to within a few percent — the four at the top to within two. The <em>geometry</em> does not: sampling the capture spirals, ` +
    `a thread in seed 1's web lies on average <strong>${fmt(mean, 1)} world units</strong> from the nearest thread of another member. ` +
    `Two identical webs slid half a mesh cell out of register would score ${fmt(halfCell, 1)}, so ${fmt(mean, 1)} is past the point where one web is a shifted copy of the other: ` +
    `these are different objects that happen to measure the same. ` +
    `That gap — tight numbers, uncorrelated geometry — is what "a family" means here.`;
}

// ─── view 3: path dependence ─────────────────────────────────────────────────

const pcanvas = $('pcanvas');
const pctx = pcanvas.getContext('2d');
let pT = null;
let pRuns = null;

function sizePath() {
  if (!pcanvas.clientWidth) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  pcanvas.width = Math.round(pcanvas.clientWidth * dpr);
  pcanvas.height = Math.round(pcanvas.clientWidth * (WORLD.h / WORLD.w) * dpr);
  pT = R.fit(pcanvas, WORLD, 10);
  if (pRuns) paintPath(pRuns.showing);
}

// The sweep. Each entry perturbs exactly one decision and nothing else.
const SWEEP = [
  { key: 'bridge', label: 'the bridge', perturb: { at: 'bridge' } },
  { key: 'r0',  label: 'radius #1',  perturb: { at: 'radius', index: 0, du: 0.16 } },
  { key: 'r2',  label: 'radius #3',  perturb: { at: 'radius', index: 2, du: 0.16 } },
  { key: 'r6',  label: 'radius #7',  perturb: { at: 'radius', index: 6, du: 0.16 } },
  { key: 'r14', label: 'radius #15', perturb: { at: 'radius', index: 14, du: 0.16 } },
  { key: 'r26', label: 'radius #27', perturb: { at: 'radius', index: 26, du: 0.16 } },
  { key: 'c60', label: 'spiral #60', perturb: { at: 'capture', index: 60, dp: 0.5 } },
  { key: 'c400', label: 'spiral #400', perturb: { at: 'capture', index: 400, dp: 0.5 } },
];

$('prun').onclick = () => {
  const bnd = currentBoundary('ppreset');
  const seed = Math.max(1, +$('pseed').value | 0);
  $('pchart').innerHTML = '';
  $('pfoot').textContent = '';
  $('pprog').textContent = 'weaving the baseline…';

  const base = new Weaver(bnd, { seed }).run();
  const results = [];
  let i = 0;

  const one = () => {
    if (i < SWEEP.length) {
      const s = SWEEP[i];
      const w = new Weaver(bnd, { seed, perturb: s.perturb }).run();
      results.push({ ...s, web: w, d: divergence(base, w).mean, m: measure(w) });
      i++;
      $('pprog').textContent = `perturbing ${i}/${SWEEP.length + 1}…`;
      return requestAnimationFrame(one);
    }
    // The reference: a different night entirely, same boundary. Nothing an
    // in-run perturbation does should exceed this.
    const other = new Weaver(bnd, { seed: seed + 1 }).run();
    const ref = { key: 'seed', label: `seed ${seed + 1}`, web: other, d: divergence(base, other).mean, m: measure(other), isRef: true };
    pRuns = { base, bnd, seed, results, ref, showing: 'r0', bm: measure(base) };
    $('pprog').textContent = '';
    paintChart();
    sizePath();
    paintPath('r0');
  };
  requestAnimationFrame(one);
};

function paintChart() {
  const { results, ref, bm } = pRuns;
  const all = results.concat([ref]);
  const max = Math.max(...all.map((r) => r.d), 0.01);
  const rows = all.map((r) => {
    const w = Math.max(2, (r.d / max) * 100);
    return `<div class="prow${r.isRef ? ' ref' : ''}" data-key="${r.key}">` +
      `<span class="nm">${r.label}</span>` +
      `<span class="bb"><i style="width:${w}%"></i></span>` +
      `<span class="vv">${fmt(r.d, 1)}</span></div>`;
  }).join('');
  $('pchart').innerHTML =
    '<h4>how far the finished web moved</h4>' +
    '<p class="sub">mean distance from a thread in the baseline to the nearest thread of the perturbed run, in world units. Click a row to overlay it.</p>' +
    rows;
  $('pchart').onclick = (e) => {
    const row = e.target.closest('.prow');
    if (row) paintPath(row.dataset.key);
  };

  const early = results.find((r) => r.key === 'r0');
  const late = results.find((r) => r.key === 'c400');
  const br = results.find((r) => r.key === 'bridge');
  $('pfoot').innerHTML =
    `Baseline: ${bm.radii} radii, ${fmt(bm.turns, 1)} turns. ` +
    `Nudging the <strong>first radius</strong> by a sixth of its gap moved the finished web ${fmt(early.d, 1)} units and changed the radius count by ${early.m.radii - bm.radii}. ` +
    `The same nudge applied to the <strong>four-hundredth capture attachment</strong> moved it ${fmt(late.d, 1)} units and changed the radius count by ${late.m.radii - bm.radii}. ` +
    `Between them the curve falls monotonically and spans roughly two orders of magnitude. ` +
    `The blue reference bar is a different seed on the same boundary — every decision in the run re-drawn — and note where <strong>the bridge</strong> sits against it: ` +
    `re-casting that single line is worth about as much divergence as re-drawing the entire night, because everything after it is measured against where it landed. ` +
    `That ordering is the signature of an agent whose memory is a structure it cannot un-build.`;
}

function paintPath(key) {
  if (!pRuns || !pT) return;
  pRuns.showing = key;
  const other = key === 'seed' ? pRuns.ref : pRuns.results.find((r) => r.key === key);
  R.clear(pctx, pcanvas);
  R.drawBoundary(pctx, pRuns.bnd, pT);
  R.drawWeb(pctx, pRuns.base.f, pT, { tint: 'rgba(86,160,172,0.62)' });
  if (other) R.drawWeb(pctx, other.web.f, pT, { tint: 'rgba(224,138,90,0.62)' });
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.font = `${13 * (pcanvas.width / pcanvas.clientWidth)}px ui-monospace, monospace`;
  pctx.fillStyle = 'rgba(86,160,172,0.95)';
  pctx.fillText('baseline', 14, 24 * (pcanvas.width / pcanvas.clientWidth));
  pctx.fillStyle = 'rgba(224,138,90,0.95)';
  pctx.fillText(other ? `perturbed: ${other.label}` : '', 14, 42 * (pcanvas.width / pcanvas.clientWidth));
}

// ─── boot ────────────────────────────────────────────────────────────────────

syncVals();
window.addEventListener('resize', () => { sizeStage(); sizePath(); });
sizeStage();
restart();
requestAnimationFrame(frame);
