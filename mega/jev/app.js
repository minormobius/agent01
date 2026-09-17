// app.js — the page. All delve logic lives in delve.mjs; this file is the
// loop, the fetches and the rendering.
//
// Two things here are deliberate and should stay that way:
//
//  1. MODE IS NEVER GUESSED. The banner says "live" only after /api/health
//     reports a configured key AND a real call has come back stamped
//     source=typesafe. Anything else says offline, loudly. A demo that
//     silently fell back to local heuristics while claiming to be a model
//     would be worse than a broken one.
//  2. THE WIRE PANEL SHOWS THE REAL BYTES. The request pane is the exact
//     body posted; the response pane is the exact JSON returned. No
//     prettified stand-in.

import {
  makeWorld, newRun, buildState, buildQuestions, applyAnswers,
  offlineAnswers, runSummary, TICK_MS_DEFAULT,
} from './delve.mjs';
import { newTelemetry, record, series, profile, SIGNALS } from './telemetry.mjs';

const FOAM = 'https://foam.mino.mobi';
const $ = (id) => document.getElementById(id);

const el = {
  mode: $('mode'), modeText: $('mode-text'),
  seed: $('seed'), size: $('size'), roll: $('roll'), tick: $('tick'), gate: $('gate'),
  run: $('run'), step: $('step'), reset: $('reset'),
  map: $('map'), mapSub: $('map-sub'), ramp: $('ramp'), tiles: $('tiles'),
  scene: $('scene'), stage: $('stage'), stageNote: $('stage-note'),
  view3d: $('view-3d'), viewPlan: $('view-plan'), spin: $('spin'), recentre: $('recentre'),
  charts: $('charts'), telCount: $('tel-count'),
  profile: $('profile'), profCaveat: $('prof-caveat'), findings: $('findings'),
  answers: $('answers'), ansSub: $('ans-sub'), gatenote: $('gatenote'),
  log: $('log'), summary: $('summary').querySelector('tbody'),
  req: $('req'), res: $('res'), tip: $('tip'),
};

const app = {
  world: null,
  run: null,
  questions: null,
  timer: null,
  running: false,
  busy: false,
  keyConfigured: false,
  live: false, // proven live: a real answer came back stamped source=typesafe
  lastLatency: null,
  lastUsage: null,
  fixtureMode: false,
  tel: newTelemetry(),
  scene: null,
  view: '3d',
};

// ---------------------------------------------------------------- helpers ---
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (n) => `${(n * 100).toFixed(0)}%`;

// `instructions` and `criteria` values may be strings OR JSON objects/arrays —
// the API accepts structure there, and the move question uses it (labelled
// keys measurably raise confidence on the hard calls; see delve.mjs). So
// everything that puts one on screen goes through here, or it renders
// "[object Object]".
function asText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(asText).join(' · ');
  if (typeof v !== 'object') return String(v);
  return Object.entries(v)
    .filter(([, val]) => val !== null && val !== undefined && val !== '')
    .map(([k, val]) => `${k.replace(/_/g, ' ')}: ${asText(val)}`)
    .join(' · ');
}

function setMode(kind, text) {
  el.mode.dataset.mode = kind;
  el.modeText.innerHTML = text;
}

function announceMode() {
  if (app.live) {
    setMode('live', '<b>Live.</b> Every decision below came from <code>jev-latest</code> over the TypeSafe API.');
  } else if (app.keyConfigured) {
    setMode('offline', '<b>Key configured, not yet proven.</b> Take a step to make the first real call.');
  } else {
    setMode('offline',
      '<b>Offline stand-in — these are not Jev’s answers.</b> No <code>TYPESAFE_API_KEY</code> is configured on this worker, '
      + 'so decisions come from a local rule-of-thumb in the same response shape. Set the secret to run it for real.');
  }
}

// ------------------------------------------------------------- the world ---
async function loadDungeon() {
  const seed = Math.max(1, parseInt(el.seed.value, 10) || 1);
  const size = el.size.value;
  const roll = Math.max(1, parseInt(el.roll.value, 10) || 1);
  const q = `seed=${seed}&n=3&size=${size}`;

  el.mapSub.textContent = 'Summoning a dungeon from foam.mino.mobi…';
  try {
    const [dRes, cRes] = await Promise.all([
      fetch(`${FOAM}/api/dungeon?${q}`),
      fetch(`${FOAM}/api/content?${q}&roll=${roll}`),
    ]);
    if (!dRes.ok || !cRes.ok) throw new Error(`foam api ${dRes.status}/${cRes.status}`);
    const [dungeon, content] = await Promise.all([dRes.json(), cRes.json()]);
    app.fixtureMode = false;
    return makeWorld(dungeon, content);
  } catch (err) {
    // The foam API is a different service; if it is down the demo should
    // still run, but it must say which dungeon it is actually showing.
    const [dungeon, content] = await Promise.all([
      fetch('fixtures/dungeon-seed7-s.json').then((r) => r.json()),
      fetch('fixtures/content-seed7-s-roll1.json').then((r) => r.json()),
    ]);
    app.fixtureMode = true;
    console.warn('foam api unreachable, using the bundled fixture:', err);
    return makeWorld(dungeon, content);
  }
}

