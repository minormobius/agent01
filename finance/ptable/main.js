// finance/ptable/main.js — renders the financial periodic table.
//
// Plain DOM, no framework. The whole app is: paint 118 cells from one of three
// sequential scales, and open a detail panel when one is chosen. State is three
// variables and a hash, which is all it needs to be.

import { ELEMENTS } from './elements.js';
import {
  MODES, gridPos, upstream, leverage, rampStep, rampCount,
  legendTicks, money, multiple, quantity, formatIn, CONF_LABEL, CATEGORIES,
} from './layout.js';

const BY_Z = new Map(ELEMENTS.map((e) => [e.z, e]));
const $ = (sel) => document.querySelector(sel);

const state = {
  mode: MODES.down,
  selected: null,
  gatesOnly: false,
};

// ------------------------------------------------------------------- tiles --
function renderTiles() {
  const totalUp = ELEMENTS.reduce((s, e) => s + upstream(e), 0);
  const totalDown = ELEMENTS.reduce((s, e) => s + (e.down || 0), 0);
  const priced = ELEMENTS.filter((e) => upstream(e) > 0);
  const gates = ELEMENTS.filter((e) => e.gate).length;
  const top = [...priced].sort((a, b) => leverage(b) - leverage(a))[0];

  const tiles = [
    ['World extraction', money(totalUp), `${priced.length} elements with a priced market`],
    ['First-order downstream', money(totalDown), 'one hop out, counted once'],
    ['Aggregate leverage', multiple(totalDown / totalUp), 'downstream ÷ upstream, all elements'],
    ['Sharpest chokepoint', `${top.sym} · ${multiple(leverage(top))}`, `${gates} elements flagged as gates`],
  ];
  $('#tiles').innerHTML = tiles
    .map(([k, v, d]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${esc(d)}</div></div>`)
    .join('');
}

// ------------------------------------------------------------------- board --
function renderBoard() {
  const grid = $('#grid');
  grid.innerHTML = '';
  // Two spacer rows carry the f-block gap without breaking the 18-column flow.
  const gap = document.createElement('div');
  gap.className = 'fgap';
  gap.style.gridRow = '8';
  grid.appendChild(gap);

  for (const e of ELEMENTS) {
    const { col, row } = gridPos(e.z);
    const v = state.mode.value(e);
    const step = rampStep(v, state.mode.domain);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell' + (step === null ? ' empty' : '') + (state.gatesOnly && !e.gate ? ' dim' : '');
    btn.style.gridColumn = String(col);
    btn.style.gridRow = String(row);
    // Ramp hexes come from CSS so dark mode can flip the anchor without JS.
    if (step !== null) {
      btn.style.background = `var(--ramp-${step})`;
      btn.style.color = `var(--ramp-ink-${step})`;
    }
    btn.setAttribute('aria-pressed', String(state.selected === e.z));
    btn.setAttribute('aria-label',
      `${e.name}, atomic number ${e.z}. ${state.mode.label}: ${formatIn(state.mode, e)}${e.gate ? '. Chokepoint' : ''}`);
    btn.innerHTML =
      `<span class="z">${e.z}</span>` +
      (e.gate ? '<span class="flag" aria-hidden="true">◆</span>' : '') +
      `<span class="sym">${e.sym}</span>` +
      `<span class="val">${step === null ? '·' : formatIn(state.mode, e)}</span>`;
    btn.addEventListener('click', () => select(e.z));
    btn.addEventListener('pointerenter', (ev) => showTip(ev, e));
    btn.addEventListener('pointermove', (ev) => moveTip(ev));
    btn.addEventListener('pointerleave', hideTip);
    btn.addEventListener('focus', (ev) => showTip(ev, e));
    btn.addEventListener('blur', hideTip);
    grid.appendChild(btn);
  }
}

function renderLegend() {
  const ticks = legendTicks(state.mode);
  const fmt = state.mode.key === 'lev' ? multiple : money;
  $('#ramp').innerHTML = Array.from({ length: rampCount() }, (_, i) =>
    `<div class="sw"><i style="background:var(--ramp-${i})"></i><span>${fmt(ticks[i])}</span></div>`).join('');
  $('#legend-note').textContent =
    `logarithmic — each block is about one order of magnitude of ${state.mode.unit}`;
}

// ------------------------------------------------------------------ tooltip --
const tip = () => $('#tip');
function showTip(ev, e) {
  const t = tip();
  t.innerHTML =
    `<b>${e.name}</b> <span style="color:var(--ink-3)">${e.sym} · ${e.z}</span>` +
    `<dl><dt>form</dt><dd>${esc(e.form || '—')}</dd>` +
    `<dt>upstream</dt><dd>${money(upstream(e))}</dd>` +
    `<dt>downstream</dt><dd>${money(e.down || 0)}</dd>` +
    `<dt>leverage</dt><dd>${multiple(leverage(e))}</dd></dl>`;
  t.dataset.show = '1';
  moveTip(ev);
}
function moveTip(ev) {
  const t = tip();
  const x = ev.clientX ?? window.innerWidth / 2;
  const y = ev.clientY ?? 0;
  const r = t.getBoundingClientRect();
  t.style.left = `${Math.min(Math.max(8, x + 14), window.innerWidth - r.width - 8)}px`;
  t.style.top = `${Math.min(Math.max(8, y + 14), window.innerHeight - r.height - 8)}px`;
}
function hideTip() { tip().dataset.show = '0'; }

// -------------------------------------------------------------------- panel --
function renderPanel() {
  const e = BY_Z.get(state.selected) || BY_Z.get(16); // sulfur is the worked example
  const up = upstream(e);
  const lev = leverage(e);
  const panel = $('#panel');
  panel.innerHTML = `
    <div class="head">
      <h2>${e.name} <span style="color:var(--ink-3);font-size:1.1rem">${e.sym}</span></h2>
      <span class="meta">Z ${e.z} · ${CATEGORIES[e.cat] || e.cat}</span>
      ${e.gate ? '<span class="badge">chokepoint</span>' : ''}
      <span class="meta" style="margin-left:auto">confidence: ${e.conf} — ${CONF_LABEL[e.conf]}</span>
    </div>

    <div class="chain">
      <div class="step"><div class="k">Extracted as</div><div class="d">${esc(quantity(e))}</div>
        <div class="v">${money(up)}</div><div class="k">upstream / year</div></div>
      <div class="step"><div class="k">Traded as</div><div class="d">${esc(e.form || '—')}</div>
        <div class="v">${e.mid ? money(e.mid.v) : '—'}</div>
        <div class="k">${e.mid ? esc(e.mid.n) : 'no distinct traded form'}</div></div>
      <div class="step"><div class="k">Stands under</div><div class="d">first-order markets</div>
        <div class="v">${money(e.down || 0)}</div><div class="k">downstream / year</div></div>
      <div class="step"><div class="k">Leverage</div><div class="d">downstream ÷ upstream</div>
        <div class="v">${multiple(lev)}</div>
        <div class="k">${lev >= 1 ? 'dollars enabled per dollar extracted' : 'held, not consumed'}</div></div>
    </div>

    <dl class="facts">
      <dt>Source</dt><dd>${esc(e.src)}</dd>
      <dt>Extraction</dt><dd>${esc(e.method)}</dd>
      <dt>Downstream</dt><dd><div class="tags">${(e.sectors || []).map((s) => `<span class="tag">${esc(s)}</span>`).join('')}</div></dd>
    </dl>

    <p class="note">${esc(e.note)}</p>
    <p class="sources">Sources: ${(e.refs || []).map(esc).join(' · ') || '—'}</p>`;
}

function select(z) {
  state.selected = z;
  if (location.hash !== `#${BY_Z.get(z).sym}`) history.replaceState(null, '', `#${BY_Z.get(z).sym}`);
  renderBoard();
  renderPanel();
  $('#panel').scrollIntoView({ block: 'nearest', behavior: prefersMotion() ? 'smooth' : 'auto' });
}

// --------------------------------------------------------------- table view --
function renderTable() {
  const rows = [...ELEMENTS]
    .filter((e) => upstream(e) > 0)
    .sort((a, b) => leverage(b) - leverage(a))
    .map((e) => `<tr><td>${e.z}</td><td>${e.sym}</td><td>${e.name}</td>
      <td>${esc(e.form)}</td>
      <td class="num">${money(upstream(e))}</td>
      <td class="num">${money(e.down || 0)}</td>
      <td class="num">${multiple(leverage(e))}</td>
      <td>${e.conf}</td></tr>`)
    .join('');
  $('#datatable tbody').innerHTML = rows;
}

// --------------------------------------------------------------------- init --
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
const prefersMotion = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setMode(key) {
  state.mode = MODES[key];
  for (const b of document.querySelectorAll('#modes button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === key));
  }
  $('#mode-blurb').textContent = state.mode.blurb;
  renderBoard();
  renderLegend();
}

function init() {
  $('#modes').innerHTML = Object.values(MODES)
    .map((m) => `<button type="button" data-mode="${m.key}" aria-pressed="false">${m.label}</button>`)
    .join('');
  for (const b of document.querySelectorAll('#modes button')) {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  }
  const gateBtn = $('#gates');
  gateBtn.addEventListener('click', () => {
    state.gatesOnly = !state.gatesOnly;
    gateBtn.setAttribute('aria-pressed', String(state.gatesOnly));
    renderBoard();
  });

  const fromHash = ELEMENTS.find((e) => e.sym === decodeURIComponent(location.hash.slice(1)));
  state.selected = fromHash ? fromHash.z : 16;

  renderTiles();
  setMode('down');
  renderPanel();
  renderTable();
}

init();
