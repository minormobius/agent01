// orbit/app.js — DOM, drag, and the two long-running jobs.
//
// Everything decidable lives next door: game.js deals and grades, matrix.js
// assembles and packs, repo-scan.js reads a repository, card.js draws the
// picture. This file is the wiring, and the rule it keeps is that nothing here
// decides anything a selftest could have checked.

import { prepare, dealHand, rngFor, scoreHand, grade, perAuthor, ringLayout } from './game.js';
import * as M from './matrix.js';
import { scanRepo } from './repo-scan.js';
import { renderCard, copyCanvas, cardAlt, tint, initial } from './card.js';
import { pdsFor } from '../lib/graph.js';

const PUB = 'https://public.api.bsky.app/xrpc';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEYS = '1234567890qwertyui';
const HAND = 20;

const S = {
  circle: null,      // the /api/orbit/circle payload
  pool: [],          // every card the ring can deal
  used: new Set(),   // uris already dealt
  hand: [],          // cards in play, in order
  idx: 0,            // where we are in the hand
  answers: [],       // { did, uri, guess, correct }
  absent: [],        // ring seats with nothing postable
  locked: false,
  state: null,       // the matrix
  view: 'volume',
  abort: null,
  scanning: false,
  sel: null,
};

// ── small helpers ────────────────────────────────────────────────────────────

const shortHandle = (h) => String(h || '').replace(/^@/, '').replace(/\.bsky\.social$/, '');
const mb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function setErr(msg) {
  const el = $('err');
  el.textContent = msg || '';
  el.hidden = !msg;
}
function setStatus(msg) {
  const el = $('status');
  el.textContent = msg || '';
  el.hidden = !msg;
}

async function jget(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json()).error || ''; } catch {}
    throw new Error(detail || `request failed (${r.status})`);
  }
  return r.json();
}

/** Avatar markup, with a coloured initial where there is no picture. */
function faceHTML(p, cls = '') {
  if (p.avatar) return `<img class="${cls}" src="${esc(p.avatar)}" alt="" loading="lazy" data-did="${esc(p.did)}" data-h="${esc(p.handle)}">`;
  return `<span class="${cls} ini" style="background:${tint(p.did)}">${esc(initial(p.handle))}</span>`;
}

/**
 * An avatar URL that 404s leaves an empty circle, and an empty circle in a ring
 * of faces reads as a broken page rather than as an account without a picture.
 * A CDN 404 is routine — people delete avatars — so every face gets the same
 * fallback the no-avatar case already had. Wired programmatically rather than
 * with an inline onerror, so no page here needs to relax a CSP for it.
 */
function wireFaces(root) {
  root.querySelectorAll('img[data-did]').forEach((img) => {
    img.addEventListener('error', () => {
      const span = document.createElement('span');
      span.className = `${img.className} ini`.trim();
      span.style.background = tint(img.dataset.did);
      span.textContent = initial(img.dataset.h);
      img.replaceWith(span);
    }, { once: true });
  });
}

// ── 1. the ring ──────────────────────────────────────────────────────────────

async function run(handle, n, windowMs) {
  setErr(''); setStatus('reading a month of their likes, reposts, replies and quotes…');
  $('go').disabled = true;
  try {
    const circle = await jget(`/api/orbit/circle?seed=${encodeURIComponent(handle)}&n=${n}&window=${windowMs}`);
    if (!circle.ring || circle.ring.length < 3) {
      throw new Error(`only ${circle.ring ? circle.ring.length : 0} accounts to ring — this handle has barely interacted with anyone in that window. Try a longer one.`);
    }
    S.circle = circle;
    S.pool = []; S.used = new Set(); S.hand = []; S.idx = 0; S.answers = []; S.state = null;
    renderRing();
    $('stage').hidden = false;
    $('result').hidden = true;
    $('lab').hidden = true;
    setStatus('dealing the deck…');
    const deck = await jget(`/api/orbit/deck?dids=${encodeURIComponent(circle.ring.map((p) => p.did).join(','))}`);
    S.pool = prepare(deck.cards);
    setStatus('');
    dealMore();
    // On a phone the arena is below the fold behind a header and a form; the
    // first card should not have to be hunted for.
    if (window.innerWidth <= 640) $('arena').scrollIntoView({ behavior: 'smooth', block: 'center' });
    const url = new URL(location.href);
    url.searchParams.set('seed', circle.seed.handle);
    url.hash = '';
    history.replaceState(null, '', url);
  } catch (e) {
    setStatus('');
    setErr(String(e && e.message ? e.message : e));
  } finally {
    $('go').disabled = false;
  }
}