async function reset() {
  stop();
  app.world = await loadDungeon();
  app.run = newRun(app.world, { seed: Math.max(1, parseInt(el.seed.value, 10) || 1) });
  app.questions = buildQuestions(app.world, app.run);
  app.tel = newTelemetry();
  app.lastLatency = null;
  app.lastUsage = null;
  el.req.textContent = '—';
  el.res.textContent = '—';
  el.answers.innerHTML = '<p class="muted" style="font-size:.86rem">Press <b>Start delve</b> — or <b>Step once</b> to take a single decision.</p>';
  el.gatenote.innerHTML = '';
  const w = app.world;
  el.mapSub.innerHTML = app.fixtureMode
    ? '<b>Bundled fixture</b> — foam.mino.mobi was unreachable, so this is the saved seed 7 dungeon.'
    : `Seed ${w.seed}, roll ${w.roll} — ${w.rooms.size} chambers, ${w.endpoints.length} vaults, `
      + `${w.maxDepth} levels down, ${w.goldOnFloor} gold on the floor.`;
  await initScene();
  renderAll();
}

// ------------------------------------------------------------- the 3D view --
/**
 * three.js is loaded with a DYNAMIC import on purpose. A static one would put
 * the whole vendored bundle on app.js's critical path, and a failure there —
 * no WebGL, a blocked asset, a stale importmap — would take the entire page
 * down with it. This way the demo degrades to the plan view and says so.
 */
async function initScene() {
  if (app.scene) { app.scene.dispose(); app.scene = null; }
  try {
    const { createScene } = await import('./scene.mjs');
    const dark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    app.scene = createScene(el.scene, app.world, { dark });
    app.scene.setSpin(el.spin.checked);
    app.scene.update(app.run);
    el.stageNote.hidden = true;
  } catch (err) {
    console.warn('3D view unavailable:', err);
    app.scene = null;
    el.stageNote.hidden = false;
    el.stageNote.textContent = `The 3D view could not start (${err?.message || err}). Showing the plan instead.`;
    setView('plan');
  }
}

function setView(v) {
  app.view = v;
  const is3d = v === '3d';
  el.stage.hidden = !is3d;
  el.map.hidden = is3d;
  el.view3d.classList.toggle('on', is3d);
  el.viewPlan.classList.toggle('on', !is3d);
  el.view3d.setAttribute('aria-pressed', String(is3d));
  el.viewPlan.setAttribute('aria-pressed', String(!is3d));
  if (!is3d) renderMap();
}

// --------------------------------------------------------------- the tick ---
async function askJev(state, questions) {
  const res = await fetch('api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state, questions }),
  });
  const body = await res.json().catch(() => ({ error: 'unreadable response' }));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.payload = body;
    err.status = res.status;
    throw err;
  }
  return body;
}

