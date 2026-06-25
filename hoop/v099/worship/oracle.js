// worship/oracle.js — the WORSHIP room's principal fixture UI: THE ORACLE.
//
// A self-contained overlay (builds its own DOM + scoped CSS on first open — additive, never touches the
// game's other modals). The player picks a rite, draws an omen (a fresh seed → a deterministic cast from
// oracle-cast.js), reads it, and — if signed in — RELEASES it as an entropic rumor to their own repo.
//
// Host contract: open({ world, signedIn, publishRumor, toast }).
//   • world        — the world key (ship seed), stamped into the rumor.
//   • signedIn     — bool; gates the "release" button (rumors live in the player's own repo).
//   • publishRumor — async (rumor) → bool; the host's auth/scope/putRumor wrapper.
//   • toast        — (msg, ms) => void; the host's flash-toast.

import { cast, divinationRumor, ORACLE_SYSTEMS } from './oracle-cast.js';

let root = null, body = null, ctx = null, open = false;
let system = 'yijing', reading = null, rolls = 0, nonce = '0';

const RITES = { yijing: { glyph: '☯', label: 'the Yijing', note: 'three coins, six lines' }, geomancy: { glyph: '🜨', label: 'geomancy', note: 'four mothers, one judge' } };

function ensureDom() {
  if (root) return;
  const css = document.createElement('style');
  css.textContent = `
  .orc-ov{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(6,8,14,.74);backdrop-filter:blur(3px);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  .orc-ov.on{display:flex}
  .orc-card{width:min(560px,94vw);max-height:92vh;overflow:auto;background:linear-gradient(180deg,#12131d,#0c0d15);border:1px solid #3a3766;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6);padding:20px 22px;color:#e8e6f2}
  .orc-head{display:flex;align-items:baseline;gap:10px;margin-bottom:4px}
  .orc-head b{font-size:17px;letter-spacing:.12em;color:#b6a8f0}
  .orc-kick{color:#8a7fd8;letter-spacing:.22em;font-size:11px;text-transform:uppercase}
  .orc-close{margin-left:auto;cursor:pointer;color:#8a86a8;border:1px solid #34324e;border-radius:7px;padding:4px 9px;font:inherit;background:none}
  .orc-close:hover{color:#e8e6f2;border-color:#5a567e}
  .orc-rites{display:flex;gap:8px;margin:14px 0 6px}
  .orc-rite{flex:1;cursor:pointer;border:1px solid #34324e;background:rgba(138,127,216,.06);border-radius:9px;padding:9px 8px;text-align:center;color:#cfc9e6}
  .orc-rite .g{font-size:20px;display:block;margin-bottom:2px}
  .orc-rite.sel{border-color:#8a7fd8;background:rgba(138,127,216,.18);color:#fff}
  .orc-rite small{display:block;color:#8a86a8;font-size:11px;margin-top:2px}
  .orc-omen{margin:14px 0;padding:15px 16px;border:1px solid #2c2a44;border-radius:10px;background:#0a0b12;min-height:70px}
  .orc-omen .figure{font-size:16px;color:#d8b25a;margin-bottom:6px}
  .orc-omen .prose{color:#cfc9e6}
  .orc-omen .meta{color:#7d79a0;font-size:12px;margin-top:8px}
  .orc-omen.empty{color:#7d79a0;display:flex;align-items:center;justify-content:center;text-align:center}
  .orc-acts{display:flex;gap:9px;margin-top:6px}
  .orc-btn{cursor:pointer;border:1px solid #5a567e;background:rgba(138,127,216,.14);color:#cfc9e6;border-radius:8px;padding:9px 16px;font:inherit;font-size:13px}
  .orc-btn:hover{border-color:#8a7fd8;color:#fff}
  .orc-btn.primary{background:rgba(244,191,98,.14);border-color:#d8b25a;color:#f4bf62}
  .orc-btn:disabled{opacity:.45;cursor:default}
  .orc-foot{color:#6e6a90;font-size:11px;margin-top:12px;text-align:center}`;
  document.head.appendChild(css);
  root = document.createElement('div');
  root.className = 'orc-ov';
  root.innerHTML = `<div class="orc-card" role="dialog" aria-label="The Oracle">
    <div class="orc-head"><span class="orc-kick">worship · the oracle</span><b>☯ draw an omen</b><button class="orc-close" data-orc-close>close ⏎</button></div>
    <div class="orc-rites" data-orc-rites></div>
    <div class="orc-body" data-orc-body></div>
    <div class="orc-foot">the draw is read from entropy; what you release is spread to the ship as a rumor</div>
  </div>`;
  document.body.appendChild(root);
  body = root.querySelector('[data-orc-body]');
  const rites = root.querySelector('[data-orc-rites]');
  rites.innerHTML = ORACLE_SYSTEMS.map((s) => `<div class="orc-rite" data-rite="${s}"><span class="g">${RITES[s].glyph}</span>${RITES[s].label}<small>${RITES[s].note}</small></div>`).join('');
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-orc-close]') || e.target === root) return close();
    const rite = e.target.closest('[data-rite]');
    if (rite) { system = rite.getAttribute('data-rite'); reading = null; render(); return; }
    if (e.target.closest('[data-draw]')) { drawOmen(); return; }
    if (e.target.closest('[data-release]')) { release(e.target.closest('[data-release]')); return; }
  });
  document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { e.preventDefault(); close(); } });
}

