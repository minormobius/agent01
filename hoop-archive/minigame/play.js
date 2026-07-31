// hoop/minigame/play.js — forge puzzles as IN-WORLD minigames.
//
// A forge "law" is a minted movement-grammar; atlas.puzzleFor() lays out a small grid the law can solve
// and the BFS oracle certifies the optimal par. Here we load the offline-minted codex (codex.json),
// pick a law DETERMINISTICALLY from a chamber seed (so the same place is the same puzzle for everyone),
// render it in a modal over the hoop canvas, take arrow/WASD input, and on a win fire onSolve — which the
// world uses as a lock-pick (#5) or a quest beat. Pure-static, no backend; the engine is vendored forge.
import { puzzleFor } from './forge/atlas.js';
import { describe } from './forge/dsl.js';
import { initialState, isWin } from './forge/engine.js';

let CODEX = null, _loading = null;
function loadCodex() {
  if (CODEX) return Promise.resolve(CODEX);
  if (!_loading) _loading = fetch(new URL('./forge/codex.json', import.meta.url)).then((r) => r.json()).then((j) => (CODEX = j.laws || []));
  return _loading;
}
const hash = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// Build a certified puzzle for a chamber seed: pick a law, then find a layout that yields a real puzzle.
export async function puzzleForSeed(seed) {
  const codex = await loadCodex(); if (!codex.length) return null;
  const law = codex[hash(seed) % codex.length];
  for (let t = 0; t < 12; t++) {                            // puzzleFor can miss; vary the layout seed
    const pz = puzzleFor({ law: law.law, name: law.name }, seed + '#' + t);
    if (pz && pz.solve && pz.solve.solvable && pz.solve.par >= 2) return { ...pz, lawName: law.name, lawText: law.text || describe(law.law) };
  }
  return null;
}

// ── the modal (created once, reused) ──
let el = null;
function ensureModal() {
  if (el) return el;
  el = document.createElement('div'); el.id = 'mini';
  el.innerHTML = `<div class="mini-card">
    <div class="mini-head"><b id="mini-law"></b><span id="mini-close" class="mini-x">✕</span></div>
    <div id="mini-text" class="mini-text"></div>
    <canvas id="mini-board"></canvas>
    <div id="mini-status" class="mini-status"></div>
    <div class="mini-foot">arrow keys / WASD · the law decides how you move · <span id="mini-reset" class="mini-act">reset</span></div>
  </div>`;
  const css = document.createElement('style');
  css.textContent = `
    #mini { position: fixed; inset: 0; z-index: 50; display: none; align-items: center; justify-content: center; background: rgba(3,4,7,.82); backdrop-filter: blur(3px); }
    #mini.on { display: flex; }
    .mini-card { background: #0a0e14; border: 1px solid #1c2530; border-radius: 12px; padding: 14px 16px; max-width: 92vw; box-shadow: 0 10px 40px #000; }
    .mini-head { display: flex; justify-content: space-between; align-items: baseline; gap: 14px; }
    .mini-head b { color: #f4bf62; font: 14px ui-monospace, monospace; }
    .mini-x, .mini-act { color: #7fd8d0; cursor: pointer; font: 12px ui-monospace, monospace; } .mini-x:hover, .mini-act:hover { color: #f4bf62; }
    .mini-text { color: #8a978f; font: 11px/1.5 ui-monospace, monospace; margin: 4px 0 9px; max-width: 60ch; }
    #mini-board { display: block; image-rendering: pixelated; border-radius: 6px; background: #05060a; }
    .mini-status { color: #dfe7e2; font: 12px ui-monospace, monospace; margin-top: 9px; min-height: 1.4em; }
    .mini-foot { color: #667; font: 11px ui-monospace, monospace; margin-top: 6px; }`;
  document.head.appendChild(css); document.body.appendChild(el);
  return el;
}

// open the minigame for a seed; resolves true if solved, false if closed without solving.
export async function openMinigame(seed, { title } = {}) {
  ensureModal();
  const $ = (id) => document.getElementById(id);
  const pz = await puzzleForSeed(seed);
  if (!pz) return false;
  const world = pz.world, step = pz.stepFn;
  let state = initialState(world), solved = false;
  $('mini-law').textContent = (title ? title + ' — ' : '') + pz.lawName;
  $('mini-text').textContent = pz.lawText + '  ·  goal: ' + goalText(world.goal) + '  ·  par ' + pz.solve.par;
  const cell = Math.max(18, Math.min(46, Math.floor(560 / Math.max(world.W, world.H))));
  const cv = $('mini-board'); cv.width = world.W * cell; cv.height = world.H * cell;
  const ctx = cv.getContext('2d');
  const status = () => { $('mini-status').textContent = solved ? `✦ solved in ${state.steps} — ${state.steps <= pz.solve.par ? 'par!' : 'par ' + pz.solve.par}` : `${state.steps} moves · par ${pz.solve.par}`; };
  draw(ctx, world, state, cell); status();

  el.classList.add('on');
  return await new Promise((resolve) => {
    const close = (won) => { el.classList.remove('on'); removeEventListener('keydown', onKey, true); $('mini-close').onclick = null; $('mini-reset').onclick = null; resolve(won); };
    const move = (d) => {
      if (solved) return;
      const ns = step(world, state, d); if (!ns) return;     // the law forbade it
      state = ns; draw(ctx, world, state, cell); status();
      if (isWin(world, state)) { solved = true; status(); setTimeout(() => close(true), 650); }
    };
    const onKey = (e) => {
      const d = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 }[e.key];
      if (d != null) { e.preventDefault(); e.stopPropagation(); move(d); }
      else if (e.key === 'Escape') { e.preventDefault(); close(false); }
    };
    addEventListener('keydown', onKey, true);
    $('mini-close').onclick = () => close(false);
    $('mini-reset').onclick = () => { state = initialState(world); solved = false; draw(ctx, world, state, cell); status(); };
  });
}
function goalText(g) { return g.type === 'exit' ? 'reach the gate' : g.type === 'collect' ? 'collect every spark' + (g.thenExit ? ', then the gate' : '') : g.type === 'inkAll' ? 'ink every cell' : g.type; }

function draw(ctx, world, s, cell) {
  const { W, H, walls, exit, goal } = world;
  ctx.clearRect(0, 0, W * cell, H * cell);
  for (let c = 0; c < W * H; c++) {
    const x = (c % W) * cell, y = ((c / W) | 0) * cell;
    ctx.fillStyle = walls[c] ? '#0a0e12' : '#11161d';
    ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    if (s.marks.has(c) && !walls[c]) { ctx.fillStyle = 'rgba(127,216,208,.30)'; ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2); }   // trail
  }
  if (exit >= 0 && goal.type !== 'inkAll') { const x = (exit % W) * cell, y = ((exit / W) | 0) * cell; ctx.fillStyle = 'rgba(244,191,98,.85)'; ctx.fillRect(x + cell * 0.22, y + cell * 0.22, cell * 0.56, cell * 0.56); }
  ctx.fillStyle = '#cf6b3b'; for (const c of s.tokens) { const x = (c % W) * cell, y = ((c / W) | 0) * cell; ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell * 0.18, 0, 7); ctx.fill(); }   // sparks
  const ax = (s.agent % W) * cell, ay = ((s.agent / W) | 0) * cell;   // the @
  ctx.fillStyle = '#ffce78'; ctx.font = `bold ${Math.floor(cell * 0.7)}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('@', ax + cell / 2, ay + cell / 2 + 1);
}
