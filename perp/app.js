// perp.mino.mobi — two linked time-series charts over ~28k hourly points.
//
// Canvas for the marks (SVG nodes at this count is a slideshow), DOM for the
// crosshair and tooltip so pointer movement never triggers a redraw. Data is
// column-oriented integer JSON from data/, written by scripts/backfill.mjs.

const HOUR = 3600e3, DAY = 86400e3;
const $ = (s) => document.querySelector(s);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ------------------------------------------------------------------ decode ---
// Inverse of encodeCandles/encodeFunding in scripts/backfill.mjs: timestamps are
// delta-encoded from t0, prices are integer cents, rates are units of 1e-8.
function decodeCandles(e) {
  const n = e.dt.length, t = new Float64Array(n);
  let acc = e.t0;
  for (let i = 0; i < n; i++) { acc += e.dt[i]; t[i] = acc; }
  const f = (a) => { const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = a[i] / 100; return o; };
  return { t, o: f(e.o), h: f(e.h), l: f(e.l), c: f(e.c), n };
}
function decodeFunding(e) {
  const n = e.dt.length, t = new Float64Array(n);
  let acc = e.t0;
  for (let i = 0; i < n; i++) { acc += e.dt[i]; t[i] = acc; }
  const f = (a) => { const o = new Float64Array(n); for (let i = 0; i < n; i++) o[i] = a[i] / 1e8; return o; };
  return { t, p: f(e.p), f: f(e.f), n };
}

// First index with t[i] >= x.
function lower(t, x, n) {
  let lo = 0, hi = n;
  while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < x) lo = m + 1; else hi = m; }
  return lo;
}

// ------------------------------------------------------------------- state ---
const S = {
  candles: {},              // resolution key -> decoded series
  reso: '1d',
  funding: null,
  stats: null,
  from: 0, to: 0,           // visible window, ms
  bounds: [0, 0],
  hover: null,
};
const RESOS = {
  '1d': { file: 'btc-1d.json', step: DAY,     label: 'daily candles' },
  '6h': { file: 'btc-6h.json', step: 6 * HOUR, label: '6-hour candles' },
  '1h': { file: 'btc-1h.json', step: HOUR,    label: 'hourly candles' },
};

// Pick the finest resolution whose candles stay wider than ~1.4px on screen.
function resoFor(span, width) {
  for (const k of ['1h', '6h', '1d']) if (span / RESOS[k].step <= width * 0.75) return k;
  return '1d';
}

const loading = new Map();
function loadCandles(key) {
  if (S.candles[key]) return Promise.resolve(S.candles[key]);
  if (!loading.has(key)) {
    loading.set(key, fetch(`/data/${RESOS[key].file}`).then((r) => r.json()).then((j) => {
      S.candles[key] = decodeCandles(j);
      return S.candles[key];
    }));
  }
  return loading.get(key);
}

// -------------------------------------------------------------- formatting ---
const bp   = (v, d = 2) => (v * 1e4).toFixed(d);
const pct  = (v, d = 1) => (v * 100).toFixed(d) + '%';
const usd  = (v) => v >= 1000 ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
                              : '$' + v.toFixed(2);
const annual = (perHour) => perHour * 24 * 365;
// Axis ticks want compactness; the tooltip and the end-label want the real figure.
const usdTick = (v) => {
  if (Math.abs(v) < 0.5) return '$0';
  if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
  return '$' + v.toFixed(0);
};
const fmtDay = (t) => new Date(t).toISOString().slice(0, 10);
const fmtHour = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + 'Z';

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

// ------------------------------------------------------------------ canvas ---
function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const r = canvas.parentElement.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: r.width, h: r.height };
}

const PAD = { l: 56, r: 14, t: 10, b: 22 };
const CANDLE_MIN_PX = 2.5;   // below this, candles are thinner than their own gap

function niceTicks(lo, hi, want) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / want;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(v);
  return out;
}

function timeTicks(from, to, width) {
  const want = clamp(Math.floor(width / 110), 2, 9);
  const span = to - from;
  const steps = [HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY,
                 30 * DAY, 91 * DAY, 182 * DAY, 365 * DAY, 730 * DAY];
  const step = steps.find((s) => span / s <= want) ?? steps.at(-1);
  const out = [];
  for (let v = Math.ceil(from / step) * step; v <= to; v += step) out.push(v);
  const label = step >= 182 * DAY ? (t) => String(new Date(t).getUTCFullYear())
              : step >= 25 * DAY  ? (t) => new Date(t).toISOString().slice(0, 7)
              : step >= DAY       ? (t) => new Date(t).toISOString().slice(5, 10)
              : (t) => new Date(t).toISOString().slice(11, 16);
  return { ticks: out, label };
}