function drawOmen() {
  rolls++;
  const seed = `${(ctx && ctx.world) || '0'}:${system}:${nonce}:${rolls}`;
  reading = cast(system, seed);
  render();
}

async function release(btn) {
  if (!reading) return;
  btn.disabled = true; btn.textContent = '◌ releasing…';
  const rumor = divinationRumor((ctx && ctx.world) || '0', reading);
  let okFlag = false;
  try { okFlag = await (ctx && ctx.publishRumor ? ctx.publishRumor(rumor) : false); } catch (e) { okFlag = false; }
  btn.textContent = okFlag ? '✦ omen released' : '✕ not released';
  if (okFlag && ctx && ctx.toast) ctx.toast('☷ your omen is loose on the ship', 2400);
  if (!okFlag) btn.disabled = false;
}

function render() {
  root.querySelectorAll('[data-rite]').forEach((el) => el.classList.toggle('sel', el.getAttribute('data-rite') === system));
  const signedIn = !!(ctx && ctx.signedIn);
  let omenHtml;
  if (!reading) {
    omenHtml = `<div class="orc-omen empty">the bowl is still — draw to read it</div>`;
  } else {
    const p = reading.profile;
    const figure = system === 'yijing'
      ? `䷀ ${esc(p.name.en)} · ${esc(p.name.zh)} ${esc(p.name.py)}`
      : `🜨 ${esc(p.judge)}${p.latin ? ` · ${esc(p.latin)}` : ''}`;
    const meta = system === 'yijing'
      ? `${esc(p.trigrams.below)} below · ${esc(p.trigrams.above)} above${p.moving.length ? ` · moving ${p.moving.join(',')}${p.changesToName ? ` → ${esc(p.changesToName)}` : ''}` : ' · still'}`
      : `${p.planet ? esc(p.planet) : ''}${p.zodiac ? ` · ${esc(p.zodiac)}` : ''}${p.nature ? ` · ${esc(p.nature)}` : ''} · witnesses ${esc(p.witnesses.join(' & '))}`;
    omenHtml = `<div class="orc-omen"><div class="figure">${figure}</div><div class="prose">${esc(reading.omen)}</div><div class="meta">${meta}</div></div>`;
  }
  const releaseBtn = reading
    ? (signedIn
      ? `<button class="orc-btn primary" data-release>☷ release the omen</button>`
      : `<button class="orc-btn" disabled title="sign in to release omens to the ship">☷ sign in to release</button>`)
    : '';
  body.innerHTML = omenHtml + `<div class="orc-acts"><button class="orc-btn" data-draw>${reading ? '↻ draw again' : '✦ draw an omen'}</button>${releaseBtn}</div>`;
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export function openOracle(opts) {
  ctx = opts || {};
  ensureDom();
  rolls = 0; reading = null;
  nonce = Math.floor((typeof performance !== 'undefined' ? performance.now() : 0) * 1000 % 1e9).toString(36) + (Math.random() * 1e6 | 0).toString(36);
  open = true; root.classList.add('on'); render();
}
export function closeOracle() { if (root) root.classList.remove('on'); open = false; }
const close = closeOracle;
export function oracleOpen() { return open; }
