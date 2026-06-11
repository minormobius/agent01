// The player: owns the user's working grid, handles input, checks progress, and
// fires onSolved when the board matches the certified solution. Givens are
// locked. The solver already proved a unique solution exists, so "correct" is
// unambiguous: the player's filled grid must equal inst.solution.

import { UNKNOWN, TRUE, FALSE } from './solver.js';
import { buildBoard, paintCell } from './render.js';

// Click cycles a cell through states. Binairo and nonogram cycle differently
// (nonogram's third state is an explicit "blank" mark the solver treats as
// FALSE; binairo's two colors are both meaningful fills).
const CYCLE = {
  binairo: [UNKNOWN, TRUE, FALSE],
  nonogram: [UNKNOWN, TRUE, FALSE],
};

export class Player {
  constructor(inst, host, opts = {}) {
    this.inst = inst;
    this.host = host;
    this.onSolved = opts.onSolved || (() => {});
    this.onChange = opts.onChange || (() => {});
    this.state = inst.givens.slice();
    this.solved = false;
    this.render();
  }

  render() {
    this.host.innerHTML = '';
    const { table, cells } = buildBoard(this.inst, this.state);
    this.cells = cells;
    this.table = table;
    table.addEventListener('click', (e) => this.onClick(e));
    table.addEventListener('contextmenu', (e) => { e.preventDefault(); this.onClick(e, true); });
    this.host.appendChild(table);
  }

  isGiven(i) { return this.inst.givens[i] !== UNKNOWN; }

  onClick(e, reverse = false) {
    if (this.solved) return;
    const el = e.target.closest('.cell');
    if (!el) return;
    const i = +el.dataset.i;
    if (this.isGiven(i)) return;
    const cyc = CYCLE[this.inst.genus] || [UNKNOWN, TRUE, FALSE];
    let idx = cyc.indexOf(this.state[i]);
    idx = (idx + (reverse ? cyc.length - 1 : 1)) % cyc.length;
    this.state[i] = cyc[idx];
    paintCell(el, this.inst, i, this.state[i], false);
    this.clearConflicts();
    this.onChange(this.progress());
    if (this.checkSolved()) this.win();
  }

  progress() {
    let placed = 0, target = 0;
    for (let i = 0; i < this.inst.V; i++) {
      if (this.inst.solution[i] === TRUE) target++;
      if (this.state[i] === TRUE && !this.isGiven(i)) placed++;
    }
    return { placed, target };
  }

  // Solved iff every cell that should be one color is that color. For binairo we
  // require an exact match of both colors; for nonogram only the filled cells
  // matter (an unmarked cell that should be blank is fine).
  checkSolved() {
    const { inst } = this;
    for (let i = 0; i < inst.V; i++) {
      const sol = inst.solution[i];
      if (inst.genus === 'nonogram') {
        const filled = this.state[i] === TRUE;
        if ((sol === TRUE) !== filled) return false;
      } else {
        if (this.state[i] !== sol) return false;
      }
    }
    return true;
  }

  win() {
    this.solved = true;
    this.table.classList.add('solved');
    this.onSolved();
  }

  clearConflicts() {
    for (const el of this.cells.values()) el.classList.remove('conflict');
  }

  // Highlight cells that contradict the solution (a hint / "check" action).
  showMistakes() {
    let n = 0;
    for (let i = 0; i < this.inst.V; i++) {
      if (this.isGiven(i)) continue;
      const el = this.cells.get(i);
      el.classList.remove('conflict');
      const v = this.state[i];
      if (v === UNKNOWN) continue;
      const sol = this.inst.solution[i];
      const wrong = this.inst.genus === 'nonogram'
        ? (v === TRUE) !== (sol === TRUE)
        : v !== sol;
      if (wrong) { el.classList.add('conflict'); n++; }
    }
    return n;
  }

  reset() {
    this.state = this.inst.givens.slice();
    this.solved = false;
    this.render();
    this.onChange(this.progress());
  }

  reveal() {
    this.state = this.inst.solution.slice();
    for (const [i, el] of this.cells) paintCell(el, this.inst, i, this.state[i], this.isGiven(i));
    this.solved = true;
    this.table.classList.add('solved');
  }
}