function renderRing() {
  const ring = S.circle.ring;
  const layout = ringLayout(ring.length, { radius: 41 });   // 41% of the arena
  $('orbit-ring').innerHTML = layout.map((p, i) => {
    const person = ring[i];
    return `<button class="seat" data-i="${i}" style="left:${(50 + p.x).toFixed(2)}%;top:${(50 + p.y).toFixed(2)}%" title="@${esc(person.handle)}${person.mutual ? '' : ' — not a mutual'}">
      <span class="disc" style="--s:${p.scale.toFixed(3)};width:calc(clamp(34px,9vw,56px) * ${p.scale.toFixed(3)});height:calc(clamp(34px,9vw,56px) * ${p.scale.toFixed(3)})">
        ${faceHTML(person, 'av')}
      </span>
      <span class="key">${esc(KEYS[i] || '·')}</span>
      <span class="lbl">${esc(shortHandle(person.handle))}</span>
    </button>`;
  }).join('');
  wireFaces($('orbit-ring'));
  $('orbit-ring').querySelectorAll('.seat').forEach((el) => {
    el.addEventListener('click', () => answer(+el.dataset.i));
  });
  renderLegend();
  renderControls();
}

function renderLegend() {
  const ring = S.circle.ring;
  // A seat that can never be the answer must look different from one that can,
  // or the game is quietly asking an impossible question.
  ring.forEach((p, i) => { const el = seatEl(i); if (el) el.classList.toggle('absent', S.absent.includes(p.did)); });
  $('legend').innerHTML = ring.map((p, i) => {
    const absent = S.absent.includes(p.did);
    return `<li class="${absent ? 'no' : ''}">
      <kbd>${esc(KEYS[i] || '·')}</kbd>
      <span class="pip" style="background:${tint(p.did)}"></span>
      <a href="https://bsky.app/profile/${esc(p.handle)}" target="_blank" rel="noopener">@${esc(shortHandle(p.handle))}</a>
      ${p.mutual ? '' : '<span title="not a mutual follow">△</span>'}
      ${absent ? '<span title="nothing long enough to deal">—</span>' : ''}
    </li>`;
  }).join('');
}

function renderControls() {
  $('controls').innerHTML = `
    <button id="more">deal 20 more</button>
    <button id="lab-open">analyse this circle</button>
    <button id="restart">new handle</button>`;
  $('more').addEventListener('click', () => { dealMore(); });
  $('lab-open').addEventListener('click', openLab);
  $('restart').addEventListener('click', () => {
    $('stage').hidden = true; $('result').hidden = true; $('lab').hidden = true;
    $('handle').focus(); $('handle').select();
  });
}

// ── 2. the hand ──────────────────────────────────────────────────────────────

function dealMore() {
  const seed = `${S.circle.seed.did}|${S.used.size}`;
  const out = dealHand(S.pool, {
    count: HAND, rng: rngFor(seed), used: S.used,
    dids: S.circle.ring.map((p) => p.did),
  });
  if (!out.hand.length) {
    setErr('the deck is spent — every long enough post from this circle has been dealt.');
    return;
  }
  S.absent = out.absent;
  for (const c of out.hand) S.used.add(c.uri);
  S.hand.push(...out.hand);
  renderLegend();
  $('result').hidden = true;
  showCard();
}

const current = () => S.hand[S.idx] || null;

function showCard() {
  const card = $('card');
  const c = current();
  if (!c) {
    card.classList.add('empty');
    card.innerHTML = 'hand over';
    renderHud();
    return finish();
  }
  card.classList.remove('empty', 't2', 't3');
  // Longer post, smaller type — see the note on #card in index.html.
  if (c.text.length > 180) card.classList.add('t3');
  else if (c.text.length > 80) card.classList.add('t2');
  card.style.transform = '';
  card.scrollTop = 0;
  card.innerHTML = `
    <div class="txt">${esc(c.text)}</div>
    <div class="meta"><span>${c.words} words</span><span>${c.embed ? c.embed : ''}</span></div>
    <div class="reveal" id="reveal" hidden></div>`;
  renderHud();
}

