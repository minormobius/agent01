// app.js — the lab's glue: feed in, metrics, ask, book, draw.
//
// Charts are inline SVG built here. Two rules from the design pass that are
// easy to lose in a refactor: never a second y-axis (the price chart and the
// return chart are separate charts precisely because of it), and every
// decision mark carries a letter as well as a colour.
import { connect, replay } from './feed.mjs';
import { newRing, push, compute, stateDoc } from './metrics.mjs';
import { ask, decide, GATE } from './ask.mjs';
import { newBook, step, summary, pct } from './book.mjs';

const $ = (id) => document.getElementById(id);
const ring = newRing();
let book = newBook();
let running = false, feed = null, timer = null, lastMetrics = null, lastDecision = null, inFlight = false;

// ---------------------------------------------------------------- theme ----
const themeBtn = $('themeBtn');
themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : cur === 'light' ? 'dark'
    : (matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('jevlab.theme', next); } catch {}
  draw();
});
try { const t = localStorage.getItem('jevlab.theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch {}

// The trial counter. Every run is a trial, and the measured lesson is that
// picking the best of many is not better than picking at random — so the
// count is on screen rather than quietly forgotten.
function trials(bump = 0) {
  let n = 0;
  try { n = Number(localStorage.getItem('jevlab.runs') || 0) + bump; localStorage.setItem('jevlab.runs', String(n)); }
  catch { n = bump; }
  $('trials').textContent = n
    ? `Run ${n} in this browser. Every configuration you try is a trial: over 127 trials against a target with no ` +
      `signal in it, the best in-sample result scored 69.7% and was worth nothing out of sample, and the rank ` +
      `correlation between the two was −0.11. Keep the count in view.`
    : '';
  return n;
}
trials(0);

// ----------------------------------------------------------------- feed ----
function setStatus(s) {
  const el = $('feedStatus');
  el.dataset.status = s.status;
  $('feedText').textContent = s.status === 'dropped' ? `dropped — retrying in ${Math.round((s.retryInMs || 0) / 1000)}s` : s.status;
}

function onTick(tick) {
  push(ring, tick);
  lastMetrics = compute(ring);
  // Every tick marks the book to market; only decision ticks carry an action.
  step(book, { px: tick.mid, spreadBps: tick.spreadBps, action: null, t: tick.t });
  paintTiles(tick);
  draw();
}

// ?replay=<path>  runs the harness against a recorded tape instead of the
// live socket — same metrics, same book, same costs, but repeatable, which
// the live feed can never be. &speed= multiplies the tick rate.
const params = new URLSearchParams(location.search);
const tape = params.get('replay');
if (tape) {
  // Same-origin only: this loads and executes nothing, but a tape from
  // elsewhere is still someone else's numbers presented as this page's run.
  const url = new URL(tape, location.href);
  if (url.origin !== location.origin) {
    setStatus({ status: 'error' });
    $('feedText').textContent = 'replay tape must be same-origin';
  } else {
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        const ticks = Array.isArray(d) ? d : d.ticks;
        if (!Array.isArray(ticks) || !ticks.length) throw new Error('tape has no ticks');
        feed = replay(ticks, { onTick, onStatus: setStatus, speed: Number(params.get('speed')) || 1, loop: params.has('loop') });
      })
      .catch((e) => { setStatus({ status: 'error' }); $('feedText').textContent = `replay failed: ${e.message}`; });
  }
} else {
  feed = connect({ onTick, onStatus: setStatus });
}

// ------------------------------------------------------------- decisions ---
async function takeDecision() {
  if (!running || inFlight || !lastMetrics) return;
  inFlight = true;
  const doc = stateDoc(lastMetrics, book.jev.pos, book);
  $('stateDoc').textContent = doc;
  try {
    const reply = await ask(doc);
    const d = decide(reply.answers, book.jev.pos, {
      ...GATE, cap: Number($('cap').value) || 3, deadband: Number($('deadband').value) || 0 });
    lastDecision = { ...d, t: Date.now(), mid: lastMetrics.mid };
    step(book, {
      px: lastMetrics.mid, spreadBps: lastMetrics.spreadBps, action: d.action, exposure: d.exposure, t: Date.now(),
      meta: { confidence: d.confidence, have: d.have, decidable: d.decidable, regime: d.regime,
        score: d.score, target: d.exposure, reason: d.reason, blocked: !!d.blocked },
    });
    paintAnswer(d);
    paintLog();
  } catch (e) {
    lastDecision = { action: 'hold', reason: `call failed: ${String(e.message || e).slice(0, 90)}`, blocked: true };
    paintAnswer(lastDecision);
  } finally {
    inFlight = false;
    draw();
  }
}

