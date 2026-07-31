// worship/oracle.js — the WORSHIP room's PRIMARY fixture: THE ORACLE (the yarrow yijing).
//
// The central component. The player performs the full yarrow-stalk division (yarrow.js) by hand, then
// reads an EXPANDED reading (the Image, the Judgment, the moving-line texts, the relating hexagram —
// from the library's composeReading + canonical Zhouyi) and, signed in, RELEASES it as a kind:'divination'
// rumor. (Geomancy moved to the secondary wall fixture — worship/scry.js.)
//
// Host contract: open({ world, signedIn, publishRumor, toast }).

import { yijingFromLines, divinationRumor } from './oracle-cast.js';
import { createYarrow } from './yarrow.js';

let root = null, body = null, ctx = null, open = false, ritual = null, reading = null;

function ensureDom() {
  if (root) return;
  const css = document.createElement('style');
  css.textContent = `
  .orc-ov{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(6,8,14,.74);backdrop-filter:blur(3px);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  .orc-ov.on{display:flex}
  .orc-card{width:min(580px,95vw);max-height:94vh;overflow:auto;background:linear-gradient(180deg,#12131d,#0c0d15);border:1px solid #3a3766;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6);padding:18px 20px;color:#e8e6f2}
  .orc-head{display:flex;align-items:baseline;gap:10px;margin-bottom:6px}
  .orc-head b{font-size:17px;letter-spacing:.12em;color:#b6a8f0}
  .orc-kick{color:#8a7fd8;letter-spacing:.22em;font-size:11px;text-transform:uppercase}
  .orc-close{margin-left:auto;cursor:pointer;color:#8a86a8;border:1px solid #34324e;border-radius:7px;padding:4px 9px;font:inherit;background:none}
  .orc-close:hover{color:#e8e6f2;border-color:#5a567e}
  .orc-canvas{width:100%;height:300px;display:block;border-radius:10px;background:#0a0b12;touch-action:none;cursor:pointer}
  .orc-status{color:#9c97c0;font-size:12.5px;margin:9px 2px;min-height:18px}
  .orc-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
  .orc-btn{cursor:pointer;border:1px solid #5a567e;background:rgba(138,127,216,.14);color:#cfc9e6;border-radius:8px;padding:9px 15px;font:inherit;font-size:13px}
  .orc-btn:hover{border-color:#8a7fd8;color:#fff}
  .orc-btn.primary{background:rgba(244,191,98,.14);border-color:#d8b25a;color:#f4bf62}
  .orc-btn:disabled{opacity:.45;cursor:default}
  .orc-omen{margin:12px 0 4px;padding:14px 15px;border:1px solid #2c2a44;border-radius:10px;background:#0a0b12}
  .orc-omen .figure{font-size:16px;color:#d8b25a;margin-bottom:6px}
  .orc-omen .prose{color:#cfc9e6}
  .orc-omen .meta{color:#7d79a0;font-size:12px;margin-top:6px}
  .orc-read{margin-top:10px;border-top:1px solid #23223a;padding-top:9px}
  .orc-read h4{margin:8px 0 2px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8a7fd8;font-weight:600}
  .orc-read p{margin:2px 0;color:#cfc9e6}
  .orc-read .zh{color:#7d79a0}
  .orc-read .ln{margin:5px 0;padding-left:10px;border-left:2px solid #2c2a44}
  .orc-read .rel{margin-top:8px;color:#c8b7e0}
  .orc-foot{color:#6e6a90;font-size:11px;margin-top:12px;text-align:center}`;
  document.head.appendChild(css);
  root = document.createElement('div');
  root.className = 'orc-ov';
  root.innerHTML = `<div class="orc-card" role="dialog" aria-label="The Oracle">
    <div class="orc-head"><span class="orc-kick">worship · the oracle</span><b>☯ the yarrow stalks</b><button class="orc-close" data-orc-close>close ⏎</button></div>
    <canvas class="orc-canvas" data-yc></canvas>
    <div class="orc-status" data-status></div>
    <div class="orc-acts"><button class="orc-btn primary" data-act="yact">divide the stalks</button><button class="orc-btn" data-act="yreset">↻ fresh bundle</button></div>
    <div data-omen></div>
    <div class="orc-foot">fifty stalks, divided by hand; what you release is spread to the ship as a rumor</div>
  </div>`;
  document.body.appendChild(root);
  body = root.querySelector('.orc-card');
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-orc-close]') || e.target === root) return close();
    const a = e.target.closest('[data-act]'); if (!a) return;
    const which = a.getAttribute('data-act');
    if (!ritual) return;
    if (which === 'yact') ritual.act();
    else if (which === 'yreset') { reading = null; clearOmen(); ritual.reset(); }
    else if (which === 'release') release(a);
  });
  document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { e.preventDefault(); close(); } });
}

