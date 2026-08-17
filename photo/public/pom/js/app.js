// app.js — the only file here that touches the document. Everything it decides
// (which plates, in what order, at what size, laid out where) comes from
// pom.js, which is DOM-free and selftested.

import {
  unpack, select, facet, histogram, justify, visibleRows, bucket,
  thumbUrl, mirrorUrl, links, caption, describe, shopUrl, bloomUrl, barcode,
  encodeState, parseState, EMPTY_STATE, SORTS, IA,
} from './pom.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const nf = new Intl.NumberFormat('en');

const dom = {
  q: $('q'), qClear: $('q-clear'), sort: $('sort'), count: $('count'), countNote: $('count-note'),
  hist: $('hist'), histTip: $('hist-tip'), yearsNote: $('years-note'), groups: $('facet-groups'),
  chips: $('chips'), grid: $('grid'), scroller: $('scroller'), empty: $('empty'),
  facets: $('facets'), srcNote: $('src-note'),
  lb: $('lightbox'), lbImg: $('lb-img'), lbCap: $('lb-cap'),
};

let index = null;
let state = { ...EMPTY_STATE };
let ids = [];           // selected row indices, in display order
let plan = { rows: [], height: 0 };
let mounted = new Map(); // grid position → tile element
let colWidth = 0;

// ── the grid ───────────────────────────────────────────────────────────────

// The row height the layout aims for. Deliberately not exposed as a control:
// the only thing a "tile size" slider changes here is how many plates you can
// compare at once, and every value between 150 and 400 is fine, so it is one
// more decision to make before seeing anything.
const TARGET = 230;
const GAP = 10;

/**
 * The Commons width to ask for. There are eleven permitted widths and no
 * others (see pom.js), so this snaps rather than scales — and it snaps on the
 * *device* pixels the tile will occupy, or a retina screen renders 250px of
 * paint into 500px of glass and every plate looks like a photocopy.
 */
function tileWidth() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return bucket(TARGET * 0.7 * dpr);
}
function lightboxWidth() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return bucket(Math.min(window.innerWidth, 1400) * dpr * 0.8);
}

function relayout() {
  colWidth = dom.scroller.clientWidth - 24;
  plan = justify(ids.map((i) => index.rows[i].aspect), colWidth, TARGET, GAP);
  dom.grid.style.height = `${plan.height}px`;
  for (const node of mounted.values()) node.remove();
  mounted.clear();
  paint();
}

/**
 * How many tiles may stay in the document beyond the ones on screen.
 *
 * ⚠️ EVICTING A TILE THE MOMENT IT LEAVES THE VIEWPORT ABORTS ITS DOWNLOAD.
 * A fling through the collection mounted and dropped hundreds of plates faster
 * than any of them could arrive, and the whole flight showed up at
 * upload.wikimedia.org as a burst of opened-and-reset connections — 7,581
 * requests nobody wanted the answer to. Measured in the browser as a wall of
 * `net::ERR_ABORTED` and, from a host that had had enough, `429`s on the
 * requests that were real.
 *
 * So a tile that scrolls off is *kept*, absolutely positioned where it belongs
 * and simply out of view, until the mounted count passes this cap; then the
 * ones furthest from the viewport go first. Scrolling back is free, the origin
 * sees each plate asked for once, and a few hundred parked <img> elements cost
 * nothing measurable.
 */
const KEEP = 700;

function paint() {
  if (!plan.rows.length) return;
  const top = dom.scroller.scrollTop - dom.grid.offsetTop;
  const height = dom.scroller.clientHeight;
  const [from, to] = visibleRows(plan, top, height);
  const w = tileWidth();

  for (let r = from; r < to; r++) {
    const row = plan.rows[r];
    let x = 0;
    for (let k = row.from; k < row.to; k++) {
      const tw = (index.rows[ids[k]].aspect) * row.h;
      let node = mounted.get(k);
      if (!node) {
        node = makeTile(ids[k], w);
        node._y = row.y;
        mounted.set(k, node);
        dom.grid.appendChild(node);
      }
      node.style.cssText = `left:${x}px;top:${row.y}px;width:${tw}px;height:${row.h}px`;
      x += tw + GAP;
    }
  }

  if (mounted.size > KEEP) {
    const mid = top + height / 2;
    const cold = [...mounted.entries()]
      .filter(([, n]) => Math.abs(n._y - mid) > height)
      .sort((a, b) => Math.abs(b[1]._y - mid) - Math.abs(a[1]._y - mid));
    for (const [k, node] of cold.slice(0, mounted.size - KEEP)) {
      node.remove();
      mounted.delete(k);
    }
  }
}