function frame(ctx, w, h, yTicks, yFmt, from, to, opts = {}) {
  const pw = w - PAD.l - PAD.r, ph = h - PAD.t - PAD.b;
  ctx.clearRect(0, 0, w, h);
  if (opts.underlay) opts.underlay(pw, ph);   // painted under the grid, after the clear
  ctx.strokeStyle = css('--hairline'); ctx.fillStyle = css('--text-muted');
  ctx.lineWidth = 1; ctx.font = '11px ui-monospace, Menlo, monospace';

  // horizontal grid — solid hairlines, one shade off the surface
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of yTicks) {
    const y = Math.round(opts.yScale(v)) + 0.5;
    if (y < PAD.t || y > PAD.t + ph) continue;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + pw, y); ctx.stroke();
    ctx.fillText(yFmt(v), PAD.l - 8, y);
  }
  // x labels only (vertical grid would double the chrome for no gain)
  const { ticks, label } = timeTicks(from, to, pw);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const t of ticks) {
    const x = Math.round(opts.xScale(t)) + 0.5;
    if (x < PAD.l - 2 || x > PAD.l + pw + 2) continue;
    ctx.fillText(label(t), x, PAD.t + ph + 6);
  }
  return { pw, ph };
}

// Collapse the visible slice into one bucket per pixel column. Preserves the
// extremes, which naive stride-sampling silently throws away.
function columns(t, i0, i1, xScale, pw) {
  const cols = new Array(Math.ceil(pw)).fill(null);
  for (let i = i0; i < i1; i++) {
    const cx = Math.floor(xScale(t[i]) - PAD.l);
    if (cx < 0 || cx >= cols.length) continue;
    const c = cols[cx];
    if (c === null) cols[cx] = { i0: i, i1: i };
    else c.i1 = i;
  }
  return cols;
}

// ------------------------------------------------------------- price chart ---
// The chart switches marks when candles get too thin to read; the legend has to
// switch with it or it describes marks that are not on screen.
function setPriceLegend(candles) {
  const el = document.getElementById('pricelegend');
  if (!el || el.dataset.mode === String(candles)) return;
  el.dataset.mode = String(candles);
  el.innerHTML = candles
    ? `<span><i class="sw" style="background:var(--pole-up)"></i>close up</span>
       <span><i class="sw" style="background:var(--pole-down)"></i>close down</span>`
    : `<span><i class="sw" style="background:var(--band)"></i>high–low range</span>
       <span><i class="sw line" style="background:var(--text-secondary)"></i>close</span>`;
}

