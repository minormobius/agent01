// The player: input, move history/undo, win detection, and solution playback
// ("watch the engine solve it"). The solver already proved a solution exists and
// found an optimal one, so "you beat par" is a meaningful, checkable goal.
import { step, isWin, initialState } from './engine.js';

const KEY_DIR = {
  ArrowUp: 0, w: 0, W: 0, k: 0,
  ArrowRight: 1, d: 1, D: 1, l: 1,
  ArrowDown: 2, s: 2, S: 2, j: 2,
  ArrowLeft: 3, a: 3, A: 3, h: 3,
};

export class Player {
  constructor(level, renderer, opts = {}) {
    this.level = level;
    this.r = renderer;
    this.solutionPath = opts.solutionPath || [];
    this.par = opts.par ?? 0;
    this.onChange = opts.onChange || (() => {});
    this.onSolved = opts.onSolved || (() => {});
    this.state = initialState(level);
    this.history = [];
    this.moves = 0;
    this.solved = false;
    this.playing = false;
    this.r.draw(this.state);
    this._bindKeys();
    this._bindTouch();
  }

  _bindKeys() {
    this._key = (e) => {
      if (this.playing) return;
      const d = KEY_DIR[e.key];
      if (d === undefined) return;
      e.preventDefault();
      this.move(d);
    };
    window.addEventListener('keydown', this._key);
  }
  _bindTouch() {
    const c = this.r.canvas; let sx = 0, sy = 0;
    c.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
    c.addEventListener('touchend', (e) => {
      if (this.playing) return;
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      this.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    }, { passive: true });
  }
  destroy() { window.removeEventListener('keydown', this._key); }

  move(dir) {
    if (this.solved) return false;
    const ns = step(this.level, this.state, dir);
    if (!ns) return false;
    this.history.push(this.state);
    this.r.animateMove(this.state, ns);
    this.state = ns;
    this.moves++;
    this.onChange(this.status());
    if (isWin(this.level, this.state)) this._win();
    return true;
  }

  _win() {
    this.solved = true;
    this.r.burst(this.state.player);
    this.onSolved(this.status());
  }

  status() { return { moves: this.moves, par: this.par, solved: this.solved, beat: this.solved && this.moves <= this.par }; }

  undo() {
    if (this.playing || !this.history.length) return;
    this.state = this.history.pop();
    this.moves++;             // an undo still counts as effort
    this.solved = false;
    this.r.draw(this.state);
    this.onChange(this.status());
  }
  reset() {
    if (this.playing) return;
    this.state = initialState(this.level);
    this.history = []; this.moves = 0; this.solved = false;
    this.r.draw(this.state);
    this.onChange(this.status());
  }

  // Replay the solver's optimal path, animated. The reveal of the "answer".
  async playSolution() {
    if (this.playing) return;
    this.reset();
    this.playing = true;
    for (const dir of this.solutionPath) {
      const ns = step(this.level, this.state, dir);
      if (!ns) break;
      this.r.animateMove(this.state, ns, 150);
      this.state = ns; this.moves++;
      this.onChange(this.status());
      await new Promise((res) => setTimeout(res, 165));
    }
    this.playing = false;
    if (isWin(this.level, this.state)) { this.solved = true; this.r.burst(this.state.player); this.onSolved(this.status()); }
  }
}
