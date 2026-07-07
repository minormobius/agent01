// app.js — the goss viewer: the civic WEB rendered as a force-laid graph (people ⊙ tinted by
// emergent tribe, places ▣ glyphed by role), with lenses for tribes / romance / tension, click
// dossiers, and the drama feed ("the goss") on the rail. All model logic lives in gossip.js —
// this file only lays out and draws what buildGoss returns.

import { buildGoss, buildGossNave, placeName, ROLES } from './gossip.js';

const BAKED_NAVE_SEEDS = [1, 2, 3, 5, 7, 11, 42, 99];   // data/nave-<seed>.json — bake more with tools/bake-nave.mjs
const FACTION_FALLBACK = { commons: '#c9b07a', rindwalker: '#9b6b3a', continuant: '#33408f', drift: '#3bb0c9' };

const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const tip = document.getElementById('tip');
const TRIBE_HUES = ['#d9b24a', '#3bb0c9', '#e0567a', '#5aa845', '#b39bd8', '#e0772f', '#7fd8d0', '#cf6bbf', '#8fa8ff', '#c2c85a', '#d98d6b', '#6bc98f'];
const tribeColor = (t) => TRIBE_HUES[t % TRIBE_HUES.length];

let G = null;                       // the goss build
let nodes = [], nodeAt = new Map(); // key 'p<idx>' | 'P<pid>' → node
let springs = [];                   // layout springs
let romEdges = [];                  // romance overlay edges
let romInvolved = new Set();        // souls with any romance edge (the rest dim under the ♥ lens)
let contestedByPlace = new Map(), defectorSet = new Set();
let view = { x: 0, y: 0, k: 1 };
let lens = 'tribes';
let sub = 'town', mode = 'floor';           // substrate (town | nave) + nave pollination mode — the
                                            // UNIFIED floor web is the default (measured healthier on
                                            // every baked seed — see UNIFIED.md); ?mode=sealed keeps the
                                            // engine-faithful seven-webs view a permalink away.
let contentW = 900, contentH = 600;         // extent of the current substrate (for fitView)
let highlight = null;               // Set of node keys, or null
let selected = null;                // node key
let alpha = 0;                      // layout temperature

// ── build + derive draw data ──────────────────────────────────────────────────────────────────
async function build(seed) {
  if (sub === 'nave') {
    const res = await fetch(`data/nave-${seed}.json`);
    if (!res.ok) {
      document.getElementById('dossier').innerHTML =
        `<div class="nm">no baked nave for seed ${seed}</div><div class="meta">baked seeds: ${BAKED_NAVE_SEEDS.join(', ')} — add more with tools/bake-nave.mjs</div>`;
      document.getElementById('dossier').style.display = 'block';
      return;
    }
    G = buildGossNave(await res.json(), { mode });
    contentW = G.world.W; contentH = G.world.H;
  } else {
    G = buildGoss({ seed });
    contentW = 900; contentH = 600;
  }
  nodes = []; nodeAt = new Map(); springs = []; romEdges = [];
  const P = G.enriched.people;
  for (const pl of G.world.places) {
    const members = (G.society.placeMembers.get(pl.id) || []).length;
    const node = { key: 'P' + pl.id, kind: 'place', pl, x: pl.x, y: pl.y, r: Math.max(3, Math.min(9, 2.5 + Math.sqrt(members))), members };
    nodeAt.set(node.key, node); nodes.push(node);
  }
  for (const p of P) {
    const jr = (p.idx * 2654435761 >>> 16) % 100;
    const node = { key: 'p' + p.idx, kind: 'person', p, x: p.x + (jr % 10) - 5, y: p.y + Math.floor(jr / 10) - 5, r: 2.6, tribe: G.tribal.tribeOf[p.idx] };
    nodeAt.set(node.key, node); nodes.push(node);
    for (const h of p.hats) {
      const to = nodeAt.get('P' + h.place);
      if (to) springs.push({ a: node, b: to, rest: 24, k: h.kind === 'work' ? 0.9 : 0.5 });
    }
  }
  for (const t of G.web.ties) if (t.w >= 3) {
    springs.push({ a: nodeAt.get('p' + t.a), b: nodeAt.get('p' + t.b), rest: 14, k: Math.min(1.3, t.w / 4) });
  }
  for (const c of G.romance.couples) romEdges.push({ a: 'p' + c.a, b: 'p' + c.b, kind: 'couple' });
  for (const s of G.romance.sparks) romEdges.push({ a: 'p' + s.a, b: 'p' + s.b, kind: s.affair ? 'affair' : s.cross ? 'crossed' : 'spark' });
  romInvolved = new Set(romEdges.flatMap((e) => [e.a, e.b]));
  contestedByPlace = new Map(G.tension.contested.map((c) => [c.place, c]));
  defectorSet = new Set(G.tension.defectors.slice(0, 8).map((d) => d.idx));
  highlight = null; selected = null;
  fitView(); renderRail();
  alpha = 1;
}