function renderHud() {
  const sc = scoreHand(S.answers, S.circle.ring.length);
  const n = S.hand.length;
  $('hud').innerHTML = `
    <span>card <b>${Math.min(S.idx + 1, n)}</b> / ${n}</span>
    <span>right <b>${sc.correct}</b></span>
    <span>${n ? Math.round(sc.pct * 100) : 0}% · blind guessing is ${Math.round(sc.chance * 100)}%</span>
    <span class="hint">drag the post to a face — or just tap one</span>`;
  $('progbar').style.width = `${n ? (S.idx / n) * 100 : 0}%`;
}

function seatEl(i) { return $('orbit-ring').querySelector(`.seat[data-i="${i}"]`); }
function clearMarks() {
  $('orbit-ring').querySelectorAll('.seat').forEach((el) => el.classList.remove('armed', 'right', 'wrong', 'dim'));
}

function answer(i) {
  const c = current();
  if (!c || S.locked) return;
  const ring = S.circle.ring;
  const correct = ring[i] && ring[i].did === c.did;
  const rightIdx = ring.findIndex((p) => p.did === c.did);
  S.answers.push({ did: c.did, uri: c.uri, guess: ring[i] ? ring[i].did : null, correct });
  S.locked = true;

  clearMarks();
  if (seatEl(i)) seatEl(i).classList.add(correct ? 'right' : 'wrong');
  if (!correct && seatEl(rightIdx)) seatEl(rightIdx).classList.add('right');

  const author = ring[rightIdx] || { handle: c.did };
  const rev = $('reveal');
  if (rev) {
    rev.hidden = false;
    rev.className = `reveal ${correct ? 'right' : 'wrong'}`;
    rev.innerHTML = `${correct ? '✓' : '✗'} <a href="https://bsky.app/profile/${esc(author.handle)}/post/${esc(String(c.uri).split('/').pop())}" target="_blank" rel="noopener">@${esc(author.handle)}</a>`;
  }
  const card = $('card');
  const seat = seatEl(rightIdx);
  if (seat && card) {
    const a = card.getBoundingClientRect(), b = seat.getBoundingClientRect();
    card.style.transition = 'transform .45s cubic-bezier(.3,.7,.3,1), opacity .45s ease';
    card.style.transform = `translate(${(b.left + b.width / 2) - (a.left + a.width / 2)}px, ${(b.top + b.height / 2) - (a.top + a.height / 2)}px) scale(.18)`;
    card.style.opacity = '0.25';
  }
  renderHud();

  setTimeout(() => {
    const el = $('card');
    el.style.transition = ''; el.style.opacity = '';
    S.locked = false;
    S.idx++;
    clearMarks();
    showCard();
  }, correct ? 950 : 1500);
}

function finish() {
  if (!S.answers.length) return;
  const sc = grade(scoreHand(S.answers, S.circle.ring.length));
  $('result').hidden = false;
  $('gradecard').innerHTML = `
    <div class="letter">${esc(sc.grade)}</div>
    <div class="who">
      <div class="lab">${esc(sc.label)}</div>
      <div class="blurb">${esc(sc.blurb)}</div>
      <div class="nums">${sc.correct} of ${sc.total} · ${Math.round(sc.pct * 100)}% against ${Math.round(sc.chance * 100)}% blind · lift ${Math.round(sc.lift * 100)}%</div>
    </div>`;

  const by = new Map(S.circle.ring.map((p) => [p.did, p]));
  $('whoyouknow').innerHTML = perAuthor(S.answers).map((e) => {
    const p = by.get(e.did) || { handle: e.did, did: e.did };
    return `<li>
      <span class="pip" style="background:${tint(e.did)};width:8px;height:8px;border-radius:50%;display:inline-block"></span>
      <span class="h">@${esc(shortHandle(p.handle))}</span>
      <span class="meter"><i style="width:${Math.round(e.pct * 100)}%"></i></span>
      <span class="n">${e.correct}/${e.seen}${e.seen < 2 ? ' · once' : ''}</span>
    </li>`;
  }).join('');

  $('resultcontrols').innerHTML = `
    <button id="more2" class="go">deal 20 more</button>
    <button id="shot">copy the circle as an image</button>
    <button id="openlab">analyse this circle →</button>`;
  $('more2').addEventListener('click', () => dealMore());
  $('shot').addEventListener('click', shareImage);
  $('openlab').addEventListener('click', openLab);
}