function makeTile(rowIndex, width) {
  const row = index.rows[rowIndex];
  const btn = el('button', 'tile');
  btn.type = 'button';
  btn.setAttribute('role', 'listitem');
  const img = el('img');
  img.src = thumbUrl(row, width);
  img.alt = describe(row);
  img.loading = 'lazy';
  img.decoding = 'async';
  // The fade is on load rather than always-on, because a wall of empty boxes
  // filling in is the clearest signal that the page is working; a wall of
  // already-opaque boxes that pop is not.
  if (img.complete) img.classList.add('on');
  else img.addEventListener('load', () => img.classList.add('on'), { once: true });
  // Two archives hold the same scans, so a plate that will not load from the
  // first is asked of the second rather than left as a hole in the wall. That
  // is not hypothetical: Commons rate-limits a client it dislikes, and the
  // failure arrives as a broken image with no explanation anywhere.
  img.addEventListener('error', () => fallback(img, row), { once: true });
  btn.appendChild(img);
  btn.appendChild(el('span', 'cap', caption(row)));
  btn.addEventListener('click', () => openPlate(row.id));
  return btn;
}

/** One retry, on the other archive. A second failure is left visible. */
function fallback(img, row) {
  if (img.dataset.fell) { img.closest('.tile')?.classList.add('broken'); return; }
  img.dataset.fell = '1';
  img.addEventListener('load', () => img.classList.add('on'), { once: true });
  img.addEventListener('error', () => img.closest('.tile')?.classList.add('broken'), { once: true });
  img.src = mirrorUrl(row);
}

let frame = 0;
dom.scroller.addEventListener('scroll', () => {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; paint(); });
}, { passive: true });

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(relayout, 120);
});

// ── filters ────────────────────────────────────────────────────────────────

const FACETS = [
  { key: 'fruit', label: 'Fruit', show: 12 },
  { key: 'artist', label: 'Painter', show: 10 },
  { key: 'sci', label: 'Species', show: 8 },
  // Two geographies, coarse then fine. The raw place strings are fully
  // qualified ("Hood River, Hood River County, Oregon, United States"), which
  // is 1,658 mostly-unique values — precise, and useless as a first move.
  { key: 'region', label: 'State or country', show: 10 },
  { key: 'place', label: 'Town or orchard', show: 8 },
];

function apply({ push = false, keepScroll = false } = {}) {
  ids = select(index, state);
  drawCount();
  drawChips();
  drawFacets();
  drawHistogram();
  dom.empty.hidden = ids.length > 0;
  if (!keepScroll) dom.scroller.scrollTop = 0;
  relayout();
  const url = `${location.pathname}${encodeState(state)}`;
  if (push) history.pushState(null, '', url);
  else history.replaceState(null, '', url);
}

function set(patch, opts) {
  state = { ...state, ...patch };
  apply(opts);
}

function drawCount() {
  dom.count.textContent = nf.format(ids.length);
  const filtered = ids.length !== index.count;
  dom.countNote.textContent = filtered ? `of ${nf.format(index.count)} plates` : 'plates';
}

function drawChips() {
  dom.chips.replaceChildren();
  const add = (label, value, clear) => {
    const chip = el('button', 'chip');
    chip.appendChild(el('b', null, `${label} ${value}`));
    chip.appendChild(el('span', 'x', '×'));
    chip.addEventListener('click', () => set(clear));
    dom.chips.appendChild(chip);
  };
  for (const { key, label } of FACETS) {
    if (state[key]) add(`${label.toLowerCase()}:`, state[key], { [key]: '' });
  }
  if (state.y0 || state.y1) {
    const span = state.y0 === state.y1 ? String(state.y0) : `${state.y0 || '…'}–${state.y1 || '…'}`;
    add('years:', span, { y0: 0, y1: 0 });
  }
  if (state.q) add('search:', state.q, { q: '' });
  if (dom.chips.childElementCount > 1) {
    const all = el('button', 'chip');
    all.appendChild(el('b', null, 'clear all'));
    all.addEventListener('click', () => { dom.q.value = ''; set({ ...EMPTY_STATE, sort: state.sort }); });
    dom.chips.appendChild(all);
  }
}

function drawFacets() {
  dom.groups.replaceChildren();
  for (const { key, label, show } of FACETS) {
    // Counted over the *selected* rows — see `facet()` in pom.js. The one
    // exception is the facet that is itself pinned: narrowing by it would leave
    // a list of one, and then no way to pick a different value without first
    // clearing this one.
    const over = state[key] ? select(index, { ...state, [key]: '' }) : ids;
    const counts = facet(index, over, key);
    if (!counts.length) continue;
    const grp = el('section', 'grp');
    const h = el('h2', null, label);
    grp.appendChild(h);
    const max = counts[0][1];
    const expanded = grp.dataset.expanded === '1';
    const render = (n) => {
      for (const child of [...grp.children].slice(1)) child.remove();
      for (const [value, count] of counts.slice(0, n)) {
        const b = el('button', 'opt');
        b.type = 'button';
        b.setAttribute('aria-pressed', String(state[key] === value));
        const lab = el('span', 'lab', value);
        lab.style.setProperty('--w', String(count / max));
        b.appendChild(lab);
        b.appendChild(el('span', 'n', nf.format(count)));
        b.addEventListener('click', () => set({ [key]: state[key] === value ? '' : value }));
        grp.appendChild(b);
      }
      if (counts.length > n) {
        const more = el('button', 'ghost more', `${nf.format(counts.length - n)} more…`);
        more.addEventListener('click', () => render(counts.length));
        grp.appendChild(more);
      }
    };
    render(expanded ? counts.length : show);
    dom.groups.appendChild(grp);
  }
}