async function tick() {
  if (app.busy || !app.run || app.run.status !== 'delving') return;
  app.busy = true;
  try {
    const state = buildState(app.world, app.run);
    const questions = buildQuestions(app.world, app.run);
    app.questions = questions;

    // The exact body we post — shown verbatim in the wire panel.
    const requestBody = { state, questions, model: 'jev-latest' };
    el.req.textContent = JSON.stringify(requestBody, null, 2);

    let response;
    if (app.keyConfigured) {
      try {
        response = await askJev(state, questions);
        if (response.source === 'typesafe' && !app.live) {
          app.live = true;
          announceMode();
        }
      } catch (err) {
        app.live = false;
        if (err.status === 503 && err.payload?.error === 'no_api_key') {
          app.keyConfigured = false;
          announceMode();
        } else {
          setMode('error',
            `<b>The TypeSafe call failed</b> (${esc(err.payload?.status || err.status || '?')}: ${esc(err.message)}). `
            + 'Falling back to the offline stand-in for this tick — the answers below are <b>not</b> Jev’s.');
        }
        response = offlineAnswers(app.world, app.run);
      }
    } else {
      response = offlineAnswers(app.world, app.run);
    }

    el.res.textContent = JSON.stringify(response, null, 2);
    app.lastLatency = response.latency_ms ?? null;
    app.lastUsage = response.usage ?? null;

    const gate = Math.min(1, Math.max(0, parseFloat(el.gate.value) || 0));
    const result = applyAnswers(app.world, app.run, response.answers, { moveConfidenceGate: gate });

    // Telemetry is recorded from the answer AS RETURNED, before anything is
    // derived from it — the series are the model's own output, not our
    // interpretation of it.
    record(app.tel, {
      tick: app.run.tick - 1,
      answers: response.answers,
      run: app.run,
      world: app.world,
      usedFallback: result.usedFallback,
      latencyMs: response.latency_ms ?? null,
      source: response.source ?? null,
      inputTokens: response.usage?.input_tokens ?? null,
    });

    renderAnswers(questions, response, result);
    renderAll();

    if (app.run.status !== 'delving') stop();
  } finally {
    app.busy = false;
  }
}

function start() {
  if (app.running || !app.run || app.run.status !== 'delving') return;
  app.running = true;
  el.run.textContent = 'Pause';
  const ms = Math.max(2, parseInt(el.tick.value, 10) || (TICK_MS_DEFAULT / 1000)) * 1000;
  tick();
  app.timer = setInterval(tick, ms);
}
function stop() {
  app.running = false;
  if (app.timer) clearInterval(app.timer);
  app.timer = null;
  el.run.textContent = app.run && app.run.status !== 'delving' ? 'Run ended' : 'Start delve';
  el.run.disabled = Boolean(app.run && app.run.status !== 'delving');
}

// --------------------------------------------------------------- rendering --
const RAMP = ['--d0', '--d1', '--d2', '--d3', '--d4'];
function depthColor(depth, maxDepth) {
  const i = maxDepth <= 0 ? 0 : Math.min(RAMP.length - 1, Math.floor((depth / maxDepth) * RAMP.length));
  return `var(${RAMP[i]})`;
}

function renderRamp() {
  el.ramp.innerHTML = RAMP.map((v) => `<i style="background:var(${v})"></i>`).join('');
}

function renderTiles() {
  const r = app.run, w = app.world;
  if (!r) return;
  const hpState = r.hp / r.maxHp <= 0.25 ? 'bad' : r.hp / r.maxHp <= 0.5 ? 'warn' : '';
  const here = w.rooms.get(r.at);
  const tiles = [
    { k: 'Health', v: `${r.hp}<small>/${r.maxHp}</small>`, state: hpState },
    { k: 'Gold', v: `${r.gold}<small>/${w.goldOnFloor}</small>` },
    { k: 'Depth', v: `${here ? here.depth : 0}<small>/${w.maxDepth}</small>` },
    { k: 'Decision', v: `#${r.tick}` },
    { k: 'Chambers', v: `${r.visited.size}<small>/${w.rooms.size}</small>` },
    {
      k: 'Latency',
      v: app.lastLatency == null ? '—<small>ms</small>' : `${app.lastLatency}<small>ms</small>`,
    },
  ];
  el.tiles.innerHTML = tiles.map((t) =>
    `<div class="tile"${t.state ? ` data-state="${t.state}"` : ''}>
       <div class="k">${t.k}</div><div class="v num">${t.v}</div>
     </div>`).join('');
}