function setStatus(t) { const el = body.querySelector('[data-status]'); if (el) el.textContent = t || ''; }
function clearOmen() { const el = body.querySelector('[data-omen]'); if (el) el.innerHTML = ''; }
function stopRitual() { if (ritual && ritual.stop) { try { ritual.stop(); } catch (_) {} } ritual = null; }

function startRitual() {
  stopRitual(); reading = null; clearOmen();
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

function renderOmen() {
  const el = body.querySelector('[data-omen]'); if (!el || !reading) return;
  const p = reading.profile, f = reading.full || {}, signedIn = !!(ctx && ctx.signedIn);
  const figure = `䷀ ${esc(p.name.en)} · ${esc(p.name.zh)} ${esc(p.name.py)}`;
  const meta = `${esc(p.trigrams.below)} below · ${esc(p.trigrams.above)} above${p.moving.length ? ` · moving ${p.moving.join(',')}${p.changesToName ? ` → ${esc(p.changesToName)}` : ''}` : ' · still'}`;
  // the expanded reading: Image · Judgment · the surfaced moving-line texts · the relating hexagram.
  let read = '<div class="orc-read">';
  if (f.image) read += `<h4>The Image</h4><p>${esc(f.image)}</p>`;
  if (f.judgment) read += `<h4>The Judgment</h4><p>${esc(f.judgment)}${f.judgmentZh ? ` <span class="zh">${esc(f.judgmentZh)}</span>` : ''}</p>`;
  if (f.lines && f.lines.length) { read += `<h4>The moving lines</h4>`; for (const L of f.lines) read += `<div class="ln"><p>Line ${L.pos}${L.zh ? ` <span class="zh">${esc(L.zh)}</span>` : ''}</p><p>${esc(L.text)}</p></div>`; }
  if (f.useLine) read += `<h4>All lines move</h4><p>${esc(f.useLine)}</p>`;
  if (f.relating) read += `<p class="rel">→ It changes toward <b>${esc(f.relating.name)}</b>${f.relating.judgment ? `: ${esc(f.relating.judgment)}` : ''}</p>`;
  read += '</div>';
  const releaseBtn = signedIn
    ? `<button class="orc-btn primary" data-act="release" style="margin-top:10px">☷ release the omen</button>`
    : `<button class="orc-btn" disabled title="sign in to release omens to the ship" style="margin-top:10px">☷ sign in to release</button>`;
  el.innerHTML = `<div class="orc-omen"><div class="figure">${figure}</div><div class="prose">${esc(reading.omen)}</div><div class="meta">${meta}</div>${read}</div>${releaseBtn}`;
}

async function release(btn) {
  if (!reading) return;
  btn.disabled = true; btn.textContent = '◌ releasing…';
  const seed = `${(ctx && ctx.world) || '0'}:yijing:${(reading.profile.lines || []).join('')}`;
  let okFlag = false;
  try { okFlag = await (ctx && ctx.publishRumor ? ctx.publishRumor(divinationRumor((ctx && ctx.world) || '0', { ...reading, seed })) : false); } catch (e) { okFlag = false; }
  btn.textContent = okFlag ? '✦ omen released' : '✕ not released';
  if (okFlag && ctx && ctx.toast) ctx.toast('☷ your omen is loose on the ship', 2400);
  if (!okFlag) btn.disabled = false;
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export function openOracle(opts) { ctx = opts || {}; ensureDom(); open = true; root.classList.add('on'); startRitual(); }
export function closeOracle() { if (root) root.classList.remove('on'); open = false; stopRitual(); }
const close = closeOracle;
export function oracleOpen() { return open; }
