// The player — generic over the substrate's direction count. Arrow keys / WASD
// drive the 4-direction substrates; the on-screen pad (built from the
// substrate's own direction names) drives all of them, including hex's six.
import { initialState, tryMove, isWin } from './engine.js';

// arrow/WASD → square-family dir index (N E S W)
const KEY4 = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3, W: 0, D: 1, S: 2, A: 3 };

export class Player {
  constructor(inst, renderer, opts = {}) {
    this.inst = inst; this.r = renderer;
    this.onChange = opts.onChange || (() => {});
    this.onSolved = opts.onSolved || (() => {});
    this.solutionPath = opts.solutionPath || [];
    this.par = opts.par ?? 0;
    this.state = initialState(inst);
    this.history = []; this.moves = 0; this.solved = false; this.playing = false;
    this.r.draw(this.state);
    this._key = (e) => {
      if (this.playing || this.inst.sub.dirs !== 4) return;
      const d = KEY4[e.key]; if (d === undefined) return; e.preventDefault(); this.move(d);
    };
    window.addEventListener('keydown', this._key);
  }
  destroy() { window.removeEventListener('keydown', this._key); }

  move(d) {
    if (this.solved || this.playing) return false;
    const ns = tryMove(this.inst, this.state, d);
    if (!ns) return false;
    this.history.push(this.state); this.state = ns; this.moves++;
    this.r.draw(this.state);
    this.onChange(this.status());
    if (isWin(this.inst, this.state)) { this.solved = true; this.onSolved(this.status()); }
    return true;
  }
  undo() { if (this.playing || !this.history.length) return; this.state = this.history.pop(); this.moves++; this.solved = false; this.r.draw(this.state); this.onChange(this.status()); }
  reset() { if (this.playing) return; this.state = initialState(this.inst); this.history = []; this.moves = 0; this.solved = false; this.r.draw(this.state); this.onChange(this.status()); }

  async watchSolver() {
    if (this.playing) return;
    this.reset(); this.playing = true;
    for (const d of this.solutionPath) {
      const ns = tryMove(this.inst, this.state, d); if (!ns) break;
      this.state = ns; this.moves++; this.r.draw(this.state); this.onChange(this.status());
      await new Promise((res) => setTimeout(res, 230));
    }
    this.playing = false;
    if (isWin(this.inst, this.state)) { this.solved = true; this.onSolved(this.status()); }
  }

  status() { return { moves: this.moves, par: this.par, solved: this.solved, beat: this.solved && this.moves <= this.par }; }
}