function drawPrice() {
  const cv = $('#pricecv'), { ctx, w, h } = fit(cv);
  const series = S.candles[S.reso];
  if (!series) return;
  const { t, o, n } = series;
  const i0 = Math.max(0, lower(t, S.from, n) - 1);
  const i1 = Math.min(n, lower(t, S.to, n) + 1);
  if (i1 <= i0) return;

  let lo = Infinity, up = -Infinity;
  for (let i = i0; i < i1; i++) { if (series.l[i] < lo) lo = series.l[i]; if (series.h[i] > up) up = series.h[i]; }
  if (!isFinite(lo)) return;
  const padY = (up - lo) * 0.08 || 1;
  lo -= padY; up += padY;

  const pw = w - PAD.l - PAD.r, ph = h - PAD.t - PAD.b;
  const xScale = (x) => PAD.l + ((x - S.from) / (S.to - S.from)) * pw;
  const yScale = (v) => PAD.t + (1 - (v - lo) / (up - lo)) * ph;
  frame(ctx, w, h, niceTicks(lo, up, 5), usdTick, S.from, S.to, { xScale, yScale });

  const step = RESOS[S.reso].step;
  const bucketPx = (step / (S.to - S.from)) * pw;
  const UP = css('--pole-up'), DOWN = css('--pole-down');
  setPriceLegend(bucketPx >= CANDLE_MIN_PX);

  ctx.save();
  ctx.beginPath(); ctx.rect(PAD.l, PAD.t, pw, ph); ctx.clip();

  if (bucketPx >= CANDLE_MIN_PX) {
    // Real candles. 2px surface gap between adjacent bodies, never a border.
    const bw = Math.max(1, bucketPx - 2);
    for (let i = i0; i < i1; i++) {
      const x = xScale(t[i]), rising = series.c[i] >= o[i];
      ctx.fillStyle = ctx.strokeStyle = rising ? UP : DOWN;
      ctx.lineWidth = Math.min(2, Math.max(1, bw * 0.18));
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, yScale(series.h[i]));
      ctx.lineTo(Math.round(x) + 0.5, yScale(series.l[i]));
      ctx.stroke();
      const yo = yScale(o[i]), yc = yScale(series.c[i]);
      ctx.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo)));
    }
  } else {
    // Too dense for candles: high/low envelope + a close line, per pixel column.
    const cols = columns(t, i0, i1, xScale, pw);
    ctx.fillStyle = css('--band');
    ctx.beginPath();
    let started = false;
    for (let cx = 0; cx < cols.length; cx++) {
      const c = cols[cx]; if (!c) continue;
      let mx = -Infinity; for (let i = c.i0; i <= c.i1; i++) mx = Math.max(mx, series.h[i]);
      const x = PAD.l + cx + 0.5;
      if (!started) { ctx.moveTo(x, yScale(mx)); started = true; } else ctx.lineTo(x, yScale(mx));
    }
    for (let cx = cols.length - 1; cx >= 0; cx--) {
      const c = cols[cx]; if (!c) continue;
      let mn = Infinity; for (let i = c.i0; i <= c.i1; i++) mn = Math.min(mn, series.l[i]);
      ctx.lineTo(PAD.l + cx + 0.5, yScale(mn));
    }
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = css('--text-secondary'); ctx.lineWidth = 1.6;
    ctx.beginPath(); started = false;
    for (let cx = 0; cx < cols.length; cx++) {
      const c = cols[cx]; if (!c) continue;
      const x = PAD.l + cx + 0.5, y = yScale(series.c[c.i1]);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // direct-label the last visible close rather than numbering every point
  const last = series.c[i1 - 1];
  ctx.fillStyle = css('--text-primary'); ctx.font = '600 11.5px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillText(usd(last), PAD.l + pw, clamp(yScale(last) - 5, PAD.t + 11, PAD.t + ph));
}

// ----------------------------------------------------------- premium chart ---
function drawPremium() {
  const cv = $('#premcv'), { ctx, w, h } = fit(cv);
  const F = S.funding, st = S.stats;
  if (!F || !st) return;
  const { t, p, f, n } = F;
  const i0 = Math.max(0, lower(t, S.from, n) - 1);
  const i1 = Math.min(n, lower(t, S.to, n) + 1);
  if (i1 <= i0) return;

  const CLAMP = st.parameters.clamp, BASE = st.parameters.baseline;
  let lo = -CLAMP * 1.35, up = CLAMP * 1.35;
  for (let i = i0; i < i1; i++) { if (p[i] < lo) lo = p[i]; if (p[i] > up) up = p[i]; if (f[i] < lo) lo = f[i]; if (f[i] > up) up = f[i]; }
  const padY = (up - lo) * 0.1; lo -= padY; up += padY;

  const pw = w - PAD.l - PAD.r, ph = h - PAD.t - PAD.b;
  const xScale = (x) => PAD.l + ((x - S.from) / (S.to - S.from)) * pw;
  const yScale = (v) => PAD.t + (1 - (v - lo) / (up - lo)) * ph;

  // the clamp corridor, painted under the grid so it reads as ground, not as a mark
  const yTop = clamp(yScale(CLAMP), PAD.t, PAD.t + ph), yBot = clamp(yScale(-CLAMP), PAD.t, PAD.t + ph);
  frame(ctx, w, h, niceTicks(lo, up, 5), (v) => bp(v, 1), S.from, S.to, {
    xScale, yScale,
    underlay: () => { ctx.fillStyle = css('--band'); ctx.fillRect(PAD.l, yTop, pw, Math.max(0, yBot - yTop)); },
  });

  ctx.save();
  ctx.beginPath(); ctx.rect(PAD.l, PAD.t, pw, ph); ctx.clip();

  // zero rule — where the perp is exactly spot
  ctx.strokeStyle = css('--text-muted'); ctx.lineWidth = 1;
  const yz = Math.round(yScale(0)) + 0.5;
  ctx.beginPath(); ctx.moveTo(PAD.l, yz); ctx.lineTo(PAD.l + pw, yz); ctx.stroke();

  const cols = columns(t, i0, i1, xScale, pw);
  const agg = cols.map((c) => {
    if (!c) return null;
    let pmin = Infinity, pmax = -Infinity, ps = 0, fs = 0, k = 0;
    for (let i = c.i0; i <= c.i1; i++) { pmin = Math.min(pmin, p[i]); pmax = Math.max(pmax, p[i]); ps += p[i]; fs += f[i]; k++; }
    return { pmin, pmax, pmean: ps / k, fmean: fs / k };
  });

  // premium: min/max envelope behind a mean line, so extremes survive downsampling
  const S1 = css('--series-1');
  if ((i1 - i0) > pw) {
    ctx.fillStyle = S1; ctx.globalAlpha = 0.18;
    ctx.beginPath();
    let started = false;
    for (let cx = 0; cx < agg.length; cx++) { const a = agg[cx]; if (!a) continue;
      const x = PAD.l + cx + 0.5; if (!started) { ctx.moveTo(x, yScale(a.pmax)); started = true; } else ctx.lineTo(x, yScale(a.pmax)); }
    for (let cx = agg.length - 1; cx >= 0; cx--) { const a = agg[cx]; if (!a) continue; ctx.lineTo(PAD.l + cx + 0.5, yScale(a.pmin)); }
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  }

  const stroke = (pick, colour, width) => {
    ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); let started = false;
    for (let cx = 0; cx < agg.length; cx++) {
      const a = agg[cx]; if (!a) continue;
      const x = PAD.l + cx + 0.5, y = yScale(pick(a));
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  stroke((a) => a.pmean, S1, 2);
  stroke((a) => a.fmean, css('--series-2'), 2);
  ctx.restore();

  // direct labels at the right edge — the two series, named where they end
  const lastA = [...agg].reverse().find(Boolean);
  if (lastA) {
    ctx.font = '600 11px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    // the two series often end within a basis point of each other — nudge the
    // labels apart rather than stacking them on the same pixel
    let yf = yScale(lastA.fmean), yp = yScale(lastA.pmean);
    if (Math.abs(yf - yp) < 21) { const mid = (yf + yp) / 2; yf = mid - 11; yp = mid + 11; }
    const fit = (y) => clamp(y, PAD.t + 8, PAD.t + ph - 8);
    const tag = (text, y, colour) => {
      const tw = ctx.measureText(text).width;
      ctx.globalAlpha = 0.82; ctx.fillStyle = css('--surface-1');
      ctx.fillRect(PAD.l + pw - tw - 6, y - 7, tw + 8, 14);
      ctx.globalAlpha = 1; ctx.fillStyle = colour;
      ctx.fillText(text, PAD.l + pw - 2, y);
    };
    tag('funding', fit(yf), css('--series-2'));
    tag('premium', fit(yp), S1);
  }
  // corridor annotation — along the TOP edge of the band, clear of the zero rule
  // and the funding line that both run through its middle
  if (yBot - yTop > 30) {
    const label = 'clamp corridor ±' + bp(CLAMP, 0) + 'bp — funding is blind to premium in here';
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    // the premium line runs through this text, so back it with the band colour
    const tw = ctx.measureText(label).width;
    ctx.globalAlpha = 0.82; ctx.fillStyle = css('--surface-1');
    ctx.fillRect(PAD.l + 6, yTop + 3, tw + 8, 15);
    ctx.globalAlpha = 1; ctx.fillStyle = css('--text-muted');
    ctx.fillText(label, PAD.l + 10, yTop + 5);
  }
}

function draw() { drawPrice(); drawPremium(); }

// -------------------------------------------------------------- crosshair ---
function makeCursor(el) {
  const line = document.createElement('div');
  line.style.cssText = 'position:absolute;top:0;bottom:0;width:1px;background:var(--text-muted);opacity:0;';
  el.appendChild(line);
  return line;
}
const cursors = [];

function moveCursor(clientX, rect) {
  const x = clientX - rect.left;
  const pw = rect.width - PAD.l - PAD.r;
  if (x < PAD.l || x > PAD.l + pw) return hideCursor();
  const t = S.from + ((x - PAD.l) / pw) * (S.to - S.from);
  for (const c of cursors) { c.style.left = `${x}px`; c.style.opacity = '1'; }
  showTip(t, clientX);
}
function hideCursor() {
  for (const c of cursors) c.style.opacity = '0';
  $('#tip').classList.remove('on');
}

function showTip(t, clientX) {
  const tip = $('#tip'), series = S.candles[S.reso], F = S.funding;
  if (!series) return;
  const ci = clamp(lower(series.t, t, series.n) - 1, 0, series.n - 1);
  const rows = [];
  const step = RESOS[S.reso].step;
  rows.push(['open', usd(series.o[ci])], ['high', usd(series.h[ci])], ['low', usd(series.l[ci])], ['close', usd(series.c[ci])]);
  let stamp = step >= DAY ? fmtDay(series.t[ci]) : fmtHour(series.t[ci]);

  if (F) {
    const fi = lower(F.t, t, F.n);
    const j = clamp(Math.abs((F.t[fi] ?? Infinity) - t) < Math.abs(t - (F.t[fi - 1] ?? -Infinity)) ? fi : fi - 1, 0, F.n - 1);
    if (Math.abs(F.t[j] - t) < Math.max(step, HOUR) * 1.5) {
      rows.push(['premium', `${bp(F.p[j])} bp`], ['funding', `${bp(F.f[j], 3)} bp/hr`],
                ['annualised', pct(annual(F.f[j]))]);
    }
  }
  tip.innerHTML = `<div class="d">${stamp}</div>` +
    rows.map(([k, v]) => `<div class="r"><span>${k}</span><b>${v}</b></div>`).join('');
  tip.classList.add('on');
  const w = tip.offsetWidth || 190;
  const left = clamp(clientX + 16, 8, innerWidth - w - 8);
  tip.style.left = `${left + scrollX}px`;
  tip.style.top = `${$('#priceplot').getBoundingClientRect().top + scrollY + 12}px`;
}

// ------------------------------------------------------ pan / zoom / range ---
function setView(from, to) {
  const [lo, hi] = S.bounds;
  const minSpan = 6 * HOUR;
  let span = clamp(to - from, minSpan, hi - lo);
  from = clamp(from, lo, hi - span);
  S.from = from; S.to = from + span;
  const want = resoFor(span, innerWidth);
  if (want !== S.reso) {
    if (S.candles[want]) { S.reso = want; }
    else loadCandles(want).then(() => { S.reso = want; syncReso(); draw(); });
  }
  syncReso();
  draw();
}
function syncReso() { $('#reso').textContent = RESOS[S.reso].label; }

function wireInteraction() {
  for (const id of ['priceplot', 'premplot']) {
    const el = document.getElementById(id);
    cursors.push(makeCursor(document.getElementById(id === 'priceplot' ? 'pricecur' : 'premcur')));
    el.addEventListener('pointermove', (e) => {
      if (el._drag) {
        const rect = el.getBoundingClientRect();
        const pw = rect.width - PAD.l - PAD.r;
        const dt = ((el._drag.x - e.clientX) / pw) * (el._drag.to - el._drag.from);
        setView(el._drag.from + dt, el._drag.to + dt);
        return;
      }
      moveCursor(e.clientX, el.getBoundingClientRect());
    });
    el.addEventListener('pointerleave', hideCursor);
    el.addEventListener('pointerdown', (e) => {
      el._drag = { x: e.clientX, from: S.from, to: S.to };
      el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing';
    });
    const end = () => { el._drag = null; el.style.cursor = 'crosshair'; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.style.cursor = 'crosshair';
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const pw = rect.width - PAD.l - PAD.r;
      const frac = clamp((e.clientX - rect.left - PAD.l) / pw, 0, 1);
      const anchor = S.from + frac * (S.to - S.from);
      const k = Math.exp(e.deltaY * 0.0016);
      setView(anchor - (anchor - S.from) * k, anchor + (S.to - anchor) * k);
    }, { passive: false });
  }
  for (const b of document.querySelectorAll('[data-range]')) {
    b.addEventListener('click', () => {
      for (const o of document.querySelectorAll('[data-range]')) o.setAttribute('aria-pressed', String(o === b));
      const r = b.dataset.range;
      const hi = S.bounds[1];
      setView(r === 'all' ? S.bounds[0] : hi - (+r) * DAY, hi);
    });
  }
  let rt;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(draw, 90); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
}

// ----------------------------------------------------------------- live tail ---
// Static files are refreshed daily by a workflow; this pulls the hours since.
// Anything that fails here leaves the page working on committed data.
// A fetch that always settles. A hung endpoint must never leave the UI stuck on
// "checking…" — without the abort signal there is no rejection to catch.
function timedFetch(url, opts = {}, ms = 7000) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
}

