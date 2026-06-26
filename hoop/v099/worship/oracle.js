// worship/oracle.js — the WORSHIP room's principal fixture UI: THE ORACLE.
//
// A self-contained overlay (builds its own DOM + scoped CSS on first open). The player picks a rite and
// performs the FULL tactile ritual — the yarrow-stalk division (yarrow.js) or geomancy stabbed in sand
// (sand.js) — reads the omen, and (signed in) RELEASES it as an entropic rumor to their own repo.
//
// Host contract: open({ world, signedIn, publishRumor, toast }).

import { yijingFromLines, geomancyFromShield, divinationRumor } from './oracle-cast.js';
import { createYarrow } from './yarrow.js';
import { createSand } from './sand.js';

let root = null, body = null, ctx = null, open = false;
let system = 'yijing', ritual = null, reading = null;

const RITES = {
  yijing: { glyph: '☯', label: 'the Yijing', note: 'fifty stalks, divided by hand' },
  geomancy: { glyph: '🜨', label: 'geomancy', note: 'sixteen lines, stabbed in sand' },
};

function ensureDom() {
  if (root) return;
  const css = document.createElement('style');
  css.textContent = `
  .orc-ov{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(6,8,14,.74);backdrop-filter:blur(3px);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  .orc-ov.on{display:flex}
  .orc-card{width:min(580px,95vw);max-height:94vh;overflow:auto;background:linear-gradient(180deg,#12131d,#0c0d15);border:1px solid #3a3766;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6);padding:18px 20px;color:#e8e6f2}
  .orc-head{display:flex;align-items:baseline;gap:10px;margin-bottom:4px}
  .orc-head b{font-size:17px;letter-spacing:.12em;color:#b6a8f0}
  .orc-kick{color:#8a7fd8;letter-spacing:.22em;font-size:11px;text-transform:uppercase}
  .orc-close{margin-left:auto;cursor:pointer;color:#8a86a8;border:1px solid #34324e;border-radius:7px;padding:4px 9px;font:inherit;background:none}
  .orc-close:hover{color:#e8e6f2;border-color:#5a567e}
  .orc-rites{display:flex;gap:8px;margin:12px 0 8px}
  .orc-rite{flex:1;cursor:pointer;border:1px solid #34324e;background:rgba(138,127,216,.06);border-radius:9px;padding:8px;text-align:center;color:#cfc9e6}
  .orc-rite .g{font-size:20px;display:block;margin-bottom:2px}
  .orc-rite.sel{border-color:#8a7fd8;background:rgba(138,127,216,.18);color:#fff}
  .orc-rite small{display:block;color:#8a86a8;font-size:11px;margin-top:2px}
  .orc-canvas{width:100%;height:300px;display:block;border-radius:10px;background:#0a0b12;touch-action:none;cursor:pointer}
  .orc-sand{position:relative;width:100%;height:300px;border-radius:10px;overflow:hidden;background:#0a0b12}
  .orc-sand canvas{position:absolute;inset:0;width:100%;height:100%}
  .orc-sand [data-soil]{cursor:crosshair;touch-action:none}
  .orc-sand [data-overlay]{pointer-events:none}
  .orc-status{color:#9c97c0;font-size:12.5px;margin:9px 2px;min-height:18px}
  .orc-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
  .orc-btn{cursor:pointer;border:1px solid #5a567e;background:rgba(138,127,216,.14);color:#cfc9e6;border-radius:8px;padding:9px 15px;font:inherit;font-size:13px}
  .orc-btn:hover{border-color:#8a7fd8;color:#fff}
  .orc-btn.primary{background:rgba(244,191,98,.14);border-color:#d8b25a;color:#f4bf62}
  .orc-btn:disabled{opacity:.45;cursor:default}
  .orc-omen{margin:12px 0 4px;padding:14px 15px;border:1px solid #2c2a44;border-radius:10px;background:#0a0b12}
  .orc-omen .figure{font-size:16px;color:#d8b25a;margin-bottom:6px}
  .orc-omen .prose{color:#cfc9e6}
  .orc-omen .meta{color:#7d79a0;font-size:12px;margin-top:8px}
  .orc-foot{color:#6e6a90;font-size:11px;margin-top:12px;text-align:center}`;
  document.head.appendChild(css);
  root = document.createElement('div');
  root.className = 'orc-ov';
  root.innerHTML = `<div class="orc-card" role="dialog" aria-label="The Oracle">
    <div class="orc-head"><span class="orc-kick">worship · the oracle</span><b>☯ consult the oracle</b><button class="orc-close" data-orc-close>close ⏎</button></div>
    <div class="orc-rites" data-orc-rites></div>
    <div class="orc-body" data-orc-body></div>
    <div class="orc-foot">the rite is performed by hand; what you release is spread to the ship as a rumor</div>
  </div>`;
  document.body.appendChild(root);
  body = root.querySelector('[data-orc-body]');
  const rites = root.querySelector('[data-orc-rites]');
  rites.innerHTML = Object.keys(RITES).map((s) => `<div class="orc-rite" data-rite="${s}"><span class="g">${RITES[s].glyph}</span>${RITES[s].label}<small>${RITES[s].note}</small></div>`).join('');
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-orc-close]') || e.target === root) return close();
    const rite = e.target.closest('[data-rite]');
    if (rite) { selectRite(rite.getAttribute('data-rite')); return; }
    const act = e.target.closest('[data-act]');
    if (act) return handleAct(act.getAttribute('data-act'), act);
  });
  document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { e.preventDefault(); close(); } });
}

