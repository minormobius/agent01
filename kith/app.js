// kith/app.js — read a crowd's follow graph, hand it to the worker, draw what
// comes back. The analysis itself lives in community.js (tested in node); this
// file is input, crawling, and four views: map, matrix, community cards, sweep.

import { followsOf, mutualsOf, profiles, pool, stats } from './lib/graph.js';
import { GAMMAS } from './community.js';

const $ = (id) => document.getElementById(id);
const API = 'https://public.api.bsky.app/xrpc';
const CONCURRENCY = 10;
const num = (n) => Number(n).toLocaleString('en-US');
const pct = (x) => (x * 100).toFixed(0) + '%';
const f2 = (x) => Number(x).toFixed(2);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── state ────────────────────────────────────────────────────────────────────
let base = null;          // { ids, rows, owner, title, partial }
let stack = [];           // drill-down path: [{ title, scope }]
let view = null;          // last worker result + derived lookups
let abort = null;
let selected = -1;        // node index highlighted on the map
const prof = new Map();   // did → { handle, name, avatar }

// ── worker ───────────────────────────────────────────────────────────────────
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let reqId = 0;
const pending = new Map();
worker.onmessage = (e) => {
  const m = e.data, p = pending.get(m.id);
  if (!p) return;
  if (m.type === 'progress') { setStatus(m.stage + '…'); return; }
  pending.delete(m.id);
  if (m.type === 'error') p.reject(new Error(m.message)); else p.resolve(m);
};
function ask(msg) {
  const id = ++reqId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker.postMessage({ ...msg, id }); });
}

// ── status ───────────────────────────────────────────────────────────────────
function setStatus(msg, err = false) { $('status').textContent = msg; $('status').className = err ? 'status err' : 'status'; }
const setProgress = (f) => { $('prog').style.width = Math.max(0, Math.min(1, f)) * 100 + '%'; };

