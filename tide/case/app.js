// app.js — the case viewer: the magistrate's file over the goss civic web. All model logic
// lives in casegen.js (node-tested); this file only presents — the clue feed revealed lead by
// lead, the suspect board with live eliminations (computed ONLY from revealed clues), the
// accusation, and the CHAIN: closing a case removes victim + culprit and the next case is
// generated from the scarred web. ?sub=&seed=&case= permalinks (prior cases fast-forwarded).

import { buildGoss, buildGossNave } from '../goss/gossip.js';
import { nextCase } from './casegen.js';

const BAKED_NAVE_SEEDS = [1, 2, 3, 5, 7, 11, 42, 99];
const TRIBE_HUES = ['#d9b24a', '#3bb0c9', '#e0567a', '#5aa845', '#b39bd8', '#e0772f', '#7fd8d0', '#cf6bbf', '#8fa8ff', '#c2c85a', '#d98d6b', '#6bc98f'];
const FACTION_COLOR = { commons: '#c9b07a', rindwalker: '#9b6b3a', continuant: '#33408f', drift: '#3bb0c9' };

const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const rail = document.getElementById('rail');
const seedInput = document.getElementById('seed'), subSelect = document.getElementById('sub');

let sub = 'nave', seed = 7;
let G = null, removed = new Set(), caseN = 0, morgue = [];
let view = null, cur = null;              // the live case
let revealed = 1, strikes = 0, wrong = new Set(), state = null;   // state: null | 'solved' | 'cold'
let selectedSuspect = -1;

// ── substrate + chain ─────────────────────────────────────────────────────────────────────────
async function loadSubstrate() {
  if (sub === 'nave') {
    const res = await fetch(`../goss/data/nave-${seed}.json`);
    if (!res.ok) { rail.innerHTML = `<div class="card"><div class="nm">no baked nave for seed ${seed}</div><div class="meta">baked: ${BAKED_NAVE_SEEDS.join(', ')}</div></div>`; return false; }
    G = buildGossNave(await res.json(), { mode: 'floor' });          // the unified floor — the casebook's canon
  } else {
    G = buildGoss({ seed });
  }
  return true;
}
function openCase() {
  const r = nextCase(G, removed, caseN);
  view = r.view; cur = r.c;
  revealed = 1; strikes = 0; wrong = new Set(); state = null; selectedSuspect = -1;
  permalink(); render(); draw();
}
function closeCase() {
  morgue.push({ n: cur.n, victim: cur.victim.name, culprit: cur.truth.name, motive: cur.truth.motive.tag, scene: cur.scene.name, cold: state === 'cold' });
  removed.add(cur.victim.orig); removed.add(cur.truth.culpritOrig);  // taken, either way — the web scars
  caseN++; openCase();
}
async function newBook(fastForward = 0) {
  removed = new Set(); caseN = 0; morgue = [];
  if (!(await loadSubstrate())) return;
  for (let k = 0; k < fastForward; k++) {                            // permalink replay: prior cases closed true
    const { c } = nextCase(G, removed, caseN);
    if (!c) break;
    morgue.push({ n: c.n, victim: c.victim.name, culprit: c.truth.name, motive: c.truth.motive.tag, scene: c.scene.name, replay: true });
    removed.add(c.victim.orig); removed.add(c.truth.culpritOrig); caseN++;
  }
  openCase();
}
function permalink() { history.replaceState(null, '', `?sub=${sub}&seed=${seed}&case=${caseN}`); document.getElementById('gosslink').href = `../goss/?sub=${sub === 'nave' ? 'nave' : 'town'}&seed=${seed}`; document.getElementById('chainlbl').textContent = cur ? `case № ${caseN + 1} · ${cur.survivors} souls` : ''; }

// ── the board state (player knowledge = revealed clues ONLY) ─────────────────────────────────
const eliminatedNow = () => { const e = new Set(); if (cur) cur.clues.slice(0, revealed).forEach((c) => c.eliminates.forEach((i) => e.add(i))); return e; };
const clearedBy = (i) => { for (const c of cur.clues.slice(0, revealed)) if (c.eliminates.includes(i)) return c.title; return null; };

function accuse(idx) {
  if (state) return;
  if (idx === cur.truth.culprit) { state = 'solved'; revealed = cur.clues.length; }
  else { wrong.add(idx); strikes++; if (strikes >= 3) { state = 'cold'; revealed = cur.clues.length; } }
  render(); draw();
}

