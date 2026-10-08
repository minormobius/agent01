// app.js — the report half of /obit. Reads the frozen chapter and draws one
// widget per section. Every number comes from stats.js; this file decides
// nothing, it only draws. To add a widget: write a function (ch) → void that
// fills one element, and add it to WIDGETS.
import * as S from './stats.js';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const fmt = n => n.toLocaleString('en-US');
const compact = n => (n >= 10000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : fmt(n));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = t => { const d = new Date(t); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const postUrl = uri => { const [, , did, , rkey] = uri.split('/'); return `https://bsky.app/profile/${did}/post/${rkey}`; };
const KIND_LABEL = { image: 'pictures', video: 'video', link: 'links', quote: 'quotes', text: 'text' };

// Thumbnails come from the frozen file, so they are checked before they become
// a src: only the two Bluesky CDNs, only https.
const safeThumb = u => (typeof u === 'string' && /^https:\/\/(cdn|video)\.bsky\.app\//.test(u) ? u : null);

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (k === 'style') Object.assign(e.style, v);
    else if (v != null) e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
function svg(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

// ---- one tooltip for the page: value first, label after ------------------
const tip = $('tip');
function showTip(evt, value, label) {
  tip.replaceChildren(el('b', { text: value }), document.createTextNode(label));
  tip.style.display = 'block';
  const r = tip.getBoundingClientRect();
  let x = evt.clientX + 14, y = evt.clientY + 14;
  if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - 14;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}
const hideTip = () => { tip.style.display = 'none'; };
function hover(node, value, label) {
  node.setAttribute('tabindex', '0');
  node.setAttribute('aria-label', `${value} ${label}`);
  node.addEventListener('pointermove', e => showTip(e, value, label));
  node.addEventListener('pointerleave', hideTip);
  node.addEventListener('focus', () => {
    const r = node.getBoundingClientRect();
    showTip({ clientX: r.right, clientY: r.top }, value, label);
  });
  node.addEventListener('blur', hideTip);
}

// The smallest round number at or above v whose quarters are also round.
const niceMax = v => {
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].map(m => m * p).find(m => m >= v);
};
const ticksFor = max => { const step = max / 4; return [0, 1, 2, 3, 4].map(i => Math.round(i * step)); };

// A column chart: one series, so one colour and no legend box.
// Charts are drawn at the card's real width, so 1 unit is 1 CSS pixel and
// text stays 11px on a phone instead of shrinking with a fixed viewBox.
const widthOf = host => Math.max(280, Math.round(host.clientWidth - 28));

function columns(host, data, { width = widthOf(host), height = 220, label, value, xLabel, ariaLabel }) {
  const W = width, H = height, L = 34, B = 24, T = 8;
  const max = niceMax(Math.max(...data.map(value)));
  const band = (W - L) / data.length;
  const bw = Math.min(24, band * 0.7);
  const y = v => T + (H - T - B) * (1 - v / max);
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': ariaLabel });
  for (const t of ticksFor(max)) {
    s.append(svg('line', { class: t ? 'grid' : 'base', x1: L, x2: W, y1: y(t), y2: y(t) }));
    s.append(svg('text', { x: L - 6, y: y(t) + 4, 'text-anchor': 'end' }, fmt(t)));
  }
  data.forEach((d, i) => {
    const x = L + band * i + (band - bw) / 2, v = value(d), top = y(v), h = y(0) - top;
    const g = svg('g');
    const hit = svg('rect', { class: 'hit', x: L + band * i, y: T, width: band, height: H - T - B });
    // 4px rounded data-end, square at the baseline.
    const r = Math.min(4, h / 2, bw / 2);
    const mark = svg('path', {
      class: 'mark', fill: 'var(--sky)',
      d: h <= 0 ? '' : `M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z`,
    });
    g.append(hit, mark);
    hover(hit, fmt(v), label(d));
    hit.addEventListener('pointerenter', () => mark.classList.add('on'));
    hit.addEventListener('pointerleave', () => mark.classList.remove('on'));
    const xl = xLabel(d, i);
    if (xl) g.append(svg('text', { x: L + band * i + band / 2, y: H - 6, 'text-anchor': 'middle' }, xl));
    s.append(g);
  });
  host.replaceChildren(s);
}

// ---- widgets --------------------------------------------------------------

function tiles(ch) {
  const s = S.summary(ch);
  const t = (label, value, hero) => el('div', { class: 'tile' + (hero ? ' hero' : '') },
    el('div', { class: 'value', text: value }), el('div', { class: 'label', text: label }));
  $('tiles').replaceChildren(
    t('entries filed in chapter one', fmt(s.entries), true),
    t('distinct works', fmt(s.works)),
    t('artists', fmt(s.artists)),
    t('days open', fmt(s.days)),
    t('per day, on average', String(s.perDay)),
    t('likes on the works', compact(s.likes)),
    t('others who spoke', fmt(s.speakers)),
  );
}

function weekly(ch) {
  const w = S.weekly(ch);
  columns($('weekly'), w, {
    ariaLabel: 'Entries per week',
    value: d => d.n,
    label: d => `entries, week of ${day(d.week)}`,
    // A month is labelled at its first week, unless that would crowd the
    // label before it (the chapter opened in the last week of February).
    xLabel: (() => {
      let last = -9;
      return (d, i) => {
        const prev = w[i - 1];
        if (prev && prev.week.slice(5, 7) === d.week.slice(5, 7)) return '';
        if (i - last < 3) return '';
        last = i;
        return MON[+d.week.slice(5, 7) - 1];
      };
    })(),
  });
}

function clock(ch) {
  const c = S.clock(ch);
  columns($('clock'), c.map((n, h) => ({ n, h })), {
    height: 230, ariaLabel: 'Entries by hour of day, UTC',
    value: d => d.n,
    label: d => `entries filed ${String(d.h).padStart(2, '0')}:00–${String(d.h).padStart(2, '0')}:59 UTC`,
    xLabel: d => (d.h % 6 === 0 ? String(d.h).padStart(2, '0') : ''),
  });
}

function growth(ch) {
  const g = S.canonGrowth(ch);
  const W = widthOf($('growth')), H = 230, L = 34, B = 24, T = 8;
  const t0 = Date.parse(g[0].t), t1 = Date.parse(g.at(-1).t);
  const max = niceMax(g.at(-1).artists);
  const x = t => L + (W - L - 8) * (Date.parse(t) - t0) / (t1 - t0);
  const y = v => T + (H - T - B) * (1 - v / max);
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Distinct artists over time' });
  for (const t of ticksFor(max)) {
    s.append(svg('line', { class: t ? 'grid' : 'base', x1: L, x2: W, y1: y(t), y2: y(t) }));
    s.append(svg('text', { x: L - 6, y: y(t) + 4, 'text-anchor': 'end' }, fmt(t)));
  }
  for (let m = 3; m <= 10; m += 1) {
    const t = `2026-${String(m).padStart(2, '0')}-01T00:00:00Z`;
    if (Date.parse(t) < t0 || m % 2 === 0) continue;
    s.append(svg('text', { x: x(t), y: H - 6, 'text-anchor': 'middle' }, MON[m - 1]));
  }
  let d = `M${x(g[0].t)},${y(g[0].artists)}`;
  for (let i = 1; i < g.length; i++) d += ` H${x(g[i].t)} V${y(g[i].artists)}`;
  s.append(svg('path', { d: `${d} V${y(0)} H${x(g[0].t)} Z`, fill: 'var(--sky)', opacity: 0.1 }));
  s.append(svg('path', { d, fill: 'none', stroke: 'var(--sky)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const end = g.at(-1);
  s.append(svg('circle', { cx: x(end.t), cy: y(end.artists), r: 4, fill: 'var(--sky)', stroke: 'var(--panel)', 'stroke-width': 2 }));
  s.append(svg('text', { class: 'lbl', x: x(end.t) - 8, y: y(end.artists) - 10, 'text-anchor': 'end' }, `${end.artists} artists`));
  // Crosshair: the pointer finds the date, not the line.
  const hair = svg('line', { class: 'base', y1: T, y2: H - B, visibility: 'hidden' });
  const dot = svg('circle', { r: 4, fill: 'var(--sky)', stroke: 'var(--panel)', 'stroke-width': 2, visibility: 'hidden' });
  const hit = svg('rect', { class: 'hit', x: L, y: T, width: W - L, height: H - T - B });
  s.append(hair, dot, hit);
  hit.addEventListener('pointermove', e => {
    const box = s.getBoundingClientRect();
    const px = (e.clientX - box.left) * (W / box.width);
    const tt = t0 + (t1 - t0) * Math.min(1, Math.max(0, (px - L) / (W - L - 8)));
    let i = g.findIndex(p => Date.parse(p.t) > tt);
    i = i === -1 ? g.length - 1 : Math.max(0, i - 1);
    const p = g[i];
    hair.setAttribute('x1', x(p.t)); hair.setAttribute('x2', x(p.t)); hair.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', x(p.t)); dot.setAttribute('cy', y(p.artists)); dot.setAttribute('visibility', 'visible');
    showTip(e, `${p.artists} artists`, `by ${day(p.t)}, entry ${fmt(i + 1)}`);
  });
  hit.addEventListener('pointerleave', () => { hideTip(); hair.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); });
  $('growth').replaceChildren(s);
}

function media(ch) {
  const m = S.media(ch);
  const total = Object.values(m).reduce((a, b) => a + b, 0);
  const stack = el('div', { class: 'stack', role: 'img', 'aria-label': 'Works by medium' });
  const legend = el('div', { class: 'legend' });
  for (const k of S.KINDS) {
    if (!m[k]) continue;
    const pct = Math.round(100 * m[k] / total);
    const seg = el('div', { style: { flex: `${m[k]} 0 0`, background: `var(--k-${k})` } });
    hover(seg, `${fmt(m[k])} · ${pct}%`, KIND_LABEL[k]);
    stack.append(seg);
    const key = el('span', { style: { '--c': `var(--k-${k})` } });
    key.style.setProperty('--c', `var(--k-${k})`);
    key.append(KIND_LABEL[k], el('b', { text: fmt(m[k]) }));
    legend.append(key);
  }
  $('media').replaceChildren(stack, legend);
}

function artists(ch) {
  const A = S.artists(ch);
  const who = d => ch.people[d]?.h ?? d;
  const top = A.slice(0, 20);
  const W = widthOf($('artists')), row = 24, L = Math.min(210, Math.round(W * 0.45)), H = top.length * row + 6;
  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Entries per artist, top 20' });
  s.append(svg('line', { class: 'base', x1: L, x2: L, y1: 0, y2: H }));
  top.forEach((a, i) => {
    const y = i * row + 4, w = (W - L - 40) * a.entries / top[0].entries, bh = 14;
    const g = svg('g');
    const fits = Math.floor((L - 12) / 6.2), h = who(a.did);
    const name = svg('text', { class: 'lbl', x: L - 8, y: y + 11, 'text-anchor': 'end' }, h.length > fits ? h.slice(0, fits - 1) + '…' : h);
    const r = Math.min(4, w / 2);
    const bar = svg('path', { class: 'mark', fill: 'var(--sky)',
      d: `M${L},${y} H${L + w - r} Q${L + w},${y} ${L + w},${y + r} V${y + bh - r} Q${L + w},${y + bh} ${L + w - r},${y + bh} H${L} Z` });
    const val = svg('text', { x: L + w + 6, y: y + 11 }, fmt(a.entries));
    const hit = svg('rect', { class: 'hit', x: 0, y: y - 4, width: W, height: row });
    hover(hit, `${fmt(a.entries)} entries`, `${who(a.did)} · ${fmt(a.likes)} likes · first filed ${day(a.first)}`);
    g.append(name, bar, val, hit);
    s.append(g);
  });
  const table = el('table', {},
    el('thead', {}, el('tr', {}, el('th', { class: 'n', text: '#' }), el('th', { text: 'artist' }),
      el('th', { class: 'n', text: 'entries' }), el('th', { class: 'n', text: 'likes' }),
      el('th', { text: 'first filed' }), el('th', { text: 'mostly' }))),
    el('tbody', {}, ...A.map((a, i) => {
      const most = Object.entries(a.kinds).sort((x, y) => y[1] - x[1])[0][0];
      return el('tr', {}, el('td', { class: 'n', text: String(i + 1) }),
        el('td', {}, el('a', { href: `https://bsky.app/profile/${a.did}`, text: who(a.did) })),
        el('td', { class: 'n', text: fmt(a.entries) }), el('td', { class: 'n', text: fmt(a.likes) }),
        el('td', { text: day(a.first) }), el('td', { text: KIND_LABEL[most] }));
    })));
  const det = el('details', {}, el('summary', { text: `all ${A.length} artists, as a table` }), el('div', { class: 'scroll' }, table));
  $('artists').replaceChildren(s, det);
}

function workCard(ch, e) {
  const w = e.w, who = ch.people[w.by]?.h ?? w.by;
  const thumb = safeThumb(w.thumb);
  const pic = thumb
    ? el('div', { class: 'pic' }, el('img', { src: thumb, alt: w.text || `work by ${who}`, loading: 'lazy' }))
    : el('div', { class: 'pic txt', text: w.text || '(no text)' });
  if (w.kind === 'video') pic.append(el('span', { class: 'badge', text: 'video' }));
  return el('a', { class: 'work', href: postUrl(w.uri), 'data-uri': w.uri, target: '_blank', rel: 'noopener' }, pic,
    el('div', { class: 'meta' }, el('div', { class: 'likes', text: `${fmt(w.likes)} likes` }), el('div', { class: 'who', text: who })));
}

function loved(ch) {
  $('loved').replaceChildren(...S.loved(ch, 24).map(e => workCard(ch, e)));
}

function months(ch) {
  const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  $('months').replaceChildren(...S.months(ch).map(m => {
    const top = m.top.w, who = ch.people[top.by]?.h ?? top.by;
    const text = top.text ? `“${top.text.split('\n')[0].slice(0, 120)}”` : '(untitled)';
    return el('li', {}, el('div', { class: 'm', text: NAMES[+m.month.slice(5) - 1] }),
      el('div', { class: 'd' },
        el('small', { text: `${fmt(m.entries)} entries · ${m.newArtists} new artist${m.newArtists === 1 ? '' : 's'}` }),
        el('a', { href: postUrl(top.uri), 'data-uri': top.uri, text: text }),
        document.createTextNode(` by ${who}, ${fmt(top.likes)} likes`)));
  }));
}

function voices(ch) {
  const { canon } = S.split(ch);
  const items = canon.filter(p => p.by !== ch.curator).map(p => {
    const who = ch.people[p.by]?.h ?? p.by;
    const body = p.cap ? el('q', { text: p.cap }) : el('span', { text: p.w ? '(shared a work)' : '(a picture)' });
    const href = `https://bsky.app/profile/${p.by}/post/${p.u}`;
    return el('li', {}, el('a', { href, 'data-uri': S.uriOf(p), style: { color: 'inherit' } }, body),
      el('span', { class: 'who', text: `${who} · ${day(p.t)}` }));
  });
  $('voices').replaceChildren(...items);
}

function mosaic(ch) {
  const es = S.entries(ch);
  const host = $('mosaic'), pick = $('who'), note = $('whoNote');
  const cells = es.map((e, i) => {
    const who = ch.people[e.w.by]?.h ?? e.w.by;
    const thumb = safeThumb(e.w.thumb);
    const a = el('a', { href: postUrl(e.w.uri), target: '_blank', rel: 'noopener', class: thumb ? '' : 't' });
    if (thumb) a.append(el('img', { src: thumb, alt: '', loading: 'lazy' }));
    hover(a, `#${i + 1} · ${who}`, `${day(e.t)} · ${fmt(e.w.likes)} likes${e.w.text ? ' · ' + e.w.text.slice(0, 80) : ''}`);
    a.dataset.by = e.w.by;
    return a;
  });
  host.replaceChildren(...cells);
  for (const a of S.artists(ch)) pick.append(el('option', { value: a.did, text: `${ch.people[a.did]?.h ?? a.did} (${a.entries})` }));
  pick.addEventListener('change', () => {
    const d = pick.value;
    let n = 0;
    for (const c of cells) { const on = !d || c.dataset.by === d; c.classList.toggle('dim', !on); n += on; }
    note.textContent = d ? `${fmt(n)} of ${fmt(cells.length)} entries` : '';
  });
}

const WIDGETS = [tiles, weekly, growth, clock, media, artists, loved, months, voices, mosaic];
// The ones whose geometry depends on the width, redrawn when it changes.
const FLUID = [weekly, growth, clock, artists];

const run = (list, ch) => { for (const w of list) { try { w(ch); } catch (e) { console.error(w.name, e); } } };

try {
  const res = await fetch('chapter-1.json');
  if (!res.ok) throw new Error(`chapter-1.json → ${res.status}`);
  const ch = await res.json();
  run(WIDGETS, ch);
  let lastW = innerWidth, t;
  addEventListener('resize', () => {
    if (innerWidth === lastW) return; // a phone's toolbar hiding is not a resize worth redrawing
    lastW = innerWidth;
    clearTimeout(t);
    t = setTimeout(() => run(FLUID, ch), 150);
  });
} catch (e) {
  const err = $('err');
  err.style.display = 'block';
  err.textContent = `The report could not load its data: ${e.message}. The obituary above is complete without it.`;
}