// ── input ────────────────────────────────────────────────────────────────────
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} on ${new URL(url).pathname.split('/').pop()}`);
  return r.json();
}
async function resolveDid(actor) {
  if (actor.startsWith('did:')) return actor;
  const j = await getJSON(`${API}/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`);
  return j.did;
}
/** A list reference in any of the forms people paste. */
async function parseList(s) {
  let m = s.match(/^at:\/\/([^/]+)\/app\.bsky\.graph\.list\/([^/?#]+)/);
  if (m) return `at://${await resolveDid(m[1])}/app.bsky.graph.list/${m[2]}`;
  m = s.match(/bsky\.app\/profile\/([^/]+)\/lists\/([^/?#]+)/);
  if (m) return `at://${await resolveDid(decodeURIComponent(m[1]))}/app.bsky.graph.list/${m[2]}`;
  return null;
}
async function listMembers(uri, signal) {
  const out = [];
  let cursor, name = 'list';
  do {
    const j = await getJSON(`${API}/app.bsky.graph.getList?list=${encodeURIComponent(uri)}&limit=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''));
    name = j.list?.name || name;
    for (const it of j.items || []) {
      out.push(it.subject.did);
      prof.set(it.subject.did, { handle: it.subject.handle, name: it.subject.displayName || '', avatar: it.subject.avatar || '' });
    }
    cursor = j.cursor;
    if (signal?.aborted) break;
  } while (cursor);
  return { name, members: [...new Set(out)] };
}

async function submit(raw) {
  const s = raw.trim().replace(/^@/, '');
  if (!s) return;
  $('picker').classList.add('hidden');
  try {
    const list = await parseList(s);
    if (list) { history.replaceState(null, '', '?list=' + encodeURIComponent(list)); return runList(list); }
    setStatus('looking up @' + s + '…');
    const did = await resolveDid(s);
    const j = await getJSON(`${API}/app.bsky.graph.getLists?actor=${encodeURIComponent(did)}&limit=50`);
    const lists = (j.lists || []).filter((l) => l.purpose === 'app.bsky.graph.defs#curatelist');
    const el = $('picker');
    el.innerHTML = '';
    const all = document.createElement('button');
    all.className = 'chip all'; all.type = 'button';
    all.innerHTML = `all of @${esc(s)}'s mutuals <small>slow past ~500</small>`;
    all.onclick = () => { history.replaceState(null, '', '?u=' + encodeURIComponent(s)); runMutuals(did, s); };
    el.appendChild(all);
    for (const l of lists) {
      const b = document.createElement('button');
      b.className = 'chip'; b.type = 'button';
      b.innerHTML = `${esc(l.name)}<small>${l.listItemCount ?? ''}</small>`;
      b.onclick = () => { history.replaceState(null, '', '?list=' + encodeURIComponent(l.uri)); runList(l.uri); };
      el.appendChild(b);
    }
    el.classList.remove('hidden');
    setStatus(lists.length ? `pick one of @${s}'s lists, or all their mutuals` : `@${s} has no lists. Read all their mutuals?`);
  } catch (e) { setStatus(String(e.message || e), true); }
}

async function runList(uri) {
  await crawl(async (signal) => {
    setStatus('reading the list…');
    const { name, members } = await listMembers(uri, signal);
    const owner = uri.split('/')[2];
    return { ids: members, owner, title: name, seedRows: {} };
  });
}
async function runMutuals(did, handle) {
  await crawl(async (signal) => {
    setStatus(`reading @${handle}'s follows and followers…`);
    const { mutuals, follows } = await mutualsOf(did, { signal, onProgress: (n) => setStatus(`reading followers… ${num(n)}`) });
    if (!mutuals.length) throw new Error('no mutual follows found');
    return { ids: [did, ...mutuals], owner: did, title: `@${handle}'s mutuals`, seedRows: { [did]: follows } };
  });
}

/** Read every member's follow row, then analyse. Stopping keeps what was read. */
async function crawl(gather) {
  $('go').disabled = true;
  $('stop').classList.remove('hidden');
  abort = new AbortController();
  const signal = abort.signal;
  const t0 = performance.now();
  try {
    const { ids, owner, title, seedRows } = await gather(signal);
    const rows = { ...seedRows };
    const todo = ids.filter((d) => !rows[d]);
    let done = ids.length - todo.length;
    const failed = [];
    setProgress(done / ids.length);
    await pool(todo, CONCURRENCY, async (d) => {
      if (signal.aborted) return;
      // A failed read is NOT "follows nobody": recording [] would turn that
      // person into a false loose end and delete every tie they have. Retry with
      // backoff (a PDS that rate-limits answers 429 without CORS headers, which
      // the browser reports as a network error), then leave them out and say so.
      for (let attempt = 0; attempt < 3 && !signal.aborted; attempt++) {
        try { rows[d] = await followsOf(d, { signal }); break; }
        catch (e) {
          if (e?.name === 'AbortError') return;
          if (attempt === 2) failed.push(d);
          else await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) ** 2));
        }
      }
      done++;
      setProgress(done / ids.length);
      setStatus(`reading follows ${num(done)}/${num(ids.length)} · ${num(stats.requests)} requests · ${((performance.now() - t0) / 1000).toFixed(0)}s`
        + (stats.cacheHits ? ` · ${num(stats.cacheHits)} cached` : ''));
    });
    const read = Object.keys(rows).length;
    base = { ids, rows, owner, title, failed, partial: read < ids.length ? { read, of: ids.length } : null };
    stack = [{ title: /\(\d[\d+]*\)\s*$/.test(title) ? title : `${title} (${num(ids.length)})`, scope: null }];
    hydrateProfiles(ids);
    await load();
  } catch (e) {
    if (e?.name === 'AbortError') setStatus('stopped');
    else setStatus(String(e.message || e), true);
  } finally {
    $('go').disabled = false;
    $('stop').classList.add('hidden');
    abort = null;
  }
}

async function load() {
  if (!base) return;
  setStatus('building the graph…');
  const exclude = $('noEgo').checked && base.owner ? [base.owner] : [];
  await ask({ type: 'load', ids: base.ids, rows: base.rows, mode: $('mode').value, exclude });
  await analyseCurrent();
}

async function analyseCurrent() {
  const top = stack[stack.length - 1];
  const gamma = GAMMAS[+$('gamma').value];
  const t0 = performance.now();
  setStatus('finding communities…');
  const res = await ask({ type: 'analyse', scope: top.scope, gamma });
  view = derive(res);
  selected = -1;
  $('out').classList.remove('hidden');
  renderAll();
  const p = base.partial, nf = base.failed.length, stopped = p ? p.of - p.read - nf : 0;
  setStatus(`${num(view.ids.length)} people · ${num(view.edgeList.length)} ties · analysed in ${((performance.now() - t0) / 1000).toFixed(1)}s`
    + (nf ? ` · ${num(nf)} ${nf === 1 ? 'account' : 'accounts'} could not be read (server refused) and ${nf === 1 ? 'is' : 'are'} left out` : '')
    + (stopped > 0 ? ` · stopped early: ${num(stopped)} not read, left out` : ''));
}