async function tailFunding(marks) {
  const last = S.funding.t[S.funding.n - 1];
  const r = await timedFetch('https://api.hyperliquid.xyz/info', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'fundingHistory', coin: 'BTC', startTime: last - HOUR }),
  });
  const add = (await r.json()).filter((x) => x.time > last + HOUR / 2);
  if (!add.length) return;
  const n = S.funding.n + add.length;
  const grow = (src) => { const o = new Float64Array(n); o.set(src); return o; };
  const t = grow(S.funding.t), p = grow(S.funding.p), f = grow(S.funding.f);
  add.forEach((x, i) => {
    const k = S.funding.n + i;
    t[k] = Math.round(x.time / HOUR) * HOUR; p[k] = +x.premium; f[k] = +x.fundingRate;
  });
  S.funding = { t, p, f, n };
  marks.push(`${add.length}h funding`);
}

async function tailCandles(marks) {
  const r = await timedFetch('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600');
  const rows = (await r.json())
    .map(([sec, low, high, open, close]) => ({ t: sec * 1000, o: open, h: high, l: low, c: close }))
    .sort((a, b) => a.t - b.t);
  for (const key of Object.keys(S.candles)) {
    const cs = S.candles[key], step = RESOS[key].step;
    const fresh = rows.filter((x) => x.t > cs.t[cs.n - 1]);
    if (!fresh.length) continue;
    // fold the hourly rows into this resolution's buckets
    const buckets = new Map();
    for (const x of fresh) {
      const b = Math.floor(x.t / step) * step, cur = buckets.get(b);
      if (!cur) buckets.set(b, { o: x.o, h: x.h, l: x.l, c: x.c });
      else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; }
    }
    const extra = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
    const n = cs.n + extra.length;
    const grow = (src) => { const o = new Float64Array(n); o.set(src); return o; };
    const t = grow(cs.t), o = grow(cs.o), h = grow(cs.h), l = grow(cs.l), c = grow(cs.c);
    extra.forEach(([bt, v], i) => { const k = cs.n + i; t[k] = bt; o[k] = v.o; h[k] = v.h; l[k] = v.l; c[k] = v.c; });
    S.candles[key] = { t, o, h, l, c, n };
    if (key === '1d') marks.push(`${extra.length} candle${extra.length > 1 ? 's' : ''}`);
  }
}