// ── layout — spring relaxation + grid-hash repulsion, budgeted per frame ──────────────────────
function relax(iters) {
  const REP = 17, CELL = REP;
  for (let it = 0; it < iters; it++) {
    const grid = new Map();
    for (const n of nodes) {
      const gk = Math.floor(n.x / CELL) + ':' + Math.floor(n.y / CELL);
      let g = grid.get(gk); if (!g) { g = []; grid.set(gk, g); } g.push(n);
    }
    for (const n of nodes) {
      const gx = Math.floor(n.x / CELL), gy = Math.floor(n.y / CELL);
      let fx = 0, fy = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const g = grid.get((gx + dx) + ':' + (gy + dy)); if (!g) continue;
        for (const m of g) {
          if (m === n) continue;
          let ddx = n.x - m.x, ddy = n.y - m.y;
          let d2 = ddx * ddx + ddy * ddy;
          if (d2 < 0.01) { ddx = ((n.key < m.key) ? 1 : -1) * 0.5; ddy = 0.3; d2 = 0.34; }
          const d = Math.sqrt(d2);
          if (d < REP) { const f = (REP - d) / REP * 0.6; fx += (ddx / d) * f; fy += (ddy / d) * f; }
        }
      }
      n.fx = fx; n.fy = fy;
    }
    for (const s of springs) {
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - s.rest) / d * 0.014 * s.k;
      s.a.fx += dx * f; s.a.fy += dy * f; s.b.fx -= dx * f; s.b.fy -= dy * f;
    }
    for (const n of nodes) { n.x += n.fx * alpha * 2.2; n.y += n.fy * alpha * 2.2; }
    alpha *= 0.996;
  }
  if (alpha < 0.004) alpha = 0;
}

// ── view / draw ───────────────────────────────────────────────────────────────────────────────
function fitView() {
  const w = cv.clientWidth || 800, h = cv.clientHeight || 600;
  view.k = Math.min(w / (contentW * 1.17), h / (contentH * 1.2));
  view.x = w / 2 - (contentW / 2) * view.k; view.y = h / 2 - (contentH / 2) * view.k;
}
function resize() {
  cv.width = cv.clientWidth * devicePixelRatio; cv.height = cv.clientHeight * devicePixelRatio;
}
const sx = (x) => x * view.k + view.x, sy = (y) => y * view.k + view.y;
const isHi = (key) => !highlight || highlight.has(key);

