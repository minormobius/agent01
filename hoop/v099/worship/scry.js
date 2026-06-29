// worship/scry.js — the WORSHIP room's SECONDARY (grown wall) fixture: GEOMANCY IN SAND.
//
// The sand-stand on the wall. The player stabs dots into damp sand (sand.js over the soil.js field); the
// parity of each line builds the four Mothers → the whole shield. This panel reports the FULL SHIELD —
// every figure (4 Mothers · 4 Daughters · 4 Nieces · 2 Witnesses · Judge · Reconciler) with glyphs — and,
// signed in, RELEASES it as a kind:'divination' rumor whose profile carries the entire shield.
//
// Host contract: open({ world, signedIn, publishRumor, toast }).

import { geomancyFromShield, divinationRumor } from './oracle-cast.js';
import { createSand } from './sand.js';

let root = null, body = null, ctx = null, open = false, ritual = null, reading = null, rawShield = null;

const glyphRows = (rows) => rows.map((v) => `<span class="gr">${v === 1 ? '•' : '• •'}</span>`).join('');

function ensureDom() {
  if (root) return;
  const css = document.createElement('style');
  css.textContent = `
  .scry-ov{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(6,8,14,.74);backdrop-filter:blur(3px);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  .scry-ov.on{display:flex}
  .scry-card{width:min(600px,95vw);max-height:94vh;overflow:auto;background:linear-gradient(180deg,#15131b,#0d0c12);border:1px solid #4a3f5e;border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.6);padding:18px 20px;color:#e8e4f0}
  .scry-head{display:flex;align-items:baseline;gap:10px;margin-bottom:6px}
  .scry-head b{font-size:17px;letter-spacing:.12em;color:#e0c98a}
  .scry-kick{color:#c9a85a;letter-spacing:.22em;font-size:11px;text-transform:uppercase}
  .scry-close{margin-left:auto;cursor:pointer;color:#9a8f9c;border:1px solid #443a4e;border-radius:7px;padding:4px 9px;font:inherit;background:none}
  .scry-close:hover{color:#e8e4f0;border-color:#6a5e7e}
  .scry-sand{position:relative;width:100%;height:300px;border-radius:10px;overflow:hidden;background:#0a0a0d}
  .scry-sand canvas{position:absolute;inset:0;width:100%;height:100%}
  .scry-sand [data-soil]{cursor:crosshair;touch-action:none}
  .scry-sand [data-overlay]{pointer-events:none}
  .scry-status{color:#b0a690;font-size:12.5px;margin:9px 2px;min-height:18px}
  .scry-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
  .scry-btn{cursor:pointer;border:1px solid #6a5e4e;background:rgba(231,196,106,.12);color:#e0d8c2;border-radius:8px;padding:9px 15px;font:inherit;font-size:13px}
  .scry-btn:hover{border-color:#d8b25a;color:#fff}
  .scry-btn.primary{background:rgba(244,191,98,.16);border-color:#d8b25a;color:#f4bf62}
  .scry-btn:disabled{opacity:.45;cursor:default}
  .scry-omen{margin:12px 0 4px;padding:13px 15px;border:1px solid #3a3142;border-radius:10px;background:#0a0a0d}
  .scry-omen .figure{font-size:16px;color:#e0c98a;margin-bottom:5px}
  .scry-omen .prose{color:#d6cfe0}
  .scry-shield{margin-top:12px;border-top:1px solid #2a2435;padding-top:9px}
  .scry-shield h4{margin:9px 0 4px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#c9a85a;font-weight:600}
  .scry-rank{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
  .scry-rank.two{grid-template-columns:repeat(2,1fr)}
  .scry-rank.one{grid-template-columns:1fr;max-width:50%}
  .scry-fig{border:1px solid #2c2638;border-radius:8px;padding:7px 8px;background:#0e0d14}
  .scry-fig .nm{color:#e0c98a;font-size:12.5px}
  .scry-fig .gl{margin:3px 0;color:#cfc9e6;letter-spacing:1px}
  .scry-fig .gr{display:block;font-size:10px;line-height:1.25}
  .scry-fig .sub{color:#8a8098;font-size:10.5px}
  .scry-fig.judge{border-color:#d8b25a;background:rgba(244,191,98,.07)}
  .scry-foot{color:#7a708a;font-size:11px;margin-top:12px;text-align:center}`;
  document.head.appendChild(css);
  root = document.createElement('div');
  root.className = 'scry-ov';
  root.innerHTML = `<div class="scry-card" role="dialog" aria-label="Geomancy in sand">
    <div class="scry-head"><span class="scry-kick">worship · the sand-stand</span><b>🜨 geomancy</b><button class="scry-close" data-scry-close>close ⏎</button></div>
    <div class="scry-sand"><canvas data-soil></canvas><canvas data-overlay></canvas></div>
    <div class="scry-status" data-status></div>
    <div class="scry-acts"><button class="scry-btn primary" data-act="read">read the cast</button><button class="scry-btn" data-act="fresh">↻ fresh sand</button><button class="scry-btn" data-act="quick">⚡ a quick hand</button></div>
    <div data-omen></div>
    <div class="scry-foot">stab the sixteen lines; the shield is read from the parity of each — released to the ship as a rumor</div>
  </div>`;
  document.body.appendChild(root);
  body = root.querySelector('.scry-card');
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-scry-close]') || e.target === root) return close();
    const a = e.target.closest('[data-act]'); if (!a || !ritual) return;
    const which = a.getAttribute('data-act');
    if (which === 'read') ritual.submit();
    else if (which === 'fresh') { reading = null; rawShield = null; clearOmen(); ritual.reset(); }
    else if (which === 'quick') ritual.randomCast();
    else if (which === 'release') release(a);
  });
  document.addEventListener('keydown', (e) => { if (open && e.key === 'Escape') { e.preventDefault(); close(); } });
}