function renderMap() {
  const w = app.world, r = app.run;
  if (!w) return;
  const rooms = [...w.rooms.values()];
  const xs = rooms.map((x) => x.centroid[0]);
  const zs = rooms.map((x) => x.centroid[2]);
  const pad = 26;
  const W = 520, H = 360;
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const sx = (maxX - minX) || 1, sz = (maxZ - minZ) || 1;
  const scale = Math.min((W - pad * 2) / sx, (H - pad * 2) / sz);
  const ox = (W - sx * scale) / 2, oz = (H - sz * scale) / 2;
  const px = (x) => ox + (x - minX) * scale;
  const pz = (z) => oz + (z - minZ) * scale;

  // room radius from floor area, clamped so tiny rooms stay clickable
  const areas = rooms.map((x) => x.area);
  const maxArea = Math.max(...areas);
  const rad = (a) => 5 + 8 * Math.sqrt(a / maxArea);

  const walked = new Set();
  for (let i = 1; i < r.trail.length; i++) {
    walked.add([r.trail[i - 1], r.trail[i]].sort((a, b) => a - b).join('-'));
  }

  const doors = new Set();
  const lines = [];
  for (const room of rooms) {
    for (const x of room.exits) {
      const key = [room.id, x.to].sort((a, b) => a - b).join('-');
      if (doors.has(key)) continue;
      doors.add(key);
      const other = w.rooms.get(x.to);
      if (!other) continue;
      lines.push(`<line class="door${walked.has(key) ? ' walked' : ''}" x1="${px(room.centroid[0]).toFixed(1)}" y1="${pz(room.centroid[2]).toFixed(1)}" x2="${px(other.centroid[0]).toFixed(1)}" y2="${pz(other.centroid[2]).toFixed(1)}"/>`);
    }
  }

  const circles = rooms.map((room) => {
    const cx = px(room.centroid[0]), cy = pz(room.centroid[2]);
    const rr = rad(room.area);
    const seen = r.visited.has(room.id);
    const agents = r.cleared.has(room.id) ? 0 : room.agents.length;
    const loot = r.looted.has(room.id) ? 0 : room.loot.reduce((s, l) => s + (l.gold || 0), 0);
    const title = `chamber ${room.id} · depth ${room.depth}`;
    const detail = seen
      ? `${Math.round(room.area)} m² · ${agents} creature(s) · ${loot} gold · ${room.exits.length} exit(s)`
      : 'not yet visited';
    return `<circle class="room${seen ? '' : ' unvisited'}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}"`
      + ` fill="${depthColor(room.depth, w.maxDepth)}"`
      + ` data-title="${esc(title)}" data-detail="${esc(detail)}"><title>${esc(title)} — ${esc(detail)}</title></circle>`;
  });

  // Identity is never colour alone: the entrance is a square, vaults are
  // diamonds, the delver is a ring. Each is in the legend by shape.
  const markers = [];
  const ent = w.rooms.get(w.entrance);
  if (ent) {
    const cx = px(ent.centroid[0]), cy = pz(ent.centroid[2]), s = 6;
    markers.push(`<rect class="marker" x="${(cx - s).toFixed(1)}" y="${(cy - s).toFixed(1)}" width="${s * 2}" height="${s * 2}" fill="none" stroke="var(--ink)" stroke-width="1.8"/>`);
  }
  for (const id of w.endpoints) {
    const v = w.rooms.get(id);
    if (!v) continue;
    const cx = px(v.centroid[0]), cy = pz(v.centroid[2]), s = 7.5;
    const reached = r.visited.has(id);
    markers.push(`<path class="marker" d="M${cx.toFixed(1)} ${(cy - s).toFixed(1)}L${(cx + s).toFixed(1)} ${cy.toFixed(1)}L${cx.toFixed(1)} ${(cy + s).toFixed(1)}L${(cx - s).toFixed(1)} ${cy.toFixed(1)}Z" fill="${reached ? 'var(--warn)' : 'none'}" stroke="var(--warn)" stroke-width="1.8"/>`);
  }
  const here = w.rooms.get(r.at);
  if (here) {
    const cx = px(here.centroid[0]), cy = pz(here.centroid[2]);
    markers.push(`<circle class="marker delver" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(rad(here.area) + 4.5).toFixed(1)}"/>`);
  }

  el.map.innerHTML =
    `<desc id="map-desc">Plan view: ${rooms.length} chambers shaded by depth, lines are doors. The delver is in chamber ${r.at}.</desc>`
    + lines.join('') + circles.join('') + markers.join('');
}

function confBadge(conf, gated) {
  return `<span class="conf" data-gate="${gated ? 1 : 0}"><span class="pip"></span>confidence ${conf.toFixed(2)}${gated ? ' — below gate' : ''}</span>`;
}

