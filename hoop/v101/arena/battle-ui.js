// battle-ui.js — the tactical-board combat UI, extracted from arena/index.html so the WORLD can host a
// battle without bloating index.html or forking the arena page. A BattleOverlay owns a canvas + action
// bar + log inside a container; you hand it an engine state (createBattle(...)) and an onResolve(winner)
// callback. Pure presentation over arena/engine.js — no world/save knowledge. Sprites are injected via
// spriteFor(unit) so the overlay stays decoupled from whichever sprite engine the caller uses.

import * as E from './engine.js';
import { frameRects, DIR_OF } from '../v3/sprite-core.js';
// beast body-plan renderers (vendored Sprite Lab kernels) — a creep genome tagged `_plan` is drawn by its
// matching frame fn (grid genome.w×genome.h, cells {x,y,c}), animated off the walk `frame` as a phase t.
import { polyFrame } from '../v3/poly.js';
import { quadFrame } from '../v3/quad.js';
import { axialFrame } from '../v3/axial.js';
import { isopodFrame } from '../v3/isopod.js';
import { swarmFrame, Swarm, beeCells } from '../v3/swarm.js';   // swarm units draw as a LIVE boids cloud on the board
const BEAST_FRAME = { swarm: swarmFrame, poly: polyFrame, axial: axialFrame, isopod: isopodFrame, quad: (g, t) => quadFrame(g, t, true) };   // quad faces LEFT (toward the player). swarm/poly/isopod are omni; only humanoid+swarm are on the live roster (encounter.js)

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class BattleOverlay {
  constructor(root, { spriteFor }) {
    this.root = root; this.spriteFor = spriteFor;
    this.S = null; this.sel = 'strike'; this.anim = null; this.phase = 0; this.busy = false;
    this.raf = null; this.sprCache = new Map(); this.swarms = new Map(); this._dt = 1 / 60; this._lastT = 0; this.onResolve = null; this.W = 0; this.H = 0; this.dpr = 1;
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

  start(state, onResolve, opts = {}) {
    this.S = state; this.onResolve = onResolve; this.sel = 'strike'; this.anim = null; this.busy = false; this._resolved = false;
    // consumable self-quaff preparations (from the pack): [{ name, glyph, use }]. onConsume(i) removes one
    // from the pack after it's quaffed. Alchemy's bench output — heal/buff draughts you can drink mid-fight.
    this.items = Array.isArray(opts.items) ? opts.items.slice() : [];
    this.onConsume = opts.onConsume || null;
    this.swarms.clear(); this._lastT = 0;
    this.elOver.classList.remove('on');
    this._renderBar(); this._syncTop();
    if (!this.raf) this.raf = requestAnimationFrame(this._loop);
    if (E.active(this.S).team === 'foe') this._runEnemy();
  }
  stop() { if (this.raf) cancelAnimationFrame(this.raf), this.raf = null; }

  // ── CONTINUUM geometry: the board is a free Euclidean field S.W×S.H world units; `sc` is px per unit
  //    (a body is UNIT_R≈0.5 units across). No tiles — positions are floats.
  _board() {
    const W = this.W, H = this.H, pad = 26, topH = 44, barH = 92, availW = W - pad * 2, availH = H - topH - barH - pad;
    const sc = Math.max(10, Math.min(availW / this.S.W, availH / this.S.H));
    const bw = sc * this.S.W, bh = sc * this.S.H, ox = (W - bw) / 2, oy = topH + Math.max(0, (availH - bh) / 2);
    return { sc, ox, oy, bw, bh };
  }
  _wc(b, x, y) { return [b.ox + x * b.sc, b.oy + y * b.sc]; }
  _toWorld(b, px, py) { return { x: (px - b.ox) / b.sc, y: (py - b.oy) / b.sc }; }

  _spriteCanvas(genome, dir, frame) {
    const key = genome.seed + '|' + dir + '|' + frame; let c = this.sprCache.get(key); if (c) return c;
    const SC = 4; let cvs, rects, W, H;
    const beast = genome._plan && BEAST_FRAME[genome._plan];
    if (beast) {                                            // a beast plan: own grid + t-parameterised gait
      W = genome.w; H = genome.h; const t = frame == null ? 0 : (frame % 4) / 4;
      rects = beast(genome, t);
    } else {                                                // the humanoid crew sprite: 8-dir frame rects
      W = H = genome.size; rects = frameRects(genome, DIR_OF[dir] || DIR_OF.S, frame);
    }
    cvs = document.createElement('canvas'); cvs.width = W * SC; cvs.height = H * SC; const g = cvs.getContext('2d');
    for (const r of rects) { g.fillStyle = r.c; g.fillRect(r.x * SC, r.y * SC, SC, SC); }
    this.sprCache.set(key, cvs); return cvs;
  }
  _chamfer(x, y, w, h, c, fill, lw) { const ctx = this.ctx, k = 12; ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + w - k, y); ctx.lineTo(x + w, y + k); ctx.lineTo(x + w, y + h - k); ctx.lineTo(x + w - k, y + h); ctx.lineTo(x + k, y + h); ctx.lineTo(x, y + h - k); ctx.lineTo(x, y + k); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (c) { ctx.strokeStyle = c; ctx.lineWidth = lw || 1.5; ctx.stroke(); } }

  _loop() { const now = performance.now(); this._dt = this._lastT ? Math.min(0.05, (now - this._lastT) / 1000) : 1 / 60; this._lastT = now; this.phase++; this._draw(); this.raf = requestAnimationFrame(this._loop); }
  // a swarm unit is a LIVE boids cloud (v3/swarm.js): one small sim per unit, its bees stamped each frame
  // over a footprint of board — so the swarm literally OCCUPIES a spread, and never buzzes the same way twice.
  _drawBoids(ctx, u, cx, cy, b, genome) {
    const hpFrac = u.maxhp > 0 ? Math.max(0.15, u.hp / u.maxhp) : 1;   // the cloud SHRINKS as it dies (mirrors swarmReach)
    const D = Math.max(30, 3.4 * b.sc * (0.55 + 0.45 * hpFrac));       // on-board diameter (a wide diffuse cloud)
    let sw = this.swarms.get(u.id);
    if (!sw || sw._D !== Math.round(D)) { sw = new Swarm({ width: D, height: D, count: genome.count || 22, seed: genome.seed }); sw._D = Math.round(D); this.swarms.set(u.id, sw); }
    sw.setTarget(D / 2, D / 2); sw.step(this._dt);
    const col = genome.colors || {}, half = D / 2, bs = Math.max(1.6, b.sc * 0.085);
    sw.forEachBee((px, py, ang, wing) => {
      const bx = cx + (px - half), by = cy + (py - half);
      for (const cell of beeCells(ang, wing, col)) { ctx.fillStyle = cell.c; ctx.fillRect(bx + cell.x * bs - bs / 2, by + cell.y * bs - bs / 2, bs + 0.5, bs + 0.5); }
    });
  }

  _draw() {
    const ctx = this.ctx, r = this.root.getBoundingClientRect();
    this.W = Math.max(160, r.width); this.H = Math.max(160, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.cv.width !== Math.floor(this.W * this.dpr)) { this.cv.width = this.W * this.dpr; this.cv.height = this.H * this.dpr; this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px'; }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.W, this.H);
    if (!this.S) return; const S = this.S, b = this._board(), R = E.UNIT_R * b.sc;
    this._chamfer(b.ox - 14, b.oy - 14, b.bw + 28, b.bh + 28, '#2b3a44', '#070a0e', 2);
    this._chamfer(b.ox - 8, b.oy - 8, b.bw + 16, b.bh + 16, '#f4bf62', null, 1);
    ctx.save(); ctx.beginPath(); ctx.rect(b.ox, b.oy, b.bw, b.bh); ctx.clip();
    ctx.fillStyle = 'rgba(14,20,27,.6)'; ctx.fillRect(b.ox, b.oy, b.bw, b.bh);
    // a faint reference grid so distance/scale read on the free board
    ctx.strokeStyle = 'rgba(40,54,66,.28)'; ctx.lineWidth = 1;
    for (let x = 1; x < S.W; x++) { const [px] = this._wc(b, x, 0); ctx.beginPath(); ctx.moveTo(px, b.oy); ctx.lineTo(px, b.oy + b.bh); ctx.stroke(); }
    for (let y = 1; y < S.H; y++) { const [, py] = this._wc(b, 0, y); ctx.beginPath(); ctx.moveTo(b.ox, py); ctx.lineTo(b.ox + b.bw, py); ctx.stroke(); }
    // TERRAIN: walls block movement + shots; hazard fields bite each turn (burn/mire/emp tinted).
    for (const t of (S.terrain || [])) {
      const [tx, ty] = this._wc(b, t.x, t.y);
      if (t.kind === 'wall') { ctx.fillStyle = '#171c24'; ctx.beginPath(); ctx.arc(tx, ty, t.r * b.sc, 0, 7); ctx.fill(); ctx.strokeStyle = '#3a4650'; ctx.lineWidth = 1.5; ctx.stroke(); }
      else { const col = t.effect === 'burn' ? '207,59,59' : t.effect === 'mire' ? '90,168,69' : '110,150,220'; ctx.fillStyle = `rgba(${col},.16)`; ctx.strokeStyle = `rgba(${col},.5)`; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(tx, ty, t.r * b.sc, 0, 7); ctx.fill(); ctx.stroke(); ctx.setLineDash([]); }
    }
    const au = E.active(S), myTurn = S.phase === 'choose' && au && au.team === 'player';
    const L = myTurn ? E.legal(S) : null;
    // MOVE DISK — the free-step reach of the active player (a radius, not a set of tiles)
    if (L && L.move.range > 0) { const [ax, ay] = this._wc(b, au.x, au.y); ctx.fillStyle = 'rgba(244,191,98,.08)'; ctx.strokeStyle = 'rgba(244,191,98,.4)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(ax, ay, L.move.range * b.sc, 0, 7); ctx.fill(); ctx.stroke(); }
    // RANGE RING + TARGETS for the selected skill (ranged skills show their reach; targets pulse red)
    if (L && this.sel && L.skills[this.sel] && L.skills[this.sel].usable) {
      const sk = E.SKILLS[this.sel]; const [ax, ay] = this._wc(b, au.x, au.y);
      if ((sk.range || 1) > 1.5) { ctx.strokeStyle = 'rgba(179,155,216,.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(ax, ay, sk.range * b.sc, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      const pulse = 0.5 + 0.5 * Math.sin(this.phase / 8);
      for (const id of L.skills[this.sel].targets) { const t = E.unitById(S, id); if (!t) continue; const [tx, ty] = this._wc(b, t.x, t.y); ctx.strokeStyle = `rgba(207,59,59,${0.5 + pulse * 0.45})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(tx, ty, R * 1.5, 0, 7); ctx.stroke(); }
    }
    ctx.restore();
    // UNITS — painters' order by y; body shadow disk + sprite + bars + status + active ring.
    const order = S.units.filter((u) => u.alive).slice().sort((a, c) => a.y - c.y);
    for (const u of order) {
      let dx = u.x, dy = u.y;
      if (this.anim && this.anim.id === u.id) { const t = Math.min(1, (performance.now() - this.anim.start) / this.anim.dur); dx = this.anim.from.x + (this.anim.to.x - this.anim.from.x) * t; dy = this.anim.from.y + (this.anim.to.y - this.anim.from.y) * t; }
      const [cx, cy] = this._wc(b, dx, dy);
      // ground shadow disk (reads the body + team)
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(cx, cy + R * 0.7, R * 1.05, R * 0.5, 0, 0, 7); ctx.fill();
      if (au && au.id === u.id) { ctx.strokeStyle = u.team === 'player' ? '#f4bf62' : '#cf3b3b'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      const g = this.spriteFor(u);
      if (g && g._plan === 'swarm') { this._drawBoids(ctx, u, cx, cy, b, g); this._drawBars(cx, cy - b.sc * 1.7 - 8, u, b.sc); continue; }   // a swarm is a LIVE boids cloud, not a static sprite
      if (g) { const moving = this.anim && this.anim.id === u.id, frame = moving ? (Math.floor(this.phase / 6) % 4) : null;
        const pc = this._spriteCanvas(g, u.team === 'player' ? 'N' : 'S', frame), hgt = b.sc * 2.2, wid = hgt * (pc.width / pc.height);
        ctx.imageSmoothingEnabled = false; ctx.drawImage(pc, cx - wid / 2, cy + R * 0.7 - hgt, wid, hgt); ctx.imageSmoothingEnabled = true;
      } else { ctx.fillStyle = u.accent || (u.team === 'player' ? '#f4bf62' : '#cf3b3b'); ctx.font = `${R * 1.6}px ui-monospace,monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(u.glyph || (u.team === 'player' ? '☻' : '☠'), cx, cy); }
      this._drawBars(cx, cy - b.sc * 2.2 + R * 0.7 - 8, u, b.sc);
    }
  }
  _drawBars(cx, top, u, sc) {
    const ctx = this.ctx, w = Math.max(24, sc * 1.5), h = 4, x = cx - w / 2;
    ctx.fillStyle = '#0a0e13'; ctx.fillRect(x - 1, top - 1, w + 2, h + 2);
    ctx.fillStyle = u.team === 'player' ? '#5aa845' : '#cf3b3b'; ctx.fillRect(x, top, w * Math.max(0, u.hp / u.maxhp), h);
    ctx.strokeStyle = '#1b2530'; ctx.lineWidth = .6; ctx.strokeRect(x, top, w, h);
    if (u.maxflux > 0) { ctx.fillStyle = '#b39bd8'; ctx.fillRect(x, top + h + 1, w * Math.max(0, u.flux / u.maxflux), 2); }
    ctx.fillStyle = u.team === 'player' ? '#f4bf62' : '#cf8b8b'; ctx.font = '9px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.fillText(u.name + ' ' + u.hp, cx, top - 4);
    // status glyphs (bleed/stun/mark/slow) ride just under the bar
    const st = Object.keys(u.status || {}).filter((k) => u.status[k] && u.status[k].turns > 0);
    if (st.length) { ctx.font = '10px ui-monospace,monospace'; ctx.fillStyle = '#e0a86a'; ctx.fillText(st.map((k) => (E.STATUS[k] && E.STATUS[k].glyph) || '•').join(' '), cx, top + h + 12); }
  }

  // ── action bar + input ──
  // which skills need a TARGET clicked (vs self skills that fire from the bar button).
  _targeted(sk) { return ['attack', 'control', 'debuff', 'siphon', 'blast', 'agglomerate', 'revive', 'assist'].includes(sk.kind); }
  _renderBar() {
    const S = this.S, u = E.active(S), can = S && S.phase === 'choose' && u && u.team === 'player';
    const L = can ? E.legal(S) : { skills: {} };
    const ids = u ? E.skillsFor(u) : [];
    const btns = ids.map((k) => {
      const sk = E.SKILLS[k], info = L.skills[k], usable = can && info && info.usable, isSel = this.sel === k, cost = u ? E.costOf(u, k) : sk.cost;
      const hint = isSel && this._targeted(sk) ? ' style="outline:1px solid #f4bf62"' : '';
      return `<button class="bact ${isSel ? 'sel' : ''}" data-skill="${k}" title="${esc(sk.gloss || '')}"${hint} ${usable ? '' : 'disabled'}>${sk.glyph} ${sk.label}${cost ? ` <span class="bc">✣${cost}</span>` : ''}</button>`;
    }).join('');
    // consumable quaff buttons (self draughts from the pack) — usable while it's your turn and you haven't acted
    const canQuaff = can && u && !u.acted;
    const items = (this.items || []).map((it, i) =>
      `<button class="bact bitem" data-item="${i}" title="${esc(it.effect || '')}" style="border-color:#6a5a9a;color:#c6b0f0" ${canQuaff ? '' : 'disabled'}>${it.glyph || '⚗'} ${esc(it.name)}</button>`).join('');
    this.elBar.innerHTML = btns + items + `<button class="bact" data-end="1" ${can ? '' : 'disabled'}>End ⏎</button>`;
    this.elBar.querySelectorAll('[data-skill]').forEach((bn) => bn.addEventListener('click', () => this._onSkill(bn.dataset.skill)));
    this.elBar.querySelectorAll('[data-item]').forEach((bn) => bn.addEventListener('click', () => this._onItem(+bn.dataset.item)));
    this.elBar.querySelector('[data-end]').addEventListener('click', () => { if (!this.busy) { this.sel = 'strike'; E.endTurn(this.S); this._afterTurn(); } });
  }
  _onSkill(k) {
    const sk = E.SKILLS[k], u = E.active(this.S); if (this.busy || !u || u.team !== 'player' || this.S.phase !== 'choose') return;
    const info = E.legal(this.S).skills[k]; if (!info || !info.usable) return;
    if (this._targeted(sk)) { this.sel = k; this._renderBar(); return; }   // arm it — the next unit-click is the target
    const ev = E.act(this.S, { type: 'skill', skillId: k });               // self skill (heal/buff/brace/convert/reposition/summon) fires now
    if (ev.type === 'reposition') this._repos = true;                       // flit reopened the move slot — the next click is the extra step
    this._afterAction(ev);
  }
  // quaff a consumable preparation on yourself (heal/buff) — fires from the bar like a self skill, then the
  // item is removed from the pack via onConsume. A non-self quaff comes back illegal and is left in the pack.
  _onItem(i) {
    const u = E.active(this.S); if (this.busy || !u || u.team !== 'player' || this.S.phase !== 'choose' || u.acted) return;
    const it = this.items[i]; if (!it) return;
    const ev = E.act(this.S, { type: 'item', use: it.use });
    if (ev.type === 'illegal') return;
    this.items.splice(i, 1);                        // spent — drop it from the in-battle list
    if (this.onConsume) { try { this.onConsume(it); } catch (e) {} }   // remove one from the real pack
    this._afterAction(ev);
  }
  _onClick(e) {
    if (this.busy || !this.S || this.S.phase !== 'choose') return;
    const u = E.active(this.S); if (!u || u.team !== 'player') return;
    const b = this._board(), r = this.cv.getBoundingClientRect();
    const p = this._toWorld(b, e.clientX - r.left, e.clientY - r.top);
    const sk = E.SKILLS[this.sel] || E.SKILLS.strike;
    const hit = this.S.units.find((x) => x.alive && E.dist(x, p) <= E.UNIT_R * 1.6);   // a body under the click?
    // a TARGETED skill armed → clicking a valid target fires it
    if (this._targeted(sk)) {
      const info = E.legal(this.S).skills[this.sel];
      if (hit && info && info.targets.includes(hit.id)) { const ev = E.act(this.S, { type: 'skill', skillId: this.sel, targetId: hit.id }); if (ev.type !== 'illegal') { this.sel = 'strike'; this._afterAction(ev); } return; }
      // a MELEE attack clicked on empty ground = a move toward there; a RANGED skill clicked off-target = ignore
      if ((sk.range || 1) > 1.5) return;
    }
    // MOVE: step to the click within reach (or as far toward it as the reach allows), rounding walls
    const flit = this._repos, R = flit ? E.SKILLS.flit.extra : E.moveRange(u);
    const dest = E.canReach(this.S, u, p.x, p.y, R) ? p : E.moveToward(this.S, u, p.x, p.y, R, 0);
    if (E.dist(u, dest) < 0.1) return;
    const ev = E.act(this.S, { type: flit ? 'flit-move' : 'move', x: dest.x, y: dest.y });
    if (ev.type === 'move' || ev.type === 'flit-move') { this._repos = false; this.anim = { id: ev.unit, from: ev.from, to: ev.to, start: performance.now(), dur: 220 }; setTimeout(() => { this.anim = null; this._afterAction(ev); }, 230); }
  }
  _afterAction(ev) {
    this._syncTop(); this._renderBar();
    if (this.S.winner) return this._finish(this.S.winner);
    const u = E.active(this.S);
    if (u && u.moved && u.acted && !this._repos) { this.busy = true; setTimeout(() => { this.busy = false; this.sel = 'strike'; E.endTurn(this.S); this._afterTurn(); }, 260); }   // spent both slots → the turn ends
  }
  _afterTurn() { this.sel = 'strike'; this._repos = false; this._syncTop(); this._renderBar(); if (this.S.winner) return this._finish(this.S.winner); if (E.active(this.S).team === 'foe') this._runEnemy(); }
  async _runEnemy() {
    this.busy = true; this._renderBar();
    while (this.S.phase === 'enemy' && !this.S.winner) {
      for (const step of E.aiPlan(this.S)) {
        if (this.S.winner) break;
        const u = E.active(this.S);
        if (step.type === 'end') { E.endTurn(this.S); break; }
        if (step.type === 'move') { this.anim = { id: u.id, from: { x: u.x, y: u.y }, to: { x: step.x, y: step.y }, start: performance.now(), dur: 220 }; E.aiStep(this.S, step); await wait(250); this.anim = null; }
        else { E.aiStep(this.S, step); this._syncTop(); await wait(330); }
      }
      await wait(120);
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