// Static files are refreshed daily by a workflow; this pulls the hours since.
// Both sources are independent, so they race in parallel and either may fail —
// whatever fails leaves the page working on committed data.
async function liveTail() {
  const marks = [];
  await Promise.allSettled([tailFunding(marks), tailCandles(marks)]);
  if (marks.length) {
    S.bounds[1] = Math.max(S.bounds[1], S.funding.t[S.funding.n - 1]);
    draw();
    $('#asof').innerHTML = `<span class="dot"></span>live — topped up with ${marks.join(' and ')} since the last daily refresh`;
  } else {
    // Already current, or both endpoints unreachable. Say so rather than
    // leaving "checking…" on screen forever.
    $('#asof').textContent = `Static history through ${fmtHour(S.funding.t[S.funding.n - 1])} — no newer hours available right now.`;
  }
  paintTiles();
  paintRecent();
}

// --------------------------------------------------------------- populate ---
function paintTiles() {
  const st = S.stats, F = S.funding, d = S.candles['1d'];
  const lastF = F.n - 1;
  const prem = F.p[lastF], fund = F.f[lastF];
  const spot = d ? d.c[d.n - 1] : null;
  $('#tiles').innerHTML = [
    spot ? `<div class="tile"><div class="k">BTC spot</div><div class="v">${usd(spot)}</div><div class="n">Coinbase, ${fmtDay(d.t[d.n - 1])}</div></div>` : '',
    `<div class="tile"><div class="k">premium now</div><div class="v ${prem >= 0 ? 'up' : 'down'}">${bp(prem)}<span style="font-size:14px"> bp</span></div>
      <div class="n">perp ${prem >= 0 ? 'above' : 'below'} spot</div></div>`,
    `<div class="tile"><div class="k">funding now</div><div class="v ${fund >= 0 ? 'up' : 'down'}">${pct(annual(fund))}</div>
      <div class="n">${bp(fund, 3)} bp/hr · ${fund >= 0 ? 'longs pay' : 'shorts pay'}</div></div>`,
    `<div class="tile"><div class="k">paid by longs since 2023</div><div class="v">${pct(st.carry.cumulative)}</div>
      <div class="n">of notional · ${pct(st.carry.annualised)} a year</div></div>`,
  ].join('');
}

