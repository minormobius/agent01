// Glue: the live foundry stream, the codex of discovered laws, and a play view
// that runs morph's inner loop on a law no one wrote.
import { makeFoundry } from './foundry.js';
import { puzzleFor } from './atlas.js';
import { FP_KEYS } from './fingerprint.js';
import { Renderer } from './render.js';
import { initialState, isWin, DIRS } from './engine.js';

const $ = (id) => document.getElementById(id);
let foundry = makeFoundry();
let running = false;
let curLaw = null, curP = 1, world = null, state = null, sr = null, renderer = null, history = [], solved = false, playing = false;

/* ---------- tabs ---------- */
function showTab(name) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tabpanel').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + name));
  if (name === 'codex') renderCodex();
  if (name === 'play') { fillLawSelect(); if (!curLaw && foundry.codex.length) loadLaw(foundry.codex[0], 1); }
}

/* ---------- the foundry stream ---------- */
function statLine() {
  const s = foundry.stats;
  $('fstat').innerHTML = `scanned <b>${s.scanned}</b> · <span style="opacity:.5">inert ${s.inert}</span> · <span style="color:var(--warn)">derivative ${s.derivative}</span> · unplayable ${s.unplayable} · <b style="color:var(--good)">admitted ${foundry.codex.length}</b>`;
}
function pushLine(html, cls) {
  const stream = $('stream');
  const div = document.createElement('div'); div.className = 'fline ' + (cls || ''); div.innerHTML = html;
  stream.appendChild(div);
  if (stream.children.length > 220) stream.removeChild(stream.firstChild);
  stream.scrollTop = stream.scrollHeight;
}
async function smelt() {
  if (running) return;
  running = true;
  $('smelt').disabled = true;
  const target = parseInt($('target').value, 10);
  let idle = 0;
  while (running && foundry.codex.length < target && idle < 4000) {
    const r = foundry.next();
    idle++;
    if (r.dup) continue;
    if (r.admitted) {
      idle = 0;
      const e = r.entry;
      pushLine(`№${e.id} ⚒ <b>${e.name}</b> — admitted · novelty ${e.noveltyDist.toFixed(2)} · par ${e.samplePar}`, 'admit');
    } else if (r.reason === 'derivative') {
      pushLine(`#${r.i} · derivative (${r.dist.toFixed(2)} from ${r.nearest})`, 'derivative');
    } else if (r.reason === 'inert') {
      pushLine(`#${r.i} · inert (${r.fp._states} states)`, 'inert');
    } else {
      pushLine(`#${r.i} · novel but unplayable`, 'derivative');
    }
    statLine();
    if (idle % 3 === 0) await new Promise((res) => setTimeout(res, 0));   // yield to paint
  }
  running = false;
  $('smelt').disabled = false;
  pushLine(`— ${foundry.codex.length} laws in the codex —`, 'admit');
}

