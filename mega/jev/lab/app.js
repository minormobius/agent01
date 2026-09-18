// app.js — the lab's glue: feed in, metrics, ask, book, draw.
//
// Charts are inline SVG built here. Two rules from the design pass that are
// easy to lose in a refactor: never a second y-axis (the price chart and the
// return chart are separate charts precisely because of it), and every
// decision mark carries a letter as well as a colour.
import { connect, replay } from './feed.mjs';
import { newRing, push, compute, stateDoc } from './metrics.mjs';
import { ask, decide, GATE, buildQuestions } from './ask.mjs';
import { readOracles, majorityTarget, bestOracleTarget, oracleDoc, oracleCriteria, ORACLES } from './oracles.mjs';
import { journalDoc } from './journal.mjs';
import * as B from './streamb.mjs';
import { captureStats, describe as describeCapture } from './bigmove.mjs';
import { newBook, step, summary, pct } from './book.mjs';
import { toCandles, isUp, extent, BUCKET_MS } from './candles.mjs';

const $ = (id) => document.getElementById(id);
const ring = newRing();
// The metrics ring holds five minutes, which is right for the metrics and
// far too short to rank big moves: at a 60-second horizon it yields four
// non-overlapping windows. So the capture analysis keeps its own longer
// price log — numbers only, an hour of them, bounded.
const PRICE_LOG = 3600;
const priceLog = [];
let book = newBook();
let running = false, feed = null, timer = null, lastMetrics = null, lastDecision = null, inFlight = false;
// The clock the CHART runs on. Under replay this is tape time, not wall
// time, and a decision stamped with Date.now() could never be matched to the
// candle it happened in.
let tapeNow = Date.now();

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
  tapeNow = tick.t;
  push(ring, tick);
  priceLog.push({ t: tick.t, mid: tick.mid });
  if (priceLog.length > PRICE_LOG) priceLog.shift();
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
  const cap = Number($('cap').value) || 3;
  const reads = readOracles(lastMetrics, cap);
  const doc = stateDoc(lastMetrics, book.jev.pos, book, {
    oracles: oracleDoc(reads),
    // His own recent decisions, and what each has earned since. The dungeon
    // needed exactly this and for exactly the same reason.
    journal: $('memory').checked ? journalDoc(book, lastMetrics.mid) : '',
  });
  $('stateDoc').textContent = doc;
  try {
    // Both streams, same tick. Stream B gets thirty raw floats and no
    // context whatever — it is the control, not a second opinion, so it is
    // deliberately NOT told anything stream A knows.
    const bCloses = B.closes(ring.buf, 10_000, B.LOOKBACK);
    const [reply, bReply] = await Promise.all([
      ask(doc, { questions: buildQuestions({ oracleCriteria: oracleCriteria(reads) }) }),
      bCloses.length >= B.LOOKBACK
        ? ask(B.stateFrom(bCloses), { questions: B.QUESTION }).catch(() => null)
        : Promise.resolve(null),
    ]);
    const bBps = bReply ? B.forecastBps(bReply.answers?.next?.score) : null;
    const bTarget = bBps == null ? book.streamb.pos
      : B.targetFrom(bBps, cap, Number($('bdead').value) || 0, book.streamb.pos);
    const d = decide(reply.answers, book.jev.pos, {
      ...GATE, cap, deadband: Number($('deadband').value) || 0,
      response: { deadZone: Number($('deadzone').value) || 0, floor: Number($('floor').value) || 0 } });
    lastDecision = { ...d, t: tapeNow, mid: lastMetrics.mid };
    // Equities as of BEFORE this bar, so the best-oracle control cannot see
    // the move it is about to trade.
    const eqBefore = Object.fromEntries(Object.entries(book.oracles).map(([id, leg]) => [id, leg.equity]));
    const best = bestOracleTarget(reads, eqBefore, { decisions: book.decisions });
    lastDecision.follows = best.follows;
    lastDecision.rule = reply.answers?.which_rule?.choice;
    lastDecision.bBps = bBps;
    lastDecision.ruleConf = reply.answers?.which_rule?.confidence;
    step(book, {
      px: lastMetrics.mid, spreadBps: lastMetrics.spreadBps, action: d.action, exposure: d.exposure, t: tapeNow,
      oracleTargets: Object.fromEntries(reads.map((r) => [r.id, r.target])),
      bestTarget: best.target, majorityTarget: majorityTarget(reads, cap), streambTarget: bTarget,
      meta: { confidence: d.confidence, have: d.have, decidable: d.decidable, regime: d.regime,
        score: d.score, target: d.exposure, reason: d.reason, blocked: !!d.blocked,
        rule: reply.answers?.which_rule?.choice, follows: best.follows },
    });
    paintAnswer(d);
    paintLog();
    paintBoard();
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
  priceLog.length = 0;
  book = newBook({ seed: Number($('seed').value) || 1,
    costs: { feeBps: Number($('fee').value) || 0, slippageBps: Number($('slip').value) || 0 },
    risk: { cap: Number($('cap').value) || 3 } });
  lastDecision = null;
  $('logBody').innerHTML = ''; $('ansRow').innerHTML = '<span class="why">no decision yet</span>';
  paintTiles(); paintBoard(); draw();
});
for (const id of ['cap', 'deadband', 'deadzone', 'floor', 'memory']) $(id).addEventListener('change', () => trials(1));
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
  // The same trades run free. When this sits above the net number, the fees
  // are the whole story and no amount of better timing is the fix.
  const bd = lastDecision?.bBps;
  $('tB').textContent = Number.isFinite(bd) ? `${bd >= 0 ? '+' : ''}${bd.toFixed(1)}bp` : '—';
  $('tB').className = `v ${Number.isFinite(bd) ? cls(bd) : ''}`;
  $('tBnet').textContent = `leg ${signed(sDD.streamb)}`;
  $('tGross').textContent = signed(sDD.gross);
  $('tGross').className = `v ${cls(sDD.gross)}`;
  $('tDrag').textContent = sDD.dragShareOfLoss != null
    ? `drag ${fmt(sDD.drag)}% — ${sDD.dragShareOfLoss.toFixed(0)}% of the loss`
    : `drag ${fmt(sDD.drag)}%`;
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
  // The scoreboard that matters if the P&L lives in a few windows: when a
  // big move happened, was the book on it, under it, or facing it?
  const capStats = captureStats(priceLog, book.history, { horizon: 60, topPct: 0.2 });
  $('tCapture').textContent = capStats?.enough ? `${(capStats.capture * 100).toFixed(0)}%` : '—';
  $('tCapture').className = `v ${capStats?.enough ? cls(capStats.capture) : ''}`;
  $('tOffsides').textContent = capStats?.enough
    ? `offsides ${capStats.offsides}/${capStats.big - capStats.flatThrough} · flat through ${capStats.flatThrough}`
    : 'of the biggest windows';
  $('capWhy').textContent = describeCapture(capStats);

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
    `${typeof d.decidable === 'number' ? ` · decidable ${fmt(d.decidable)}` : ''}` +
    `${d.rule ? ` · backs <b>${escapeHtml(d.rule)}</b>${typeof d.ruleConf === 'number' ? ` (${fmt(d.ruleConf)})` : ''}` : ''}` +
    `${d.follows ? ` · best-so-far is ${escapeHtml(d.follows)}` : ''}</span>`;
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function paintBoard() {
  const s = summary(book);
  const names = { jev: 'Jev (stream A)', 'best oracle': 'best rule so far', majority: 'average of the rules',
    'buy & hold': 'buy & hold (1x)', random: 'random control', 'do nothing': 'do nothing (never trades)',
    'stream B': 'stream B — 30 floats, max leverage' };
  const nice = Object.fromEntries(ORACLES.map((o) => [o.id, o.name]));
  const rows = s.ranking.map(([id, v, dd, fills], i) => {
    const isJev = id === 'jev';
    return `<tr${isJev ? ' style="background:var(--accent-soft)"' : ''}>
      <td>${i + 1}</td><td>${escapeHtml(names[id] || nice[id] || id)}${isJev ? ' ←' : ''}</td>
      <td class="${cls(v)}">${signed(v)}</td>
      <td>${Number.isFinite(dd) && dd > 0 ? signed(-dd) : '0.00%'}</td>
      <td>${fills}</td></tr>`;
  }).join('');
  $('boardBody').innerHTML = rows;
  $('boardWhy').textContent = s.decisions < 30
    ? `${s.decisions} decisions — a leaderboard this short is noise, not a ranking.`
    : `t = ${fmt(s.tStatVsMajority)} against simply averaging the rules, over ${s.nVsMajority} paired decisions. ` +
      `Jev has SEEN every rule below, so beating one is not evidence he could not have copied it; ` +
      `beating the average of them is the test that means something.`;
}