function derive(res) {
  const n = res.ids.length;
  const nbrs = Array.from({ length: n }, () => []);
  const edgeList = [];
  for (let k = 0; k < res.edges.length; k += 3) {
    const i = res.edges[k], j = res.edges[k + 1], w = res.edges[k + 2];
    edgeList.push([i, j, w]); nbrs[i].push(j); nbrs[j].push(i);
  }
  const A = res.analysis;
  return { ...res, A, nbrs, edgeList, order: matrixOrder(A) };
}
function matrixOrder(A) {
  const order = [];
  for (const c of A.communities) order.push(...c.members.slice().sort((a, b) => A.people[b].internal - A.people[a].internal || a - b));
  return order;
}

// ── profiles (decoration, never blocks) ──────────────────────────────────────
async function hydrateProfiles(ids) {
  const missing = ids.filter((d) => !prof.has(d));
  for (let i = 0; i < missing.length; i += 100) {
    const got = await profiles(missing.slice(i, i + 100));
    for (const [k, v] of got) prof.set(k, v);
    if (view) { renderComms(); renderPeople(); }
  }
}
const handle = (did) => prof.get(did)?.handle || did.slice(0, 16) + '…';
const profileUrl = (did) => `https://bsky.app/profile/${encodeURIComponent(prof.get(did)?.handle || did)}`;

// ── colour ───────────────────────────────────────────────────────────────────
// Eight validated categorical slots in fixed order; a ninth community and
// beyond is "other", never a generated hue. Every community also carries a
// direct label (C1…C8 on the map, names on the cards), so identity is never
// colour alone.
let SLOTS = [], OTHER = '#999', EDGE = '', EDGE_HOT = '', MUTED = '', TEXT = '', RULE = '', PAPER = '';
function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  SLOTS = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => cs.getPropertyValue('--s' + i).trim());
  OTHER = cs.getPropertyValue('--s-other').trim();
  EDGE = cs.getPropertyValue('--edge').trim();
  EDGE_HOT = cs.getPropertyValue('--edge-hot').trim();
  MUTED = cs.getPropertyValue('--muted').trim();
  TEXT = cs.getPropertyValue('--text').trim();
  RULE = cs.getPropertyValue('--rule').trim();
  PAPER = cs.getPropertyValue('--paper').trim();
}
const colour = (c) => (c >= 0 && c < 8 ? SLOTS[c] : OTHER);
const label = (c) => 'C' + (c + 1);

// ── render ───────────────────────────────────────────────────────────────────
function renderAll() {
  readTheme();
  renderCrumbs(); renderVerdict(); renderTiles();
  drawMap(); drawMatrix(); renderLegend();
  renderComms(); drawSweep(); renderPeople();
}

function renderCrumbs() {
  $('crumbs').innerHTML = stack.map((s, i) => i === stack.length - 1
    ? `<span>${esc(s.title)}</span>`
    : `<a data-i="${i}">${esc(s.title)}</a> ›`).join(' ');
  for (const a of $('crumbs').querySelectorAll('a')) a.onclick = () => { stack = stack.slice(0, +a.dataset.i + 1); analyseCurrent(); };
}

const bigComms = () => view.A.communities.filter((c) => c.size >= 3);