function renderAnswers(questions, response, result) {
  const a = response.answers || {};
  const out = [];

  // --- move: a choice. Probability per option, single hue, pick emphasised.
  if (a.move && questions.move) {
    const probs = a.move.probabilities || {};
    const opts = Object.keys(questions.move.criteria);
    const rows = opts.map((o) => {
      const p = probs[o] ?? 0;
      const picked = o === a.move.choice;
      return `<div class="bar${picked ? ' picked' : ''}" data-title="${esc(o)}" data-detail="${esc(asText(questions.move.criteria[o]))}">
        <span class="lbl">${picked ? '▸ ' : ''}${esc(o)}</span>
        <span class="track"><span class="fill" style="width:${Math.max(0, Math.min(1, p)) * 100}%"></span></span>
        <span class="pct num">${pct(p)}</span>
      </div>`;
    }).join('');
    out.push(`<div class="answer">
      <div class="qhead"><span class="qid">move</span><span class="qtype">choice</span>
        ${confBadge(a.move.confidence ?? 0, result.usedFallback)}</div>
      <div class="qtext">${esc(asText(questions.move.instructions))}</div>
      <div class="bars">${rows}</div>
    </div>`);
  }

  // --- danger: a score on an ordered scale.
  if (a.danger && questions.danger) {
    const levels = questions.danger.criteria;
    const s = a.danger.score ?? 0;
    const nearest = Math.round(s);
    const segs = levels.map((txt, i) => {
      const on = i === nearest;
      return `<span class="seg" data-on="${on ? 1 : 0}" style="${on ? `background:var(${RAMP[Math.min(RAMP.length - 1, i + 1)]})` : ''}"
        data-title="level ${i}" data-detail="${esc(txt)}">${i}</span>`;
    }).join('');
    out.push(`<div class="answer">
      <div class="qhead"><span class="qid">danger</span><span class="qtype">score</span>
        ${confBadge(a.danger.confidence ?? 0, false)}</div>
      <div class="qtext">${esc(asText(questions.danger.instructions))}</div>
      <div class="meter">${segs}</div>
      <div class="scorelegend"><b class="num">${s.toFixed(2)}</b> — ${esc(levels[nearest] ?? '')}</div>
    </div>`);
  }

  // --- the nouls: 0..1 with the 0.5 decision threshold drawn in.
  for (const key of ['fight', 'take_loot', 'withdraw']) {
    if (!a[key] || !questions[key]) continue;
    const v = Math.max(0, Math.min(1, a[key].noul ?? 0));
    const yes = v > 0.5;
    out.push(`<div class="answer">
      <div class="qhead"><span class="qid">${key}</span><span class="qtype">noul</span></div>
      <div class="qtext">${esc(asText(questions[key].instructions))}</div>
      <div class="noul">
        <span class="track"><span class="fill" data-yes="${yes ? 1 : 0}" style="width:${v * 100}%"></span><span class="thresh"></span></span>
        <span class="verdict" data-yes="${yes ? 1 : 0}">${yes ? 'YES' : 'no'} ${v.toFixed(2)}</span>
      </div>
    </div>`);
  }

  el.answers.innerHTML = out.join('') || '<p class="muted">No answers this tick.</p>';

  el.gatenote.innerHTML = result.usedFallback
    ? `<div class="gatenote"><b>Confidence gate fired.</b> The <code>move</code> confidence came back under
       the gate, so the delver did <i>not</i> act on the model's pick — it fell back to the dungeon's own
       descent rule. This is the documented
       <a href="https://docs.typesafe.ai/patterns/confidence-routing" rel="noopener">confidence-gated routing</a>
       pattern: a typed answer still carries how sure it is, and you decide what that is worth.</div>`
    : '';

  const bits = [];
  bits.push(`${Object.keys(questions).length} typed questions, one call`);
  if (app.lastUsage?.input_tokens) bits.push(`${app.lastUsage.input_tokens} input tokens`);
  if (app.lastLatency != null) bits.push(`${app.lastLatency} ms`);
  if (!app.live) bits.push('offline stand-in — not Jev');
  el.ansSub.textContent = bits.join(' · ');
}

function renderLog() {
  const lines = app.run.log.slice(-60).reverse();
  el.log.innerHTML = lines.map((l) =>
    `<div class="line" data-kind="${esc(l.kind)}"><span class="t num">${l.tick}</span><span class="m">${esc(l.text)}</span></div>`,
  ).join('') || '<div class="muted">Nothing yet.</div>';
}

function renderSummary() {
  const s = runSummary(app.world, app.run);
  const rows = [
    ['Status', s.status],
    ['Decisions taken', s.ticks],
    ['Health', `${s.health} / ${s.max_health}`],
    ['Gold recovered', `${s.gold} / ${s.gold_on_floor}`],
    ['Chambers visited', `${s.rooms_visited} / ${s.rooms_total}`],
    ['Deepest level', `${s.deepest_depth} / ${s.max_depth}`],
    ['Vaults reached', `${s.vaults_reached} / ${s.vaults_total}`],
    ['Answers from', app.live ? 'jev-latest (live)' : 'offline stand-in'],
  ];
  el.summary.innerHTML = rows.map(([k, v]) =>
    `<tr><td>${esc(k)}</td><td class="n">${esc(v)}</td></tr>`).join('');
}