function paintLog() {
  const rows = book.history.slice(-120).reverse();
  $('logBody').innerHTML = rows.map((r) => `<tr>
    <td>${new Date(r.t).toLocaleTimeString()}</td><td>${fmt(r.px, 1)}</td>
    <td>${r.action}${r.blocked ? ' (held)' : ''}</td><td>${Number.isFinite(r.target) ? `${r.target > 0 ? '+' : ''}${r.target.toFixed(2)}x` : '—'}</td><td>${fmt(r.confidence)}</td><td>${fmt(r.have)}</td>
    <td>${escapeHtml(r.rule || '—')}</td><td>${r.pos === 0 ? 'flat' : `${r.pos > 0 ? '+' : ''}${r.pos.toFixed(2)}x`}</td>
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
  const svg = $('pxChart'), W = 640, H = 240, L = 6, R = 52, T = 10, B = 22;
  const t = ring.buf.slice(-180);
  const candles = toCandles(t, BUCKET_MS);
  if (candles.length < 2) { svg.innerHTML = ''; return; }
  const ext = extent(candles);
  // Room above and below for the annotation marks, so they never sit on a wick.
  const padPx = 14;
  const y = (v) => {
    const span = Math.max(1e-9, ext.hi - ext.lo);
    return T + padPx + (H - B - T - 2 * padPx) * (1 - (v - ext.lo) / span);
  };
  const cw = Math.max(2, Math.min(14, (W - L - R) / candles.length * 0.62));
  const x = (i) => L + (W - L - R) * ((i + 0.5) / candles.length);

  const body = candles.map((c, i) => {
    const up = isUp(c);
    const cx = x(i);
    const yo = y(c.o), yc = y(c.c);
    const top = Math.min(yo, yc), h = Math.max(1.2, Math.abs(yc - yo));
    // Hollow for up, filled for down — the encoding that predates colour and
    // survives without it. The hue is redundancy, not the signal.
    return `<line class="wick" x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${y(c.h).toFixed(1)}" y2="${y(c.l).toFixed(1)}" stroke="${up ? 'var(--up-c)' : 'var(--down-c)'}"/>` +
      `<rect class="candle" x="${(cx - cw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${cw.toFixed(1)}" height="${h.toFixed(1)}" rx="1"
         fill="${up ? 'var(--paper)' : 'var(--down-c)'}" stroke="${up ? 'var(--up-c)' : 'var(--down-c)'}"/>`;
  }).join('');

  // Annotations sit ABOVE the candle for a reduce and BELOW for an add, so
  // they never cover the price they are commenting on.
  const marks = book.history.slice(-40).map((r) => {
    let best = -1, bd = Infinity;
    for (let i = 0; i < candles.length; i++) {
      const mid = (candles[i].t0 + candles[i].t1) / 2, d = Math.abs(mid - r.t);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0 || bd > BUCKET_MS * 2) return '';
    const c = candles[best], cx = x(best);
    const below = r.action === 'buy';
    const cy = below ? y(c.l) + 10 : y(c.h) - 10;
    return `<circle class="mark" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="6.5" fill="${STATUS[r.action]}"/>` +
      `<text class="mark-glyph" x="${cx.toFixed(1)}" y="${(cy + 2.6).toFixed(1)}" fill="${GLYPH_INK[r.action]}">${GLYPH[r.action]}</text>`;
  }).join('');

  const s = summary(book);
  // Jev's number lives ON the chart rather than in a tile across the page.
  // Laid out as three rows with the right-hand column anchored to the far
  // edge, because the first attempt let a long "b&h … · rnd …" line run
  // underneath the position and the call count.
  const IW = 188;
  const inset = `<g class="inset" transform="translate(${L + 4}, ${T + 2})">
      <rect x="0" y="0" width="${IW}" height="56" rx="4" fill="var(--paper)" stroke="var(--line)" opacity="0.95"/>
      <text class="ins-k" x="9" y="14">JEV, after costs</text>
      <text class="ins-k" x="${IW - 9}" y="14" text-anchor="end">${s.decisions} calls</text>
      <text class="ins-v" x="9" y="34" fill="${s.jev > 0 ? 'var(--ok)' : s.jev < 0 ? 'var(--bad)' : 'var(--ink)'}">${signed(s.jev)}</text>
      <text class="ins-p" x="${IW - 9}" y="34" text-anchor="end" fill="${book.jev.liquidated ? 'var(--bad)' : book.jev.pos > 0 ? 'var(--ok)' : book.jev.pos < 0 ? 'var(--bad)' : 'var(--ink-2)'}">${
        book.jev.liquidated ? 'LIQUIDATED' : book.jev.pos === 0 ? 'flat' : `${book.jev.pos > 0 ? '+' : ''}${book.jev.pos.toFixed(2)}x`}</text>
      <text class="ins-k" x="9" y="49">b&amp;h ${signed(s.hold)}</text>
      <text class="ins-k" x="${IW - 9}" y="49" text-anchor="end">rnd ${signed(s.rand)}</text>
    </g>`;

  svg.innerHTML =
    [ext.hi, (ext.hi + ext.lo) / 2, ext.lo].map((v) =>
      `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>` +
      `<text class="endlab" x="${W - R + 5}" y="${(y(v) + 3).toFixed(1)}" fill="var(--ink-3)">${v.toFixed(0)}</text>`).join('') +
    body + marks + inset +
    `<g class="axis"><text x="${L}" y="${H - 6}">${candles.length} candles of ${BUCKET_MS / 1000}s, built from one-second mid samples</text></g>` +
    `<line class="crosshair" id="pxCross" x1="0" x2="0" y1="${T}" y2="${H - B}" style="opacity:0"/>`;

  wireHover(svg, $('pxTip'), candles.map((_, i) => [x(i), 0]), (i) => {
    const c = candles[i];
    return `${new Date(c.t0).toLocaleTimeString()}  ${BUCKET_MS / 1000}s\nopen  ${c.o.toFixed(1)}\nhigh  ${c.h.toFixed(1)}\nlow   ${c.l.toFixed(1)}\nclose ${c.c.toFixed(1)}\n${c.n} ticks`;
  }, W);
}