// ── the rail ──────────────────────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function render() {
  if (!cur) {
    rail.innerHTML = `<h2>the book closes</h2><div class="card"><div class="ln">The town has gone quiet — too few standing grievances left to make a board. ${morgue.length} case${morgue.length === 1 ? '' : 's'} in the book, ${removed.size} souls gone. Roll a new book, or a new seed.</div></div>` + morgueHtml();
    return;
  }
  const elim = eliminatedNow();
  const V = cur.victim;
  let h = `<div class="caseHd"><div class="no">case № ${caseN + 1} — ${esc(cur.tickLabel)}</div>
    <div class="ti">the ${esc(cur.scene.name)} matter</div>
    <div class="town">the town: ${cur.survivors} souls · vitality ${cur.vitality.v} (${cur.vitality.tier})${removed.size ? ` · ${removed.size} gone` : ''}</div></div>`;
  h += `<h2>the victim</h2><div class="card">
    <div class="nm">✝ ${esc(V.name)}</div>
    <div class="meta">${V.age}, ${esc(V.kinship)} of the ${esc(V.surname)} household · ${esc(V.tribeName)}${V.faction ? ` · ${esc(V.faction)} ward` : ''}</div>
    <div class="ln">${V.hats.map((ht) => `${esc(ht.kind)}@${esc(ht.name)}`).join(' · ')}</div></div>`;
  if (state) {
    const t = cur.truth;
    h += `<div class="verdict${state === 'cold' ? ' cold' : ''}"><div class="hd">${state === 'solved' ? '⚖ the accusation holds' : '✗ the case goes cold — the watch takes over'}</div>
      <div class="ln"><b>${esc(t.name)}</b> — <b>${esc(t.motive.tag)}</b>. ${esc(t.motive.text)}<br>The instrument: ${esc(t.item)}.</div></div>
      <div class="row" style="margin-bottom:10px"><button class="gold" id="nextcase">⚰ close the case — the next body</button></div>`;
  }
  h += `<h2>the leads · ${Math.min(revealed, cur.clues.length)}/${cur.clues.length}</h2>`;
  for (const c of cur.clues.slice(0, revealed)) {
    h += `<div class="clue"><div class="hd"><span class="ty ${c.kind}">${c.kind.toUpperCase()}</span></div>
      <div class="ti">${esc(c.title)}</div><div class="ln">${esc(c.text)}</div>
      ${c.eliminates.length ? `<div class="out">— off the board: ${c.eliminates.map((i) => esc(nameOf(i))).join(', ')}</div>` : ''}</div>`;
  }
  if (!state && revealed < cur.clues.length) h += `<div style="margin:2px 0 10px"><button id="lead">» pursue the next lead</button><span class="strikes">${'✗'.repeat(strikes)}</span></div>`;
  h += `<h2>the board · ${cur.suspects.length - [...elim].length} standing</h2>`;
  for (const s of cur.suspects) {
    const out = elim.has(s.idx), isW = wrong.has(s.idx);
    const isC = state && s.idx === cur.truth.culprit;
    h += `<div class="susp${out ? ' out' : ''}${isC ? ' culprit' : ''}${isW && !isC ? ' wrong' : ''}" id="susp${s.idx}">
      <div class="hd"><span class="nm" style="color:${TRIBE_HUES[s.tribe % TRIBE_HUES.length]}">${esc(s.name)}</span>
        <span style="color:var(--dim);font-size:12px">${s.age}</span>
        <span class="tag" style="color:${isC ? 'var(--gold)' : out ? 'var(--dim)' : isW ? 'var(--hot)' : 'var(--dim)'}">${isC ? '★ TAKEN' : out ? 'CLEARED' : isW ? 'DENIED' : ''}</span></div>
      <div class="meta" style="color:var(--dim);font-size:11.5px">${esc(s.tribeName)}${s.faction ? ` · <span style="color:${FACTION_COLOR[s.faction] || 'var(--dim)'}">${esc(s.faction)}</span>` : ''}</div>
      ${s.motives.slice(0, 2).map((m) => `<div class="mv"><b>${esc(m.tag)}</b> ${esc(m.text)}</div>`).join('')}
      <div class="cl"><span class="k">claims:</span> ${esc(s.claim.name)} <span class="k">(${s.witnesses} present, ${s.independent} independent)</span></div>
      ${out ? `<div class="note">cleared — ${esc(clearedBy(s.idx) || '')}</div>`
        : state ? '' : `<div class="row"><button data-accuse="${s.idx}">⚖ accuse</button>${isW ? '<span class="note">the magistrate dismissed it</span>' : ''}</div>`}
    </div>`;
  }
  h += `<div class="note">Only INDEPENDENT witnesses clear a name — the household swearing to you is worth exactly what kin’s word is worth. Three dismissed accusations and the case goes cold.</div>`;
  h += morgueHtml();
  rail.innerHTML = h;
  const lead = document.getElementById('lead');
  if (lead) lead.addEventListener('click', () => { revealed++; render(); draw(); });
  const nx = document.getElementById('nextcase');
  if (nx) nx.addEventListener('click', closeCase);
  rail.querySelectorAll('[data-accuse]').forEach((b) => b.addEventListener('click', () => accuse(parseInt(b.dataset.accuse, 10))));
}
const nameOf = (i) => (view ? view.enriched.people[i].name : '');
function morgueHtml() {
  if (!morgue.length) return '';
  return `<h2>the morgue · ${morgue.length}</h2>` + morgue.map((m) =>
    `<div class="morgue">№ ${m.n + 1} — <b>${esc(m.victim)}</b> at the ${esc(m.scene)} · ${esc(m.culprit)} taken (${esc(m.motive)})${m.cold ? ' · went cold' : ''}${m.replay ? ' · replayed' : ''}</div>`).join('');
}