/* ---------- the codex ---------- */
function fpBars(fp) {
  return `<div class="fp-bars">${FP_KEYS.map((k) => `<div class="fpb" title="${k} ${(fp[k] ?? 0).toFixed(2)}"><i style="height:${Math.round((fp[k] ?? 0) * 100)}%"></i></div>`).join('')}</div>`;
}
function renderCodex() {
  const host = $('codex');
  if (!foundry.codex.length) { host.innerHTML = '<div class="loading">smelt some laws first (the foundry tab)</div>'; return; }
  host.innerHTML = '';
  for (const e of foundry.codex) {
    const el = document.createElement('div'); el.className = 'lawcard';
    el.innerHTML = `<span class="lid">№${e.id}</span><div class="ln">${e.name}</div>
      <div class="lt">${e.text}</div>
      <div class="lmeta">novelty ${e.noveltyDist.toFixed(2)} from ${e.nearestKnown} · goal: ${e.goal} · par ${e.samplePar}</div>
      ${fpBars(e.fp)}`;
    el.addEventListener('click', () => { loadLaw(e, 1); showTab('play'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    host.appendChild(el);
  }
}

/* ---------- play a law ---------- */
function fillLawSelect() {
  const sel = $('law-sel'); const cur = sel.value;
  sel.innerHTML = foundry.codex.map((e) => `<option value="${e.id}">№${e.id} · ${e.name}</option>`).join('') || '<option>— smelt laws first —</option>';
  if (cur) sel.value = cur;
}
function loadLaw(entry, p) {
  curLaw = entry; curP = p;
  fillLawSelect(); $('law-sel').value = entry.id;
  const pz = puzzleFor(entry, p);
  if (!pz) { $('board-title').textContent = 'no puzzle for this law/page'; return; }
  world = pz.world; sr = pz.solve; state = initialState(world); history = []; solved = false; playing = false;
  this_stepFn = pz.stepFn;
  $('board-title').textContent = entry.name;
  $('goal-pill').textContent = world.goal.type; $('goal-pill').style.background = 'var(--accent)';
  $('law-banner').innerHTML = `<b>The law:</b> ${entry.text}`;
  $('pnum').textContent = `puzzle ${p}`;
  $('win-banner').classList.remove('show');
  renderer = new Renderer($('board'), world);
  renderer.draw(state);
  $('moves').textContent = `0 moves · par ${sr.par}`;
  $('howto').innerHTML = `<span style="color:var(--faint);font-size:12px;">Goal: ${goalText(world.goal)}. Arrow keys / WASD or the pad. The law decides how you move — read it above.</span>`;
  $('law-detail').innerHTML =
    `<div style="font-size:13px;color:var(--fg);margin-bottom:8px;">${entry.text}</div>` +
    `<div style="font-family:var(--mono);font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:3px;">behavioral fingerprint</div>` + fpBars(entry.fp) +
    `<div style="font-family:var(--mono);font-size:10px;color:var(--faint);margin-top:5px;">${FP_KEYS.join(' · ')}</div>`;
  $('verdict').innerHTML =
    `<div class="verdict-row"><span class="ico ok">✓</span><span>Solvable on a law no one wrote</span></div>` +
    `<div class="verdict-row"><span class="ico ok">✓</span><span>Optimal answer: par ${sr.par}</span></div>` +
    `<div class="verdict-row"><span class="ico">⛁</span><span>${sr.nodes.toLocaleString()} states searched</span></div>`;
  $('diff-num').textContent = pz.report.difficulty; $('diff-tier').textContent = pz.report.diffTier; $('int-num').textContent = pz.report.interest;
}
let this_stepFn = null;
function goalText(g) { return { exit: 'reach the ringed exit', collect: 'gather every token' + (g.thenExit ? ', then reach the exit' : ''), inkAll: 'ink every cell' }[g.type]; }

function move(d) {
  if (solved || playing || !world) return;
  const ns = this_stepFn(world, state, d);
  if (!ns) return;
  history.push(state); state = ns; renderer.draw(state);
  $('moves').textContent = `${state.steps} moves · par ${sr.par}`;
  if (isWin(world, state)) { solved = true; $('win-banner').textContent = state.steps <= sr.par ? `Solved in ${state.steps} — par! ✦` : `Solved in ${state.steps} (par ${sr.par}).`; $('win-banner').classList.add('show'); }
}
async function watchOracle() {
  if (playing || !world) return;
  state = initialState(world); history = []; solved = false; playing = true; renderer.draw(state);
  for (const d of sr.path) { const ns = this_stepFn(world, state, d); if (!ns) break; state = ns; renderer.draw(state); $('moves').textContent = `${state.steps} moves · par ${sr.par}`; await new Promise((r) => setTimeout(r, 230)); }
  playing = false; solved = true;
  $('win-banner').textContent = `The oracle's route, par ${sr.par}. ✦`; $('win-banner').classList.add('show');
}

function init() {
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('smelt').addEventListener('click', smelt);
  $('stop').addEventListener('click', () => { running = false; });
  $('codex-refill').addEventListener('click', () => { showTab('foundry'); smelt(); });
  $('law-sel').addEventListener('change', () => { const e = foundry.codex.find((x) => x.id === +$('law-sel').value); if (e) loadLaw(e, 1); });
  $('prev').addEventListener('click', () => { if (curLaw) loadLaw(curLaw, Math.max(1, curP - 1)); });
  $('next').addEventListener('click', () => { if (curLaw) loadLaw(curLaw, curP + 1); });
  $('undo').addEventListener('click', () => { if (playing || !history.length) return; state = history.pop(); solved = false; renderer.draw(state); $('moves').textContent = `${state.steps} moves · par ${sr.par}`; });
  $('reset').addEventListener('click', () => { if (playing || !world) return; state = initialState(world); history = []; solved = false; renderer.draw(state); $('moves').textContent = `0 moves · par ${sr.par}`; $('win-banner').classList.remove('show'); });
  $('solve').addEventListener('click', watchOracle);
  document.querySelectorAll('.dpad button').forEach((b) => b.addEventListener('click', () => move(+b.dataset.d)));
  window.addEventListener('keydown', (e) => { const m = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 }; const dir = m[e.key]; if (dir !== undefined) { e.preventDefault(); move(dir); } });
  $('ver').textContent = 'v1 · the foundry';
  // pre-smelt a few so the site isn't empty on arrival
  for (let i = 0; i < 6 && foundry.codex.length < 4; i++) { /* warm a couple synchronously is too slow; leave to user */ }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
