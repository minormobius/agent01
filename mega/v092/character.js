// character.js — CHARACTER CREATION. Class creation mirrors the civic tree (your vocation IS a civic
// role), you roll up your own sprite (the seed-deterministic NPC sprite genome), tune the
// FLESH·CHASSIS·ANIMA blend, and re-roll weird "a-bit-robot" characteristics. Everything reads live:
// the blend → cast → nine attributes → combat preview. Embarking commits the character (localStorage)
// and hands it back to the world.
//
// Pure view over stats.js (the spine) + v3/sprite-core.js (the sprite). No data of its own beyond the
// working draft. Deterministic: the same seed + choices reproduce the same person.

import { rollCharacter, rollTriad, rollCharacteristics, normTriad, deriveCombat, deriveAttrs, applyCharacteristics,
         TRIAD, TRIAD_ORDER, ATTRS, ATTR_ORDER, VOCATIONS, VOCATION_ORDER, castOf } from './stats.js';
import { ROLES, frameRects, DIR_OF } from './v3/sprite-core.js';
import { crewSprite } from './crew.js';

const STORE_KEY = 'mega:v092:character';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const mix = (a, b) => { let h = Math.imul((a >>> 0) ^ 0x9e3779b1, 2654435761) ^ Math.imul((b | 0) + 1, 0x85ebca77); h ^= h >>> 13; return (h >>> 0); };