// ── the ego web — victim centred, suspects ringed, ties drawn at true weight ─────────────────
function resize() { const r = cv.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
let nodePos = [];                          // {x, y, r, kind, idx?, label, color, dim}
function draw() {
  const W = cv.clientWidth, H = cv.clientHeight;
  ctx.clearRect(0, 0, W, H);
  nodePos = [];
  if (!cur) return;
  const elim = eliminatedNow();
  const cx = W / 2, cyy = H / 2 + 14, R = Math.min(W, H) * 0.30;
  const S = cur.suspects, n = S.length;
  const pos = new Map();                    // suspect idx → [x,y]
  S.forEach((s, k) => { const a = -Math.PI / 2 + (k + 0.5) * (Math.PI * 2 / n); pos.set(s.idx, [cx + R * Math.cos(a), cyy + R * Math.sin(a), a]); });
  const tw = (a, b) => { for (const e of view.web.adj.get(a) || []) if (e.to === b) return e.w; return 0; };
  // ties: victim↔suspect + suspect↔suspect, width ∝ weight
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const [xi, yi] = pos.get(S[i].idx);
    const wv = tw(cur.victim.idx, S[i].idx);
    if (wv > 0) { ctx.strokeStyle = 'rgba(207,221,230,.28)'; ctx.lineWidth = Math.min(4, 0.8 + wv * 0.5); ctx.beginPath(); ctx.moveTo(cx, cyy); ctx.lineTo(xi, yi); ctx.stroke(); }
    for (let j = i + 1; j < n; j++) {
      const w = tw(S[i].idx, S[j].idx); if (w <= 0) continue;
      const [xj, yj] = pos.get(S[j].idx);
      ctx.strokeStyle = 'rgba(95,118,132,.22)'; ctx.lineWidth = Math.min(3.5, 0.6 + w * 0.45);
      ctx.beginPath(); ctx.moveTo(xi, yi); ctx.lineTo(xj, yj); ctx.stroke();
    }
  }
  // claim places: unique, set beyond the ring at the mean angle of their claimants (dotted spokes)
  const claims = new Map();
  S.forEach((s) => { let c = claims.get(s.claim.place); if (!c) claims.set(s.claim.place, c = { name: s.claim.name, who: [] }); c.who.push(s.idx); });
  ctx.setLineDash([3, 4]);
  for (const [, c] of claims) {
    let ax = 0, ay = 0;
    for (const i of c.who) { const [, , a] = pos.get(i); ax += Math.cos(a); ay += Math.sin(a); }
    const a = Math.atan2(ay, ax), px = cx + R * 1.45 * Math.cos(a), py = cyy + R * 1.45 * Math.sin(a);
    for (const i of c.who) { const [xi, yi] = pos.get(i); ctx.strokeStyle = 'rgba(59,176,201,.30)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xi, yi); ctx.lineTo(px, py); ctx.stroke(); }
    ctx.setLineDash([3, 4]);
    ctx.fillStyle = '#12202b'; ctx.strokeStyle = '#3bb0c9';
    ctx.fillRect(px - 4, py - 4, 8, 8); ctx.strokeRect(px - 4, py - 4, 8, 8);
    ctx.fillStyle = 'rgba(95,118,132,.9)'; ctx.font = '10px ' + getComputedStyle(document.body).getPropertyValue('--mono'); ctx.textAlign = 'center';
    ctx.fillText(c.name, px, py + 18);
    nodePos.push({ x: px, y: py, r: 8, kind: 'place', label: c.name });
  }
  ctx.setLineDash([]);
  // the scene, pinned above the victim
  const sx = cx, sy = cyy - R * 0.52;
  ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(217,178,74,.55)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(cx, cyy); ctx.lineTo(sx, sy); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#17202a'; ctx.strokeStyle = '#d9b24a'; ctx.lineWidth = 1.4;
  ctx.fillRect(sx - 6, sy - 6, 12, 12); ctx.strokeRect(sx - 6, sy - 6, 12, 12);
  ctx.fillStyle = '#d9b24a'; ctx.font = '11px ' + getComputedStyle(document.body).getPropertyValue('--mono'); ctx.textAlign = 'center';
  ctx.fillText('▣ ' + cur.scene.name + ' — the scene', sx, sy - 12);
  // suspects
  for (const s of S) {
    const [x, y] = pos.get(s.idx);
    const out = elim.has(s.idx), isC = state && s.idx === cur.truth.culprit;
    const col = TRIBE_HUES[s.tribe % TRIBE_HUES.length];
    ctx.globalAlpha = out ? 0.35 : 1;
    if (isC) { ctx.strokeStyle = '#d9b24a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.fill();
    if (s.faction && FACTION_COLOR[s.faction]) { ctx.strokeStyle = FACTION_COLOR[s.faction]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = out ? 'rgba(95,118,132,.8)' : '#cfdde6'; ctx.font = (selectedSuspect === s.idx ? '700 ' : '') + '11px ' + getComputedStyle(document.body).getPropertyValue('--mono');
    ctx.fillText(s.name, x, y + 24);
    if (out) { ctx.strokeStyle = 'rgba(224,86,122,.85)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke(); }
    ctx.globalAlpha = 1;
    nodePos.push({ x, y, r: 11, kind: 'suspect', idx: s.idx, label: s.name });
  }
  // the victim
  ctx.fillStyle = '#0d161d'; ctx.strokeStyle = '#e0567a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cyy, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e0567a'; ctx.font = '700 12px ' + getComputedStyle(document.body).getPropertyValue('--mono');
  ctx.fillText('✝', cx, cyy + 4);
  ctx.fillText(cur.victim.name, cx, cyy + 28);
}
cv.addEventListener('click', (ev) => {
  const r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
  for (const nd of nodePos) {
    if (nd.kind !== 'suspect') continue;
    if ((x - nd.x) ** 2 + (y - nd.y) ** 2 <= (nd.r + 4) ** 2) {
      selectedSuspect = nd.idx;
      const el = document.getElementById('susp' + nd.idx);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      draw(); return;
    }
  }
});

// ── boot ──────────────────────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => { resize(); draw(); });
document.getElementById('roll').addEventListener('click', () => {
  seedInput.value = sub === 'nave' ? BAKED_NAVE_SEEDS[Math.floor(Math.random() * BAKED_NAVE_SEEDS.length)] : 1 + Math.floor(Math.random() * 99999);
  seed = parseInt(seedInput.value, 10); newBook();
});
seedInput.addEventListener('change', () => { seed = Math.max(1, parseInt(seedInput.value, 10) || 1); newBook(); });
subSelect.addEventListener('change', () => {
  sub = subSelect.value;
  if (sub === 'nave' && !BAKED_NAVE_SEEDS.includes(parseInt(seedInput.value, 10))) seedInput.value = 7;
  seed = parseInt(seedInput.value, 10); newBook();
});
resize();
const q = new URLSearchParams(location.search);
if (q.get('sub') === 'town') { sub = 'town'; subSelect.value = 'town'; }
if (parseInt(q.get('seed'), 10)) seedInput.value = parseInt(q.get('seed'), 10);
if (sub === 'nave' && !BAKED_NAVE_SEEDS.includes(parseInt(seedInput.value, 10))) seedInput.value = 7;
seed = parseInt(seedInput.value, 10);
newBook(Math.max(0, parseInt(q.get('case'), 10) || 0));