function stopRitual() { if (ritual && ritual.stop) { try { ritual.stop(); } catch (_) {} } ritual = null; }

function selectRite(sys) {
  system = sys; reading = null;
  stopRitual();
  root.querySelectorAll('[data-rite]').forEach((el) => el.classList.toggle('sel', el.getAttribute('data-rite') === sys));
  if (sys === 'yijing') buildYarrow(); else buildSand();
}

// ── YIJING — the yarrow division ──
function buildYarrow() {
  body.innerHTML = `<canvas class="orc-canvas" data-yc></canvas><div class="orc-status" data-status></div>`
    + `<div class="orc-acts"><button class="orc-btn primary" data-act="yact">divide the stalks</button><button class="orc-btn" data-act="yreset">↻ fresh bundle</button></div>`
    + `<div data-omen></div>`;
  const canvas = body.querySelector('[data-yc]');
  ritual = createYarrow({
    canvas,
    onStatus: ({ text, label, busy }) => {
      setStatus(text);
      const b = body.querySelector('[data-act="yact"]');
      if (b) { if (label) { b.textContent = label; b.disabled = false; } else { b.textContent = busy ? 'counting…' : 'cast'; b.disabled = true; } }
    },
    onComplete: (lines) => { reading = yijingFromLines(lines); renderOmen(); },
  });
  ritual.start();
}

// ── GEOMANCY — stabbed in sand ──
function buildSand() {
  body.innerHTML = `<div class="orc-sand"><canvas data-soil></canvas><canvas data-overlay></canvas></div><div class="orc-status" data-status></div>`
    + `<div class="orc-acts"><button class="orc-btn primary" data-act="sread">read the cast</button><button class="orc-btn" data-act="sfresh">↻ fresh sand</button><button class="orc-btn" data-act="squick">⚡ a quick hand</button></div>`
    + `<div data-omen></div>`;
  const soil = body.querySelector('[data-soil]'), overlay = body.querySelector('[data-overlay]');
  ritual = createSand({
    soil, overlay,
    onStatus: ({ text }) => setStatus(text),
    onCast: (S) => { reading = geomancyFromShield(S); renderOmen(); },
  });
  ritual.start();
}

function handleAct(which, btn) {
  if (!ritual) return;
  if (which === 'yact') ritual.act();
  else if (which === 'yreset') { reading = null; clearOmen(); ritual.reset(); }
  else if (which === 'sread') ritual.submit();
  else if (which === 'sfresh') { reading = null; clearOmen(); ritual.reset(); }
  else if (which === 'squick') ritual.randomCast();
  else if (which === 'release') release(btn);
}

function setStatus(t) { const el = body.querySelector('[data-status]'); if (el) el.textContent = t || ''; }
function clearOmen() { const el = body.querySelector('[data-omen]'); if (el) el.innerHTML = ''; }

function renderOmen() {
  const el = body.querySelector('[data-omen]'); if (!el || !reading) return;
  const p = reading.profile, signedIn = !!(ctx && ctx.signedIn);
  const figure = system === 'yijing'
    ? `䷀ ${esc(p.name.en)} · ${esc(p.name.zh)} ${esc(p.name.py)}`
    : `🜨 ${esc(p.judge)}${p.latin ? ` · ${esc(p.latin)}` : ''}`;
  const meta = system === 'yijing'
    ? `${esc(p.trigrams.below)} below · ${esc(p.trigrams.above)} above${p.moving.length ? ` · moving ${p.moving.join(',')}${p.changesToName ? ` → ${esc(p.changesToName)}` : ''}` : ' · still'}`
    : `${p.planet ? esc(p.planet) : ''}${p.zodiac ? ` · ${esc(p.zodiac)}` : ''}${p.nature ? ` · ${esc(p.nature)}` : ''} · witnesses ${esc(p.witnesses.join(' & '))}`;
  const releaseBtn = signedIn
    ? `<button class="orc-btn primary" data-act="release" style="margin-top:10px">☷ release the omen</button>`
    : `<button class="orc-btn" disabled title="sign in to release omens to the ship" style="margin-top:10px">☷ sign in to release</button>`;
  el.innerHTML = `<div class="orc-omen"><div class="figure">${figure}</div><div class="prose">${esc(reading.omen)}</div><div class="meta">${meta}</div></div>${releaseBtn}`;
}

async function release(btn) {
  if (!reading) return;
  btn.disabled = true; btn.textContent = '◌ releasing…';
  const rumor = divinationRumor((ctx && ctx.world) || '0', { ...reading, seed: `${(ctx && ctx.world) || '0'}:${system}:${(reading.profile.lines || reading.profile.judge || '')}` });
  let okFlag = false;
  try { okFlag = await (ctx && ctx.publishRumor ? ctx.publishRumor(rumor) : false); } catch (e) { okFlag = false; }
  btn.textContent = okFlag ? '✦ omen released' : '✕ not released';
  if (okFlag && ctx && ctx.toast) ctx.toast('☷ your omen is loose on the ship', 2400);
  if (!okFlag) btn.disabled = false;
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export function openOracle(opts) {
  ctx = opts || {};
  ensureDom();
  reading = null;
  open = true; root.classList.add('on');
  selectRite(system);   // (re)build the current rite fresh
}
export function closeOracle() { if (root) root.classList.remove('on'); open = false; stopRitual(); }
const close = closeOracle;
export function oracleOpen() { return open; }