function renderVerdict() {
  const A = view.A, S = A.summary;
  const big = bigComms();
  const excess = A.excessQ;
  let shape;
  if (S.edges === 0) shape = '<b>No ties at all</b> between these people, so there is nothing to cluster.';
  else if (excess < 0.04) shape = `<b>One well-mixed crowd.</b> The best split scores Q ${f2(A.q)}, no better than the same degrees wired at random (${f2(A.nullQ.mean)}). The groups below are cuts through a blob, not communities.`;
  else if (excess < 0.12) shape = `<b>A loose confederation.</b> There is structure (Q ${f2(A.q)} against ${f2(A.nullQ.mean)} at random), but the groups share many ties.`;
  else if (excess < 0.25) shape = `<b>Distinct communities.</b> Q ${f2(A.q)} against ${f2(A.nullQ.mean)} at random: clear groups, with real traffic between them.`;
  else shape = `<b>Separate worlds.</b> Q ${f2(A.q)} against ${f2(A.nullQ.mean)} at random: the groups barely touch.`;
  const agree = A.agreement >= 0.8 ? 'The 16 runs agree on the borders' : A.agreement >= 0.6 ? 'The runs mostly agree on the borders' : '<b>The runs disagree on the borders</b>, so read the groups as tendencies, not memberships';
  const tight = big.length ? big.slice().sort((a, b) => b.density - a.density)[0] : null;
  $('verdict').innerHTML = `${shape} ${big.length} ${big.length === 1 ? 'community' : 'communities'} of three or more. ${agree} (agreement ${f2(A.agreement)}).`
    + (tight && big.length > 1 ? ` Tightest: <b>${label(tight.id)}</b>, where ${pct(tight.density)} of possible ties exist.` : '');
}

function renderTiles() {
  const A = view.A, S = A.summary;
  const t = (v, l) => `<div class="tile"><div class="v">${v}</div><div class="l">${l}</div></div>`;
  $('tiles').innerHTML = [
    t(num(S.nodes), 'people'),
    t(num(S.edges), base && $('mode').value === 'any' ? 'ties' : 'mutual ties'),
    t(pct(S.density), 'density'),
    t(bigComms().length + (A.communities.length > bigComms().length ? ` <small>+${A.communities.length - bigComms().length} tiny</small>` : ''), 'communities'),
    t(f2(A.q) + ` <small>vs ${f2(A.nullQ.mean)}</small>`, 'modularity · random'),
    t(f2(A.agreement), 'agreement'),
    t(S.degeneracy, 'deepest k-core'),
    t(pct(S.transitivity), 'closed triangles'),
  ].join('');
  $('gammaOut').textContent = GAMMAS[+$('gamma').value].toFixed(2).replace(/0$/, '');
  const g = GAMMAS[+$('gamma').value];
  $('gammaHint').textContent = g < 1 ? 'coarse: fewer, broader groups' : g > 1 ? 'fine: more, tighter groups' : 'standard modularity';
}

function renderLegend() {
  const cs = view.A.communities;
  const shown = cs.filter((c) => c.id < 8 && c.size >= 3);
  const rest = cs.length - shown.length;
  $('legend').innerHTML = shown.map((c) => `<span><i class="sw" style="background:${colour(c.id)}"></i>${label(c.id)} · ${c.size}</span>`).join('')
    + (rest ? `<span><i class="sw" style="background:${OTHER}"></i>other · ${cs.filter((c) => !(c.id < 8 && c.size >= 3)).reduce((s, c) => s + c.size, 0)}</span>` : '')
    + (selected >= 0 ? `<span>· showing @${esc(handle(view.ids[selected]))}'s ties (click empty space to clear)</span>` : '<span>· click a person to see their ties</span>');
}

