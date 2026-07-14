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
import { PLANETS, READING_ORDER, matchups } from './planets.js';
import { ROLES, frameRects, DIR_OF } from './v3/sprite-core.js';
import { crewSprite } from './crew.js';

// v104 unified language — creation picks a VERB × a PLANET (NOT a faction: faction is the main-quest fork
// you choose at Sevin's threshold, so it must not be pre-spent here). The VERB is your vocation — it sets
// your BODY (its own triad lean's dominant domain), your kit, your civic role. The PLANET is your flavor
// register (metal/colour/temperament/combat-matchup). Body × planet = the 21 identity flavors, reached
// through the verb. The verbs group under the three bodies exactly as planets.js derives the factions from
// them, so the two layers stay consistent without committing an allegiance.
const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const bodyOfLean = (lean) => TRIAD_ORDER.slice().sort((a, b) => (lean[b] || 0) - (lean[a] || 0))[0];
const bodyOfVocation = (v) => bodyOfLean((VOCATIONS[v] || {}).lean || {});
const identityName = (v, p) => 'The ' + ((PLANETS[p] || {}).adj || '') + ' ' + capital((VOCATIONS[v] || {}).tag || v);
// the 13 verbs bucketed under the body their lean lands in (flesh: dwell/grow/serve/heal/move; chassis:
// make/mend/store; anima: trade/play/learn/worship/govern) — the picker's three columns.
const VERBS_BY_BODY = (() => { const g = { flesh: [], chassis: [], anima: [] }; for (const v of VOCATION_ORDER) g[bodyOfVocation(v)].push(v); return g; })();

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
    this.mustEmbark = false;                       // forced mode: no close, embark required (a brand-new game)
    this._afterEmbark = null;                      // one-shot continuation fired after a forced embark
    // working draft
    this.seed = (seed >>> 0) || 1;
    this.spriteSeed = mix(this.seed, 1);
    this.vocation = null;                          // the VERB — your body/kit/role; null until rolled/picked
    this.planet = null;                            // the FLAVOR register; null until rolled/picked
    this.triad = null;                            // weights; null ⇒ the vocation's own lean (faction is NOT set here)
    this.chars = null;                            // characteristics
    this.charName = null;                          // PLAYER-OWNED name (string); null ⇒ use the rolled name
    this._build();
    this._reroll(true);
  }

  _build() {
    const root = document.createElement('div'); this.root = root;
    root.id = 'char'; root.style.cssText = 'position:fixed;inset:0;z-index:40;display:none;overflow:auto;background:radial-gradient(120% 120% at 50% 30%,rgba(8,11,16,.96),rgba(3,4,7,.99));font-family:"JetBrains Mono",ui-monospace,monospace;color:#dfe7e2;';
    root.innerHTML = `
      <button id="chclose" style="position:absolute;top:10px;right:14px;background:none;border:0;color:#6b7872;font:inherit;font-size:12px;cursor:pointer;z-index:2">close ⏎</button>
      <div style="max-width:720px;margin:0 auto;padding:30px 18px 60px;">
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:13px;color:#7fd8d0;letter-spacing:1px">CHARACTER · roll up a crew-soul</div>
          <div style="font-size:10.5px;color:#6b7872;margin-top:3px">class mirrors the civic tree · everyone is a little bit robot</div>
        </div>
        <!-- the SPRITE is a FLOATED element: the name, rerolls, vocation and stats all work their way around it -->
        <div class="chflow">
          <canvas id="chsprite" width="220" height="220" class="chsprite"></canvas>
          <div class="chrow" style="margin-bottom:5px">
            <input id="chnameinput" type="text" maxlength="28" placeholder="name your character" autocomplete="off" spellcheck="false"
              style="flex:1;min-width:130px;background:#0c1118;border:1px solid #2c3c47;color:#f4bf62;font:inherit;font-size:16px;font-weight:600;padding:8px 10px;border-radius:9px;outline:none">
            <button class="chbtn" id="chrerollName" title="suggest a name">⟳</button>
          </div>
          <div id="chnamewarn" style="font-size:10.5px;color:#e08a8a;height:13px"></div>
          <div id="chcast" style="font-size:11px;color:#9aa8a0;margin-top:1px"></div>
          <div class="chrow" style="margin:11px 0 16px">
            <button class="chbtn" id="chrerollAll">⟳ reroll all</button>
            <button class="chbtn" id="chrerollSprite">⟳ body</button>
            <button class="chbtn" id="chrerollQuirks">⟳ quirks</button>
          </div>
          <div class="chh">VOCATION <span style="color:#6b7872">· what you do aboard · sets your body</span></div>
          <div id="chvocs" style="margin-top:9px"></div>
          <div class="chh" style="margin-top:14px">REGISTER <span style="color:#6b7872">· planetary flavor · one of seven</span></div>
          <div id="chplanets" style="margin-top:9px"></div>
          <div id="chidgloss" style="font-size:10.5px;color:#9aa8a0;margin-top:9px;min-height:30px;line-height:1.45"></div>
          <div class="chh" style="margin-top:16px">BLEND <span style="color:#6b7872">· fine-tune the body</span></div>
          <div id="chtriad" style="margin-top:8px"></div>
          <div class="chh" style="margin-top:16px">ATTRIBUTES</div>
          <div id="chattrs" style="margin-top:7px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px 12px"></div>
          <div class="chh" style="margin-top:16px">IN A FIGHT</div>
          <div id="chcombat" style="margin-top:6px;font-size:11px;color:#cfd8d2"></div>
          <div class="chh" style="margin-top:16px">CHARACTERISTICS</div>
          <div id="chquirks" style="margin-top:6px"></div>
        </div>
        <button id="chembark" style="margin:24px auto 0;display:block;width:100%;max-width:420px;background:#11331f;border:1px solid #2f7a4a;color:#bfe9cf;font:inherit;font-size:13px;padding:11px;border-radius:9px;cursor:pointer">embark →</button>
      </div>
      <style>
        #char .chbtn{background:#0f141a;border:1px solid #20303a;color:#dfe7e2;font:inherit;font-size:11px;padding:4px 9px;border-radius:7px;cursor:pointer}
        #char .chbtn:hover{border-color:#7fd8d0;color:#fff}
        #char .chh{font-size:11px;color:#7fd8d0;letter-spacing:.6px;border-bottom:1px solid #1b2530;padding-bottom:4px}
        #char .chflow::after{content:"";display:block;clear:both}   /* contain the float so the embark button sits below */
        #char .chsprite{float:left;width:172px;height:172px;image-rendering:pixelated;background:radial-gradient(circle at 50% 42%,#0c1118,#06080c);border:1px solid #1b2530;border-radius:14px;margin:2px 20px 12px 0}
        #char .chrow{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
        @media (max-width:560px){ #char .chsprite{width:118px;height:118px;margin:2px 14px 10px 0} }
        #char #chvocs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
        #char .vocgrp{min-width:0}
        #char .vocgh{font-size:9.5px;letter-spacing:.1em;padding-bottom:3px;border-bottom:1px solid #1b2530;margin-bottom:5px}
        #char .voc{display:flex;align-items:center;gap:5px;width:100%;text-align:left;background:#0d1117;border:1px solid #1b2530;color:#cfd8d2;font:inherit;font-size:10.5px;padding:4px 6px;border-radius:6px;cursor:pointer;margin-bottom:4px;transition:border-color .1s}
        #char .voc .vg{font-size:12px;color:var(--bc)}
        #char .voc:hover{border-color:var(--bc)}
        #char .voc.on{border-color:#f4bf62;background:#161d12;color:#fff;box-shadow:0 0 0 1px #f4bf62}
        #char #chplanets{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
        #char .pcell{aspect-ratio:1;min-height:0;background:#0d1117;border:1px solid #1b2530;color:var(--pc);font-size:16px;border-radius:7px;cursor:pointer;position:relative;transition:transform .1s,border-color .1s}
        #char .pcell::before{content:"";position:absolute;inset:0;border-radius:7px;background:var(--pc);opacity:.1}
        #char .pcell:hover{border-color:var(--pc);transform:translateY(-1px)}
        #char .pcell.on{border-color:#f4bf62;box-shadow:0 0 0 1px #f4bf62}
        #char .pcell.on::before{opacity:.24}
        #char #chnameinput:focus{border-color:#7fd8d0}
        #char input[type=range]{width:100%;accent-color:#7fd8d0}
      </style>`;
    document.body.appendChild(root);
    this.cv = root.querySelector('#chsprite'); this.ctx = this.cv.getContext('2d');
    root.querySelector('#chclose').addEventListener('click', () => this.close());
    root.querySelector('#chrerollAll').addEventListener('click', () => this._reroll(true));
    root.querySelector('#chrerollSprite').addEventListener('click', () => { this.spriteSeed = mix(this.spriteSeed, 7) ^ Date.now(); this._sync(); });
    // ⟳ name SUGGESTS a fresh name (into the editable field) without disturbing the rolled stats/sprite
    root.querySelector('#chrerollName').addEventListener('click', () => { this.charName = this._rollName(); this._setNameInput(this.charName); this._clearNameWarn(); });
    root.querySelector('#chrerollQuirks').addEventListener('click', () => { this.chars = rollCharacteristics((mix(this.seed, 53) ^ Date.now()) >>> 0, 2); this._sync(); });
    root.querySelector('#chembark').addEventListener('click', () => this._embark());
    // the name is PLAYER-OWNED: typing sets it directly (no seed reroll), and it's required to embark
    const nameInput = root.querySelector('#chnameinput');
    nameInput.addEventListener('input', () => { this.charName = nameInput.value; this._clearNameWarn(); });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this._embark(); } e.stopPropagation(); });
    this._buildIdentity();
    this._buildTriad();
    this._keyh = (e) => { if (!this.open) return; if (e.key === 'Escape' && !this.mustEmbark) { this.close(); e.preventDefault(); } };
    addEventListener('keydown', this._keyh);
  }

  _buildIdentity() {
    // VOCATION picker — the 13 verbs in three body columns (flesh · chassis · anima).
    const vhost = this.root.querySelector('#chvocs');
    vhost.innerHTML = TRIAD_ORDER.map((body) => {
      const T = TRIAD[body];
      const verbs = (VERBS_BY_BODY[body] || []).map((v) => {
        const R = ROLES[v] || { glyph: '·' };
        return `<button class="voc" data-voc="${v}" title="${esc(VOCATIONS[v].tag)} — ${esc(VOCATIONS[v].gloss)}" style="--bc:${T.accent}"><span class="vg">${R.glyph}</span><span>${esc(v)}</span></button>`;
      }).join('');
      return `<div class="vocgrp"><div class="vocgh" style="color:${T.accent}">${T.glyph} ${T.label.toUpperCase()}</div>${verbs}</div>`;
    }).join('');
    vhost.querySelectorAll('.voc').forEach((b) => b.addEventListener('click', () => {
      this.vocation = b.dataset.voc;
      this.triad = normTriad({ ...(VOCATIONS[this.vocation].lean) });   // your verb sets the body (still tunable below)
      this._sync();
    }));
    // REGISTER picker — the seven planets (flavor only; no body commitment).
    const phost = this.root.querySelector('#chplanets');
    phost.innerHTML = READING_ORDER.map((p) => {
      const P = PLANETS[p];
      return `<button class="pcell" data-p="${p}" title="${esc(P.adj)} · ${esc(P.metal)}" style="--pc:${P.colour}">${P.glyph}</button>`;
    }).join('');
    phost.querySelectorAll('.pcell').forEach((b) => b.addEventListener('click', () => { this.planet = b.dataset.p; this._sync(); }));
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
    if (all || !this.vocation) {
      this.vocation = VOCATION_ORDER[this.seed % VOCATION_ORDER.length];
      this.planet = READING_ORDER[(this.seed >>> 4) % READING_ORDER.length];
      this.triad = normTriad({ ...(VOCATIONS[this.vocation].lean) });
      this.chars = rollCharacteristics(this.seed, 2);
    }
    if (all) this.charName = null;                 // a fresh person → a fresh suggested name
    this._sync();
    if (this.charName == null && this._c) { this.charName = this._c.name; this._setNameInput(this._c.name); this._clearNameWarn(); }
  }
  _rollName() { try { return rollCharacter((mix(this.seed, 31) ^ Date.now()) >>> 0, { vocation: this.vocation || 'dwell' }).name; } catch (e) { return ''; } }
  _setNameInput(v) { const i = this.root && this.root.querySelector('#chnameinput'); if (i && document.activeElement !== i) i.value = v == null ? '' : v; }
  _nameWarn(m) { const w = this.root && this.root.querySelector('#chnamewarn'); if (w) w.textContent = m || ''; }
  _clearNameWarn() { this._nameWarn(''); }

  // build the live character from the working draft
  _draft() {
    const vocation = this.vocation || 'dwell', planet = this.planet || 'venus';
    const triad = this.triad || normTriad({ ...(VOCATIONS[vocation].lean) });
    const c = rollCharacter(this.seed, {
      vocation, triad, characteristics: this.chars || rollCharacteristics(this.seed, 2),
      sprite: { seed: `mega:char:${this.spriteSeed}`, role: vocation, arch: 'balanced', size: 17 },
    });
    // stamp the unified-language tags: BODY from the verb, FLAVOR from the planet. Faction is NOT set here —
    // it's the main-quest fork (chosen at Sevin's threshold), so a fresh character carries no allegiance yet.
    const P = PLANETS[planet], body = bodyOfVocation(vocation);
    if (P) { c.planet = planet; c.body = body; c.metal = P.metal; c.planetColour = P.colour; c.glyph = P.glyph; c.identity = identityName(vocation, planet); }
    const nm = this.charName != null ? String(this.charName).trim() : '';   // the player's typed name wins over the rolled one
    if (nm) c.name = nm;
    return c;
  }

  _sync() {                                                 // full refresh (selection, sliders, readouts, sprite)
    const c = this._draft(); this._c = c;
    // highlight the chosen verb + planet, then read the identity out of (body, planet)
    this.root.querySelectorAll('.voc').forEach((b) => b.classList.toggle('on', b.dataset.voc === c.vocation));
    this.root.querySelectorAll('.pcell').forEach((b) => b.classList.toggle('on', b.dataset.p === c.planet));
    const P = PLANETS[c.planet], body = c.body;
    if (P) this.root.querySelector('#chidgloss').innerHTML =
      `<b style="color:${P.colour}">${P.glyph} ${esc(c.identity)}</b> — <b style="color:${TRIAD[body].accent}">${body.toUpperCase()}</b> body · <b>${esc(P.metal)}</b> flavor. `
      + `<span style="color:#6b7872">${esc(VOCATIONS[c.vocation].gloss)}. kit leans <b style="color:#f4bf62">${esc(c.kit)}</b>. `
      + `<span style="color:#59606a">faction — your allegiance — is chosen later, at the threshold.</span></span>`;
    // sliders to current triad
    TRIAD_ORDER.forEach((d) => { const s = this.root.querySelector(`[data-tri="${d}"]`); if (s) s.value = Math.round(c.triad[d] * 100); });
    this._syncReadout();
    this._drawSprite();
  }

  _syncReadout() {                                          // recompute cast/attrs/combat from sliders+state
    const triad = this.triad || (this._c && this._c.triad);
    const cast = castOf(triad);
    const attrs = applyCharacteristics(deriveAttrs(triad, 10, this.seed), this.chars);
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
      // profession-coloured per the style guide; the technomagic aura carries the PLANET flavor (its colour)
      this._spriteGenome = crewSprite(c.sprite.seed, c.vocation, { arch: c.sprite.arch, size: c.sprite.size });
      this._spriteAccent = c.planetColour || accent;
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
    this.root.querySelector('#chclose').style.display = this.mustEmbark ? 'none' : '';   // forced: no escape hatch
    if (!this._c) this._sync();
    const loop = () => { if (!this.open) return; this.phase++; this._renderSpriteFrame(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  // FORCED creation (a brand-new game): can't be dismissed; `after` fires once the player embarks.
  showForced(after) { this.mustEmbark = true; this._afterEmbark = after || null; this.show(); }
  close() { if (this.mustEmbark) return; this.open = false; this.root.style.display = 'none'; if (this.raf) cancelAnimationFrame(this.raf), this.raf = null; if (this.onClose) this.onClose(); }

  _embark() {
    const name = String(this.charName == null ? '' : this.charName).trim();
    if (!name) { this._nameWarn('your character needs a name'); const i = this.root.querySelector('#chnameinput'); if (i) i.focus(); return; }
    this.charName = name;
    const c = this._draft(); c.name = name; c.named = true;
    saveCharacter(c);
    const after = this._afterEmbark; this._afterEmbark = null;
    this.mustEmbark = false;                          // release the forced gate so close() can run
    this.open = false; this.root.style.display = 'none'; if (this.raf) cancelAnimationFrame(this.raf), this.raf = null;
    if (this.onEmbark) this.onEmbark(c);
    if (after) try { after(); } catch (e) {}
  }
}

export default CharacterCreator;