// ── 3. drag ──────────────────────────────────────────────────────────────────
// Pointer events, not HTML5 drag-and-drop: the latter does not exist on touch,
// and this game is mostly played on a phone. One code path for both.

function armDrag() {
  const card = $('card');
  let drag = null;
  const seats = () => [...$('orbit-ring').querySelectorAll('.seat')];

  const nearest = (x, y) => {
    let best = null, bestD = Infinity;
    for (const el of seats()) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < bestD) { bestD = d; best = el; }
    }
    // A face is armed only when the card is genuinely over it. Too generous a
    // threshold and a small nudge answers the question for you.
    return best && bestD < Math.max(64, best.getBoundingClientRect().width * 1.25) ? best : null;
  };

  card.addEventListener('pointerdown', (e) => {
    if (S.locked || !current()) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    card.setPointerCapture(e.pointerId);
    card.classList.add('dragging');
  });
  card.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${(dx * 0.015).toFixed(2)}deg)`;
    const hit = drag.moved ? nearest(e.clientX, e.clientY) : null;
    for (const el of seats()) el.classList.toggle('armed', el === hit);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const hit = drag.moved ? nearest(e.clientX, e.clientY) : null;
    card.classList.remove('dragging');
    drag = null;
    for (const el of seats()) el.classList.remove('armed');
    if (hit) answer(+hit.dataset.i);
    else card.style.transform = '';
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', (e) => { drag = null; card.classList.remove('dragging'); card.style.transform = ''; });

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    const i = KEYS.indexOf(e.key.toLowerCase());
    if (i >= 0 && S.circle && i < S.circle.ring.length) { e.preventDefault(); answer(i); }
  });
}

// ── 4. the picture ───────────────────────────────────────────────────────────

async function shareImage(ev) {
  const btn = ev.currentTarget;
  btn.disabled = true;
  const was = btn.textContent;
  btn.textContent = 'drawing…';
  try {
    const sc = grade(scoreHand(S.answers, S.circle.ring.length));
    const model = { seed: S.circle.seed, ring: S.circle.ring, score: sc };
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const canvas = await renderCard(model, { dark });
    const out = $('shareout');
    out.innerHTML = '';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', cardAlt(model));
    out.appendChild(canvas);
    const how = await copyCanvas(canvas, `orbit-${shortHandle(S.circle.seed.handle)}.png`);
    btn.textContent = how === 'clipboard' ? '✓ copied — paste it anywhere' : '✓ downloaded';
  } catch (e) {
    btn.textContent = 'could not draw it';
    setErr(String(e && e.message ? e.message : e));
  } finally {
    setTimeout(() => { btn.disabled = false; btn.textContent = was; }, 2600);
  }
}

// ── 5. the lab: whole repositories, one at a time ────────────────────────────

function openLab() {
  $('lab').hidden = false;
  const people = [S.circle.seed, ...S.circle.ring];
  $('labwarn').innerHTML = `This downloads <b>${people.length} whole repositories</b> — every post, like and repost each of them has ever written — through your browser, one at a time, and throws each one away as soon as its row is extracted. Expect <b>tens to hundreds of megabytes</b> and several minutes. Nothing is uploaded and nothing is stored; the finished matrix packs into a link you can keep.`;
  $('labcontrols').innerHTML = `<button id="scan" class="go">analyse the circle</button><button id="stop" hidden>stop</button>`;
  $('scan').addEventListener('click', analyse);
  $('stop').addEventListener('click', () => { if (S.abort) S.abort.abort(); });
  renderScanList(people, true);
  $('lab').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderScanList(people, reset) {
  if (reset) {
    $('scanlist').innerHTML = people.map((p, i) => `
      <li data-i="${i}" id="scan-${i}">
        <span class="n">${i === 0 ? '★' : i}</span>
        <span class="h">@${esc(shortHandle(p.handle))}</span>
        <span class="track"><i></i></span>
        <span class="b">waiting</span>
      </li>`).join('');
  }
}

function scanRow(i) { return $(`scan-${i}`); }

async function analyse() {
  if (S.scanning) return;
  const people = [S.circle.seed, ...S.circle.ring];
  S.state = M.newState(S.circle.seed, S.circle.ring);
  S.scanning = true;
  S.abort = new AbortController();
  $('scan').disabled = true;
  $('stop').hidden = false;
  $('mviews').hidden = false;
  $('mlegend').hidden = false;
  renderViews();

  const targets = new Set(people.map((p) => p.did));
  for (let i = 0; i < people.length; i++) {
    if (S.abort.signal.aborted) break;
    const p = people[i];
    const li = scanRow(i);
    li.querySelector('.b').textContent = 'resolving…';
    try {
      const pds = await pdsFor(p.did, { signal: S.abort.signal });
      const row = await scanRepo(pds, p.did, targets, {
        signal: S.abort.signal,
        onProgress: ({ bytes, total }) => {
          li.querySelector('.b').textContent = mb(bytes);
          li.querySelector('.track i').style.width = total ? `${Math.min(100, (bytes / total) * 100).toFixed(1)}%` : '100%';
        },
      });
      M.applyRow(S.state, row);
      li.classList.add('done');
      li.querySelector('.track i').style.width = '100%';
      li.querySelector('.b').textContent = `${mb(row.bytes)} · ${row.posts.toLocaleString()} posts`;
      renderMatrix();
    } catch (e) {
      li.classList.add('fail');
      li.querySelector('.b').textContent = S.abort.signal.aborted ? 'stopped' : String(e && e.message ? e.message : e).slice(0, 40);
    }
  }
  S.scanning = false;
  $('scan').disabled = false;
  $('scan').textContent = 'analyse again';
  $('stop').hidden = true;
  renderMatrix();
}

function renderViews() {
  $('mviews').innerHTML = `
    <button data-v="volume" class="${S.view === 'volume' ? 'on' : ''}">volume of interactions</button>
    <button data-v="first" class="${S.view === 'first' ? 'on' : ''}">first contact</button>
    <button id="perma">copy permalink</button>`;
  $('mviews').querySelectorAll('button[data-v]').forEach((b) => b.addEventListener('click', () => {
    S.view = b.dataset.v; renderViews(); renderMatrix();
  }));
  $('perma').addEventListener('click', permalink);
}

const RAMP = ['#e8f1f7', '#c6e0ee', '#95c7e0', '#5da7cd', '#2f85b6', '#12608f', '#0a3f63'];
function heat(t) { return RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.round(t * (RAMP.length - 1))))]; }

function renderMatrix() {
  const st = S.state;
  if (!st) return;
  const n = st.people.length;
  const max = M.maxVolume(st) || 1;
  const { lo, hi } = M.dateRange(st);
  const span = (hi && lo && hi > lo) ? hi - lo : 1;

  const head = `<tr><th></th>${st.people.map((p) => `<th class="col" title="@${esc(p.handle)}">${faceHTML(p)}</th>`).join('')}</tr>`;
  const rows = st.people.map((p, i) => {
    const read = M.hasRow(st, i);
    const cells = st.people.map((q, j) => {
      if (i === j) return `<td class="cell self">·</td>`;
      if (!read) return `<td class="cell unread" title="@${esc(p.handle)}'s repository has not been read yet"></td>`;
      const c = M.cell(st, i, j);
      if (S.view === 'volume') {
        const v = c && c.counts ? c.counts.total : 0;
        if (!v) return `<td class="cell" data-i="${i}" data-j="${j}" title="never"></td>`;
        const t = Math.sqrt(v / max);
        return `<td class="cell has" data-i="${i}" data-j="${j}" style="background:${heat(t)};color:${t > 0.55 ? '#fff' : '#123'}">${v > 999 ? Math.round(v / 100) / 10 + 'k' : v}</td>`;
      }
      const f = c && c.first;
      if (!f || !f.createdAt) return `<td class="cell" data-i="${i}" data-j="${j}" title="never spoke first"></td>`;
      const t = 1 - (Date.parse(f.createdAt) - lo) / span;   // older = deeper
      return `<td class="cell has" data-i="${i}" data-j="${j}" style="background:${heat(t)};color:${t > 0.55 ? '#fff' : '#123'}">'${esc(String(f.createdAt).slice(2, 4))}</td>`;
    }).join('');
    return `<tr><th class="row"><div class="wrap"><span class="nm">@${esc(shortHandle(p.handle))}</span>${faceHTML(p)}</div></th>${cells}</tr>`;
  }).join('');

  $('mtable').innerHTML = head + rows;
  wireFaces($('mtable'));
  $('mtable').querySelectorAll('td.cell[data-i]').forEach((td) => {
    const show = () => showCell(+td.dataset.i, +td.dataset.j, td);
    td.addEventListener('mouseenter', show);
    td.addEventListener('click', show);
  });

  const p = M.progress(st);
  $('mlegend').innerHTML = S.view === 'volume'
    ? `<span><span class="swatch" style="background:linear-gradient(90deg,${RAMP.join(',')})"></span> 1 → ${max.toLocaleString()} interactions</span>
       <span>row → column is what that person did TO the other</span>
       <span>${p.done}/${p.total} repositories read</span>`
    : `<span><span class="swatch" style="background:linear-gradient(90deg,${RAMP.slice().reverse().join(',')})"></span> recent → oldest first contact</span>
       <span>the year each first reply was written</span>
       <span>${p.done}/${p.total} repositories read</span>`;
}

