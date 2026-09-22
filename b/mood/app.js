// mood/app.js — the ring, the list, and the link between them.
//
// Everything decidable is in mood.js and gated by mood.selftest.mjs; this file
// is DOM. Note that mood.js is imported BOTH here and by the worker
// (lib/jev.js) — the question shapes are the contract with the model, and a
// contract written twice is a contract that drifts.

import {
  readMoods, aggregate, spread, moodName, moodColour, flavourTally,
  ringSegments, arcPath, VALENCE, ENERGY,
} from './mood.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SVG = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const n = document.createElementNS(SVG, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

const CX = 200, CY = 200, R_IN = 104, R_OUT = 140, R_AV = 92;

const S = { moods: [], data: null, sel: null };

function setErr(m) { const e = $('err'); e.textContent = m || ''; e.hidden = !m; }
function setStatus(m) { const e = $('status'); e.textContent = m || ''; e.hidden = !m; }

// ── the ring ─────────────────────────────────────────────────────────────────

function drawRing(data, moods) {
  const svg = $('ring');
  svg.innerHTML = '';
  const agg = aggregate(moods);
  const title = el('title', { id: 'ringtitle' });
  title.textContent = `The mood ring for @${data.profile.handle}: ten bands, one per recent post, reading ${moodName(agg.valence, agg.energy)} overall.`;
  svg.appendChild(title);

  // The stone: the whole account's mood, as a soft halo behind the avatar.
  // Drawn from the aggregate colour, which was averaged on the plane.
  const defs = el('defs');
  const grad = el('radialGradient', { id: 'stone-glow' });
  grad.appendChild(el('stop', { offset: '0%', 'stop-color': agg.solid, 'stop-opacity': 0.55 }));
  grad.appendChild(el('stop', { offset: '70%', 'stop-color': agg.solid, 'stop-opacity': 0.18 }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': agg.solid, 'stop-opacity': 0 }));
  defs.appendChild(grad);

  // The avatar is clipped to a circle. It is fetched through /api/orbit/av —
  // cdn.bsky.app sends no access-control-allow-origin, and while a plain <img>
  // does not care, keeping one path for avatars on this surface means the next
  // thing that wants to read pixels back already works.
  const clip = el('clipPath', { id: 'av-clip' });
  clip.appendChild(el('circle', { cx: CX, cy: CY, r: R_AV }));
  defs.appendChild(clip);
  svg.appendChild(defs);

  svg.appendChild(el('circle', { cx: CX, cy: CY, r: R_OUT + 24, fill: 'url(#stone-glow)' }));

  const segs = ringSegments(moods.length);
  moods.forEach((m, i) => {
    const s = segs[i];
    const c = moodColour(m.valence, m.energy, m.confidence);
    const g = el('g', { class: 'seg', 'data-i': i });
    g.appendChild(el('path', {
      d: arcPath(CX, CY, R_IN, R_OUT, s.from, s.to),
      fill: m.answered ? c.css : 'none',
      stroke: m.answered ? 'none' : 'currentColor',
      'stroke-width': m.answered ? 0 : 1,
      'stroke-dasharray': m.answered ? '' : '3 3',
      'stroke-opacity': 0.35,
    }));
    const t = el('title');
    t.textContent = m.answered
      ? `${m.flavour || 'unnamed'} · ${moodName(m.valence, m.energy)} · confidence ${Math.round(m.confidence * 100)}%\n${m.text.slice(0, 120)}`
      : 'the model returned no reading for this post';
    g.appendChild(t);
    g.addEventListener('mouseenter', () => select(i));
    g.addEventListener('click', () => select(i));
    svg.appendChild(g);
  });

  if (data.profile.avatar) {
    svg.appendChild(el('image', {
      href: `/api/orbit/av?u=${encodeURIComponent(data.profile.avatar)}`,
      x: CX - R_AV, y: CY - R_AV, width: R_AV * 2, height: R_AV * 2,
      'clip-path': 'url(#av-clip)', preserveAspectRatio: 'xMidYMid slice',
    }));
  } else {
    svg.appendChild(el('circle', { cx: CX, cy: CY, r: R_AV, fill: agg.solid, 'fill-opacity': 0.3 }));
    const ini = el('text', { x: CX, y: CY + 14, 'text-anchor': 'middle', 'font-size': 52, fill: 'currentColor', 'fill-opacity': 0.6 });
    ini.textContent = (data.profile.handle || '?')[0].toUpperCase();
    svg.appendChild(ini);
  }
  svg.appendChild(el('circle', { cx: CX, cy: CY, r: R_AV, fill: 'none', stroke: agg.solid, 'stroke-width': 3, 'stroke-opacity': 0.75 }));
}

// ── the stone panel ──────────────────────────────────────────────────────────

function drawStone(data, moods) {
  const agg = aggregate(moods);
  const sp = spread(moods);
  const tally = flavourTally(moods);
  const unread = moods.filter((m) => !m.answered).length;
  const p = data.profile;

  // The spread is the only thing that separates ten even-tempered posts from a
  // ring torn between two extremes — both average to the same stone.
  const spreadWord = sp < 0.18 ? 'all of a piece' : sp < 0.40 ? 'some range' : sp < 0.65 ? 'wide range' : 'all over the place';

  $('stone').innerHTML = `
    <div class="who"><a href="https://bsky.app/profile/${esc(p.handle)}" target="_blank" rel="noopener">@${esc(p.handle)}</a>${p.displayName ? ` · ${esc(p.displayName)}` : ''}</div>
    <div class="name" style="color:${agg.solid}">${esc(moodName(agg.valence, agg.energy))}</div>
    <div class="nums">
      valence <b>${agg.valence.toFixed(2)}</b> / 4 &nbsp;·&nbsp; energy <b>${agg.energy.toFixed(2)}</b> / 4<br>
      ${esc(VALENCE[Math.round(agg.valence)] || '')} and ${esc(ENERGY[Math.round(agg.energy)] || '')}
    </div>
    <div class="flavours">${tally.map((f) => `<span>${esc(f.flavour)} ×${f.n}</span>`).join('')}</div>
    <div class="meter">
      spread across the ten — ${esc(spreadWord)}
      <div class="track"><i style="width:${Math.round(Math.min(1, sp / 0.9) * 100)}%;background:${agg.solid}"></i></div>
      mean confidence ${Math.round(agg.confidence * 100)}%${unread ? ` · ${unread} post${unread === 1 ? '' : 's'} the model would not read` : ''}<br>
      ${data.cached ? `from cache (${data.cached})` : `${data.latency_ms} ms · ${data.usage ? `${data.usage.input_tokens} tokens in, ${data.usage.output_tokens} out` : ''}`}
    </div>`;
}

// ── the list ─────────────────────────────────────────────────────────────────

function drawPosts(moods) {
  $('posts').innerHTML = moods.map((m, i) => {
    const c = moodColour(m.valence, m.energy, m.confidence);
    const rkey = m.uri ? String(m.uri).split('/').pop() : null;
    return `<li data-i="${i}" style="border-left-color:${m.answered ? c.solid : 'var(--rule)'}">
      <span class="n">${i + 1}</span>
      <span>
        <span class="t">${esc(m.text)}</span>
        <span class="meta">${m.isReply ? '↩ reply' : 'post'}${m.createdAt ? ` · ${esc(String(m.createdAt).slice(0, 10))}` : ''}${rkey && S.data ? ` · <a href="https://bsky.app/profile/${esc(S.data.profile.handle)}/post/${esc(rkey)}" target="_blank" rel="noopener">open</a>` : ''}</span>
      </span>
      <span class="r">${m.answered
        ? `<b>${esc(m.flavour || '—')}</b>v ${m.valence.toFixed(1)} · e ${m.energy.toFixed(1)}<br>${Math.round(m.confidence * 100)}% sure`
        : '<b>—</b>no reading'}</span>
    </li>`;
  }).join('');
  $('posts').querySelectorAll('li').forEach((li) => {
    li.addEventListener('mouseenter', () => select(+li.dataset.i));
    li.addEventListener('click', () => select(+li.dataset.i));
  });
  $('posts').addEventListener('mouseleave', () => select(null), { once: false });
}

/** One highlight, shared by the ring and the list — hover either, both respond. */
function select(i) {
  S.sel = i;
  document.querySelectorAll('#ring .seg').forEach((g) => {
    const on = +g.dataset.i === i;
    g.classList.toggle('on', on);
    g.classList.toggle('dim', i !== null && !on);
  });
  document.querySelectorAll('#posts li').forEach((li) => {
    const on = +li.dataset.i === i;
    li.classList.toggle('on', on);
    li.classList.toggle('dim', i !== null && !on);
  });
}

// ── the legend wheel ─────────────────────────────────────────────────────────
// Drawn from the same moodColour() the ring uses, so the key cannot drift from
// the thing it is a key to.

function drawWheel() {
  const svg = $('wheel');
  if (!svg) return;
  const cx = 170, cy = 170, rIn = 34, rOut = 96;

  // SVG's +y points DOWN, and every circumplex ever drawn puts arousal UP. So
  // a circumplex angle `a` is drawn at SVG angle `-a`: the colour sampled at a
  // point is still exactly the colour moodColour() gives that mood, the wheel
  // just reads the way a reader expects it to.
  for (let a = 0; a < 360; a += 6) {
    const rad = (a * Math.PI) / 180;
    const v = 2 + 2 * Math.cos(rad), e = 2 + 2 * Math.sin(rad);
    const c = moodColour(v, e, 1);
    svg.appendChild(el('path', { d: arcPath(cx, cy, rIn, rOut, -a - 5.5, -a + 0.5), fill: c.solid, 'fill-opacity': 0.92 }));
  }
  svg.appendChild(el('circle', { cx, cy, r: rIn - 2, fill: moodColour(2, 2, 1).solid }));
  const mid = el('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', 'font-size': 11, fill: 'currentColor', 'fill-opacity': .75 });
  mid.textContent = 'even';
  svg.appendChild(mid);

  // Corner labels sit where the colour actually is, computed from the same
  // mapping rather than eyeballed — a legend that drifts from its subject is
  // worse than no legend. Two lines each, so nothing runs off the viewBox.
  for (const [v, e, l1, l2] of [
    [4, 4, 'delighted', '+ charged'], [0, 4, 'bleak', '+ charged'],
    [0, 0, 'bleak', '+ becalmed'], [4, 0, 'delighted', '+ becalmed'],
  ]) {
    const rad = Math.atan2((e - 2) / 2, (v - 2) / 2);
    const x = cx + Math.cos(rad) * (rOut + 16);
    const y = cy - Math.sin(rad) * (rOut + 16);
    const anchor = Math.cos(rad) > 0 ? 'start' : 'end';
    const up = Math.sin(rad) > 0;
    [l1, l2].forEach((line, k) => {
      const t = el('text', {
        x, y: y + (up ? -12 : 4) + k * 11, 'text-anchor': anchor,
        'font-size': 9.5, fill: 'currentColor', 'fill-opacity': .7,
      });
      t.textContent = line;
      svg.appendChild(t);
    });
  }
}

// ── running it ───────────────────────────────────────────────────────────────

async function run(handle) {
  setErr(''); setStatus('reading ten posts, then asking jev thirty questions in one call…');
  $('go').disabled = true;
  try {
    const r = await fetch(`/api/mood?handle=${encodeURIComponent(handle)}`);
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || `the ring could not be read (${r.status})`);
    S.data = d;
    S.moods = readMoods(d.answers, d.posts);
    drawRing(d, S.moods);
    drawStone(d, S.moods);
    drawPosts(S.moods);
    $('raw').textContent = JSON.stringify({ request: d.jev.request, response: d.jev.response }, null, 2);
    $('out').hidden = false;
    setStatus('');
    const url = new URL(location.href);
    url.searchParams.set('handle', d.profile.handle);
    history.replaceState(null, '', url);
    try { localStorage.setItem('mood.handle', d.profile.handle); } catch {}
  } catch (e) {
    setStatus('');
    setErr(String(e && e.message ? e.message : e));
  } finally {
    $('go').disabled = false;
  }
}

function boot() {
  drawWheel();
  $('entry').addEventListener('submit', (e) => {
    e.preventDefault();
    const h = $('handle').value.trim();
    if (h) run(h);
  });
  const q = new URL(location.href).searchParams.get('handle');
  const last = (() => { try { return localStorage.getItem('mood.handle'); } catch { return null; } })();
  if (q || last) $('handle').value = q || last;
  if (q) run(q); else $('handle').focus();
}

boot();
