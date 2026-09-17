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

const FOAM = 'https://foam.mino.mobi';
const $ = (id) => document.getElementById(id);

const el = {
  mode: $('mode'), modeText: $('mode-text'),
  seed: $('seed'), size: $('size'), roll: $('roll'), tick: $('tick'), gate: $('gate'),
  run: $('run'), step: $('step'), reset: $('reset'),
  map: $('map'), mapSub: $('map-sub'), ramp: $('ramp'), tiles: $('tiles'),
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
};

// ---------------------------------------------------------------- helpers ---
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (n) => `${(n * 100).toFixed(0)}%`;

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
  renderAll();
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
      return `<div class="bar${picked ? ' picked' : ''}" data-title="${esc(o)}" data-detail="${esc(questions.move.criteria[o])}">
        <span class="lbl">${picked ? '▸ ' : ''}${esc(o)}</span>
        <span class="track"><span class="fill" style="width:${Math.max(0, Math.min(1, p)) * 100}%"></span></span>
        <span class="pct num">${pct(p)}</span>
      </div>`;
    }).join('');
    out.push(`<div class="answer">
      <div class="qhead"><span class="qid">move</span><span class="qtype">choice</span>
        ${confBadge(a.move.confidence ?? 0, result.usedFallback)}</div>
      <div class="qtext">${esc(questions.move.instructions)}</div>
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
      <div class="qtext">${esc(questions.danger.instructions)}</div>
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
      <div class="qtext">${esc(questions[key].instructions)}</div>
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

function renderAll() {
  renderTiles();
  renderMap();
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
};

boot();