function showCell(i, j, td) {
  const st = S.state;
  $('mtable').querySelectorAll('td.sel').forEach((e) => e.classList.remove('sel'));
  if (td) td.classList.add('sel');
  const a = st.people[i], b = st.people[j];
  const c = M.cell(st, i, j);
  const back = M.cell(st, j, i);
  const d = $('detail');
  d.hidden = false;
  if (!c) {
    d.innerHTML = `<div class="hd">@${esc(a.handle)} → @${esc(b.handle)}</div><div class="body empty">no recorded interaction in that direction.</div>`;
    return;
  }
  const co = c.counts || {};
  const f = c.first;
  const uri = M.firstUri(st, i, j);
  const rkey = uri ? uri.split('/').pop() : null;
  const PLURAL = { reply: 'replies', quote: 'quotes', repost: 'reposts', like: 'likes', mention: 'mentions' };
  const bits = ['reply', 'quote', 'repost', 'like', 'mention']
    .filter((k) => co[k]).map((k) => `${co[k].toLocaleString()} ${co[k] === 1 ? k : PLURAL[k]}`).join(' · ');
  d.innerHTML = `
    <div class="hd">@${esc(a.handle)} → @${esc(b.handle)} · ${esc(bits || 'nothing')}${back && back.counts ? ` · ${back.counts.total} back` : ''}</div>
    ${f ? `<div class="body">${f.text ? esc(f.text) : '<span class="empty">(fetching the post…)</span>'}</div>
      <div class="hd" style="margin-top:.5rem">first ${esc(f.kind)} · ${esc(String(f.createdAt || '').slice(0, 10))}${rkey ? ` · <a href="https://bsky.app/profile/${esc(a.did)}/post/${esc(rkey)}" target="_blank" rel="noopener">open</a>` : ''}</div>`
      : '<div class="body empty">no reply or quote in this direction — only the lighter interactions.</div>'}`;
  if (f && !f.text && uri) hydrateTexts([uri]);
}

