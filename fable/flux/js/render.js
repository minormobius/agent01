// Canvas renderer for the continuous world: gravity wells, magnets (attract /
// repel), goo fields, bumpers, walls, the launch pad, goal, the flying ball with
// a trail, the aim indicator, and — the signature view — the solver's win-map
// drawn as a polar overlay anchored at the launch pad (radius = power, angle =
// launch angle; lit where that launch wins).
import { ARENA, POWER_MIN, POWER_MAX, BALL_R } from './engine.js';

function pal() {
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? {
    bg: '#16140f', frame: '#3a362e', floor: '#1d1b16', grid: '#262219', text: '#ece7da',
    attract: '#d98a3a', repel: '#4f9ad6', well: '#9a7be0', goo: 'rgba(70,180,120,.32)', gooEdge: '#3a9d72',
    bumper: '#b46', bumperHi: '#d68', wall: '#7a7264', goal: '#46c08a', pad: '#a39bff', ball: '#fff', trail: 'rgba(163,155,255,.55)',
    winmap: 'rgba(120,200,150,.5)',
  } : {
    bg: '#f3efe6', frame: '#cdc6b6', floor: '#efe9dc', grid: '#e2dccc', text: '#1f1d1a',
    attract: '#cf7a25', repel: '#2f7fc8', well: '#7a55c8', goo: 'rgba(47,160,110,.26)', gooEdge: '#2f9d72',
    bumper: '#c2607f', bumperHi: '#e090ac', wall: '#6e6454', goal: '#1f9d6e', pad: '#4338ca', ball: '#23202b', trail: 'rgba(67,56,202,.45)',
    winmap: 'rgba(40,150,90,.42)',
  };
}

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.world = world;
    this.p = pal(); this.dpr = window.devicePixelRatio || 1;
    this.showMap = false;
    this.layout();
  }
  layout() {
    const max = Math.min(this.canvas.parentElement.clientWidth || 520, 540);
    this.size = max; this.s = max / ARENA;
    this.canvas.width = max * this.dpr; this.canvas.height = max * this.dpr;
    this.canvas.style.width = max + 'px'; this.canvas.style.height = max + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
  X(x) { return x * this.s; } Y(y) { return y * this.s; } R(r) { return r * this.s; }

  setSolutionMap(grid, na, np) { this.mapGrid = grid; this.mapNa = na; this.mapNp = np; }

  draw(opts = {}) {
    const ctx = this.ctx, P = this.p, w = this.world, S = this.size;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = P.floor; ctx.fillRect(0, 0, S, S);
    // faint grid
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
    for (let g = 10; g < ARENA; g += 10) { ctx.beginPath(); ctx.moveTo(this.X(g), 0); ctx.lineTo(this.X(g), S); ctx.moveTo(0, this.Y(g)); ctx.lineTo(S, this.Y(g)); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = P.frame; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, S - 3, S - 3);

    // goo
    for (const g of w.goo) {
      ctx.fillStyle = P.goo; ctx.beginPath(); ctx.arc(this.X(g.x), this.Y(g.y), this.R(g.rad), 0, 7); ctx.fill();
      ctx.strokeStyle = P.gooEdge; ctx.globalAlpha = 0.5; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    // walls
    ctx.strokeStyle = P.wall; ctx.lineWidth = Math.max(3, this.R(BALL_R * 1.4)); ctx.lineCap = 'round';
    for (const s of w.walls) { ctx.beginPath(); ctx.moveTo(this.X(s.x1), this.Y(s.y1)); ctx.lineTo(this.X(s.x2), this.Y(s.y2)); ctx.stroke(); }
    // attractors / magnets / wells
    for (const a of w.attractors) {
      const cx = this.X(a.x), cy = this.Y(a.y);
      const big = a.q >= 0.8 && !w.attractors.some((b) => b.q < 0);
      const col = a.q < 0 ? P.repel : (big && w.bundle === 'orrery' ? P.well : P.attract);
      const rad = this.R(7 + Math.abs(a.q) * 5);
      const grd = ctx.createRadialGradient(cx, cy, 2, cx, cy, rad);
      grd.addColorStop(0, col); grd.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.5; ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, this.R(3.4), 0, 7); ctx.fill();
      // +/- glyph
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; const r = this.R(2);
      ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); if (a.q >= 0) { ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r); } ctx.stroke();
    }
    // bumpers
    for (const b of w.bumpers) {
      const cx = this.X(b.x), cy = this.Y(b.y), r = this.R(b.rad);
      ctx.fillStyle = P.bumper; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
      ctx.fillStyle = P.bumperHi; ctx.beginPath(); ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.45, 0, 7); ctx.fill();
    }
    // goal
    {
      const cx = this.X(w.goal.x), cy = this.Y(w.goal.y), r = this.R(w.goal.rad);
      ctx.strokeStyle = P.goal; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.18; ctx.fillStyle = P.goal; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.45, 0, 7); ctx.stroke();
    }

    // solver win-map overlay (polar, at the launch pad)
    if (this.showMap && this.mapGrid) this._winmap();

    // trail
    if (opts.trail && opts.trail.length > 1) {
      ctx.strokeStyle = P.trail; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.beginPath();
      ctx.moveTo(this.X(opts.trail[0].x), this.Y(opts.trail[0].y));
      for (let i = 1; i < opts.trail.length; i++) ctx.lineTo(this.X(opts.trail[i].x), this.Y(opts.trail[i].y));
      ctx.stroke();
    }
    // aim indicator
    if (opts.aim) this._aim(opts.aim.angle, opts.aim.power);

    // launch pad
    {
      const cx = this.X(w.ball0.x), cy = this.Y(w.ball0.y);
      ctx.strokeStyle = P.pad; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, this.R(3.4), 0, 7); ctx.stroke();
    }
    // ball
    const bp = opts.ball || w.ball0;
    const bx = this.X(bp.x), by = this.Y(bp.y);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.arc(bx, by + 2, this.R(BALL_R), 0, 7); ctx.fill();
    ctx.fillStyle = P.ball; ctx.beginPath(); ctx.arc(bx, by, this.R(BALL_R), 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(bx - this.R(0.5), by - this.R(0.5), this.R(0.5), 0, 7); ctx.fill();
  }

  _aim(angle, power) {
    const ctx = this.ctx, P = this.p;
    const cx = this.X(this.world.ball0.x), cy = this.Y(this.world.ball0.y);
    const len = this.R(8 + (power - POWER_MIN) / (POWER_MAX - POWER_MIN) * 22);
    ctx.strokeStyle = P.pad; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len); ctx.stroke(); ctx.setLineDash([]);
    // arrowhead
    ctx.save(); ctx.translate(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len); ctx.rotate(angle);
    ctx.fillStyle = P.pad; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-7, -4); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  _winmap() {
    const ctx = this.ctx, P = this.p, na = this.mapNa, np = this.mapNp;
    const cx = this.X(this.world.ball0.x), cy = this.Y(this.world.ball0.y);
    const r0 = this.R(5), r1 = this.R(30);
    ctx.save();
    for (let i = 0; i < na; i++) {
      const a0 = (i / na) * Math.PI * 2, a1 = ((i + 1) / na) * Math.PI * 2;
      for (let j = 0; j < np; j++) {
        if (!this.mapGrid[i * np + j]) continue;
        const rr0 = r0 + (j / np) * (r1 - r0), rr1 = r0 + ((j + 1) / np) * (r1 - r0);
        ctx.fillStyle = P.winmap; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(cx, cy, rr1, a0, a1); ctx.arc(cx, cy, rr0, a1, a0, true); ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1; ctx.restore();
  }
}

// Static thumbnail for gallery cards.
export function drawThumb(canvas, world, sr, px = 150) {
  const r = new Renderer(canvas, world);
  r.size = px; r.s = px / ARENA;
  canvas.width = px * r.dpr; canvas.height = px * r.dpr;
  canvas.style.width = px + 'px'; canvas.style.height = px + 'px';
  r.ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  r.draw({ trail: sr && sr.answer ? sr.answer.trace : null });
}