function drawExposure() {
  const svg = $('expChart'), W = 640, H = 96, L = 6, R = 52, T = 8, B = 16;
  // The SAME margins and the same candle count as the price chart above, so
  // a position lines up with the bar it was taken on. A position chart on its
  // own axis would be a second chart about a different thing.
  const t = ring.buf.slice(-180);
  const candles = toCandles(t, BUCKET_MS);
  if (candles.length < 2) { svg.innerHTML = ''; return; }
  const cap = Math.max(0.01, book.risk.cap);
  const y = (v) => T + (H - B - T) * (1 - (v + cap) / (2 * cap));
  const x = (i) => L + (W - L - R) * ((i + 0.5) / candles.length);

  // Position is a step function: it holds whatever the last decision set
  // until the next one, so the series is built by carrying forward, not by
  // interpolating between decisions.
  const hist = book.history;
  let hi = 0, pos = 0;
  const series = candles.map((c) => {
    while (hi < hist.length && hist[hi].t <= c.t1) pos = hist[hi++].pos;
    return pos;
  });

  const pts = [];
  series.forEach((v, i) => { pts.push([x(i), y(v)]); if (i < series.length - 1) pts.push([x(i + 1), y(v)]); });
  const area = `M${x(0).toFixed(1)} ${y(0).toFixed(1)} ` +
    pts.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') +
    ` L${pts.at(-1)[0].toFixed(1)} ${y(0).toFixed(1)} Z`;

  svg.innerHTML =
    [cap, cap / 2, 0, -cap / 2, -cap].map((v) =>
      `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"` +
      `${Math.abs(v) === cap ? ' stroke-dasharray="2 3"' : ''}/>`).join('') +
    // One clip per side, so the fill above the line and the fill below it can
    // carry different hues from a single path.
    `<defs>
       <clipPath id="clipUp"><rect x="0" y="0" width="${W}" height="${y(0).toFixed(1)}"/></clipPath>
       <clipPath id="clipDn"><rect x="0" y="${y(0).toFixed(1)}" width="${W}" height="${H}"/></clipPath>
     </defs>` +
    `<path d="${area}" fill="var(--up-c)" opacity="0.28" clip-path="url(#clipUp)"/>` +
    `<path d="${area}" fill="var(--down-c)" opacity="0.28" clip-path="url(#clipDn)"/>` +
    `<path d="${'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')}" fill="none" stroke="var(--ink-2)" stroke-width="1.4"/>` +
    `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="var(--ink-3)"/>` +
    [[cap, `+${cap}x`], [0, 'flat'], [-cap, `-${cap}x`]].map(([v, lab]) =>
      `<text class="endlab" x="${W - R + 5}" y="${(y(v) + 3).toFixed(1)}" fill="var(--ink-3)">${lab}</text>`).join('') +
    `<line class="crosshair" x1="0" x2="0" y1="${T}" y2="${H - B}" style="opacity:0"/>`;

  wireHover(svg, $('expTip'), candles.map((_, i) => [x(i), 0]), (i) => {
    const v = series[i];
    return `${new Date(candles[i].t0).toLocaleTimeString()}\n${v === 0 ? 'flat' : `${v > 0 ? 'long' : 'short'} ${Math.abs(v).toFixed(2)}x`}\n${((Math.abs(v) / cap) * 100).toFixed(0)}% of the cap`;
  }, W);
}

function drawPnl() {
  const svg = $('pnlChart'), W = 420, H = 190, L = 6, R = 46, T = 12, B = 22;
  const h = book.history.slice(-240);
  if (h.length < 2) { svg.innerHTML = ''; return; }
  // THREE lines, because three is what the palette clears on the all-pairs
  // CVD check — and these three because the question changed. Once Jev has
  // been shown the rules, "does he beat buy-and-hold" stops being the
  // interesting comparison and "does choosing beat aggregating" starts.
  // Buy-and-hold, random and the six rules are all in the leaderboard.
  const legs = [
    { k: 'jev', label: 'jev', c: 'var(--s1)', v: h.map((r) => (r.jev - 1) * 100) },
    { k: 'majority', label: 'avg', c: 'var(--s2)', v: h.map((r) => (r.majority - 1) * 100) },
    { k: 'best', label: 'best', c: 'var(--s3)', v: h.map((r) => (r.best - 1) * 100) },
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
function draw() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { drawPrice(); drawExposure(); drawPnl(); }); }

paintTiles();
paintBoard();
addEventListener('beforeunload', () => feed?.stop());