/**
 * Post text is deliberately absent from a permalink (169 posts would be 50 KB
 * of fragment). It comes back from the AppView 25 at a time, and a post that
 * has since been deleted comes back as nothing — which reads as deleted rather
 * than as a quotation from a ghost.
 */
async function hydrateTexts(uris) {
  const want = uris.filter(Boolean).slice(0, 25);
  if (!want.length) return;
  try {
    const qs = want.map((u) => `uris=${encodeURIComponent(u)}`).join('&');
    const d = await jget(`${PUB}/app.bsky.feed.getPosts?${qs}`);
    const byUri = new Map((d.posts || []).map((p) => [p.uri, p]));
    for (const k in S.state.cells) {
      const c = S.state.cells[k];
      if (!c.first || c.first.text) continue;
      const [i, j] = k.split(',').map(Number);
      const u = M.firstUri(S.state, i, j);
      const p = u && byUri.get(u);
      if (p && p.record && typeof p.record.text === 'string') c.first.text = p.record.text;
      else if (u && want.includes(u)) c.first.text = '(this post has been deleted)';
    }
    const sel = $('mtable').querySelector('td.sel');
    if (sel) showCell(+sel.dataset.i, +sel.dataset.j, sel);
  } catch { /* the matrix is still the matrix without its quotations */ }
}