export function loadCharacter() {
  try { const s = localStorage.getItem(STORE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
export function saveCharacter(c) { try { localStorage.setItem(STORE_KEY, JSON.stringify(c)); } catch (e) {} }

export class CharacterCreator {
  constructor({ onEmbark = null, onClose = null, seed = 1 } = {}) {
    this.onEmbark = onEmbark; this.onClose = onClose;
    this.open = false; this.raf = null; this.phase = 0;
    // working draft
    this.seed = (seed >>> 0) || 1;
    this.spriteSeed = mix(this.seed, 1);
    this.vocation = null;                          // null until rolled/picked
    this.triad = null;                            // weights; null ⇒ derive from vocation
    this.chars = null;                            // characteristics
    this._build();
    this._reroll(true);
  }

  _build() {
    const root = document.createElement('div'); this.root = root;
    root.id = 'char'; root.style.cssText = 'position:fixed;inset:0;z-index:40;display:none;overflow:auto;background:radial-gradient(120% 120% at 50% 30%,rgba(8,11,16,.96),rgba(3,4,7,.99));font-family:"JetBrains Mono",ui-monospace,monospace;color:#dfe7e2;';
    root.innerHTML = `
      <button id="chclose" style="position:absolute;top:10px;right:14px;background:none;border:0;color:#6b7872;font:inherit;font-size:12px;cursor:pointer;z-index:2">close ⏎</button>
      <div style="max-width:980px;margin:0 auto;padding:34px 18px 60px;">
        <div style="text-align:center;margin-bottom:18px">
          <div style="font-size:13px;color:#7fd8d0;letter-spacing:1px">CHARACTER · roll up a crew-soul</div>
          <div style="font-size:10.5px;color:#6b7872;margin-top:3px">class mirrors the civic tree · everyone is a little bit robot</div>
        </div>
        <div style="display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start">
          <!-- LEFT: sprite + identity -->
          <div style="flex:1 1 240px;min-width:230px;text-align:center">
            <canvas id="chsprite" width="220" height="220" style="width:200px;height:200px;image-rendering:pixelated;background:radial-gradient(circle at 50% 42%,#0c1118,#06080c);border:1px solid #1b2530;border-radius:14px"></canvas>
            <div id="chname" style="font-size:17px;font-weight:600;color:#f4bf62;margin-top:10px"></div>
            <div id="chcast" style="font-size:11px;color:#9aa8a0;margin-top:2px"></div>
            <div style="display:flex;gap:6px;justify-content:center;margin-top:11px;flex-wrap:wrap">
              <button class="chbtn" id="chrerollAll">⟳ reroll all</button>
              <button class="chbtn" id="chrerollSprite">⟳ body</button>
              <button class="chbtn" id="chrerollName">⟳ name</button>
              <button class="chbtn" id="chrerollQuirks">⟳ quirks</button>
            </div>
          </div>
          <!-- MIDDLE: vocation (the civic tree) -->
          <div style="flex:1 1 250px;min-width:240px">
            <div class="chh">VOCATION <span style="color:#6b7872">· the civic tree</span></div>
            <div id="chvocs" style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:8px"></div>
            <div id="chvocgloss" style="font-size:10.5px;color:#9aa8a0;margin-top:8px;min-height:28px;line-height:1.45"></div>
          </div>
          <!-- RIGHT: triad + attrs + combat -->
          <div style="flex:1 1 250px;min-width:240px">
            <div class="chh">BLEND <span style="color:#6b7872">· flesh · chassis · anima</span></div>
            <div id="chtriad" style="margin-top:8px"></div>
            <div class="chh" style="margin-top:14px">ATTRIBUTES</div>
            <div id="chattrs" style="margin-top:7px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px 12px"></div>
            <div class="chh" style="margin-top:14px">IN A FIGHT</div>
            <div id="chcombat" style="margin-top:6px;font-size:11px;color:#cfd8d2"></div>
            <div class="chh" style="margin-top:14px">CHARACTERISTICS</div>
            <div id="chquirks" style="margin-top:6px"></div>
            <button id="chembark" style="margin-top:18px;width:100%;background:#11331f;border:1px solid #2f7a4a;color:#bfe9cf;font:inherit;font-size:13px;padding:10px;border-radius:9px;cursor:pointer">embark →</button>
          </div>
        </div>
      </div>
      <style>
        #char .chbtn{background:#0f141a;border:1px solid #20303a;color:#dfe7e2;font:inherit;font-size:11px;padding:4px 9px;border-radius:7px;cursor:pointer}
        #char .chbtn:hover{border-color:#7fd8d0;color:#fff}
        #char .chh{font-size:11px;color:#7fd8d0;letter-spacing:.6px;border-bottom:1px solid #1b2530;padding-bottom:4px}
        #char .voc{text-align:left;background:#0d1117;border:1px solid #1b2530;color:#cfd8d2;font:inherit;font-size:11px;padding:5px 7px;border-radius:7px;cursor:pointer;display:flex;align-items:center;gap:6px}
        #char .voc:hover{border-color:#7fd8d0}
        #char .voc.on{border-color:#f4bf62;color:#fff;background:#161d12}
        #char input[type=range]{width:100%;accent-color:#7fd8d0}
      </style>`;
    document.body.appendChild(root);
    this.cv = root.querySelector('#chsprite'); this.ctx = this.cv.getContext('2d');
    root.querySelector('#chclose').addEventListener('click', () => this.close());
    root.querySelector('#chrerollAll').addEventListener('click', () => this._reroll(true));
    root.querySelector('#chrerollSprite').addEventListener('click', () => { this.spriteSeed = mix(this.spriteSeed, 7) ^ Date.now(); this._sync(); });
    root.querySelector('#chrerollName').addEventListener('click', () => { this.seed = (mix(this.seed, 31) ^ Date.now()) >>> 0; this._sync(); });
    root.querySelector('#chrerollQuirks').addEventListener('click', () => { this.chars = rollCharacteristics((mix(this.seed, 53) ^ Date.now()) >>> 0, 2); this._sync(); });
    root.querySelector('#chembark').addEventListener('click', () => this._embark());
    this._buildVocations();
    this._buildTriad();
    this._keyh = (e) => { if (!this.open) return; if (e.key === 'Escape') { this.close(); e.preventDefault(); } };
    addEventListener('keydown', this._keyh);
  }

  _buildVocations() {
    const host = this.root.querySelector('#chvocs');
    host.innerHTML = VOCATION_ORDER.map((v) => {
      const R = ROLES[v] || { glyph: '·', color: '#888' };
      return `<button class="voc" data-voc="${v}"><span style="color:${R.color};font-size:13px">${R.glyph}</span><span>${v}<span style="color:#6b7872"> · ${esc(VOCATIONS[v].tag)}</span></span></button>`;
    }).join('');
    host.querySelectorAll('[data-voc]').forEach((b) => b.addEventListener('click', () => {
      this.vocation = b.dataset.voc;
      this.triad = rollTriad(this.seed, this.vocation);     // picking a vocation re-leans the blend
      this._sync();
    }));
  }

  _buildTriad() {
    const host = this.root.querySelector('#chtriad');
    host.innerHTML = TRIAD_ORDER.map((d) => {
      const T = TRIAD[d];
      return `<div style="margin-bottom:7px">
        <div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:${T.accent}">${T.glyph} ${T.label}</span><span id="chtv-${d}" style="color:#9aa8a0"></span></div>
        <input type="range" min="0" max="100" data-tri="${d}">
      </div>`;
    }).join('');
    host.querySelectorAll('[data-tri]').forEach((s) => s.addEventListener('input', () => {
      const w = {}; host.querySelectorAll('[data-tri]').forEach((x) => w[x.dataset.tri] = +x.value || 0);
      if (TRIAD_ORDER.every((d) => (w[d] || 0) === 0)) w[s.dataset.tri] = 1;
      this.triad = normTriad(w);
      this._syncReadout();                                  // live, no full rebuild (keeps slider focus)
    }));
  }

  _reroll(all) {
    this.seed = all ? ((this.seed * 1664525 + 1013904223) >>> 0 || 1) : this.seed;
    this.spriteSeed = mix(this.seed, 1);
    if (all || !this.vocation) { const c = rollCharacter(this.seed, {}); this.vocation = c.vocation; this.triad = c.triad; this.chars = c.characteristics; }
    this._sync();
  }

  // build the live character from the working draft
  _draft() {
    const triad = this.triad || rollTriad(this.seed, this.vocation || 'dwell');
    return rollCharacter(this.seed, {
      vocation: this.vocation || 'dwell', triad, characteristics: this.chars || rollCharacteristics(this.seed, 2),
      sprite: { seed: `mega:char:${this.spriteSeed}`, role: this.vocation || 'dwell', arch: 'balanced', size: 17 },
    });
  }

  _sync() {                                                 // full refresh (selection, sliders, readouts, sprite)
    const c = this._draft(); this._c = c;
    // vocation highlight + gloss
    this.root.querySelectorAll('[data-voc]').forEach((b) => b.classList.toggle('on', b.dataset.voc === c.vocation));
    this.root.querySelector('#chvocgloss').innerHTML = `<b style="color:#cfd8d2">${esc(c.vocTag)}</b> — ${esc(VOCATIONS[c.vocation].gloss)}. <span style="color:#6b7872">starting kit leans <b style="color:#f4bf62">${esc(c.kit)}</b>.</span>`;
    // sliders to current triad
    TRIAD_ORDER.forEach((d) => { const s = this.root.querySelector(`[data-tri="${d}"]`); if (s) s.value = Math.round(c.triad[d] * 100); });
    this._syncReadout();
    this._drawSprite();
  }

  _syncReadout() {                                          // recompute cast/attrs/combat from sliders+state
    const triad = this.triad || (this._c && this._c.triad);
    const cast = castOf(triad);
    const attrs = applyCharacteristics(deriveAttrs(triad, 10, this.seed), this.chars);
    const name = (this._c && this._c.name) || '—';
    this.root.querySelector('#chname').textContent = name;
    this.root.querySelector('#chcast').innerHTML = `<b style="color:#cfd8d2">${esc(cast.label)}</b> · ${esc(this.vocation || '')} — <span style="color:#6b7872">${esc(cast.gloss)}</span>`;
    TRIAD_ORDER.forEach((d) => { const el = this.root.querySelector(`#chtv-${d}`); if (el) el.textContent = Math.round(triad[d] * 100) + '%'; });
    // attributes grouped by domain colour
    this.root.querySelector('#chattrs').innerHTML = ATTR_ORDER.map((k) => {
      const A = ATTRS[k], T = TRIAD[A.domain];
      return `<div title="${esc(A.gloss)}" style="font-size:10.5px;color:#9aa8a0;display:flex;justify-content:space-between;gap:4px"><span style="color:${T.accent}">${A.glyph} ${A.label}</span><b style="color:#dfe7e2">${attrs[k]}</b></div>`;
    }).join('');
    // combat preview (unarmed baseline)
    const cm = deriveCombat({ attrs, power: 10 });
    this.root.querySelector('#chcombat').innerHTML =
      `<span title="hit points">✚ ${cm.hp} HP</span> · <span title="attack">⚔ ${cm.atk} atk</span> · <span title="defense">⛨ ${cm.def} def</span> · <span title="speed">↯ ${cm.speed}×</span> · <span title="accuracy">◎ ${Math.round(cm.accuracy * 100)}%</span> · <span title="crit">✦ ${Math.round(cm.crit * 100)}%</span> · <span title="flux pool">✣ ${cm.fluxPool}</span>`;
    // quirks
    this.root.querySelector('#chquirks').innerHTML = (this.chars || []).map((q) => {
      const T = TRIAD[q.domain];
      const mods = Object.entries(q.mods).map(([k, v]) => `<span style="color:${v > 0 ? '#5aa845' : '#cf5b5b'}">${v > 0 ? '+' : ''}${v} ${k}</span>`).join(' ');
      return `<div style="font-size:10.5px;margin-bottom:5px;line-height:1.4"><b style="color:${T.accent}">${esc(q.label)}</b> — <span style="color:#9aa8a0">${esc(q.gloss)}</span> <span style="color:#6b7872">(${mods})</span></div>`;
    }).join('');
  }

  _drawSprite() {
    try {
      const c = this._c, dom = c.cast.dominant, accent = TRIAD[dom].accent;
      // profession-coloured per the style guide; the technomagic aura carries the dominant domain
      this._spriteGenome = crewSprite(c.sprite.seed, c.vocation, { arch: c.sprite.arch, size: c.sprite.size });
      this._spriteAccent = accent;
    } catch (e) { this._spriteGenome = null; }
  }

  _renderSpriteFrame() {
    const ctx = this.ctx, g = this._spriteGenome; if (!g) return;
    const W = this.cv.width, H = this.cv.height;
    ctx.clearRect(0, 0, W, H);
    // technomagic aura: a soft ring in the dominant domain's colour
    const cx = W / 2, cy = H * 0.46;
    ctx.save(); ctx.globalAlpha = 0.16 + 0.06 * Math.sin(this.phase * 0.12); ctx.fillStyle = this._spriteAccent || '#7fd8d0';
    ctx.beginPath(); ctx.arc(cx, cy, W * 0.30, 0, 7); ctx.fill(); ctx.restore();
    // the sprite, walking gently
    ctx.imageSmoothingEnabled = false;
    const S = Math.floor((W * 0.62) / g.size), ox = Math.round(cx - g.size * S / 2), oy = Math.round(cy - g.size * S * 0.46);
    const frame = Math.floor(this.phase / 9) % (g.opts.frames || 4);
    for (const r of frameRects(g, DIR_OF.S, frame)) { ctx.fillStyle = r.c; ctx.fillRect(ox + r.x * S, oy + r.y * S, S, S); }
  }

  toggle() { this.open ? this.close() : this.show(); }
  show() {
    this.open = true; this.root.style.display = 'block';
    if (!this._c) this._sync();
    const loop = () => { if (!this.open) return; this.phase++; this._renderSpriteFrame(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  close() { this.open = false; this.root.style.display = 'none'; if (this.raf) cancelAnimationFrame(this.raf), this.raf = null; if (this.onClose) this.onClose(); }

  _embark() {
    const c = this._draft();
    saveCharacter(c);
    this.close();
    if (this.onEmbark) this.onEmbark(c);
  }
}

export default CharacterCreator;
