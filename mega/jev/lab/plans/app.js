// The plans replay: walks a recorded tape with lab/plans.mjs in the browser
// (the same engine the gate and the eval run) and draws every plan's levels.
import { MACROS, DECIDERS, walk, options, state, questions } from '../plans.mjs';

const $ = (id) => document.getElementById(id);
const WIN = 360;
const tapes = {};
let bars = [], run = null, chosen = null;

const who = $('who');
for (const [v, label] of [['baseline', 'baseline script'], ['random', 'random plan'], ['bestRecent', 'best recent record'], ['wait', 'stand aside'], ...Object.keys(MACROS).filter((k) => k !== 'wait').map((k) => [`fixed:${k}`, `always ${k}`])]) {
  const o = document.createElement('option'); o.value = v; o.textContent = label; who.append(o);
}

async function tape(coin) {
  if (!tapes[coin]) {
    const r = await fetch(`../fixtures/candles-${coin.toLowerCase()}-1m.json`);
    const j = await r.json();
    tapes[coin] = j.bars.map(([t, o, h, l, c]) => ({ t, o, h, l, c }));
  }
  return tapes[coin];
}
function decider() {
  const v = who.value;
  if (v === 'random') return DECIDERS.random(+$('seed').value || 1);
  if (v === 'baseline') return DECIDERS.baseline();
  if (v === 'bestRecent') return DECIDERS.bestRecent();
  if (v === 'wait') return DECIDERS.wait;
  return DECIDERS.fixed(v.slice(6));
}
const fmt = (x, d = 1) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(+x).toFixed(d)}`);

async function rerun() {
  bars = await tape($('coin').value);
  run = await walk(bars, decider(), { record: who.value === 'bestRecent' });
  chosen = null;
  const r = run, days = (bars.length - 300) / 1440;
  $('tNet').textContent = `${fmt(r.net_bp, 0)}bp`; $('tNet').className = 'v ' + (r.net_bp >= 0 ? 'pos' : 'neg');
  $('tPer').textContent = `${fmt(r.net_bp / days, 0)}bp a day over ${days.toFixed(1)} days`;
  $('tGross').textContent = `${fmt(r.gross_bp, 0)}bp`;
  $('tT').textContent = r.t_gross == null ? 'no trades' : `t ${r.t_gross} per trade (|t|<2: nothing)`;
  $('tCost').textContent = `${r.cost_bp.toFixed(0)}bp`;
  $('tTrades').textContent = `${r.trades} trades, ${r.unfilled} unfilled, ${r.waits} waits`;
  $('tHit').textContent = r.hit_rate == null ? '—' : `${(r.hit_rate * 100).toFixed(0)}% (${r.coin_flip_hit_rate == null ? '—' : (r.coin_flip_hit_rate * 100).toFixed(0) + '%'})`;
  $('tCoin').textContent = r.coin_flip_net_bp == null ? '—' : `${fmt(r.coin_flip_net_bp, 0)}bp`;
  const w = $('win'); w.max = Math.max(0, bars.length - WIN); if (+w.value > +w.max || w.dataset.coin !== $('coin').value) w.value = w.max; w.dataset.coin = $('coin').value;
  draw();
}

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function draw() {
  const cv = $('cv'), box = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = box.width, H = box.height, a = +$('win').value, b = Math.min(bars.length - 1, a + WIN - 1);
  $('winLabel').textContent = bars.length ? `${new Date(bars[a].t).toISOString().slice(5, 16).replace('T', ' ')} UTC` : '—';
  const seen = run ? run.plans.filter((p) => p.entryBar != null ? p.exitBar >= a && p.entryBar <= b : p.start >= a && p.start <= b) : [];
  let lo = Infinity, hi = -Infinity;
  for (let k = a; k <= b; k++) { lo = Math.min(lo, bars[k].l); hi = Math.max(hi, bars[k].h); }
  for (const p of seen) for (const v of [p.spec?.tgt, p.spec?.stp]) if (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const pad = (hi - lo) * 0.04; lo -= pad; hi += pad;
  const L = 8, R = 58, T = 8, B = 18, x = (k) => L + ((k - a) + 0.5) / WIN * (W - L - R), y = (v) => T + (hi - v) / (hi - lo) * (H - T - B), cw = Math.max(1, (W - L - R) / WIN * 0.7);
  g.clearRect(0, 0, W, H);
  g.font = '10px ' + css('--mono'); g.fillStyle = css('--ink-3'); g.strokeStyle = css('--line-2'); g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4; g.beginPath(); g.moveTo(L, y(v)); g.lineTo(W - R, y(v)); g.stroke(); g.fillText(v.toFixed(v > 1000 ? 0 : 2), W - R + 4, y(v) + 3); }
  // plans under the candles
  const ok = css('--ok'), bad = css('--bad'), ink = css('--ink'), ink2 = css('--ink-2'), acc = css('--accent');
  for (const p of seen) {
    const sp = p.spec; if (!sp) continue;
    const x0 = x(Math.max(a, p.entryBar ?? p.start)), x1 = x(Math.min(b, p.exitBar ?? p.start));
    if (!p.filled) { g.setLineDash([3, 3]); g.strokeStyle = ink2; g.beginPath(); g.moveTo(x(Math.max(a, p.start)), y(sp.entry.px)); g.lineTo(x1, y(sp.entry.px)); g.stroke(); g.setLineDash([]); continue; }
    const sh = p.entryPx / sp.entry.px, tgt = sp.tgt != null ? sp.tgt * (p.key === 'revert' ? 1 : sh) : null;
    g.globalAlpha = p === chosen ? 0.32 : 0.14;
    if (tgt != null) { g.fillStyle = ok; g.fillRect(x0, Math.min(y(tgt), y(p.entryPx)), x1 - x0, Math.abs(y(tgt) - y(p.entryPx))); }
    g.fillStyle = bad; const st = sp.stp * sh; g.fillRect(x0, Math.min(y(st), y(p.entryPx)), x1 - x0, Math.abs(y(st) - y(p.entryPx)));
    g.globalAlpha = 1;
    g.lineWidth = p === chosen ? 2 : 1;
    if (tgt != null) { g.strokeStyle = ok; g.beginPath(); g.moveTo(x0, y(tgt)); g.lineTo(x1, y(tgt)); g.stroke(); g.fillStyle = ok; g.fillText('T', x0 + 2, y(tgt) - 2); }
    g.strokeStyle = bad; g.beginPath(); g.moveTo(x0, y(st)); g.lineTo(x1, y(st)); g.stroke(); g.fillStyle = bad; g.fillText('S', x0 + 2, y(st) + 10);
    g.lineWidth = 1;
  }
  for (let k = a; k <= b; k++) {
    const c = bars[k], up = c.c >= c.o; g.strokeStyle = ink; g.fillStyle = ink;
    g.beginPath(); g.moveTo(x(k), y(c.h)); g.lineTo(x(k), y(c.l)); g.stroke();
    const top = y(Math.max(c.o, c.c)), h = Math.max(1, Math.abs(y(c.o) - y(c.c)));
    if (up) { g.fillStyle = css('--paper'); g.fillRect(x(k) - cw / 2, top, cw, h); g.strokeRect(x(k) - cw / 2, top, cw, h); } else g.fillRect(x(k) - cw / 2, top, cw, h);
  }
  // entry and exit marks
  g.font = 'bold 12px ' + css('--mono');
  for (const p of seen) {
    if (!p.filled) { if (p.exitBar <= b) { g.fillStyle = ink2; g.fillText('–', x(p.exitBar) - 3, y(p.spec.entry.px) - 3); } continue; }
    if (p.entryBar >= a) { g.fillStyle = acc; g.beginPath(); g.arc(x(p.entryBar), y(p.entryPx), 3, 0, 7); g.fill(); }
    if (p.exitBar <= b) { const m = p.reason === 'target' ? ['✓', ok] : p.reason === 'stopped' ? ['×', bad] : ['⏱', ink2]; g.fillStyle = m[1]; g.fillText(m[0], x(p.exitBar) - 4, y(p.exitPx) - 5); }
  }
  // the list
  const list = $('plans'); list.innerHTML = '';
  for (const p of seen.filter((p) => p.spec)) {
    const btn = document.createElement('button');
    btn.setAttribute('aria-pressed', String(p === chosen));
    btn.textContent = `${new Date(bars[p.start].t).toISOString().slice(11, 16)}  ${p.key.padEnd(15)} ${p.reason.padEnd(10)} ${p.filled ? fmt(p.netBp) + 'bp' : ''}`;
    btn.onclick = () => { chosen = p; showFacts(p); draw(); };
    list.append(btn);
  }
}
function showFacts(p) {
  const i = p.start, opts = options(bars, i), q = questions(opts);
  $('facts').textContent = `chose ${p.key} → ${p.reason}${p.filled ? `, ${fmt(p.grossBp)}bp gross, ${fmt(p.netBp)}bp net` : ''}\n\nSTATE\n${JSON.stringify(state(bars, i), null, 1)}\n\nTHE MENU (what a decider is offered)\n${JSON.stringify(q.plan.criteria, null, 1)}`;
}

async function gate() {
  try {
    const r = await (await fetch('../plans-gate.json')).json();
    const rows = Object.entries(r.pooled);
    const t = $('gate');
    t.innerHTML = '<tr><th>arm</th><th>net bp</th><th>gross</th><th>trades</th><th>hit (coin)</th><th>t gross</th></tr>' +
      rows.map(([n, v]) => n === 'random' ? `<tr><td>random (${r.seeds} seeds)</td><td class="neg">${v.net_bp.toFixed(0)}</td><td colspan="4">± ${v.sd_bp.toFixed(0)} sd</td></tr>` :
        `<tr><td>${n}</td><td class="${v.net_bp >= 0 ? 'pos' : 'neg'}">${v.net_bp.toFixed(0)}</td><td>${v.gross_bp.toFixed(0)}</td><td>${v.trades}</td><td>${v.hit_rate == null ? '—' : `${(v.hit_rate * 100).toFixed(0)}% (${v.coin_flip_hit_rate == null ? '—' : (v.coin_flip_hit_rate * 100).toFixed(0) + '%'})`}</td><td>${v.t_gross ?? '—'}</td></tr>`).join('');
    const tp = Object.entries(r.tapes).map(([c, v]) => `${c} ${v.days}d (${v.from.slice(0, 10)}→${v.to.slice(5, 10)})`).join(', ');
    const arms = rows.filter(([n]) => n !== 'random' && n !== 'wait');
    const beat = arms.filter(([, v]) => v.net_bp > 0).map(([n, v]) => `${n} (${v.net_bp.toFixed(0)}bp on ${v.trades} trades)`);
    const out = arms.filter(([, v]) => v.t_gross != null && Math.abs(v.t_gross) >= 2).map(([n, v]) => `${n} (t ${v.t_gross})`);
    $('gateNote').textContent = `Run ${r.ran.slice(0, 16).replace('T', ' ')} UTC on ${tp}. Standing aside returns exactly 0; ` +
      (beat.length ? `only ${beat.join(', ')} beat it. ` : 'no arm beats it. ') +
      (out.length ? `Gross t outside ±2: ${out.join(', ')}; everything else earned nothing before costs that a coin flip would not.` : 'Every gross t is inside ±2: before costs, nothing here beats a coin flip.');
  } catch (e) { $('gate').innerHTML = `<tr><td>could not load the gate: ${e.message}</td></tr>`; }
}

for (const id of ['coin', 'who', 'seed']) $(id).addEventListener('change', rerun);
$('win').addEventListener('input', draw);
new ResizeObserver(() => run && draw()).observe($('cv'));
gate();
rerun();
