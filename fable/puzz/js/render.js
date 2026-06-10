// Board rendering for every genus. Two entry points:
//   buildBoard(inst, state, opts) — the interactive table the player drives
//   thumb(inst, px)               — a small static silhouette for gallery cards
//
// Genera differ only in how a cell paints and how the gutters are drawn, so the
// dispatch here is tiny: add a case when you add a genus.

import { UNKNOWN, TRUE, FALSE } from './solver.js';

function cellSize(inst) {
  const n = Math.max(inst.size.rows, inst.size.cols);
  if (n <= 6) return 40;
  if (n <= 8) return 36;
  if (n <= 10) return 32;
  if (n <= 12) return 28;
  return 24;
}

// Paint one cell element to reflect a state value, for the given genus.
export function paintCell(el, inst, i, val, isGiven) {
  el.className = 'cell' + (isGiven ? ' locked given' : '');
  if (inst.genus === 'binairo') {
    if (val === TRUE) el.classList.add('bin-a');
    else if (val === FALSE) el.classList.add('bin-b');
  } else if (inst.genus === 'nonogram') {
    if (val === TRUE) el.classList.add('non-fill');
    else if (val === FALSE) el.classList.add('non-x');
  }
}

function fmtClue(clue) { return clue.length ? clue.join(' ') : '0'; }
function fmtClueV(clue) { return clue.length ? clue.map((x) => `<span>${x}</span>`).join('<br>') : '<span>0</span>'; }

export function buildBoard(inst, state, opts = {}) {
  const cs = cellSize(inst);
  const table = document.createElement('table');
  table.className = 'board';
  table.style.setProperty('--cs', cs + 'px');
  const cells = new Map();
  const { rows, cols } = inst.size;

  if (inst.genus === 'nonogram') {
    // header row: top-left corner + one cell per column holding its clue stack
    const thead = document.createElement('tr');
    const corner = document.createElement('td');
    corner.className = 'non-corner';
    thead.appendChild(corner);
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td');
      td.className = 'non-clue col' + ((c + 1) % 5 === 0 ? ' bx' : '');
      td.innerHTML = fmtClueV(inst.meta.colClues[c]);
      thead.appendChild(td);
    }
    table.appendChild(thead);
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      const rc = document.createElement('td');
      rc.className = 'non-clue row' + ((r + 1) % 5 === 0 ? ' by' : '');
      rc.textContent = fmtClue(inst.meta.rowClues[r]);
      tr.appendChild(rc);
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const td = document.createElement('td');
        if ((c + 1) % 5 === 0) td.classList.add('bx');
        if ((r + 1) % 5 === 0) td.classList.add('by');
        const el = document.createElement('div');
        paintCell(el, inst, i, state[i], false);
        el.dataset.i = i;
        td.appendChild(el);
        tr.appendChild(td);
        cells.set(i, el);
      }
      table.appendChild(tr);
    }
  } else {
    // plain grid (binairo and other shade genera)
    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const td = document.createElement('td');
        const el = document.createElement('div');
        const isGiven = inst.givens[i] !== UNKNOWN;
        paintCell(el, inst, i, state[i], isGiven);
        el.dataset.i = i;
        td.appendChild(el);
        tr.appendChild(td);
        cells.set(i, el);
      }
      table.appendChild(tr);
    }
  }
  return { table, cells };
}

// Small static silhouette of the SOLVED grid for gallery cards.
export function thumb(inst, px = 110) {
  const { rows, cols } = inst.size;
  const cs = Math.max(4, Math.floor(px / Math.max(rows, cols)));
  const wrap = document.createElement('div');
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = `repeat(${cols}, ${cs}px)`;
  grid.style.gap = '1px';
  grid.style.background = 'var(--rule-soft)';
  grid.style.padding = '1px';
  grid.style.borderRadius = '4px';
  for (let i = 0; i < rows * cols; i++) {
    const d = document.createElement('div');
    d.style.width = cs + 'px';
    d.style.height = cs + 'px';
    const v = inst.solution[i];
    if (inst.genus === 'binairo') d.style.background = v === TRUE ? 'var(--tile-a)' : 'var(--tile-b)';
    else d.style.background = v === TRUE ? 'var(--fill)' : 'var(--panel)';
    grid.appendChild(d);
  }
  wrap.appendChild(grid);
  return wrap;
}