$('runBtn').addEventListener('click', () => {
  running = !running;
  $('runBtn').textContent = running ? 'stop run' : 'start run';
  clearInterval(timer);
  if (running) {
    trials(1);
    takeDecision();
    timer = setInterval(takeDecision, Number($('interval').value));
  }
});
$('resetBtn').addEventListener('click', () => {
  running = false; clearInterval(timer); $('runBtn').textContent = 'start run';
  book = newBook({ seed: Number($('seed').value) || 1,
    costs: { feeBps: Number($('fee').value) || 0, slippageBps: Number($('slip').value) || 0 },
    risk: { cap: Number($('cap').value) || 3 } });
  lastDecision = null;
  $('logBody').innerHTML = ''; $('ansRow').innerHTML = '<span class="why">no decision yet</span>';
  paintTiles(); draw();
});
for (const id of ['cap', 'deadband']) $(id).addEventListener('change', () => trials(1));
$('interval').addEventListener('change', () => {
  if (running) { clearInterval(timer); timer = setInterval(takeDecision, Number($('interval').value)); }
});

// ------------------------------------------------------------- painting ----
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const signed = (x, d = 2) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(d)}%` : '—');
const cls = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : '');

function paintTiles(tick) {
  if (tick) {
    $('tMid').textContent = fmt(tick.mid, 1);
    $('tSpread').textContent = `spread ${fmt(tick.spreadBps)}bp · book ${fmt(tick.bookImbalance)}×`;
  }
  const p = book.jev.pos;
  $('tPos').textContent = book.jev.liquidated ? 'LIQUIDATED'
    : p === 0 ? 'flat' : `${p > 0 ? '+' : ''}${p.toFixed(2)}x`;
  $('tPos').className = `v ${book.jev.liquidated ? 'down' : p > 0 ? 'up' : p < 0 ? 'down' : ''}`;
  $('tFills').textContent = book.jev.liquidated
    ? `wiped out after ${book.jev.fills} fills` : `${book.jev.fills} fills · ${book.jev.turnover.toFixed(1)}x turned over`;
  for (const [id, leg] of [['tJev', book.jev], ['tHold', book.hold], ['tRand', book.rand]]) {
    const v = pct(leg);
    $(id).textContent = signed(v); $(id).className = `v ${cls(v)}`;
  }
  $('tCost').textContent = `cost paid ${fmt(book.jev.costPaid * 100)}%`;
  // The counterweight to a leveraged return, beside it rather than below it.
  const sDD = summary(book);
  $('tDD').textContent = signed(-sDD.maxDD).replace('-0.00%', '0.00%');
  $('tDD').className = `v ${sDD.maxDD > 0 ? 'down' : ''}`;
  $('tDDref').textContent = `unlevered ref ${signed(-sDD.holdMaxDD)}`;
  $('tDec').textContent = String(book.decisions);
  $('tTicks').textContent = `${book.ticks} ticks`;

  // Jev's own view of whether this decision is decidable at all. It never
  // gates anything; it is here because it is the honest number.
  const dec = lastDecision?.decidable;
  $('tDecidable').textContent = Number.isFinite(dec) ? fmt(dec) : '—';
  $('tDecidable').className = `v ${Number.isFinite(dec) ? (dec < 0.5 ? 'down' : 'up') : ''}`;
  const gated = book.history.filter((r) => r.blocked).length;
  $('tGated').textContent = `Jev's own answer · ${gated} of ${book.decisions} gated`;

  const s = sDD;
  const real = s.verdict.includes('better') || s.verdict.includes('worse') || s.liquidated;
  $('verdictH').textContent = s.liquidated ? 'Liquidated — the run ended in ruin.'
    : s.decisions < 30 ? `${s.decisions} decisions — ${30 - s.decisions} more before this says anything.`
    : `${s.verdict}.`;
  $('verdictH').className = `verdict ${real ? 'real' : 'null'}`;
  $('verdictWhy').textContent = s.liquidated
    ? `The levered book went to zero and stopped. Worst drawdown ${fmt(s.maxDD)}%, against ${fmt(s.holdMaxDD)}% ` +
      `for the same ticks unlevered. This is what the leverage control buys and costs.`
    : s.decisions < 30
    ? 'A verdict needs at least 30 decisions, and then it is read off t against the random control — not off whichever line is highest.'
    : `t = ${fmt(s.tStat)} on the per-decision difference against the random control. |t| under 2 means the run ` +
      `says nothing, whatever the curve looks like. Jev ${signed(s.jev)} · random ${signed(s.rand)} · ` +
      `buy & hold ${signed(s.hold)}, all after ${fmt(s.costPaid)}% of costs.`;
}