function paintProse() {
  const st = S.stats;
  $('#clampbp').textContent = bp(st.parameters.clamp, 0);
  $('#pinnedpct').textContent = pct(st.clamp.sharePinnedAtBaseline);
  $('#longspaid').textContent = pct(st.carry.shareLongsPaid);
  $('#annualised').textContent = pct(st.carry.annualised);
  $('#nsamp').textContent = st.correlation.samples.toLocaleString('en-US');
  $('#mederr').textContent = `${bp(st.clamp.modelErrorMedian, 4)} bp`;
  $('#maxerr').textContent = `${bp(st.clamp.modelErrorMax, 1)} bp`;
  const depth = st.clamp.pinRateByDepth;
  $('#pindeep').textContent = pct(depth.at(-1).pinned);
  $('#pinedge').textContent = pct(depth[0].pinned);
  $('#gen').textContent = `Series through ${fmtDay(st.span.to)}.`;

  const label = { 1: '1 hour', 6: '6 hours', 24: '1 day', 72: '3 days', 168: '1 week' };
  $('#corrtable tbody').innerHTML = Object.keys(st.correlation.trailing).map((w) =>
    `<tr><td>${label[w] ?? w + 'h'}</td><td>${st.correlation.trailing[w].toFixed(3)}</td><td>${st.correlation.forward[w].toFixed(3)}</td></tr>`).join('');

  $('#regimetable tbody').innerHTML = st.regimes.map((r) =>
    `<tr><td>${r.year}</td><td>${r.hours.toLocaleString('en-US')}</td>
     <td class="${r.meanPremium >= 0 ? 'up' : 'down'}">${bp(r.meanPremium)} bp</td>
     <td>${pct(r.fundingPaid, 2)}</td><td>${pct(r.annualised)}</td><td>${pct(r.sharePositive)}</td></tr>`).join('');
}

