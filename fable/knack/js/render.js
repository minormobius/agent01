// Canvas renderer. Draws a level + state with smooth movement animation and a
// per-bundle theme. Kept self-contained (no CSS-var reads) so it works the same
// on a gallery thumbnail and the main board.
import { FLOOR, WALL, ICE, PIT, EXIT, xy, initialState } from './engine.js';

const COLOR_HEX = { red: '#d7544b', blue: '#3f8fd6', green: '#34a87f', amber: '#d6a52a' };
const COLOR_NAMES = ['red', 'blue', 'green', 'amber'];

function pal() {
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? {
    floor: '#211f1a', floorAlt: '#262219', wall: '#3a362e', wall2: '#46423a', ice: '#1d3a4a', iceLine: '#3e6a82',
    pit: '#0c0b09', exit: '#caa24a', grid: '#322f28', box: '#7a5a36', boxTop: '#9a744a', boxOn: '#34a87f',
    player: '#a39bff', playerDk: '#6f66d8', target: '#caa24a', coin: '#d6a52a', text: '#ece7da', shadow: 'rgba(0,0,0,.45)',
  } : {
    floor: '#efe9dc', floorAlt: '#e7e0d0', wall: '#5c5346', wall2: '#6e6454', ice: '#cfe7f4', iceLine: '#a7cfe6',
    pit: '#241f18', exit: '#b07e22', grid: '#d9d2c2', box: '#b9854e', boxTop: '#d2a067', boxOn: '#2f9d73',
    player: '#4338ca', playerDk: '#2b249a', target: '#9a6f1c', coin: '#caa11f', text: '#1f1d1a', shadow: 'rgba(0,0,0,.16)',
  };
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function gateOpen(level, state, color) {
  for (const b of level.buttons) if (b.color === color && (state.player === b.idx || state.boxes.indexOf(b.idx) >= 0)) return true;
  return false;
}

export class Renderer {
  constructor(canvas, level) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.level = level;
    this.p = pal();
    this.dpr = window.devicePixelRatio || 1;
    this.anim = null;
    this.particles = [];
    this.layout();
  }

  layout() {
    const { W, H } = this.level;
    const maxW = Math.min(this.canvas.parentElement.clientWidth || 520, 560);
    this.cs = Math.max(26, Math.floor(maxW / W));
    const w = this.cs * W, h = this.cs * H;
    this.canvas.width = w * this.dpr; this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  cell(i) { const [x, y] = xy(this.level, i); return [x * this.cs, y * this.cs]; }

  draw(state) {
    this.state = state;
    this._paint(state, null);
  }

  // Animate player (and a pushed box) from prev→next over dur ms.
  animateMove(prev, next, dur = 110) {
    const movedBox = (() => {
      const a = new Set(prev.boxes), b = new Set(next.boxes);
      let from = -1, to = -1;
      for (const x of a) if (!b.has(x)) from = x;
      for (const x of b) if (!a.has(x)) to = x;
      return from >= 0 && to >= 0 ? { from, to } : null;
    })();
    this.anim = { t0: performance.now(), dur, prev, next, player: { from: prev.player, to: next.player }, box: movedBox };
    this._loop();
  }

  _loop() {
    const tick = () => {
      const a = this.anim;
      if (!a) return;
      const t = Math.min(1, (performance.now() - a.t0) / a.dur);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this._paint(a.next, { e, a });
      if (t < 1 || this.particles.length) requestAnimationFrame(tick);
      else { this.anim = null; this._paint(a.next, null); }
    };
    requestAnimationFrame(tick);
  }

  burst(i) {
    const [x, y] = this.cell(i); const cs = this.cs;
    for (let k = 0; k < 24; k++) {
      const ang = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      this.particles.push({ x: x + cs / 2, y: y + cs / 2, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1 });
    }
    this._loop2();
  }
  _loop2() {
    const tick = () => {
      if (!this.particles.length) { this._paint(this.state, null); return; }
      this._paint(this.state, null);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  _paint(state, animCtx) {
    const ctx = this.ctx, cs = this.cs, L = this.level, P = this.p;
    const W = L.W, H = L.H;
    ctx.clearRect(0, 0, W * cs, H * cs);

    // terrain
    for (let i = 0; i < W * H; i++) {
      const [x, y] = this.cell(i);
      const b = L.base[i];
      if (b === WALL) {
        ctx.fillStyle = P.wall; rr(ctx, x + 1, y + 1, cs - 2, cs - 2, 5); ctx.fill();
        ctx.fillStyle = P.wall2; rr(ctx, x + 1, y + 1, cs - 2, (cs - 2) * 0.5, 5); ctx.fill();
        continue;
      }
      // base floor
      ctx.fillStyle = ((x + y) % 2) ? P.floorAlt : P.floor;
      ctx.fillRect(x, y, cs, cs);
      if (b === ICE) {
        ctx.fillStyle = P.ice; ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2);
        ctx.strokeStyle = P.iceLine; ctx.lineWidth = 1; ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(x + cs * 0.2, y + cs * 0.7); ctx.lineTo(x + cs * 0.5, y + cs * 0.35);
        ctx.moveTo(x + cs * 0.45, y + cs * 0.8); ctx.lineTo(x + cs * 0.78, y + cs * 0.45); ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (b === PIT) {
        const filled = (state.filled & (1 << i)) !== 0;
        if (filled) { ctx.fillStyle = P.box; rr(ctx, x + 3, y + 3, cs - 6, cs - 6, 4); ctx.fill(); }
        else { ctx.fillStyle = P.pit; rr(ctx, x + 3, y + 3, cs - 6, cs - 6, 6); ctx.fill(); }
      } else if (b === EXIT) {
        ctx.save(); ctx.translate(x + cs / 2, y + cs / 2);
        const r = cs * 0.34;
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
        g.addColorStop(0, P.exit); g.addColorStop(1, 'transparent');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
        ctx.strokeStyle = P.exit; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, 7); ctx.stroke();
        ctx.restore();
      }
    }
    // grid lines
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
    for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * cs, 0); ctx.lineTo(x * cs, H * cs); ctx.stroke(); }
    for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * cs); ctx.lineTo(W * cs, y * cs); ctx.stroke(); }
    ctx.globalAlpha = 1;

    // targets
    for (const t of L.targets) { const [x, y] = this.cell(t); this._diamond(x + cs / 2, y + cs / 2, cs * 0.18, P.target); }
    // arrows
    for (let i = 0; i < W * H; i++) if (L.arrow[i] >= 0) { const [x, y] = this.cell(i); this._chevron(x, y, cs, L.arrow[i], P.text); }
    // doors
    for (const d of L.doors) {
      const open = (state.keys & (1 << d.color)) !== 0;
      const [x, y] = this.cell(d.idx); this._bars(x, y, cs, COLOR_HEX[['red', 'blue', 'green', 'amber'][d.color]], open, 'door');
    }
    // gates
    for (const g of L.gates) {
      const open = gateOpen(L, state, g.color);
      const [x, y] = this.cell(g.idx); this._bars(x, y, cs, COLOR_HEX[['red', 'blue', 'green', 'amber'][g.color]], open, 'gate');
    }
    // buttons
    for (const b of L.buttons) {
      const held = state.player === b.idx || state.boxes.indexOf(b.idx) >= 0;
      const [x, y] = this.cell(b.idx); const c = COLOR_HEX[['red', 'blue', 'green', 'amber'][b.color]];
      ctx.fillStyle = c; ctx.globalAlpha = held ? 1 : 0.55;
      ctx.beginPath(); ctx.arc(x + cs / 2, y + cs / 2, cs * (held ? 0.16 : 0.22), 0, 7); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + cs / 2, y + cs / 2, cs * 0.26, 0, 7); ctx.stroke();
    }
    // keys
    for (const k of L.keys) {
      if ((state.keys & (1 << k.color)) !== 0) continue;
      const [x, y] = this.cell(k.idx); this._key(x, y, cs, COLOR_HEX[['red', 'blue', 'green', 'amber'][k.color]]);
    }
    // coins
    L.coins.forEach((ci, j) => {
      if ((state.coins & (1 << j)) !== 0) return;
      const [x, y] = this.cell(ci); ctx.fillStyle = P.coin;
      ctx.beginPath(); ctx.arc(x + cs / 2, y + cs / 2, cs * 0.2, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    });

    // boxes
    for (const bi of state.boxes) {
      let [x, y] = this.cell(bi);
      if (animCtx && animCtx.a.box && animCtx.a.box.to === bi) {
        const [fx, fy] = this.cell(animCtx.a.box.from), [tx, ty] = this.cell(animCtx.a.box.to);
        x = fx + (tx - fx) * animCtx.e; y = fy + (ty - fy) * animCtx.e;
      }
      const onTarget = L.targets.indexOf(bi) >= 0;
      ctx.fillStyle = P.shadow; rr(ctx, x + 5, y + 6, cs - 8, cs - 8, 5); ctx.fill();
      ctx.fillStyle = onTarget ? P.boxOn : P.box; rr(ctx, x + 4, y + 4, cs - 8, cs - 8, 5); ctx.fill();
      ctx.fillStyle = onTarget ? '#46c79a' : P.boxTop; rr(ctx, x + 4, y + 4, cs - 8, (cs - 8) * 0.42, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + 7, y + 7); ctx.lineTo(x + cs - 7, y + cs - 7); ctx.moveTo(x + cs - 7, y + 7); ctx.lineTo(x + 7, y + cs - 7); ctx.stroke();
    }

    // player
    {
      let [x, y] = this.cell(state.player);
      if (animCtx) {
        const [fx, fy] = this.cell(animCtx.a.player.from), [tx, ty] = this.cell(animCtx.a.player.to);
        x = fx + (tx - fx) * animCtx.e; y = fy + (ty - fy) * animCtx.e;
      }
      const cx = x + cs / 2, cy = y + cs / 2, r = cs * 0.3;
      ctx.fillStyle = P.shadow; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.8, r * 0.9, r * 0.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = P.player; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
      ctx.fillStyle = P.playerDk; ctx.beginPath(); ctx.arc(cx, cy - r * 0.2, r, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx - r * 0.32, cy + r * 0.12, r * 0.16, 0, 7); ctx.arc(cx + r * 0.32, cy + r * 0.12, r * 0.16, 0, 7); ctx.fill();
    }

    // particles
    if (this.particles.length) {
      ctx.fillStyle = P.exit;
      this.particles = this.particles.filter((q) => q.life > 0);
      for (const q of this.particles) {
        q.x += q.vx; q.y += q.vy; q.vy += 0.12; q.life -= 0.03;
        ctx.globalAlpha = Math.max(0, q.life);
        ctx.beginPath(); ctx.arc(q.x, q.y, 2.4, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  _diamond(cx, cy, r, color) {
    const ctx = this.ctx; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.stroke();
  }
  _chevron(x, y, cs, dir, color) {
    const ctx = this.ctx; ctx.save(); ctx.translate(x + cs / 2, y + cs / 2); ctx.rotate(dir * Math.PI / 2);
    ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-cs * 0.18, cs * 0.08); ctx.lineTo(0, -cs * 0.16); ctx.lineTo(cs * 0.18, cs * 0.08); ctx.stroke();
    ctx.globalAlpha = 1; ctx.restore();
  }
  _bars(x, y, cs, color, open, kind) {
    const ctx = this.ctx;
    if (open) { ctx.strokeStyle = color; ctx.globalAlpha = 0.4; ctx.lineWidth = 2; ctx.strokeRect(x + 4, y + 4, cs - 8, cs - 8); ctx.globalAlpha = 1; return; }
    ctx.fillStyle = color; ctx.globalAlpha = 0.9;
    for (let k = 0; k < 3; k++) ctx.fillRect(x + 5 + k * (cs - 10) / 3 + 1, y + 5, (cs - 10) / 3 - 2, cs - 10);
    ctx.globalAlpha = 1;
  }
  _key(x, y, cs, color) {
    const ctx = this.ctx; ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = cs * 0.08;
    ctx.beginPath(); ctx.arc(x + cs * 0.38, y + cs * 0.42, cs * 0.13, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + cs * 0.48, y + cs * 0.5); ctx.lineTo(x + cs * 0.66, y + cs * 0.68); ctx.stroke();
    ctx.fillRect(x + cs * 0.6, y + cs * 0.6, cs * 0.1, cs * 0.04);
  }
}

// Small static thumbnail of the initial layout for gallery cards.
export function drawThumb(canvas, level, px = 150) {
  const r = new Renderer(canvas, level);
  // override sizing to a compact thumbnail
  r.cs = Math.max(10, Math.floor(px / Math.max(level.W, level.H)));
  const w = r.cs * level.W, h = r.cs * level.H;
  canvas.width = w * r.dpr; canvas.height = h * r.dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  r.ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  r._paint(initialState(level), null);
}