function setStatus(t) { const el = body.querySelector('[data-status]'); if (el) el.textContent = t || ''; }
function clearOmen() { const el = body.querySelector('[data-omen]'); if (el) el.innerHTML = ''; }
function stopRitual() { if (ritual && ritual.stop) { try { ritual.stop(); } catch (_) {} } ritual = null; }

function startRitual() {
  stopRitual(); reading = null; rawShield = null; clearOmen();
  const soil = body.querySelector('[data-soil]'), overlay = body.querySelector('[data-overlay]');
  ritual = createSand({
    soil, overlay,
    onStatus: ({ text }) => setStatus(text),
    onCast: (S) => { rawShield = S; reading = geomancyFromShield(S); renderShield(); },
  });
  ritual.start();
}

// one figure cell: name + the four glyph rows (•/• •) + its Latin/planet.
function figCell(node, info, judge) {
  return `<div class="scry-fig${judge ? ' judge' : ''}"><div class="nm">${esc(info.name)}</div>`
    + `<div class="gl">${glyphRows(node.rows)}</div>`
    + `<div class="sub">${esc(info.latin || info.en || '')}${info.planet ? ` · ${esc(info.planet)}` : ''}</div></div>`;
}
function rank(nodes, infos, cls, judgeFlag) {
  return `<div class="scry-rank ${cls || ''}">${nodes.map((n, i) => figCell(n, infos[i], judgeFlag)).join('')}</div>`;
}

function renderShield() {
  const el = body.querySelector('[data-omen]'); if (!el || !reading || !rawShield) return;
  const p = reading.profile, sh = p.shield, S = rawShield, signedIn = !!(ctx && ctx.signedIn);
  const meta = `${p.planet ? esc(p.planet) : ''}${p.zodiac ? ` · ${esc(p.zodiac)}` : ''}${p.nature ? ` · ${esc(p.nature)}` : ''}`;
  let html = `<div class="scry-omen"><div class="figure">🜨 The Judge — ${esc(p.judge)}${p.latin ? ` · ${esc(p.latin)}` : ''}</div>`
    + `<div class="prose">${esc(reading.omen)}</div><div class="sub" style="color:#8a8098;font-size:11.5px;margin-top:5px">${meta}</div>`;
  html += `<div class="scry-shield">`;
  html += `<h4>Mothers</h4>${rank(S.mothers, sh.mothers, '')}`;
  html += `<h4>Daughters</h4>${rank(S.daughters, sh.daughters, '')}`;
  html += `<h4>Nieces</h4>${rank(S.nieces, sh.nieces, '')}`;
  html += `<h4>Witnesses</h4>${rank([S.witnessRight, S.witnessLeft], [sh.witnessRight, sh.witnessLeft], 'two')}`;
  html += `<h4>Judge</h4>${rank([S.judge], [sh.judge], 'one', true)}`;
  html += `<h4>Reconciler</h4>${rank([S.reconciler], [sh.reconciler], 'one')}`;
  html += `</div></div>`;
  html += signedIn
    ? `<button class="scry-btn primary" data-act="release" style="margin-top:10px">☷ release the cast</button>`
    : `<button class="scry-btn" disabled title="sign in to release the cast to the ship" style="margin-top:10px">☷ sign in to release</button>`;
  el.innerHTML = html;
}

async function release(btn) {
  if (!reading) return;
  btn.disabled = true; btn.textContent = '◌ releasing…';
  const seed = `${(ctx && ctx.world) || '0'}:geomancy:${reading.profile.judge}`;
  let okFlag = false;
  try { okFlag = await (ctx && ctx.publishRumor ? ctx.publishRumor(divinationRumor((ctx && ctx.world) || '0', { ...reading, seed })) : false); } catch (e) { okFlag = false; }
  btn.textContent = okFlag ? '✦ cast released' : '✕ not released';
  if (okFlag && ctx && ctx.toast) ctx.toast('☷ the shield is loose on the ship', 2400);
  if (!okFlag) btn.disabled = false;
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export function openGeomancy(opts) { ctx = opts || {}; ensureDom(); open = true; root.classList.add('on'); startRitual(); }
export function closeGeomancy() { if (root) root.classList.remove('on'); open = false; stopRitual(); }
const close = closeGeomancy;
export function geomancyOpen() { return open; }
