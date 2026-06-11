// The player: drag to aim (direction + pull = power), release to launch. The
// ball flies the simulated trajectory; reaching the goal wins. "Watch the
// solver" replays the canonical answer the solver found. Because the engine is
// deterministic, the shot you see is exactly the shot the solver scored.
import { simulate, POWER_MIN, POWER_MAX } from './engine.js';

export class Player {
  constructor(world, renderer, report, opts = {}) {
    this.w = world; this.r = renderer; this.report = report;
    this.onChange = opts.onChange || (() => {});
    this.onSolved = opts.onSolved || (() => {});
    this.attempts = 0; this.solved = false;
    this.mode = 'idle';                 // idle | aiming | flying | done
    this.aim = { angle: -Math.PI / 4, power: (POWER_MIN + POWER_MAX) / 2 };
    this.ball = { ...world.ball0 };
    this._bind();
    this.r.draw({ ball: this.ball, aim: this.aim });
  }

  _bind() {
    const c = this.r.canvas;
    const toWorld = (e) => {
      const rect = c.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return { x: cx / this.r.s, y: cy / this.r.s };
    };
    const setAim = (e) => {
      const p = toWorld(e), pad = this.w.ball0;
      const dx = p.x - pad.x, dy = p.y - pad.y;
      const d = Math.hypot(dx, dy);
      this.aim.angle = Math.atan2(dy, dx);
      this.aim.power = POWER_MIN + Math.min(1, d / 30) * (POWER_MAX - POWER_MIN);
    };
    const down = (e) => { if (this.mode === 'flying') return; e.preventDefault(); this.mode = 'aiming'; setAim(e); this._redraw(); };
    const move = (e) => { if (this.mode !== 'aiming') return; e.preventDefault(); setAim(e); this._redraw(); };
    const up = (e) => { if (this.mode !== 'aiming') return; e.preventDefault(); this.mode = 'idle'; this.launch(this.aim.angle, this.aim.power); };
    c.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    c.addEventListener('touchstart', down, { passive: false }); c.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', up);
    this._cleanup = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('touchend', up); };
  }
  destroy() { if (this._cleanup) this._cleanup(); }

  _redraw() { this.r.draw({ ball: this.ball, aim: this.mode === 'aiming' ? this.aim : null }); }

  setAimValues(angle, power) { this.aim.angle = angle; this.aim.power = power; }

  launch(angle, power, isSolver = false) {
    if (this.mode === 'flying') return;
    this.mode = 'flying';
    if (!isSolver) this.attempts++;
    const res = simulate(this.w, angle, power, { trace: true, sample: 2 });
    const trace = res.trace;
    let i = 0;
    const speed = 3;            // trace points per frame
    const tick = () => {
      i = Math.min(trace.length - 1, i + speed);
      this.ball = trace[i];
      this.r.draw({ ball: this.ball, trail: trace.slice(0, i + 1) });
      if (i < trace.length - 1) requestAnimationFrame(tick);
      else this._land(res, isSolver);
    };
    requestAnimationFrame(tick);
    this.onChange(this.status());
  }

  _land(res, isSolver) {
    this.mode = 'done';
    if (res.win) { this.solved = true; this.onSolved({ ...this.status(), isSolver }); }
    else {
      // bounce the ball back to the pad after a beat for another try
      setTimeout(() => { if (this.mode === 'done' && !this.solved) { this.ball = { ...this.w.ball0 }; this.mode = 'idle'; this._redraw(); } }, 650);
    }
    this.onChange(this.status());
  }

  watchSolver() {
    const a = this.report.answer;
    this.ball = { ...this.w.ball0 };
    this.solved = false; this.mode = 'idle';
    this.launch(a.angle, a.power, true);
  }

  reset() { if (this.mode === 'flying') return; this.ball = { ...this.w.ball0 }; this.solved = false; this.mode = 'idle'; this.attempts = 0; this._redraw(); this.onChange(this.status()); }

  toggleMap() { this.r.showMap = !this.r.showMap; this._redraw(); return this.r.showMap; }

  status() { return { attempts: this.attempts, solved: this.solved }; }
}