// ------------------------------------------------------------- telemetry ---
// Small multiples, never a dual axis. Health, depth, perceived danger and
// confidence live on different scales, so each gets its own panel with its own
// y-domain; the three nouls share one chart because they genuinely share 0–1.
//
// The three-series palette is validated for both themes (lightness band,
// chroma floor, CVD separation, contrast). Its worst adjacent tritan ΔE sits
// in the 6–8 band, which is only legal with secondary encoding — hence the
// legend AND the direct label on each series' last value.
const NOUL_COLORS = { fight: '#D64C77', take_loot: '#B8720C', withdraw: '#7B5FD6' };

const CW = 264, CH = 88, PL = 28, PR = 30, PT = 8, PB = 15;

function plotPoints(values, domain) {
  const n = values.length;
  const [lo, hi] = domain;
  const span = hi - lo || 1;
  const xw = CW - PL - PR;
  const x = (i) => PL + (n <= 1 ? xw / 2 : (i / (n - 1)) * xw);
  const y = (v) => PT + (1 - (v - lo) / span) * (CH - PT - PB);
  return { x, y, n };
}

function pathFor(values, domain) {
  const { x, y } = plotPoints(values, domain);
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

function lastDefined(values) {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] != null && Number.isFinite(values[i])) return { i, v: values[i] };
  }
  return null;
}

function chartSVG({ lines, domain, threshold, fmt }) {
  const [lo, hi] = domain;
  const { x, y } = plotPoints(lines[0].values, domain);
  const n = lines[0].values.length;

  let g = '';
  // recessive grid: just the two bounds
  for (const v of [lo, hi]) {
    g += `<line class="gridline" x1="${PL}" y1="${y(v).toFixed(1)}" x2="${CW - PR}" y2="${y(v).toFixed(1)}"/>`;
    g += `<text class="ylab" x="${PL - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${fmt(v)}</text>`;
  }
  if (threshold != null && threshold > lo && threshold < hi) {
    g += `<line class="thresh" x1="${PL}" y1="${y(threshold).toFixed(1)}" x2="${CW - PR}" y2="${y(threshold).toFixed(1)}"/>`;
  }

  for (const ln of lines) {
    const d = pathFor(ln.values, domain);
    if (!d) continue;
    if (lines.length === 1) {
      const base = y(Math.max(lo, Math.min(hi, lo)));
      const first = plotPoints(ln.values, domain).x(0);
      g += `<path class="area" fill="${ln.color}" d="${d}L${x(n - 1).toFixed(1)} ${base.toFixed(1)}L${first.toFixed(1)} ${base.toFixed(1)}Z"/>`;
    }
    g += `<path class="lineplot" stroke="${ln.color}" d="${d}"/>`;
    const last = lastDefined(ln.values);
    if (last) {
      g += `<circle class="lastdot" cx="${x(last.i).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="3" fill="${ln.color}"/>`;
      g += `<text class="lastval" x="${CW - PR + 4}" y="${(y(last.v) + 3.5).toFixed(1)}" fill="${ln.color}">${fmt(last.v)}</text>`;
    }
  }
  g += `<line class="axis" x1="${PL}" y1="${CH - PB}" x2="${CW - PR}" y2="${CH - PB}"/>`;
  g += `<text class="xlab" x="${PL}" y="${CH - 4}">0</text>`;
  g += `<text class="xlab" x="${CW - PR}" y="${CH - 4}" text-anchor="end">${Math.max(0, n - 1)}</text>`;
  g += `<rect class="hit" x="${PL}" y="${PT}" width="${CW - PL - PR}" height="${CH - PT - PB}"/>`;
  return `<svg viewBox="0 0 ${CW} ${CH}" role="img">${g}</svg>`;
}

