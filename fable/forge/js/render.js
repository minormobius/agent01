// Renderer for forge puzzles — a grid where the LAW is unknown, so the renderer
// shows only the universal vocabulary: walls, marks (ink), dynamic walls (hard
// trails), tokens, exit, agent. The law animates how the agent moves; the
// renderer just paints state.
import { initialState } from './engine.js';

function pal() {
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark
    ? { floor: '#211f1a', floorAlt: '#262219', wall: '#46423a', ink: '#3a4d8a', hard: '#5a4a30', token: '#d6a52a', exit: '#caa24a', agent: '#a39bff', grid: '#322f28', text: '#ece7da' }
    : { floor: '#efe9dc', floorAlt: '#e7e0d0', wall: '#6e6454', ink: '#9fb0e0', hard: '#b9854e', token: '#caa11f', exit: '#b07e22', agent: '#4338ca', grid: '#d9d2c2', text: '#1f1d1a' };
}

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.world = world;
    this.p = pal(); this.dpr = window.devicePixelRatio || 1; this.layout();
  }
  layout() {
    const { W, H } = this.world;
    const max = Math.min(this.canvas.parentElement.clientWidth || 460, 460);
    this.cs = Math.max(30, Math.floor((max - 6) / Math.max(W, H)));
    const w = this.cs * W, h = this.cs * H;
    this.canvas.width = w * this.dpr; this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.W = w; this.H = h;
  }
  xy(c) { return [(c % this.world.W) * this.cs, (c / this.world.W | 0) * this.cs]; }
  rr(x, y, s, r) { const c = this.ctx; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + s, y, x + s, y + s, r); c.arcTo(x + s, y + s, x, y + s, r); c.arcTo(x, y + s, x, y, r); c.arcTo(x, y, x + s, y, r); c.closePath(); }

  draw(s) {
    const ctx = this.ctx, P = this.p, cs = this.cs, wd = this.world;
    ctx.clearRect(0, 0, this.W, this.H);
    for (let c = 0; c < wd.W * wd.H; c++) {
      const [x, y] = this.xy(c);
      ctx.fillStyle = ((c % wd.W + (c / wd.W | 0)) % 2) ? P.floorAlt : P.floor;
      ctx.fillRect(x, y, cs, cs);
      if (wd.walls[c]) { ctx.fillStyle = P.wall; this.rr(x + 1, y + 1, cs - 2, 4); ctx.fill(); continue; }
      if (s.dynWalls.has(c)) { ctx.fillStyle = P.hard; this.rr(x + 3, y + 3, cs - 6, 3); ctx.fill(); }
      else if (s.marks.has(c)) { ctx.fillStyle = P.ink; ctx.globalAlpha = .6; this.rr(x + 4, y + 4, cs - 8, 4); ctx.fill(); ctx.globalAlpha = 1; }
    }
    // grid
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1; ctx.globalAlpha = .5;
    for (let i = 0; i <= wd.W; i++) { ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, this.H); ctx.stroke(); }
    for (let i = 0; i <= wd.H; i++) { ctx.beginPath(); ctx.moveTo(0, i * cs); ctx.lineTo(this.W, i * cs); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // tokens
    for (const c of s.tokens) { const [x, y] = this.xy(c); ctx.fillStyle = P.token; ctx.beginPath(); ctx.arc(x + cs / 2, y + cs / 2, cs * .2, 0, 7); ctx.fill(); }
    // exit
    if (wd.exit >= 0 && wd.goal.type !== 'inkAll') { const [x, y] = this.xy(wd.exit); ctx.strokeStyle = P.exit; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + cs / 2, y + cs / 2, cs * .32, 0, 7); ctx.stroke(); ctx.globalAlpha = .15; ctx.fillStyle = P.exit; ctx.beginPath(); ctx.arc(x + cs / 2, y + cs / 2, cs * .32, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    // agent (with heading nub)
    { const [x, y] = this.xy(s.agent), cx = x + cs / 2, cy = y + cs / 2; ctx.fillStyle = P.agent; ctx.beginPath(); ctx.arc(cx, cy, cs * .3, 0, 7); ctx.fill();
      const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + DX[s.dir] * cs * .16, cy + DY[s.dir] * cs * .16, cs * .07, 0, 7); ctx.fill(); }
  }
}

export function drawThumb(canvas, world, px = 96) {
  const r = new Renderer(canvas, world);
  r.cs = Math.max(12, Math.floor((px - 4) / Math.max(world.W, world.H)));
  const w = r.cs * world.W, h = r.cs * world.H;
  canvas.width = w * r.dpr; canvas.height = h * r.dpr; canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  r.ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0); r.W = w; r.H = h;
  r.draw(initialState(world));
}