// ── the map ──────────────────────────────────────────────────────────────────
function fitCanvas(cv, square = false) {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth;
  const h = square ? w : Math.min(560, Math.max(340, w * 0.8));
  cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
let mapGeom = null;
function drawMap() {
  const cv = $('map');
  const { ctx, w, h } = fitCanvas(cv);
  const n = view.ids.length, pad = 18;
  const sx = (x) => pad + (x + 1) / 2 * (w - 2 * pad);
  const sy = (y) => pad + (y + 1) / 2 * (h - 2 * pad);
  const P = view.A.people;
  const maxDeg = Math.max(1, ...P.map((p) => p.degree));
  const rBase = n > 600 ? 1.6 : n > 200 ? 2.4 : 3.4;
  const radius = (i) => rBase + rBase * 1.4 * Math.sqrt(P[i].degree / maxDeg);
  mapGeom = { sx, sy, radius };
  ctx.clearRect(0, 0, w, h);

  // edges
  ctx.lineWidth = 1;
  ctx.strokeStyle = EDGE;
  ctx.beginPath();
  for (const [i, j] of view.edgeList) { ctx.moveTo(sx(view.x[i]), sy(view.y[i])); ctx.lineTo(sx(view.x[j]), sy(view.y[j])); }
  ctx.stroke();
  if (selected >= 0) {
    ctx.strokeStyle = EDGE_HOT; ctx.lineWidth = 1.2; ctx.beginPath();
    for (const j of view.nbrs[selected]) { ctx.moveTo(sx(view.x[selected]), sy(view.y[selected])); ctx.lineTo(sx(view.x[j]), sy(view.y[j])); }
    ctx.stroke();
  }
  // nodes, with a surface ring so overlaps stay legible
  const hot = selected >= 0 ? new Set([selected, ...view.nbrs[selected]]) : null;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = hot && !hot.has(i) ? 0.25 : 1;
    ctx.beginPath(); ctx.arc(sx(view.x[i]), sy(view.y[i]), radius(i), 0, Math.PI * 2);
    ctx.fillStyle = colour(view.A.part[i] < 8 && view.A.communities[view.A.part[i]].size >= 3 ? view.A.part[i] : -1);
    ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = PAPER; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // direct labels at community centroids
  ctx.font = '600 12px ' + getComputedStyle(document.body).getPropertyValue('--mono');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const c of view.A.communities) {
    if (c.id >= 8 || c.size < 3) continue;
    let cx = 0, cy = 0; for (const i of c.members) { cx += view.x[i]; cy += view.y[i]; }
    cx = sx(cx / c.size); cy = sy(cy / c.size);
    ctx.lineWidth = 4; ctx.strokeStyle = PAPER; ctx.strokeText(label(c.id), cx, cy);
    ctx.fillStyle = TEXT; ctx.fillText(label(c.id), cx, cy);
  }
}
function nodeAt(ev) {
  if (!mapGeom || !view) return -1;
  const r = $('map').getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
  let best = -1, bd = 12 * 12;
  for (let i = 0; i < view.ids.length; i++) {
    const dx = mapGeom.sx(view.x[i]) - mx, dy = mapGeom.sy(view.y[i]) - my, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function personTip(i) {
  const p = view.A.people[i], did = view.ids[i], pr = prof.get(did);
  const reach = p.reaches.slice(0, 3).map(([c, w]) => `${label(c)} ${num(w)}`).join(', ');
  return `<b>@${esc(handle(did))}</b>${pr?.name ? `<br><span class="mu">${esc(pr.name)}</span>` : ''}`
    + `<br>${label(p.community)} · ${p.role}`
    + `<br>${num(p.internal)} of ${num(p.degree)} ties inside · participation ${f2(p.participation)}`
    + (reach ? `<br><span class="mu">also tied to ${reach}</span>` : '')
    + `<br><span class="mu">stability ${f2(view.A.stability[i])}${p.betweenness != null ? ` · betweenness ${p.betweenness.toFixed(3)}` : ''}</span>`;
}
function showTip(ev, html) {
  const t = $('tip');
  t.innerHTML = html; t.classList.remove('hidden');
  const x = Math.min(ev.clientX + 14, window.innerWidth - t.offsetWidth - 8);
  const y = ev.clientY + 14 + t.offsetHeight > window.innerHeight ? ev.clientY - t.offsetHeight - 10 : ev.clientY + 14;
  t.style.left = x + 'px'; t.style.top = y + 'px';
}
const hideTip = () => $('tip').classList.add('hidden');
$('map').addEventListener('pointermove', (ev) => { const i = nodeAt(ev); if (i >= 0) showTip(ev, personTip(i)); else hideTip(); });
$('map').addEventListener('pointerleave', hideTip);
$('map').addEventListener('click', (ev) => {
  const i = nodeAt(ev);
  selected = i === selected ? -1 : i;
  drawMap(); renderLegend();
});

// ── the matrix ───────────────────────────────────────────────────────────────
let matGeom = null;
function drawMatrix() {
  const cv = $('matrix');
  const { ctx, w } = fitCanvas(cv, true);
  const order = view.order, n = order.length, pad = 6;
  const cell = (w - 2 * pad) / Math.max(1, n);
  const pos = new Int32Array(n); order.forEach((i, k) => { pos[i] = k; });
  matGeom = { cell, pad, order };
  ctx.clearRect(0, 0, w, w);
  const part = view.A.part, comms = view.A.communities;
  const sz = Math.max(cell, 1);
  for (const [i, j, wt] of view.edgeList) {
    const same = part[i] === part[j];
    ctx.fillStyle = same ? colour(part[i] < 8 && comms[part[i]].size >= 3 ? part[i] : -1) : MUTED;
    ctx.globalAlpha = same ? (wt < 1 ? 0.55 : 1) : (wt < 1 ? 0.3 : 0.6);
    const a = pad + pos[i] * cell, b = pad + pos[j] * cell;
    ctx.fillRect(a, b, sz, sz); ctx.fillRect(b, a, sz, sz);
  }
  ctx.globalAlpha = 1;
  // block outlines
  ctx.strokeStyle = RULE; ctx.lineWidth = 1;
  let k = 0;
  for (const c of comms) {
    if (c.size >= 3) ctx.strokeRect(pad + k * cell, pad + k * cell, c.size * cell, c.size * cell);
    k += c.size;
  }
}
$('matrix').addEventListener('pointermove', (ev) => {
  if (!matGeom) return;
  const r = $('matrix').getBoundingClientRect();
  const a = Math.floor((ev.clientX - r.left - matGeom.pad) / matGeom.cell), b = Math.floor((ev.clientY - r.top - matGeom.pad) / matGeom.cell);
  const n = matGeom.order.length;
  if (a < 0 || b < 0 || a >= n || b >= n) return hideTip();
  const i = matGeom.order[b], j = matGeom.order[a];
  const tied = view.nbrs[i].includes(j);
  const ci = view.A.part[i], cj = view.A.part[j];
  showTip(ev, `<b>@${esc(handle(view.ids[i]))}</b> ${label(ci)}<br><b>@${esc(handle(view.ids[j]))}</b> ${label(cj)}<br><span class="mu">${i === j ? 'same person' : tied ? 'tied' : 'no tie'}</span>`);
});
$('matrix').addEventListener('pointerleave', hideTip);

// ── community cards ──────────────────────────────────────────────────────────
function renderComms() {
  if (!view) return;
  const A = view.A, P = A.people;
  const meter = (x) => `<div class="meter"><i style="width:${Math.max(2, Math.min(100, x * 100))}%"></i></div>`;
  const big = bigComms(), small = A.communities.filter((c) => c.size < 3);
  const html = big.map((c) => {
    const byInside = c.members.slice().sort((a, b) => P[b].internal - P[a].internal);
    const anchors = byInside.slice(0, 3).map((i) => `@${esc(handle(view.ids[i]))}`).join(', ');
    const faces = byInside.slice(0, 18).map((i) => {
      const d = view.ids[i], pr = prof.get(d);
      return `<a href="${profileUrl(d)}" target="_blank" rel="noopener" title="@${esc(handle(d))}">${pr?.avatar ? `<img src="${esc(pr.avatar)}" alt="" loading="lazy">` : ''}</a>`;
    }).join('');
    const bridges = c.members.filter((i) => P[i].role === 'bridge' || P[i].role === 'broker')
      .sort((a, b) => P[b].participation - P[a].participation).slice(0, 4);
    const links = c.links.map((wt, o) => [o, wt]).filter(([o, wt]) => o !== c.id && wt > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const linkTotal = c.links.reduce((s, x, o) => s + (o === c.id ? 0 : x), 0);
    return `<div class="comm">
      <h3><i class="sw" style="background:${colour(c.id < 8 ? c.id : -1)}"></i>${label(c.id)}<span class="n">${c.size} people</span></h3>
      <div class="sub">around ${anchors}</div>
      <div class="metrics">
        <div><div class="v">${pct(c.density)}</div><div class="l">density</div>${meter(c.density)}</div>
        <div><div class="v">${c.lift.toFixed(1)}×</div><div class="l">lift</div></div>
        <div><div class="v">${pct(c.cohesion)}</div><div class="l">cohesion</div>${meter(c.cohesion)}</div>
        <div><div class="v">${pct(c.conductance)}</div><div class="l">leak</div>${meter(c.conductance)}</div>
        <div><div class="v">${c.kcore}</div><div class="l">k-core</div></div>
        <div><div class="v">${pct(c.clustering)}</div><div class="l">clustering</div></div>
      </div>
      <div class="faces">${faces}</div>
      ${links.length ? `<div class="sub">ties out: ${links.map(([o, wt]) => `${label(o)} ${pct(wt / linkTotal)}`).join(' · ')}</div>` : '<div class="sub">no ties out</div>'}
      ${bridges.length ? `<div class="sub">bridges: ${bridges.map((i) => `<a href="${profileUrl(view.ids[i])}" target="_blank" rel="noopener">@${esc(handle(view.ids[i]))}</a>`).join(', ')}</div>` : ''}
      <div class="acts">${c.size >= 8 ? `<button class="ghost small" data-zoom="${c.id}">zoom in: what's inside ${label(c.id)}</button>` : ''}
        <button class="ghost small" data-copy="${c.id}">copy handles</button></div>
    </div>`;
  }).join('');
  const smallHtml = small.length
    ? `<div class="comm"><h3><i class="sw" style="background:${OTHER}"></i>loose ends<span class="n">${small.reduce((s, c) => s + c.size, 0)} people</span></h3>
       <div class="sub">${small.length} pairs and singles with no group of three: people tied mostly outside this set, or not at all.</div></div>`
    : '';
  $('comms').innerHTML = html + smallHtml;
  for (const b of $('comms').querySelectorAll('[data-zoom]')) b.onclick = () => zoom(+b.dataset.zoom);
  for (const b of $('comms').querySelectorAll('[data-copy]')) b.onclick = async () => {
    const c = A.communities[+b.dataset.copy];
    const text = c.members.map((i) => '@' + handle(view.ids[i])).join('\n');
    try { await navigator.clipboard.writeText(text); b.textContent = 'copied'; } catch { b.textContent = 'copy failed'; }
  };
}
function zoom(cid) {
  const c = view.A.communities[cid];
  const top = stack[stack.length - 1];
  stack.push({ title: `${label(cid)} (${c.size})`, scope: c.members.map((i) => view.ids[i]), from: top });
  $('gamma').value = String(GAMMAS.indexOf(1));
  analyseCurrent().then(() => $('crumbs').scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

// ── the sweep ────────────────────────────────────────────────────────────────
let sweepGeom = null;
function drawSweep() {
  const cv = $('sweep');
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = 300;
  cv.style.height = h + 'px'; cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const levels = view.A.sweep || [];
  const top = 26, bottom = 30, left = 8, right = 8;
  const colW = (w - left - right) / levels.length, barW = Math.min(46, colW * 0.62);
  const n = view.ids.length, scale = (h - top - bottom) / n;
  const segs = [];
  const font = getComputedStyle(document.body).getPropertyValue('--mono');
  const chosen = GAMMAS[+$('gamma').value];
  levels.forEach((L, k) => {
    const x = left + k * colW + (colW - barW) / 2;
    const comms = L.communities.map((c, id) => ({ ...c, id })).sort((a, b) => a.parent - b.parent || b.size - a.size);
    let y = top;
    for (const c of comms) {
      const hgt = c.size * scale;
      const gap = hgt > 3 ? 2 : 0;
      const pc = c.parent < 8 && view.A.communities[c.parent]?.size >= 3 ? c.parent : -1;
      ctx.fillStyle = colour(pc);
      ctx.fillRect(x, y, barW, Math.max(0.5, hgt - gap));
      segs.push({ x, y, w: barW, h: hgt, L, c });
      y += hgt;
    }
    ctx.fillStyle = TEXT; ctx.font = '600 11px ' + font; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(L.count), x + barW / 2, top - 8);
    ctx.fillStyle = L.gamma === chosen ? TEXT : MUTED; ctx.font = (L.gamma === chosen ? '700 ' : '400 ') + '10px ' + font;
    ctx.fillText('γ ' + L.gamma, x + barW / 2, h - 10);
    if (L.gamma === chosen) { ctx.fillRect(x, h - bottom + 6, barW, 2); }
  });
  sweepGeom = segs;
  const qs = levels.map((L) => `γ ${L.gamma}: ${L.count}`).join(' · ');
  $('sweepNote').innerHTML = `<span>number above each bar = communities of two or more · ${esc(qs)}</span>`;
}
$('sweep').addEventListener('pointermove', (ev) => {
  if (!sweepGeom) return;
  const r = $('sweep').getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
  const s = sweepGeom.find((g) => mx >= g.x && mx <= g.x + g.w && my >= g.y && my <= g.y + g.h);
  if (!s) return hideTip();
  const names = s.c.members.slice().sort((a, b) => view.A.people[b].degree - view.A.people[a].degree).slice(0, 4).map((i) => '@' + esc(handle(view.ids[i]))).join(', ');
  showTip(ev, `<b>γ ${s.L.gamma}</b> · ${s.c.size} people<br>${pct(s.c.purity)} from ${label(s.c.parent)}<br><span class="mu">${names}</span><br><span class="mu">Q ${f2(s.L.q)} · agreement ${f2(s.L.agreement)}</span>`);
});
$('sweep').addEventListener('pointerleave', hideTip);
$('sweep').addEventListener('click', (ev) => {
  const r = $('sweep').getBoundingClientRect(), mx = ev.clientX - r.left;
  const s = sweepGeom?.find((g) => mx >= g.x - 6 && mx <= g.x + g.w + 6);
  if (s) { $('gamma').value = String(GAMMAS.indexOf(s.L.gamma)); analyseCurrent(); }
});

// ── people table ─────────────────────────────────────────────────────────────
let sortKey = 'betweenness', sortDir = -1, showAll = false;
const COLS = [
  ['person', 'person', (p) => handle(view.ids[p.i])],
  ['community', 'group', (p) => p.community],
  ['role', 'role', (p) => p.role],
  ['internal', 'inside', (p) => p.internal, true],
  ['degree', 'ties', (p) => p.degree, true],
  ['participation', 'particip.', (p) => p.participation, true],
  ['betweenness', 'between.', (p) => p.betweenness ?? 0, true],
  ['stability', 'stability', (p) => view.A.stability[p.i], true],
];
function renderPeople() {
  if (!view) return;
  const col = COLS.find((c) => c[0] === sortKey);
  const rows = view.A.people.slice().sort((a, b) => {
    const x = col[2](a), y = col[2](b);
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sortDir;
  });
  const shown = showAll ? rows : rows.slice(0, 60);
  $('more').classList.toggle('hidden', showAll || rows.length <= 60);
  $('more').textContent = `show all ${num(rows.length)}`;
  const cell = (p) => {
    const d = view.ids[p.i];
    return `<tr><td><a href="${profileUrl(d)}" target="_blank" rel="noopener">@${esc(handle(d))}</a></td>
      <td><i class="sw" style="background:${colour(p.community < 8 && view.A.communities[p.community].size >= 3 ? p.community : -1)}"></i> ${label(p.community)}</td>
      <td>${p.role}</td><td class="num">${num(p.internal)}</td><td class="num">${num(p.degree)}</td>
      <td class="num">${f2(p.participation)}</td><td class="num">${(p.betweenness ?? 0).toFixed(3)}</td>
      <td class="num">${f2(view.A.stability[p.i])}</td></tr>`;
  };
  $('people').innerHTML = `<thead><tr>${COLS.map(([k, h, , isNum]) => `<th data-k="${k}" class="${isNum ? 'num' : ''}">${h}${k === sortKey ? (sortDir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead>
    <tbody>${shown.map(cell).join('')}</tbody>`;
  for (const th of $('people').querySelectorAll('th')) th.onclick = () => {
    if (sortKey === th.dataset.k) sortDir = -sortDir; else { sortKey = th.dataset.k; sortDir = COLS.find((c) => c[0] === sortKey)[3] ? -1 : 1; }
    renderPeople();
  };
}
$('more').onclick = () => { showAll = true; renderPeople(); };

// ── controls ─────────────────────────────────────────────────────────────────
$('f').addEventListener('submit', (e) => { e.preventDefault(); submit($('q').value); });
$('stop').addEventListener('click', () => { if (abort) abort.abort(); });
let gTimer = null;
$('gamma').addEventListener('input', () => {
  $('gammaOut').textContent = GAMMAS[+$('gamma').value];
  clearTimeout(gTimer);
  gTimer = setTimeout(() => { if (view) analyseCurrent().catch((e) => setStatus(e.message, true)); }, 250);
});
$('mode').addEventListener('change', () => { if (base) { stack = stack.slice(0, 1); load().catch((e) => setStatus(e.message, true)); } });
$('noEgo').addEventListener('change', () => { if (base) { stack = stack.slice(0, 1); load().catch((e) => setStatus(e.message, true)); } });
let rT = null;
window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { if (view) { drawMap(); drawMatrix(); drawSweep(); } }, 150); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (view) renderAll(); });

// ── deep links: ?list=at://… or ?u=handle ────────────────────────────────────
const qs = new URLSearchParams(location.search);
if (qs.get('list')) { $('q').value = qs.get('list'); runList(qs.get('list')).catch((e) => setStatus(e.message, true)); }
else if (qs.get('u')) {
  $('q').value = qs.get('u');
  resolveDid(qs.get('u')).then((did) => runMutuals(did, qs.get('u'))).catch((e) => setStatus(e.message, true));
}