// ── the year histogram, which is also the year filter ──────────────────────

function drawHistogram() {
  const bars = histogram(index, ids);
  if (!bars.length) return;
  const max = Math.max(...bars.map(([, n]) => n), 1);
  dom.hist.replaceChildren();
  for (const [year, n] of bars) {
    const b = el('div', 'yb');
    b.style.height = `${n ? Math.max(2, (n / max) * 100) : 1}%`;
    if (!n) b.classList.add('zero');
    const inRange = (!state.y0 && !state.y1)
      || (year >= (state.y0 || -Infinity) && year <= (state.y1 || Infinity));
    if ((state.y0 || state.y1) && inRange) b.classList.add('on');
    b.title = `${year} · ${nf.format(n)} plate${n === 1 ? '' : 's'}`;
    b.dataset.year = String(year);
    dom.hist.appendChild(b);
  }
  const [lo, hi] = index.years;
  dom.yearsNote.textContent = state.y0 || state.y1
    ? `${state.y0 || lo}–${state.y1 || hi}` : `${lo}–${hi}`;
  dom.histTip.textContent = bars.undated
    ? `${nf.format(bars.undated)} plates carry no date — a year filter excludes them`
    : 'click a year · drag across the bars for a span';
}

// Drag across the bars for a span. Pointer events rather than mouse, so the
// same three handlers cover a finger; `touch-action: pan-y` on the strip keeps
// the page scrollable through a stray vertical drag.
let dragFrom = 0;
dom.hist.addEventListener('pointerdown', (e) => {
  const y = Number(e.target?.dataset?.year || 0);
  if (!y) return;
  dragFrom = y;
  dom.hist.setPointerCapture(e.pointerId);
  e.preventDefault();
});
dom.hist.addEventListener('pointermove', (e) => {
  if (!dragFrom) return;
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const y = Number(under?.dataset?.year || 0);
  if (y) previewYears(dragFrom, y);
});
dom.hist.addEventListener('pointerup', (e) => {
  if (!dragFrom) return;
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const y = Number(under?.dataset?.year || 0) || dragFrom;
  const [a, b] = dragFrom <= y ? [dragFrom, y] : [y, dragFrom];
  // Clicking the year you are already alone on clears it — otherwise a
  // single-year filter is a dead end you can only leave via the chip.
  const same = state.y0 === a && state.y1 === b;
  dragFrom = 0;
  set(same ? { y0: 0, y1: 0 } : { y0: a, y1: b });
});
function previewYears(a, b) {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  for (const node of dom.hist.children) {
    const y = Number(node.dataset.year);
    node.classList.toggle('on', y >= lo && y <= hi);
  }
}

// ── the lightbox ───────────────────────────────────────────────────────────

let lbPos = -1;

function openPlate(id, { push = true } = {}) {
  const pos = ids.findIndex((i) => index.rows[i].id === id);
  if (pos < 0) return;
  lbPos = pos;
  showPlate(push);
}