async function permalink(ev) {
  const btn = ev.currentTarget;
  const was = btn.textContent;
  try {
    const payload = await M.encodeState(S.state);
    const url = `${location.origin}${location.pathname}#m=${payload}`;
    history.replaceState(null, '', url);
    try { await navigator.clipboard.writeText(url); btn.textContent = `✓ copied (${(url.length / 1024).toFixed(1)} KB link)`; }
    catch { btn.textContent = '✓ in the address bar'; }
  } catch (e) {
    btn.textContent = 'could not pack it';
  }
  setTimeout(() => { btn.textContent = was; }, 2600);
}

// ── 6. opening a permalink ───────────────────────────────────────────────────

async function openPermalink(payload) {
  setStatus('unpacking a shared matrix…');
  try {
    S.state = await M.decodeState(payload);
    // Handles rot and avatars are not in the payload; the DIDs are, so the
    // labels are rebuilt from the network rather than frozen at share time.
    try {
      const dids = S.state.people.map((p) => p.did);
      const qs = dids.slice(0, 25).map((d) => `actors=${encodeURIComponent(d)}`).join('&');
      const d = await jget(`${PUB}/app.bsky.actor.getProfiles?${qs}`);
      const by = new Map((d.profiles || []).map((p) => [p.did, p]));
      S.state.people = S.state.people.map((p) => {
        const hit = by.get(p.did);
        return hit ? { ...p, handle: hit.handle, displayName: hit.displayName || '', avatar: hit.avatar || null } : p;
      });
    } catch { /* labels fall back to the handles baked into the link */ }

    $('lab').hidden = false;
    const seed = S.state.people[0];
    $('labwarn').innerHTML = `A shared closeness matrix for <b>@${esc(seed.handle)}</b> and ${S.state.people.length - 1} accounts, ${M.progress(S.state).done} of ${M.progress(S.state).total} repositories read. Nothing was downloaded to show you this — it all travelled in the link.`;
    $('labcontrols').innerHTML = `<button id="playthis" class="go">play this circle</button>`;
    $('playthis').addEventListener('click', () => {
      $('handle').value = seed.handle;
      run(seed.handle, Math.min(16, S.state.people.length - 1), 2592000000);
    });
    $('scanlist').innerHTML = '';
    $('mviews').hidden = false;
    $('mlegend').hidden = false;
    renderViews();
    renderMatrix();
    setStatus('');
    // warm the first page of quotations so hovering is instant
    const uris = [];
    for (const k in S.state.cells) {
      const [i, j] = k.split(',').map(Number);
      const u = M.firstUri(S.state, i, j);
      if (u) uris.push(u);
    }
    hydrateTexts(uris);
  } catch (e) {
    setStatus('');
    setErr('that link does not unpack — it may have been truncated in transit.');
  }
}

// ── boot ─────────────────────────────────────────────────────────────────────

function boot() {
  armDrag();
  $('entry').addEventListener('submit', (e) => {
    e.preventDefault();
    const h = $('handle').value.trim();
    if (!h) return;
    try { localStorage.setItem('orbit.handle', h); } catch {}
    run(h, +$('ringsize').value, +$('window').value);
  });

  const hash = location.hash.startsWith('#m=') ? location.hash.slice(3) : null;
  const seed = new URL(location.href).searchParams.get('seed');
  const last = (() => { try { return localStorage.getItem('orbit.handle'); } catch { return null; } })();
  if (seed || last) $('handle').value = seed || last;

  if (hash) openPermalink(hash);
  else if (seed) run(seed, +$('ringsize').value, +$('window').value);
  else $('handle').focus();
}

boot();
