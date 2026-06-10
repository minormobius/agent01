// The player. Drag near the ball to aim in the tangent plane (pull for power),
// release to launch; drag anywhere else to orbit the camera. "Watch the solver"
// replays the canonical fine-robust answer. Deterministic engine ⇒ the shot you
// watch is exactly the shot the solver scored.
import { simulate, POWER_MIN, POWER_MAX } from './engine.js';

export class Player {
  constructor(world, renderer, report, opts = {}) {
    this.w = world; this.r = renderer; this.report = report;
    this.onChange = opts.onChange || (() => {});
    this.onSolved = opts.onSolved || (() => {});
    this.attempts = 0; this.solved = false;
    this.mode = 'idle';                 // idle | aiming | orbiting | flying
    this.aim = { psi: 0.8, power: (POWER_MIN + POWER_MAX) / 2 };
    this.ballUV = { u: world.ball0.u, v: world.ball0.v };
    this._bind();
    this.redraw();
  }

  _bind() {
    const c = this.r.canvas;
    const pos = (e) => {
      const rect = c.getBoundingClientRect();
      return {
        x: (e.touches ? e.touches[0].clientX : e.clientX) - rect.left,
        y: (e.touches ? e.touches[0].clientY : e.clientY) - rect.top,
      };
    };
    const setAim = (p) => {
      const basis = this.r.aimBasis();
      const dx = p.x - basis.origin.x, dy = p.y - basis.origin.y;
      // solve drag = a·ê_u_screen + b·ê_v_screen for (a, b)
      const det = basis.eu.x * basis.ev.y - basis.eu.y * basis.ev.x;
      if (Math.abs(det) < 1e-6) return;
      const a = (dx * basis.ev.y - dy * basis.ev.x) / det;
      const b = (-dx * basis.eu.y + dy * basis.eu.x) / det;
      this.aim.psi = Math.atan2(b, a);
      const mag = Math.hypot(a, b);
      this.aim.power = POWER_MIN + Math.min(1, mag / 9) * (POWER_MAX - POWER_MIN);
    };
    const down = (e) => {
      if (this.mode === 'flying') return;
      e.preventDefault();
      const p = pos(e);
      const basis = this.r.aimBasis();
      const near = Math.hypot(p.x - basis.origin.x, p.y - basis.origin.y) < 46;
      if (near && !this.solved) { this.mode = 'aiming'; setAim(p); this.redraw(); }
      else { this.mode = 'orbiting'; this._last = p; }
    };
    const move = (e) => {
      if (this.mode === 'aiming') { e.preventDefault(); setAim(pos(e)); this.redraw(); }
      else if (this.mode === 'orbiting') {
        e.preventDefault();
        const p = pos(e);
        this.r.yaw += (p.x - this._last.x) * 0.01;
        this.r.pitch += (p.y - this._last.y) * 0.01;
        this.r.pitch = Math.max(-2.6, Math.min(-0.1, this.r.pitch));
        this._last = p;
        this.redraw();
      }
    };
    const up = (e) => {
      if (this.mode === 'aiming') { e.preventDefault(); this.mode = 'idle'; this.launch(this.aim.psi, this.aim.power); }
      else if (this.mode === 'orbiting') this.mode = 'idle';
    };
    c.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    c.addEventListener('touchstart', down, { passive: false }); c.addEventListener('touchmove', move, { passive: false }); window.addEventListener('touchend', up);
    this._cleanup = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); window.removeEventListener('touchend', up); };
  }
  destroy() { if (this._cleanup) this._cleanup(); }

  redraw(extra = {}) {
    this.r.draw({ ballUV: this.ballUV, aim: this.mode === 'aiming' ? this.aim : null, trail: this._trail, ...extra });
  }

  launch(psi, power, isSolver = false) {
    if (this.mode === 'flying') return;
    this.mode = 'flying';
    if (!isSolver) this.attempts++;
    const res = simulate(this.w, psi, power, { trace: true, sample: 2 });
    const trace = res.trace;
    let i = 0;
    const speed = 3;
    const tick = () => {
      i = Math.min(trace.length - 1, i + speed);
      this.ballUV = trace[i];
      this._trail = trace.slice(0, i + 1);
      this.redraw();
      if (i < trace.length - 1) requestAnimationFrame(tick);
      else this._land(res, isSolver);
    };
    requestAnimationFrame(tick);
    this.onChange(this.status());
  }

  _land(res, isSolver) {
    this.mode = 'idle';
    if (res.win) { this.solved = true; this.onSolved({ ...this.status(), isSolver, windU: res.windU, windV: res.windV }); }
    else {
      setTimeout(() => {
        if (this.mode === 'idle' && !this.solved) { this.ballUV = { u: this.w.ball0.u, v: this.w.ball0.v }; this._trail = null; this.redraw(); }
      }, 700);
    }
    this.onChange(this.status());
  }

  watchSolver() {
    if (this.mode === 'flying') return;
    const a = this.report.answer;
    this.ballUV = { u: this.w.ball0.u, v: this.w.ball0.v };
    this._trail = null; this.solved = false;
    this.launch(a.psi, a.power, true);
  }

  reset() {
    if (this.mode === 'flying') return;
    this.ballUV = { u: this.w.ball0.u, v: this.w.ball0.v };
    this._trail = null; this.solved = false; this.attempts = 0; this.mode = 'idle';
    this.redraw(); this.onChange(this.status());
  }

  toggleMap() { this.r.showMap = !this.r.showMap; this.redraw(); return this.r.showMap; }

  status() { return { attempts: this.attempts, solved: this.solved }; }
}
