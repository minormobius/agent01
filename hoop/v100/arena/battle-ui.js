// battle-ui.js — the tactical-board combat UI, extracted from arena/index.html so the WORLD can host a
// battle without bloating index.html or forking the arena page. A BattleOverlay owns a canvas + action
// bar + log inside a container; you hand it an engine state (createBattle(...)) and an onResolve(winner)
// callback. Pure presentation over arena/engine.js — no world/save knowledge. Sprites are injected via
// spriteFor(unit) so the overlay stays decoupled from whichever sprite engine the caller uses.

import * as E from './engine.js';
import { frameRects, DIR_OF } from '../v3/sprite-core.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class BattleOverlay {
  constructor(root, { spriteFor }) {
    this.root = root; this.spriteFor = spriteFor;
    this.S = null; this.sel = 'strike'; this.anim = null; this.phase = 0; this.busy = false;
    this.raf = null; this.sprCache = new Map(); this.onResolve = null; this.W = 0; this.H = 0; this.dpr = 1;
    root.innerHTML =
      `<div class="btop"><span class="bwho"></span><span class="bturn"></span><span class="bphase"></span>`
      + `<button class="bflee" title="flee — counts as defeat">flee ⏎</button></div>`
      + `<canvas class="bcv"></canvas>`
      + `<div class="blog"></div><div class="bbar"></div>`
      + `<div class="bover"><div class="bres"></div><div class="bsub"></div><button class="bclaim">continue ⏎</button></div>`;
    this.cv = root.querySelector('.bcv'); this.ctx = this.cv.getContext('2d');
    this.elWho = root.querySelector('.bwho'); this.elTurn = root.querySelector('.bturn'); this.elPhase = root.querySelector('.bphase');
    this.elLog = root.querySelector('.blog'); this.elBar = root.querySelector('.bbar'); this.elOver = root.querySelector('.bover');
    this.cv.addEventListener('click', (e) => this._onClick(e));
    root.querySelector('.bflee').addEventListener('click', () => { if (!this.busy && this.S && !this.S.winner) this._finish('foe'); });
    root.querySelector('.bclaim').addEventListener('click', () => this._claim());
    this._loop = this._loop.bind(this);
  }

  start(state, onResolve) {
    this.S = state; this.onResolve = onResolve; this.sel = 'strike'; this.anim = null; this.busy = false; this._resolved = false;
    this.elOver.classList.remove('on');
    this._renderBar(); this._syncTop();
    if (!this.raf) this.raf = requestAnimationFrame(this._loop);
    if (E.active(this.S).team === 'foe') this._runEnemy();
  }
  stop() { if (this.raf) cancelAnimationFrame(this.raf), this.raf = null; }

  // ── geometry ──
  _board() {
    const W = this.W, H = this.H, pad = 26, topH = 44, barH = 92, availW = W - pad * 2, availH = H - topH - barH - pad;
    const ts = Math.max(16, Math.min(Math.floor(availW / this.S.W), Math.floor(availH / this.S.H)));
    const bw = ts * this.S.W, bh = ts * this.S.H, ox = (W - bw) / 2, oy = topH + Math.max(0, (availH - bh) / 2);
    return { ts, ox, oy, bw, bh };
  }
  _tileC(b, x, y) { return [b.ox + (x + 0.5) * b.ts, b.oy + (y + 0.5) * b.ts]; }
  _tileAt(px, py) { const b = this._board(); const x = Math.floor((px - b.ox) / b.ts), y = Math.floor((py - b.oy) / b.ts); return (x >= 0 && y >= 0 && x < this.S.W && y < this.S.H) ? { x, y } : null; }

  _spriteCanvas(genome, dir, frame) {
    const key = genome.seed + '|' + dir + '|' + frame; let c = this.sprCache.get(key); if (c) return c;
    const N = genome.size, SC = 4, cvs = document.createElement('canvas'); cvs.width = N * SC; cvs.height = N * SC; const g = cvs.getContext('2d');
    for (const r of frameRects(genome, DIR_OF[dir] || DIR_OF.S, frame)) { g.fillStyle = r.c; g.fillRect(r.x * SC, r.y * SC, SC, SC); }
    this.sprCache.set(key, cvs); return cvs;
  }
  _chamfer(x, y, w, h, c, fill, lw) { const ctx = this.ctx, k = 12; ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + w - k, y); ctx.lineTo(x + w, y + k); ctx.lineTo(x + w, y + h - k); ctx.lineTo(x + w - k, y + h); ctx.lineTo(x + k, y + h); ctx.lineTo(x, y + h - k); ctx.lineTo(x, y + k); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (c) { ctx.strokeStyle = c; ctx.lineWidth = lw || 1.5; ctx.stroke(); } }

  _loop() { this.phase++; this._draw(); this.raf = requestAnimationFrame(this._loop); }

  _draw() {
    const ctx = this.ctx, r = this.root.getBoundingClientRect();
    this.W = Math.max(160, r.width); this.H = Math.max(160, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.cv.width !== Math.floor(this.W * this.dpr)) { this.cv.width = this.W * this.dpr; this.cv.height = this.H * this.dpr; this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px'; }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.W, this.H);
    if (!this.S) return; const S = this.S, b = this._board();
    this._chamfer(b.ox - 14, b.oy - 14, b.bw + 28, b.bh + 28, '#2b3a44', '#070a0e', 2);
    this._chamfer(b.ox - 8, b.oy - 8, b.bw + 16, b.bh + 16, '#f4bf62', null, 1);
    const L = (S.phase === 'choose') ? E.legal(S) : { move: [], targets: [], skills: [] };
    const reach = new Set(L.move.map((t) => t.x + ',' + t.y));
    const atkSet = new Set(L.targets.map((id) => { const u = E.unitById(S, id); return u.x + ',' + u.y; }));
    for (let y = 0; y < S.H; y++) for (let x = 0; x < S.W; x++) {
      const px = b.ox + x * b.ts, py = b.oy + y * b.ts, k = x + ',' + y;
      ctx.fillStyle = ((x + y) & 1) ? 'rgba(20,28,36,.5)' : 'rgba(13,19,26,.5)'; ctx.fillRect(px + 1, py + 1, b.ts - 2, b.ts - 2);
      if (reach.has(k)) { ctx.strokeStyle = 'rgba(244,191,98,.55)'; ctx.lineWidth = 1.4; ctx.strokeRect(px + 2.5, py + 2.5, b.ts - 5, b.ts - 5); }
      if (atkSet.has(k)) { ctx.strokeStyle = '#cf3b3b'; ctx.lineWidth = 2; ctx.strokeRect(px + 2, py + 2, b.ts - 4, b.ts - 4); }
    }
    const au = E.active(S); if (au && au.alive) { ctx.strokeStyle = au.team === 'player' ? '#f4bf62' : '#cf3b3b'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(b.ox + au.x * b.ts + 2, b.oy + au.y * b.ts + 2, b.ts - 4, b.ts - 4); ctx.setLineDash([]); }
    const order = S.units.filter((u) => u.alive).slice().sort((a, c) => a.y - c.y);
    for (const u of order) {
      let dx = u.x, dy = u.y;
      if (this.anim && this.anim.id === u.id) { const t = Math.min(1, (performance.now() - this.anim.start) / this.anim.dur); dx = this.anim.from.x + (this.anim.to.x - this.anim.from.x) * t; dy = this.anim.from.y + (this.anim.to.y - this.anim.from.y) * t; }
      const cx = b.ox + (dx + 0.5) * b.ts, cy = b.oy + (dy + 0.5) * b.ts;
      const g = this.spriteFor(u);
      if (g) { const moving = this.anim && this.anim.id === u.id, frame = moving ? (Math.floor(this.phase / 6) % 4) : null;
        const pc = this._spriteCanvas(g, u.team === 'player' ? 'N' : 'S', frame), hgt = b.ts * 1.5, wid = hgt * (pc.width / pc.height);
        ctx.imageSmoothingEnabled = false; ctx.drawImage(pc, cx - wid / 2, cy - hgt * 0.78, wid, hgt); ctx.imageSmoothingEnabled = true;
      } else { ctx.fillStyle = u.team === 'player' ? '#f4bf62' : '#cf3b3b'; ctx.font = `${b.ts * 0.7}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(u.team === 'player' ? '☻' : (u.glyph || '☠'), cx, cy); }
      this._drawBars(cx, cy - b.ts * 1.5 * 0.78 - 7, u, b.ts);
    }
  }
  _drawBars(cx, top, u, ts) {
    const ctx = this.ctx, w = ts * 0.9, h = 4, x = cx - w / 2;
    ctx.fillStyle = '#0a0e13'; ctx.fillRect(x - 1, top - 1, w + 2, h + 2);
    ctx.fillStyle = u.team === 'player' ? '#5aa845' : '#cf3b3b'; ctx.fillRect(x, top, w * Math.max(0, u.hp / u.maxhp), h);
    ctx.strokeStyle = '#1b2530'; ctx.lineWidth = .6; ctx.strokeRect(x, top, w, h);
    if (u.maxflux > 0) { ctx.fillStyle = '#b39bd8'; ctx.fillRect(x, top + h + 1, w * Math.max(0, u.flux / u.maxflux), 2); }
    ctx.fillStyle = u.team === 'player' ? '#f4bf62' : '#cf8b8b'; ctx.font = '9px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(u.name + ' ' + u.hp, cx, top - 4);
  }

  // ── action bar + input ──
  _renderBar() {
    const S = this.S, u = E.active(S), can = S && S.phase === 'choose' && u && u.team === 'player';
    const L = can ? E.legal(S) : { skills: [], targets: [] };
    const btns = E.SKILL_ORDER.map((k) => {
      const sk = E.SKILLS[k], usable = can && L.skills.includes(k), isSel = (sk.kind === 'attack') && this.sel === k;
      return `<button class="bact ${isSel ? 'sel' : ''}" data-skill="${k}" ${usable ? '' : 'disabled'}>${sk.glyph} ${sk.label}${sk.cost ? ` <span class="bc">✣${sk.cost}</span>` : ''}</button>`;
    }).join('');
    this.elBar.innerHTML = btns + `<button class="bact" data-end="1" ${can ? '' : 'disabled'}>End ⏎</button>`;
    this.elBar.querySelectorAll('[data-skill]').forEach((bn) => bn.addEventListener('click', () => this._onSkill(bn.dataset.skill)));
    this.elBar.querySelector('[data-end]').addEventListener('click', () => { if (!this.busy) { E.endTurn(this.S); this._afterTurn(); } });
  }
  _onSkill(k) {
    const sk = E.SKILLS[k], u = E.active(this.S); if (this.busy || !u || u.team !== 'player' || this.S.phase !== 'choose') return;
    if (sk.kind === 'attack') { this.sel = k; this._renderBar(); return; }
    const ev = E.act(this.S, { type: 'skill', skillId: k }); this._afterAction(ev);
  }
  _onClick(e) {
    if (this.busy || !this.S || this.S.phase !== 'choose') return;
    const u = E.active(this.S); if (!u || u.team !== 'player') return;
    const r = this.cv.getBoundingClientRect(), t = this._tileAt(e.clientX - r.left, e.clientY - r.top); if (!t) return;
    const foe = this.S.units.find((x) => x.alive && x.team === 'foe' && x.x === t.x && x.y === t.y);
    if (foe) { const ev = E.act(this.S, { type: 'attack', targetId: foe.id, skillId: this.sel }); if (ev.type === 'attack') { this.anim = null; this._afterAction(ev); } return; }
    const ev = E.act(this.S, { type: 'move', x: t.x, y: t.y });
    if (ev.type === 'move') { this.anim = { id: ev.unit, from: ev.from, to: ev.to, start: performance.now(), dur: 200 }; setTimeout(() => { this.anim = null; this._afterAction(ev); }, 210); }
  }
  _afterAction(ev) {
    this._syncTop(); this._renderBar();
    if (this.S.winner) return this._finish(this.S.winner);
    const u = E.active(this.S);
    if (u && u.moved && u.acted) { this.busy = true; setTimeout(() => { this.busy = false; E.endTurn(this.S); this._afterTurn(); }, 240); }
  }
  _afterTurn() { this._syncTop(); this._renderBar(); if (this.S.winner) return this._finish(this.S.winner); if (E.active(this.S).team === 'foe') this._runEnemy(); }
  async _runEnemy() {
    this.busy = true; this._renderBar();
    while (this.S.phase === 'enemy' && !this.S.winner) {
      for (const step of E.aiPlan(this.S)) {
        if (this.S.winner) break;
        if (step.type === 'end') { E.endTurn(this.S); break; }
        if (step.type === 'move') { const u = E.active(this.S); this.anim = { id: u.id, from: { x: u.x, y: u.y }, to: { x: step.x, y: step.y }, start: performance.now(), dur: 200 }; E.aiStep(this.S, step); await wait(230); this.anim = null; }
        else { E.aiStep(this.S, step); this._syncTop(); await wait(340); }
      }
      await wait(110);
    }
    this.busy = false; this._syncTop(); this._renderBar();
    if (this.S.winner) this._finish(this.S.winner);
  }
  _syncTop() {
    const S = this.S; if (!S) return; const me = S.units.find((u) => u.team === 'player');
    this.elWho.innerHTML = me ? `${esc(me.name)} · ✚${me.hp}/${me.maxhp} · ✣${me.flux}` : '';
    this.elTurn.textContent = `turn ${S.turn}`;
    this.elPhase.textContent = S.phase === 'choose' ? 'your move' : S.phase === 'enemy' ? 'enemy…' : '';
    this.elLog.innerHTML = S.log.slice(-12).map((l) => `<div class="l-${l.kind}">${esc(l.msg)}</div>`).join(''); this.elLog.scrollTop = 1e6;
  }
  _finish(winner) {
    if (this._resolved) return; this._resolved = true; this.S.winner = winner;
    const win = winner === 'player';
    this.elOver.querySelector('.bres').textContent = win ? 'VICTORY' : 'DEFEAT';
    this.elOver.querySelector('.bres').className = 'bres ' + (win ? 'win' : 'lose');
    this.elOver.querySelector('.bsub').textContent = win ? 'The hazard is cleared.' : 'You fall. You wake in your quarters.';
    this.elOver.classList.add('on');
  }
  _claim() { const w = this.S ? this.S.winner : 'foe'; this.stop(); if (this.onResolve) this.onResolve(w || 'foe'); }
}

export default BattleOverlay;