function paintRecent() {
  const F = S.funding, h = S.candles['1h'];
  const rows = [];
  for (let i = F.n - 1; i >= 0 && rows.length < 48; i--) {
    let spot = '—';
    if (h) { const j = lower(h.t, F.t[i], h.n); if (h.t[j] === F.t[i]) spot = usd(h.c[j]); }
    rows.push(`<tr><td>${fmtHour(F.t[i])}</td><td>${spot}</td>
      <td class="${F.p[i] >= 0 ? 'up' : 'down'}">${bp(F.p[i])}</td><td>${bp(F.f[i], 3)}</td><td>${pct(annual(F.f[i]))}</td></tr>`);
  }
  $('#recent tbody').innerHTML = rows.join('');
}

// ------------------------------------------------------------------- boot ---
(async function boot() {
  const [fundRaw, statsRaw] = await Promise.all([
    fetch('/data/hl-btc-funding.json').then((r) => r.json()),
    fetch('/data/stats.json').then((r) => r.json()),
    loadCandles('1d'),
  ]);
  S.funding = decodeFunding(fundRaw);
  S.stats = statsRaw;

  const d = S.candles['1d'];
  S.bounds = [d.t[0], Math.max(d.t[d.n - 1], S.funding.t[S.funding.n - 1])];
  paintProse(); paintTiles(); paintRecent();
  $('#asof').textContent = `Static history through ${fmtDay(S.stats.span.to)} — checking for newer hours…`;

  wireInteraction();
  setView(S.bounds[1] - 365 * DAY, S.bounds[1]);

  // hourly spot is only needed for the recent table + deep zoom; fetch it after paint
  loadCandles('1h').then(() => { paintRecent(); draw(); });
  liveTail();
})();
