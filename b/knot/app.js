// knot/app.js — drive the crawl and repaint the core as it assembles.
//
// The whole point is that this is watchable. Every batch of rows produces a new
// (and never worse) answer, so the page repaints continuously and the stop
// button is a first-class control rather than an escape hatch: stopping is a
// legitimate way to finish, because what is on screen is already true.

import { resolveHandle, fetchProfile } from '../lib/identity.js';
import { mutualsOf, followsOf, profiles, pool, stats } from '../lib/graph.js';
import { Knot } from './kcore.js';

const $ = (id) => document.getElementById(id);
const num = (n) => Number(n).toLocaleString('en-US');
const CONCURRENCY = 10;

let abort = null, knot = null, seenMembers = new Set();

function setStatus(msg, isErr = false) {
  $('status').textContent = msg;
  $('status').className = isErr ? 'status err' : 'status';
}
const setProgress = (f) => { $('prog').style.width = Math.max(0, Math.min(1, f)) * 100 + '%'; };

async function run(input) {
  $('go').disabled = true;
  $('stop').classList.remove('hidden');
  $('out').classList.add('hidden');
  seenMembers = new Set();
  abort = new AbortController();
  const signal = abort.signal;
  const t0 = performance.now();

  try {
    setStatus('resolving ' + input + '…');
    const { did } = await resolveHandle(input);

    setStatus('reading your follows and followers…');
    const { mutuals } = await mutualsOf(did, {
      signal,
      onProgress: (n) => setStatus(`reading followers… ${num(n)}`),
    });
    if (!mutuals.length) throw new Error('no mutual follows found — nothing to cluster');

    knot = new Knot([did, ...mutuals], did);
    // The seed follows every one of its own mutuals by definition, so that row is
    // free and gives the first pass something to steer with.
    knot.addRow(did, mutuals);
    $('out').classList.remove('hidden');
    paint(t0);

    // Best-first, forever, until stopped or exhausted. Each pass is one batch of
    // concurrent row reads followed by one repaint.
    while (!signal.aborted) {
      const batch = knot.nextTargets(CONCURRENCY);
      if (!batch.length) break;
      await pool(batch, CONCURRENCY, async (target) => {
        if (signal.aborted) return;
        try {
          knot.addRow(target, await followsOf(target, { signal }));
        } catch (e) {
          if (e && e.name === 'AbortError') return;
          knot.addRow(target, []);      // unreachable repo: read, and empty
        }
      });
      paint(t0);
      await new Promise((r) => setTimeout(r, 0));    // let the browser draw
    }
    setStatus(signal.aborted
      ? `stopped at ${num(knot.fetched)} of ${num(knot.total)} rows — what is shown is still a real core`
      : `complete — every one of the ${num(knot.total)} rows read`);
  } catch (e) {
    if (e && e.name === 'AbortError') setStatus('stopped');
    else setStatus(String((e && e.message) || e), true);
  } finally {
    $('go').disabled = false;
    $('stop').classList.add('hidden');
    abort = null;
  }
}

// ── painting ─────────────────────────────────────────────────────────────────
let painting = false;
function paint(t0) {
  if (painting) return;
  painting = true;
  const c = knot.core();
  const s = knot.stats();
  const frac = s.fetched / s.total;

  $('k').textContent = c.k;
  $('size').textContent = num(c.members.length);
  $('edges').textContent = num(c.edges);
  $('rows').textContent = `${num(s.fetched)}/${num(s.total)}`;
  $('saved').textContent = (frac * 100).toFixed(0) + '%';
  setProgress(frac);

  const secs = (performance.now() - t0) / 1000;
  setStatus(`${num(stats.requests)} requests · ${(stats.bytes / 1048576).toFixed(1)} MB · ${secs.toFixed(0)}s`
    + (stats.cacheHits ? ` · ${num(stats.cacheHits)} from cache` : ''));

  $('claim').innerHTML = c.k > 0
    ? `Everyone below is mutuals with <b>at least ${c.k}</b> of the others — confirmed, from
       <b>${(frac * 100).toFixed(0)}%</b> of the graph. Reading the rest can raise ${c.k}; it cannot make this wrong.`
    : 'Not enough rows yet to confirm a single mutual pair. Give it a moment.';

  renderMembers(c);
  painting = false;
}

function renderMembers(c) {
  const el = $('members');
  const ordered = c.members.slice().sort((a, b) => (c.adj.get(b)?.size || 0) - (c.adj.get(a)?.size || 0));
  el.innerHTML = ordered.map((did) => {
    const p = profileCache.get(did);
    const deg = c.adj.get(did) ? [...c.adj.get(did)].filter((n) => c.members.includes(n)).length : 0;
    const fresh = !seenMembers.has(did) ? ' new' : '';
    return `<a class="m${fresh}" href="https://bsky.app/profile/${encodeURIComponent(p ? p.handle : did)}" target="_blank" rel="noopener">
      ${p && p.avatar ? `<img src="${p.avatar}" alt="" loading="lazy">` : '<img alt="">'}
      <span class="who"><span class="h">${p ? p.handle : did.slice(0, 18) + '…'}</span><span class="d">${deg} inside</span></span>
    </a>`;
  }).join('');
  for (const d of c.members) seenMembers.add(d);
  hydrate(ordered);
}

// Profiles are decoration, fetched lazily for whoever is currently on screen and
// never blocking the crawl.
const profileCache = new Map();
let hydrating = false;
async function hydrate(dids) {
  if (hydrating) return;
  const missing = dids.filter((d) => !profileCache.has(d)).slice(0, 75);
  if (!missing.length) return;
  hydrating = true;
  try {
    const got = await profiles(missing);
    for (const [k, v] of got) profileCache.set(k, v);
    for (const d of missing) if (!profileCache.has(d)) profileCache.set(d, null);
    if (knot) renderMembers(knot.core());
  } catch { /* decoration */ } finally { hydrating = false; }
}

// ── events ───────────────────────────────────────────────────────────────────
$('f').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('handle').value.trim().replace(/^@/, '');
  if (v) { history.replaceState(null, '', '?u=' + encodeURIComponent(v)); run(v); }
});
$('stop').addEventListener('click', () => { if (abort) abort.abort(); });
if (window.attachHandleTypeahead) attachHandleTypeahead($('handle'));

const preset = new URLSearchParams(location.search).get('u');
if (preset) { $('handle').value = preset; run(preset); }