function showPlate(push) {
  const row = index.rows[ids[lbPos]];
  const L = links(row);
  dom.lb.hidden = false;
  document.body.style.overflow = 'hidden';

  // Show the grid rendition immediately and swap in the large one when it has
  // decoded, rather than opening onto an empty frame for the second and a half
  // a 500 kB plate takes. Same picture, two widths — the browser reuses the
  // small one as a placeholder at no cost.
  dom.lbImg.src = thumbUrl(row, tileWidth());
  dom.lbImg.alt = describe(row);
  const big = new Image();
  const wanted = row.id;
  big.src = thumbUrl(row, lightboxWidth());
  big.decode?.().then(() => {
    if (index.rows[ids[lbPos]]?.id === wanted) dom.lbImg.src = big.src;
  }).catch(() => {});

  const cap = dom.lbCap;
  cap.replaceChildren();
  const title = el('span', 'title');
  title.appendChild(document.createTextNode(caption(row)));
  if (row.sci) { title.appendChild(document.createTextNode(' ')); title.appendChild(el('em', null, row.sci)); }
  cap.appendChild(title);

  const meta = [];
  if (row.place) meta.push(row.place);
  if (row.date) meta.push(row.date);
  if (row.artist) meta.push(row.artist);
  if (row.note) meta.push(row.note);
  meta.push(barcode(row.id));
  if (row.src === IA) meta.push('Internet Archive — no catalogue record');
  cap.appendChild(el('span', 'meta', meta.join(' · ')));

  const doors = el('span', 'doors');
  const link = (href, text, cls) => {
    const a = el('a', cls, text);
    a.href = href;
    if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
    doors.appendChild(a);
    return a;
  };
  // Both doors on every picture — the surface's rule, and the reason /bloom
  // was findable at all. See photo/CLAUDE.md.
  link(shopUrl(row, lightboxWidth()), 'open in shop', 'hi');
  link(bloomUrl(row, lightboxWidth()), 'grow variations', 'hi');
  link(L.full, `full scan${row.w ? ` · ${row.w}×${row.h}` : ''}`);
  if (L.commons) link(L.commons, 'on Commons');
  else link(L.ia, 'on the Internet Archive');
  link(L.nal, 'at the NAL');
  cap.appendChild(doors);

  if (push) history.replaceState(null, '', `${location.pathname}${encodeState({ ...state, id: row.id })}`);
}

function closePlate() {
  dom.lb.hidden = true;
  lbPos = -1;
  document.body.style.overflow = '';
  history.replaceState(null, '', `${location.pathname}${encodeState({ ...state, id: 0 })}`);
}

function step(d) {
  if (lbPos < 0) return;
  const next = lbPos + d;
  if (next < 0 || next >= ids.length) return;
  lbPos = next;
  showPlate(true);
}

$('lb-close').addEventListener('click', closePlate);
$('lb-prev').addEventListener('click', () => step(-1));
$('lb-next').addEventListener('click', () => step(1));
dom.lb.addEventListener('click', (e) => { if (e.target === dom.lb || e.target.classList.contains('lb-fig')) closePlate(); });

// ── chrome ─────────────────────────────────────────────────────────────────

for (const [value, label] of Object.entries(SORTS)) {
  const o = el('option', null, label);
  o.value = value;
  dom.sort.appendChild(o);
}
dom.sort.addEventListener('change', () => set({ sort: dom.sort.value }));

let qTimer = 0;
dom.q.addEventListener('input', () => {
  dom.qClear.hidden = !dom.q.value;
  clearTimeout(qTimer);
  qTimer = setTimeout(() => set({ q: dom.q.value.trim() }), 140);
});
dom.qClear.addEventListener('click', () => { dom.q.value = ''; dom.qClear.hidden = true; set({ q: '' }); });
$('empty-clear').addEventListener('click', () => { dom.q.value = ''; set({ ...EMPTY_STATE, sort: state.sort }); });

$('facets-toggle').addEventListener('click', (e) => {
  const open = dom.facets.classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});
$('about-btn').addEventListener('click', () => { $('about').hidden = false; });
$('about-close').addEventListener('click', () => { $('about').hidden = true; });
$('about').addEventListener('click', (e) => { if (e.target === $('about')) $('about').hidden = true; });

window.addEventListener('keydown', (e) => {
  if (!$('about').hidden && e.key === 'Escape') { $('about').hidden = true; return; }
  if (lbPos >= 0) {
    if (e.key === 'Escape') closePlate();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    return;
  }
  if (e.key === '/' && document.activeElement !== dom.q) { e.preventDefault(); dom.q.focus(); }
});

window.addEventListener('popstate', () => {
  state = parseState(location.search);
  dom.q.value = state.q;
  dom.qClear.hidden = !state.q;
  dom.sort.value = state.sort;
  apply({ keepScroll: true });
  if (state.id) openPlate(state.id, { push: false }); else if (lbPos >= 0) closePlate();
});

// ── boot ───────────────────────────────────────────────────────────────────

(async function boot() {
  dom.count.textContent = '…';
  let packed;
  try {
    const r = await fetch('./data/index.json');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    packed = await r.json();
  } catch (err) {
    dom.count.textContent = '—';
    dom.countNote.textContent = 'the catalogue would not load';
    dom.empty.hidden = false;
    dom.empty.textContent = `Could not load the catalogue: ${err.message}`;
    return;
  }
  index = unpack(packed);
  state = parseState(location.search);
  dom.q.value = state.q;
  dom.qClear.hidden = !state.q;
  dom.sort.value = state.sort;

  const s = index.source || {};
  dom.srcNote.replaceChildren();
  dom.srcNote.appendChild(document.createTextNode(
    `Images served by Wikimedia Commons and the Internet Archive — nothing is hosted here. `
    + `Catalogue harvested ${s.harvested || 'from Commons'}; public domain.`,
  ));

  apply();
  if (state.id) openPlate(state.id, { push: false });
})();