function draw() {
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
  if (!G) return;
  const P = G.enriched.people;
  // ward outlines (nave substrate) — the DESIGNED partition, under the emergent web
  if (G.nave) {
    for (let w = 0; w < G.nave.polys.length; w++) {
      const col = G.nave.meta[w].color || FACTION_FALLBACK[G.nave.meta[w].faction] || '#556';
      ctx.beginPath();
      G.nave.polys[w].forEach(([px, py], i) => { const X = sx(px), Y = sy(py); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
      ctx.closePath();
      ctx.fillStyle = hexA(col, 0.05); ctx.fill();
      ctx.strokeStyle = hexA(col, 0.45); ctx.lineWidth = 1.2; ctx.stroke(); ctx.lineWidth = 1;
    }
  }
  // ties (person-person) — lens decides which and how hot
  ctx.lineWidth = 1;
  if (lens === 'web') {
    for (const t of G.web.ties) {
      const a = nodeAt.get('p' + t.a), b = nodeAt.get('p' + t.b);
      ctx.strokeStyle = `rgba(120,160,185,${Math.min(0.5, t.w / 14)})`;
      ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke();
    }
  } else if (lens === 'tension') {
    for (const t of G.web.ties) {
      const same = G.tribal.tribeOf[t.a] === G.tribal.tribeOf[t.b];
      if (same && t.w < 3) continue;
      const a = nodeAt.get('p' + t.a), b = nodeAt.get('p' + t.b);
      ctx.strokeStyle = same ? 'rgba(90,120,140,0.05)' : `rgba(224,86,122,${Math.min(0.75, 0.18 + t.w / 8)})`;
      ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke();
    }
  } else {
    for (const t of G.web.ties) {
      if (t.w < 2.4) continue;
      const a = nodeAt.get('p' + t.a), b = nodeAt.get('p' + t.b);
      if (!isHi(a.key) && !isHi(b.key)) continue;
      const same = G.tribal.tribeOf[t.a] === G.tribal.tribeOf[t.b];
      ctx.strokeStyle = same ? hexA(tribeColor(G.tribal.tribeOf[t.a]), lens === 'romance' ? 0.04 : 0.13) : 'rgba(130,150,165,0.07)';
      ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke();
    }
  }
  // hat edges person→place, very faint structure
  if (lens !== 'romance') {
    ctx.strokeStyle = 'rgba(95,118,132,0.06)';
    ctx.beginPath();
    for (const s of springs) if (s.b.kind === 'place' && (isHi(s.a.key) || isHi(s.b.key))) { ctx.moveTo(sx(s.a.x), sy(s.a.y)); ctx.lineTo(sx(s.b.x), sy(s.b.y)); }
    ctx.stroke();
  }
  // romance overlay
  if (lens === 'romance') {
    for (const e of romEdges) {
      const a = nodeAt.get(e.a), b = nodeAt.get(e.b);
      const col = e.kind === 'couple' ? 'rgba(224,86,122,0.55)' : e.kind === 'affair' ? 'rgba(255,60,60,0.9)' : e.kind === 'crossed' ? 'rgba(255,150,60,0.9)' : 'rgba(224,86,122,0.85)';
      ctx.strokeStyle = col; ctx.lineWidth = e.kind === 'couple' ? 1.2 : 1.6;
      ctx.setLineDash(e.kind === 'couple' ? [] : [4, 3]);
      ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineWidth = 1;
  }
  // places
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const n of nodes) {
    if (n.kind !== 'place') continue;
    const hi = isHi(n.key), X = sx(n.x), Y = sy(n.y), r = n.r * Math.max(0.7, Math.sqrt(view.k));
    const con = contestedByPlace.get(n.pl.id);
    if (lens === 'tension' && con) {
      ctx.strokeStyle = hexA('#d9b24a', Math.min(0.85, 0.25 + con.entropy / 3)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X, Y, r + 4, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
    }
    ctx.fillStyle = hi ? '#22333f' : 'rgba(34,51,63,0.25)';
    ctx.strokeStyle = hi ? (ROLES[n.pl.role] ? hexA(ROLES[n.pl.role].color, 0.9) : '#456') : 'rgba(70,90,105,0.25)';
    ctx.beginPath(); ctx.roundRect(X - r, Y - r, r * 2, r * 2, 2); ctx.fill(); ctx.stroke();
    if (view.k > 1.15 && hi && ROLES[n.pl.role]) {
      ctx.fillStyle = hexA(ROLES[n.pl.role].color, 0.95); ctx.font = `${Math.max(8, r * 1.3)}px sans-serif`;
      ctx.fillText(ROLES[n.pl.role].glyph, X, Y + 0.5);
    }
  }
  // people
  for (const n of nodes) {
    if (n.kind !== 'person') continue;
    const hi = isHi(n.key) && (lens !== 'romance' || romInvolved.has(n.key));
    const X = sx(n.x), Y = sy(n.y);
    ctx.fillStyle = hi ? tribeColor(n.tribe) : hexA(tribeColor(n.tribe), 0.1);
    ctx.beginPath(); ctx.arc(X, Y, n.r * Math.max(0.7, Math.sqrt(view.k)), 0, 7); ctx.fill();
    if (lens === 'tension' && defectorSet.has(n.p.idx) && hi) {
      ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(X, Y, n.r + 3, 0, 7); ctx.stroke();
    }
  }
  if (selected) {
    const n = nodeAt.get(selected);
    if (n) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx(n.x), sy(n.y), n.r + 5, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
  }
}
function hexA(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

// ── the rail ──────────────────────────────────────────────────────────────────────────────────
function renderRail() {
  document.getElementById('vnum').textContent = Math.round(G.vital.vitality);
  document.getElementById('vtier').textContent = G.vital.tier;
  document.getElementById('vnote').textContent =
    `${G.enriched.people.length} souls · ${G.enriched.households.length} households · ${G.world.places.length} places · ` +
    `${G.web.ties.length} ties · polarization ${(G.tension.polarization * 100).toFixed(0)}%` +
    (G.nave ? ` · engine roster ${G.enginePeople} (the cast that walks the deck — a separate population)` : '');
  // the wards block (nave substrate): the designed partition vs what emerges
  const wb = document.getElementById('wardsblock');
  wb.style.display = G.nave ? 'block' : 'none';
  if (G.nave) {
    const wd = document.getElementById('wards'); wd.innerHTML = '';
    for (const w of G.wards) {
      const col = w.meta.color || FACTION_FALLBACK[w.meta.faction] || '#556';
      const el = document.createElement('div'); el.className = 'tribe';
      el.innerHTML = `<span class="sw" style="background:${col}"></span><span>${esc(w.meta.key)}</span>` +
        `<span class="sz">${w.people}p${w.vitality != null ? ` · ${w.vitality} ${esc(w.tier)}` : ''}</span>`;
      el.onclick = () => {
        const on = el.classList.toggle('on');
        [...wd.children].forEach((c) => { if (c !== el) c.classList.remove('on'); });
        highlight = on ? new Set(G.enriched.people.filter((p) => p.ward === w.ward).map((p) => 'p' + p.idx)) : null;
        draw();
      };
      wd.appendChild(el);
    }
    document.getElementById('alignment').textContent = G.alignment
      ? `designed factions vs emergent tribes: ${(G.alignment.overall * 100).toFixed(0)}% aligned ` +
        (mode === 'sealed' ? '(sealed wards — tribes can only form inside a ward)' : '(one floor — hats cross wards by nearest distance, like the game’s commute web)')
      : '';
  }
  const tr = document.getElementById('tribes'); tr.innerHTML = '';
  G.tribal.tribes.forEach((t) => {
    const el = document.createElement('div'); el.className = 'tribe';
    el.innerHTML = `<span class="sw" style="background:${tribeColor(t.id)}"></span><span>${t.name}</span><span class="sz">${t.members.length}</span>`;
    el.onclick = () => {
      const on = el.classList.toggle('on');
      [...tr.children].forEach((c) => { if (c !== el) c.classList.remove('on'); });
      highlight = on ? new Set([...t.members.map((i) => 'p' + i), ...(t.totem != null ? ['P' + t.totem] : [])]) : null;
      draw();
    };
    tr.appendChild(el);
  });
  const dr = document.getElementById('dramas'); dr.innerHTML = '';
  G.dramas.slice(0, 24).forEach((d) => {
    const el = document.createElement('div'); el.className = 'drama';
    el.innerHTML = `<div class="hd"><span class="ty">${d.type}</span><span class="heat">♨ ${d.heat}</span></div>` +
      `<div class="ti">${esc(d.title)}</div><div class="ln">${esc(d.line)}</div>`;
    el.onclick = () => {
      const on = el.classList.toggle('on');
      [...dr.children].forEach((c) => { if (c !== el) c.classList.remove('on'); });
      if (!on) { highlight = null; draw(); return; }
      const set = new Set();
      for (const i of d.people || []) if (i >= 0) set.add('p' + i);
      for (const pid of d.places || []) set.add('P' + pid);
      for (const t of d.tribes || []) for (const i of G.tribal.tribes[t].members) set.add('p' + i);
      highlight = set; draw();
    };
    dr.appendChild(el);
  });
}
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ── dossiers ──────────────────────────────────────────────────────────────────────────────────
function showDossier(node) {
  const box = document.getElementById('dossier');
  if (!node) { box.style.display = 'none'; return; }
  const seed = G.seed, P = G.enriched.people;
  let html = `<span class="close" onclick="this.parentElement.style.display='none'">✕</span>`;
  if (node.kind === 'person') {
    const p = node.p, t = G.tribal.tribes[node.tribe];
    const hh = G.enriched.households.find((h) => h.home === p.home);
    const partner = G.romance.partnerOf[p.idx];
    const myDramas = G.dramas.filter((d) => (d.people || []).includes(p.idx));
    html += `<div class="nm">${esc(p.name)}</div>` +
      `<div class="meta">${p.age} · ${p.pronouns.join('/')} · ${p.kinship} of the ${esc(p.surname)} household · <span style="color:${tribeColor(node.tribe)}">${esc(t.name)}</span>` +
      (p.faction ? ` · ${esc(p.faction)} ward` : '') + `</div><ul>`;
    if (partner >= 0) html += `<li><span class="k">partner</span> ${esc(P[partner].name)}</li>`;
    if (hh) html += `<li><span class="k">household</span> ${hh.members.filter((i) => i !== p.idx).map((i) => esc(P[i].given)).join(', ') || '(alone)'}</li>`;
    for (const h of p.hats) {
      const pl = G.world.places[h.place];
      html += `<li><span class="k">${esc(h.kind)}</span> ${esc(h.role)} @ ${pl ? esc(placeName(pl, seed)) : '#' + h.place}</li>`;
    }
    html += '</ul>';
    if (myDramas.length) html += `<div class="meta" style="margin-top:6px">the goss on ${esc(p.given)}:</div><ul>` +
      myDramas.map((d) => `<li><span class="k">${d.type}</span> ${esc(d.title)}</li>`).join('') + '</ul>';
  } else {
    const pl = node.pl, members = G.society.placeMembers.get(pl.id) || [];
    const con = contestedByPlace.get(pl.id);
    const byTribe = new Map();
    for (const i of members) { const t = G.tribal.tribeOf[i]; byTribe.set(t, (byTribe.get(t) || 0) + 1); }
    html += `<div class="nm">${esc(placeName(pl, seed))}</div>` +
      `<div class="meta">${esc(pl.role)}${pl.domain ? ' · ' + esc(pl.domain) : ''} · ${members.length} members${con ? ` · CONTESTED (entropy ${con.entropy.toFixed(2)})` : ''}</div>`;
    if (members.length) {
      html += '<div class="bar">' + [...byTribe.entries()].sort((a, b) => b[1] - a[1])
        .map(([t, c]) => `<div style="width:${(c / members.length) * 100}%;background:${tribeColor(t)}" title="${esc(G.tribal.tribes[t].name)}: ${c}"></div>`).join('') + '</div>';
      html += `<ul>` + members.slice(0, 14).map((i) => `<li>${esc(P[i].name)} <span class="k">(${esc(G.tribal.tribes[G.tribal.tribeOf[i]].name)})</span></li>`).join('') +
        (members.length > 14 ? `<li class="k">… and ${members.length - 14} more</li>` : '') + '</ul>';
    }
  }
  box.innerHTML = html; box.style.display = 'block';
}

// ── interaction ───────────────────────────────────────────────────────────────────────────────
let drag = null;
cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; cv.classList.add('dragging'); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    view.x += dx; view.y += dy; drag.x = e.clientX; drag.y = e.clientY; draw();
    return;
  }
  const n = pickNode(e); // hover tooltip
  if (n) {
    tip.style.display = 'block';
    const rect = cv.getBoundingClientRect();
    tip.style.left = (e.clientX - rect.left + 14) + 'px'; tip.style.top = (e.clientY - rect.top + 8) + 'px';
    tip.innerHTML = n.kind === 'person'
      ? `<b>${esc(n.p.name)}</b> · ${n.p.age} · ${esc(G.tribal.tribes[n.tribe].name)}`
      : `<b>${esc(placeName(n.pl, G.seed))}</b> · ${esc(n.pl.role)} · ${n.members} members`;
  } else tip.style.display = 'none';
});
cv.addEventListener('pointerup', (e) => {
  cv.classList.remove('dragging');
  if (drag && !drag.moved) {
    const n = pickNode(e);
    selected = n ? n.key : null;
    showDossier(n); draw();
  }
  drag = null;
});
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const f = Math.exp(-e.deltaY * 0.0012);
  const rect = cv.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
  view.x = mx - (mx - view.x) * f; view.y = my - (my - view.y) * f; view.k *= f;
  draw();
}, { passive: false });
function pickNode(e) {
  const rect = cv.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
  let best = null, bd = 10 * 10;
  for (const n of nodes) {
    const d = (sx(n.x) - mx) ** 2 + (sy(n.y) - my) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

document.querySelectorAll('#lenses .chip').forEach((c) => c.addEventListener('click', () => {
  document.querySelectorAll('#lenses .chip').forEach((x) => x.classList.remove('on'));
  c.classList.add('on'); lens = c.dataset.lens; draw();
}));
const seedInput = document.getElementById('seed');
const subSelect = document.getElementById('sub');
document.getElementById('roll').addEventListener('click', () => {
  seedInput.value = sub === 'nave'
    ? BAKED_NAVE_SEEDS[Math.floor(Math.random() * BAKED_NAVE_SEEDS.length)]
    : 1 + Math.floor(Math.random() * 99999);
  reroll();
});
seedInput.addEventListener('change', reroll);
subSelect.addEventListener('change', () => {
  sub = subSelect.value;
  document.getElementById('modes').style.display = sub === 'nave' ? 'flex' : 'none';
  if (sub === 'nave' && !BAKED_NAVE_SEEDS.includes(parseInt(seedInput.value, 10))) seedInput.value = 7;
  reroll();
});
document.querySelectorAll('#modes .chip').forEach((c) => c.addEventListener('click', () => {
  document.querySelectorAll('#modes .chip').forEach((x) => x.classList.remove('on'));
  c.classList.add('on'); mode = c.dataset.mode; reroll();
}));
function reroll() {
  const s = Math.max(1, parseInt(seedInput.value, 10) || 1);
  history.replaceState(null, '', `?sub=${sub}&seed=${s}` + (sub === 'nave' ? `&mode=${mode}` : ''));
  build(s).then(() => draw());
}

// ── boot ──────────────────────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => { resize(); draw(); });
resize();
const q = new URLSearchParams(location.search);
const urlSeed = parseInt(q.get('seed'), 10);
if (urlSeed) seedInput.value = urlSeed;
if (q.get('sub') === 'nave') {
  sub = 'nave'; subSelect.value = 'nave';
  document.getElementById('modes').style.display = 'flex';
  if (q.get('mode') === 'sealed') mode = 'sealed';
  document.querySelectorAll('#modes .chip').forEach((c) => c.classList.toggle('on', c.dataset.mode === mode));
  if (!BAKED_NAVE_SEEDS.includes(parseInt(seedInput.value, 10))) seedInput.value = 7;
}
build(Math.max(1, parseInt(seedInput.value, 10) || 7)).then(() => draw());
(function tick() {
  if (alpha > 0) { relax(3); draw(); }
  requestAnimationFrame(tick);
})();
draw();