function paintAnswer(d) {
  const a = d.action;
  $('ansRow').innerHTML =
    `<span class="act" data-a="${a}">${a.toUpperCase()}</span>` +
    (d.blocked ? '<span class="act" data-a="hold" title="the gate held this">gated</span>' : '') +
    `<span class="why">${escapeHtml(d.reason || '')}${d.regime ? ` · regime: ${escapeHtml(d.regime)}` : ''}` +
    `${typeof d.have === 'number' ? ` · figures present ${fmt(d.have)}` : ''}` +
    `${typeof d.decidable === 'number' ? ` · decidable ${fmt(d.decidable)}` : ''}</span>`;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function paintLog() {
  const rows = book.history.slice(-120).reverse();
  $('logBody').innerHTML = rows.map((r) => `<tr>
    <td>${new Date(r.t).toLocaleTimeString()}</td><td>${fmt(r.px, 1)}</td>
    <td>${r.action}${r.blocked ? ' (held)' : ''}</td><td>${Number.isFinite(r.target) ? `${r.target > 0 ? '+' : ''}${r.target.toFixed(2)}x` : '—'}</td><td>${fmt(r.confidence)}</td><td>${fmt(r.have)}</td>
    <td>${escapeHtml(r.regime || '—')}</td><td>${r.pos === 0 ? 'flat' : `${r.pos > 0 ? '+' : ''}${r.pos.toFixed(2)}x`}</td>
    <td>${signed((r.jev - 1) * 100)}</td><td>${signed((r.rand - 1) * 100)}</td></tr>`).join('');
}

// ---------------------------------------------------------------- charts ---
const STATUS = { buy: 'var(--st-good)', hold: 'var(--neutral)', sell: 'var(--st-serious)', bail: 'var(--st-critical)' };
const GLYPH = { buy: 'B', hold: 'H', sell: 'S', bail: 'X' };
const GLYPH_INK = { buy: '#fff', hold: 'var(--ink)', sell: '#23180f', bail: '#fff' };

function scale(vals, h, pad) {
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return () => h / 2;
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const span = hi - lo;
  return (v) => pad + (h - 2 * pad) * (1 - (v - lo) / span);
}
const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

function drawPrice() {
  const svg = $('pxChart'), W = 640, H = 190, L = 6, R = 52, T = 10, B = 22;
  const t = ring.buf.slice(-180);
  if (t.length < 2) { svg.innerHTML = ''; return; }
  const px = t.map((x) => x.mid);
  const y = scale(px, H - B, T);
  const x = (i) => L + (W - L - R) * (i / Math.max(1, t.length - 1));
  const pts = px.map((v, i) => [x(i), y(v)]);
  const lo = Math.min(...px), hi = Math.max(...px);

  const marks = book.history.slice(-60).map((r) => {
    // Place each decision at the nearest tick we still hold.
    let best = -1, bd = Infinity;
    for (let i = 0; i < t.length; i++) { const d = Math.abs(t[i].t - r.t); if (d < bd) { bd = d; best = i; } }
    return best >= 0 && bd < 8000 ? { ...r, cx: x(best), cy: y(t[best].mid) } : null;
  }).filter(Boolean);

  svg.innerHTML =
    [hi, (hi + lo) / 2, lo].map((v) =>
      `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>` +
      `<text class="endlab" x="${W - R + 5}" y="${(y(v) + 3).toFixed(1)}" fill="var(--ink-3)">${v.toFixed(0)}</text>`).join('') +
    `<path class="pxline" d="${path(pts)}"/>` +
    marks.map((m) =>
      `<circle class="mark" cx="${m.cx.toFixed(1)}" cy="${m.cy.toFixed(1)}" r="7" fill="${STATUS[m.action]}"/>` +
      `<text class="mark-glyph" x="${m.cx.toFixed(1)}" y="${(m.cy + 2.7).toFixed(1)}" fill="${GLYPH_INK[m.action]}">${GLYPH[m.action]}</text>`).join('') +
    `<g class="axis"><text x="${L}" y="${H - 6}">${t.length}s of one-second ticks</text></g>` +
    `<line class="crosshair" id="pxCross" x1="0" x2="0" y1="${T}" y2="${H - B}" style="opacity:0"/>`;
  wireHover(svg, $('pxTip'), pts, (i) => {
    const k = t[i];
    return `${new Date(k.t).toLocaleTimeString()}\nmid   ${k.mid.toFixed(1)}\nspread ${k.spreadBps.toFixed(2)}bp\nbook  ${k.bookImbalance.toFixed(2)}×`;
  }, W);
}

function drawPnl() {
  const svg = $('pnlChart'), W = 420, H = 190, L = 6, R = 46, T = 12, B = 22;
  const h = book.history.slice(-240);
  if (h.length < 2) { svg.innerHTML = ''; return; }
  const legs = [
    { k: 'jev', label: 'jev', c: 'var(--s1)', v: h.map((r) => (r.jev - 1) * 100) },
    { k: 'hold', label: 'b&h', c: 'var(--s2)', v: h.map((r) => (r.hold - 1) * 100) },
    { k: 'rand', label: 'rnd', c: 'var(--s3)', v: h.map((r) => (r.rand - 1) * 100) },
  ];
  const all = legs.flatMap((l) => l.v).concat([0]);
  const y = scale(all, H - B, T);
  const x = (i) => L + (W - L - R) * (i / Math.max(1, h.length - 1));

  svg.innerHTML =
    // The zero line is labelled on the LEFT: the right gutter belongs to the
    // series' direct labels, and a run that finishes near flat puts them all
    // on top of each other.
    `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>` +
    `<text class="endlab" x="${L}" y="${(y(0) - 4).toFixed(1)}" fill="var(--ink-3)">0%</text>` +
    legs.map((l) => `<path class="serie" stroke="${l.c}" d="${path(l.v.map((v, i) => [x(i), y(v)]))}"/>`).join('') +
    // Direct labels at the line ends — identity is never colour alone. Legs
    // that finish close together would stack on the same baseline, so they
    // are pushed apart; two labels on top of each other is worse than a
    // label a few pixels off its line.
    (() => {
      const lab = legs.map((l) => ({ c: l.c, label: l.label, y: y(l.v[l.v.length - 1]) }))
        .sort((a, b) => a.y - b.y);
      for (let i = 1; i < lab.length; i++) {
        if (lab[i].y - lab[i - 1].y < 10) lab[i].y = lab[i - 1].y + 10;
      }
      const overflow = lab.length ? lab[lab.length - 1].y - (H - B) : 0;
      if (overflow > 0) for (const l of lab) l.y -= overflow;
      return lab.map((l) =>
        `<text class="endlab" x="${W - R + 5}" y="${(l.y + 3).toFixed(1)}" fill="${l.c}">${l.label}</text>`).join('');
    })() +
    `<g class="axis"><text x="${L}" y="${H - 6}">${h.length} decisions, after costs</text></g>` +
    `<line class="crosshair" id="pnlCross" x1="0" x2="0" y1="${T}" y2="${H - B}" style="opacity:0"/>`;
  wireHover(svg, $('pnlTip'), h.map((_, i) => [x(i), 0]), (i) => {
    const r = h[i];
    return `${new Date(r.t).toLocaleTimeString()}  ${r.action}\njev  ${signed((r.jev - 1) * 100)}\nb&h  ${signed((r.hold - 1) * 100)}\nrnd  ${signed((r.rand - 1) * 100)}`;
  }, W);
}

function wireHover(svg, tip, pts, text, W) {
  const cross = svg.querySelector('line.crosshair');
  svg.onpointerleave = () => { tip.classList.remove('on'); if (cross) cross.style.opacity = 0; };
  svg.onpointermove = (e) => {
    const r = svg.getBoundingClientRect();
    const vx = (e.clientX - r.left) / r.width * W;
    let best = 0, bd = Infinity;
    for (let i = 0; i < pts.length; i++) { const d = Math.abs(pts[i][0] - vx); if (d < bd) { bd = d; best = i; } }
    if (cross) { cross.setAttribute('x1', pts[best][0]); cross.setAttribute('x2', pts[best][0]); cross.style.opacity = 1; }
    tip.textContent = text(best);
    tip.classList.add('on');
    const box = svg.parentElement.getBoundingClientRect();
    tip.style.left = `${Math.min(box.width - tip.offsetWidth - 6, Math.max(0, e.clientX - box.left + 12))}px`;
    tip.style.top = `${Math.max(0, e.clientY - box.top - 10)}px`;
  };
}

let raf = 0;
function draw() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { drawPrice(); drawPnl(); }); }

paintTiles();
addEventListener('beforeunload', () => feed?.stop());
