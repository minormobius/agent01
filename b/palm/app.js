// palm/app.js — the page. Resolve, stream, read, draw.
//
// The heavy part is deliberately visible: a 90 MB repository takes a while to
// arrive and the post counter ticking up while it does is most of the fun. The
// alternative — a spinner over a silent minute — reads as broken.

import { resolveHandle, fetchProfile } from '../lib/identity.js';
import { createReader } from './car-stream.js';
import { readings, AXES } from './axes.js';
import { score } from './baseline.js';
import { radarSvg, svgToPng } from './radar.js';

const $ = (id) => document.getElementById(id);
const fmtMB = (n) => (n / 1048576).toFixed(1) + ' MB';
const num = (n) => n.toLocaleString('en-US');

let baseline = null;
let lastCard = null;

const baselineReady = fetch('./baseline.json')
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error('baseline.json missing'))))
  .then((b) => { baseline = b; $('poolN').textContent = b.n; return b; })
  .catch(() => null);

function setStatus(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.className = isError ? 'status err' : 'status';
}
function setProgress(frac) {
  $('prog').style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
}

// ── the run ──────────────────────────────────────────────────────────────────
async function run(input) {
  $('out').classList.add('hidden');
  $('go').disabled = true;
  setProgress(0);

  try {
    await baselineReady;
    if (!baseline) throw new Error('the reference pool failed to load — nothing to compare against');

    setStatus('resolving ' + input + '…');
    const { did, pdsUrl } = await resolveHandle(input);
    const profile = await fetchProfile(did);
    const handle = (profile && profile.handle) || input;

    setStatus('asking ' + new URL(pdsUrl).host + ' for the whole repository…');
    const res = await fetch(`${pdsUrl.replace(/\/$/, '')}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`);
    if (!res.ok) throw new Error(`that PDS refused the repository (${res.status})`);
    const total = parseInt(res.headers.get('content-length') || '0', 10) || null;

    // Streamed, never buffered whole — see the note at the top of car-stream.js.
    const reader = createReader();
    const body = res.body.getReader();
    let last = 0;
    for (;;) {
      const { done, value } = await body.read();
      if (done) break;
      reader.push(value);
      const now = performance.now();
      if (now - last > 80) {                              // repaint at ~12fps, not per chunk
        last = now;
        const seen = reader.bytesRead ? reader.bytesRead() : 0;
        setStatus(`reading… ${fmtMB(seen)}${total ? ' of ' + fmtMB(total) : ''} · ${num(reader.postsFound())} posts`);
        if (total) setProgress(seen / total);
        await new Promise((r) => setTimeout(r, 0));       // let the browser paint
      }
    }
    setProgress(1);

    const { posts, collections, bytes } = reader.finish();
    if (!posts.length) throw new Error('no posts in that repository');

    setStatus(`taking six readings off ${num(posts.length)} posts…`);
    await new Promise((r) => setTimeout(r, 16));
    const read = readings(posts, did);
    const scored = score(read, baseline);
    render(scored, read, { handle, did, collections, bytes });
    setStatus('');
  } catch (e) {
    setStatus(String((e && e.message) || e), true);
    setProgress(0);
  } finally {
    $('go').disabled = false;
  }
}

// ── drawing ──────────────────────────────────────────────────────────────────
function render(scored, read, ctx) {
  const span = Math.round(read.meta.span);
  const subtitle = `${num(read.meta.posts)} posts over ${num(span)} days`;
  const svg = radarSvg(scored, { handle: '@' + ctx.handle, subtitle });
  $('card').innerHTML = svg;
  lastCard = { svg, handle: ctx.handle };

  $('blurb').textContent = scored.band ? scored.band.blurb : 'Too little history to read.';

  $('rows').innerHTML = scored.axes.map((a) => {
    const d = a.detail;
    let reading;
    if (a.raw === null) reading = '<i>not enough history to measure</i>';
    else if (a.key === 'cadence') reading = `burstiness ${d.burstiness.toFixed(2)} · typical gap ${fmtGap(d.medianGapMin)}`;
    else if (a.key === 'vigil') reading = `${d.quietHours} quiet hours a day · hour-entropy ${d.raw !== null ? a.raw.toFixed(3) : '—'}`;
    else if (a.key === 'lexicon') reading = `Heaps β ${d.heaps.toFixed(3)} · ${num(d.vocabAtFit)} distinct words in the first ${num(d.n)} · ${(d.hapaxRate * 100).toFixed(0)}% used once`;
    else if (a.key === 'polish') reading = `${(a.raw * 100).toFixed(0)}% of well-formedness markers present`;
    else if (a.key === 'drift') reading = `early vs late similarity ${d.similarity.toFixed(3)} across ${num(d.vocab)} words`;
    else if (a.key === 'chorus') reading = `${(d.replyShare * 100).toFixed(0)}% replies · ${num(d.partners)} people · ${(d.selfReplyShare * 100).toFixed(0)}% to own threads`;
    return `<tr class="${a.soft ? 'soft' : ''}">
      <td class="name">${a.label}<small>${a.line}</small></td>
      <td>${reading}<br><span class="poles" style="font-family:var(--mono);font-size:0.72rem;color:var(--muted)">${a.animal} ← → ${a.machine}</span></td>
      <td class="pct">${a.pct === null ? '—' : '<b>' + Math.round(a.pct) + '</b>'}</td>
    </tr>`;
  }).join('');

  const cols = Object.entries(ctx.collections).slice(0, 6)
    .map(([k, v]) => `${k.replace('app.bsky.', '')} ${num(v)}`).join(' · ');
  const corr = baseline.correlations || {};
  const worst = Object.entries(corr).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];

  $('notes').innerHTML = `
    <h2>what was read</h2>
    <p>${fmtMB(ctx.bytes)} of CAR, streamed and discarded as it arrived — ${num(read.meta.posts)} posts kept,
       everything else counted and dropped. Records in the repository: ${cols}.</p>
    <p>Repeated trigrams (not one of the six — it correlated with Lexicon at r = 0.84, so it was cut
       from the radar and kept as a footnote): <b>${read.extra.echo.raw === null ? '—' : (read.extra.echo.raw * 100).toFixed(1) + '%'}</b> of your
       three-word sequences are ones you had used before.</p>
    <p>${scored.measured} of ${scored.total} lines were comparable against the pool of ${scored.pool};
       the most-correlated remaining pair is ${worst ? `<code>${worst[0]}</code> at r = ${worst[1]}` : '—'}.</p>`;

  $('out').classList.remove('hidden');
}

function fmtGap(min) {
  if (min < 60) return min.toFixed(0) + ' min';
  if (min < 1440) return (min / 60).toFixed(1) + ' h';
  return (min / 1440).toFixed(1) + ' days';
}

// ── the card ─────────────────────────────────────────────────────────────────
$('save').addEventListener('click', async () => {
  if (!lastCard) return;
  try {
    const blob = await svgToPng(lastCard.svg);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `palm-${lastCard.handle.replace(/[^a-z0-9]/gi, '-')}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) {
    setStatus('could not render the card: ' + e.message, true);
  }
});

$('f').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('handle').value.trim();
  if (v) { history.replaceState(null, '', '?u=' + encodeURIComponent(v)); run(v); }
});

const preset = new URLSearchParams(location.search).get('u');
if (preset) { $('handle').value = preset; run(preset); }