function renderCharts() {
  const s = series(app.tel);
  const n = s.tick.length;
  el.telCount.textContent = n ? `· ${n} decision${n === 1 ? '' : 's'} recorded` : '';

  if (!n) {
    el.charts.innerHTML = '<div class="chart empty">Nothing recorded yet — take a step.</div>';
    return;
  }

  const maxHp = app.run.maxHp;
  const maxDepth = Math.max(1, app.world.maxDepth);
  const int = (v) => String(Math.round(v));
  const two = (v) => v.toFixed(2);
  const one = (v) => v.toFixed(1);

  const panels = [
    { key: 'health', title: 'Health', note: 'What it actually cost. The ground truth the model is reacting to.',
      lines: [{ key: 'health', label: 'health', color: 'var(--accent)', values: s.health }],
      domain: [0, maxHp], fmt: int },
    { key: 'depth', title: 'Depth reached', note: 'Down is progress. Flat stretches are a delver going in circles.',
      lines: [{ key: 'depth', label: 'depth', color: 'var(--accent)', values: s.depth }],
      domain: [0, maxDepth], fmt: int },
    { key: 'danger', title: 'Perceived danger', note: 'The `danger` score — what the model THINKS is happening. Read it against health.',
      lines: [{ key: 'danger', label: 'danger', color: 'var(--bad)', values: s.danger }],
      domain: [0, 3], fmt: one },
    { key: 'confidence', title: 'Move confidence', note: 'Dips mark junctions the model found genuinely hard. Below the dashed line the gate fires.',
      lines: [{ key: 'confidence', label: 'confidence', color: 'var(--accent)', values: s.confidence }],
      domain: [0, 1], threshold: Math.min(1, Math.max(0, parseFloat(el.gate.value) || 0.45)), fmt: two },
    { key: 'nouls', title: 'Fight · loot · withdraw', note: 'The three nouls, on their shared 0–1 scale. The dashed line is the 0.5 decision threshold.',
      lines: [
        { key: 'fight', label: 'fight', color: NOUL_COLORS.fight, values: s.fight },
        { key: 'take_loot', label: 'take_loot', color: NOUL_COLORS.take_loot, values: s.take_loot },
        { key: 'withdraw', label: 'withdraw', color: NOUL_COLORS.withdraw, values: s.withdraw },
      ],
      domain: [0, 1], threshold: 0.5, fmt: two },
  ];

  el.charts.innerHTML = panels.map((p) => {
    const legend = p.lines.length > 1
      ? `<div class="clegend">${p.lines.map((l) =>
        `<span class="k"><i class="sw" style="background:${l.color}"></i>${esc(l.label)}</span>`).join('')}</div>`
      : '';
    return `<div class="chart" data-chart="${p.key}">
      <h3>${esc(p.title)}</h3>
      <div class="cnote">${esc(p.note)}</div>
      ${chartSVG({ lines: p.lines, domain: p.domain, threshold: p.threshold, fmt: p.fmt })}
      ${legend}
    </div>`;
  }).join('');
}

// --------------------------------------------------------------- profile ---
function renderProfile() {
  const p = profile(app.tel);
  el.profCaveat.textContent = p.caveat;

  el.profile.innerHTML = p.traits.map((t) => {
    const pctv = t.value == null ? 0 : Math.round(t.value * 100);
    return `<div class="trait">
      <span class="tname">${esc(t.label)}</span>
      <span class="tband num">${t.value == null ? '—' : t.value.toFixed(2)} · ${esc(t.band)}</span>
      <span class="tbar"><i style="width:${pctv}%"></i></span>
      <span class="tbasis">${esc(t.basis)} · n=${t.n}</span>
    </div>`;
  }).join('');

  const findings = p.findings.map((f) => {
    const weak = Math.abs(f.r) < 0.3;
    return `<div class="finding${weak ? ' weak' : ''}"><b>${esc(f.label)}</b>${esc(f.text)}</div>`;
  }).join('');

  el.findings.innerHTML = findings
    + (p.n >= 8 ? `<div class="profsum">${esc(p.summary)}</div>` : '');
}

function renderAll() {
  renderTiles();
  if (app.view === 'plan' || !app.scene) renderMap();
  if (app.scene) app.scene.update(app.run);
  renderCharts();
  renderProfile();
  renderLog();
  renderSummary();
}

// -------------------------------------------------------------- tooltips ---
function wireTooltip() {
  const show = (ev) => {
    const t = ev.target.closest('[data-title]');
    if (!t) return hide();
    el.tip.innerHTML = `<div class="th">${esc(t.dataset.title)}</div><div class="tr">${esc(t.dataset.detail || '')}</div>`;
    el.tip.dataset.show = '1';
    el.tip.setAttribute('aria-hidden', 'false');
    const r = el.tip.getBoundingClientRect();
    const x = Math.min(window.innerWidth - r.width - 10, ev.clientX + 14);
    const y = Math.max(8, ev.clientY - r.height - 10);
    el.tip.style.left = `${x}px`;
    el.tip.style.top = `${y}px`;
  };
  const hide = () => {
    el.tip.dataset.show = '0';
    el.tip.setAttribute('aria-hidden', 'true');
  };
  document.addEventListener('mousemove', show);
  document.addEventListener('mouseleave', hide);
  window.addEventListener('scroll', hide, { passive: true });
}

// A crosshair + tooltip over every chart: an SVG chart is interactive by
// default, and reading a value off a sparkline otherwise means squinting.
// One handler is delegated over the whole grid rather than per-chart.
function wireChartHover() {
  el.charts.addEventListener('mousemove', (ev) => {
    const hit = ev.target.closest('.hit');
    if (!hit) return;
    const svg = hit.ownerSVGElement;
    const box = svg.getBoundingClientRect();
    const n = app.tel.samples.length;
    if (!n) return;

    // map the pointer into the plot's own viewBox coordinates
    const px = ((ev.clientX - box.left) / box.width) * CW;
    const frac = Math.max(0, Math.min(1, (px - PL) / (CW - PL - PR)));
    const i = Math.round(frac * (n - 1));

    el.charts.querySelectorAll('.crosshair').forEach((c) => c.remove());
    const cx = PL + (n <= 1 ? (CW - PL - PR) / 2 : (i / (n - 1)) * (CW - PL - PR));
    for (const sv of el.charts.querySelectorAll('svg')) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'crosshair');
      line.setAttribute('x1', cx); line.setAttribute('x2', cx);
      line.setAttribute('y1', PT); line.setAttribute('y2', CH - PB);
      sv.appendChild(line);
    }

    const smp = app.tel.samples[i];
    if (!smp) return;
    const num = (v) => (v == null || !Number.isFinite(v) ? '\u2014' : v.toFixed(2));
    const rows = [
      ['health', `${smp.health}/${smp.maxHealth}`],
      ['depth', String(smp.depth)],
      ['danger', num(smp.danger)],
      ['confidence', num(smp.confidence)],
      ['fight', num(smp.fight)],
      ['take_loot', num(smp.take_loot)],
      ['withdraw', num(smp.withdraw)],
    ];
    el.tip.innerHTML = `<div class="th">decision ${smp.tick} \u00b7 chamber ${smp.room}</div>`
      + rows.map(([k, v]) => `<div class="tr">${esc(k)}: ${esc(v)}</div>`).join('')
      + (smp.usedFallback ? '<div class="tr">\u2014 gate fired, fallback used</div>' : '');
    el.tip.dataset.show = '1';
    el.tip.setAttribute('aria-hidden', 'false');
    const r = el.tip.getBoundingClientRect();
    el.tip.style.left = `${Math.min(window.innerWidth - r.width - 10, ev.clientX + 14)}px`;
    el.tip.style.top = `${Math.max(8, ev.clientY - r.height - 10)}px`;
  });
  el.charts.addEventListener('mouseleave', () => {
    el.charts.querySelectorAll('.crosshair').forEach((c) => c.remove());
    el.tip.dataset.show = '0';
    el.tip.setAttribute('aria-hidden', 'true');
  });
}

// ------------------------------------------------------------------ boot ---
async function boot() {
  renderRamp();
  wireTooltip();

  try {
    const health = await fetch('api/health').then((r) => r.json());
    app.keyConfigured = Boolean(health.configured);
  } catch {
    // Opening index.html off a static server (no worker) lands here.
    app.keyConfigured = false;
  }
  announceMode();

  await reset();

  el.view3d.addEventListener('click', () => setView('3d'));
  el.viewPlan.addEventListener('click', () => setView('plan'));
  el.spin.addEventListener('change', () => app.scene && app.scene.setSpin(el.spin.checked));
  el.recentre.addEventListener('click', () => app.scene && app.scene.resetView());
  el.gate.addEventListener('change', () => renderCharts()); // the gate line moves
  wireChartHover();

  el.run.addEventListener('click', () => (app.running ? stop() : start()));
  el.step.addEventListener('click', () => { stop(); tick(); });
  el.reset.addEventListener('click', () => { reset(); });
  for (const input of [el.seed, el.size, el.roll]) {
    input.addEventListener('change', () => { el.run.disabled = false; reset(); });
  }
  el.tick.addEventListener('change', () => { if (app.running) { stop(); start(); } });
}

// The headless harness hook, matching the `__foam` / `__dungeon` pattern used
// elsewhere in this repo: tests drive the page through this instead of the DOM.
window.__jev = {
  app,
  tick,
  reset,
  start,
  stop,
  state: () => (app.run ? buildState(app.world, app.run) : null),
  questions: () => (app.run ? buildQuestions(app.world, app.run) : null),
  summary: () => (app.run ? runSummary(app.world, app.run) : null),
  telemetry: () => app.tel,
  series: () => series(app.tel),
  profile: () => profile(app.tel),
  setView,
};

boot();
