// days.js — the chronicle (packages/whetstone/chronicle.json), rendered. One fetch from
// raw.githubusercontent.com, which has no API rate limit, cached for ten minutes like every
// other page here. Each section fails on its own, with a sentence.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
const NAME = { modulo: 'Modulo', morphyx: 'Morphyx', mozzie: 'Mozzie' };
const money = (x) => (typeof x === 'number' ? `$${x.toFixed(2)}` : '—');

const state = await fetch('../state.json').then((r) => r.json());
const RAW = `https://raw.githubusercontent.com/${state.repo}/${state.branch}/`;

async function get(url) {
  const key = `del:json:${url}`;
  try { const hit = JSON.parse(sessionStorage.getItem(key) || 'null'); if (hit && Date.now() - hit.t < 600000) return hit.v; } catch { /* fetch */ }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  const v = await r.json();
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* fine */ }
  return v;
}

// **bold** and `code` only; everything escaped first.
const md = (t) => esc(t).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');

let ch;
try { ch = await get(`${RAW}packages/whetstone/chronicle.json`); }
catch (e) {
  for (const id of ['tiles', 'chart', 'days']) $(id).innerHTML = `<p class="muted">Couldn't read the chronicle: ${esc(e.message)}.</p>`;
  throw e;
}
const N = ch.now;

// ---- now -----------------------------------------------------------------------------------
$('tiles').innerHTML = [
  [N.days, 'days in the lab'],
  [money(N.cost_usd), 'spent on model calls'],
  [N.calls, 'model calls'],
  [N.projects.filter((p) => p.complete).length, 'projects complete'],
  [N.corrections, 'grading errors the lab caught in itself'],
].map(([v, l]) => `<div class="tile"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');

$('projects').innerHTML = N.projects.length ? `<div class="scroll"><table class="t"><thead><tr><th>Project</th><th>Milestones</th><th>Day</th><th>State</th></tr></thead><tbody>${
  N.projects.map((p) => `<tr><td><code>${esc(p.id)}</code></td><td class="num">${esc(p.milestones)}</td><td class="num">${esc(p.day)}</td><td><span class="pill ${p.complete ? 'ok' : 'wip'}">${p.complete ? 'complete' : 'in progress'}</span>${p.regraded ? ' <span class="muted">regraded</span>' : ''}</td></tr>`).join('')
}</tbody></table></div>` : '';

$('choice').innerHTML = N.choice
  ? `<p><b>Last council, day ${esc(N.choice.day)}:</b> ${esc(N.choice.choice || 'untitled')}. Signed by ${esc(N.choice.signed.map((s) => NAME[s] || s).join(', ') || 'nobody')}; ${N.choice.stands ? 'it stands' : 'it does not stand'}.</p>` : '';

$('open').innerHTML = N.open_tasks.length ? `<details><summary>${N.open_tasks.length} open in the ledger</summary><ul>${
  N.open_tasks.map((t) => `<li><code>${esc(t.id)}</code> <span class="muted">${esc(t.status.replace('_', ' '))}</span> ${esc(t.title)}${t.by ? ` <span class="muted">(${esc(NAME[t.by] || t.by)})</span>` : ''}</li>`).join('')
}</ul></details>` : '';

// ---- cost per day: one series, so no legend; the title names it. Bars anchored at zero, a
// rounded data end, a 2px gap between bars, a hit target the full column height. -------------
{
  const D = ch.days, W = 720, H = 220, L = 40, B = 24, T = 8, n = D.length;
  const max = Math.max(1, ...D.map((d) => d.cost_usd || 0));
  const top = Math.ceil(max / 2) * 2;
  const bw = (W - L) / n, y = (v) => T + (H - T - B) * (1 - v / top);
  const ticks = [0, top / 2, top];
  const bar = (x, w, y0, y1) => { const r = Math.min(4, w / 2, y1 - y0); return `M${x},${y1} V${y0 + r} Q${x},${y0} ${x + r},${y0} H${x + w - r} Q${x + w},${y0} ${x + w},${y0 + r} V${y1} Z`; };
  const svg = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cost per day in US dollars, ${n} days">`,
    ...ticks.map((t) => `<line class="ax" x1="${L}" x2="${W}" y1="${y(t)}" y2="${y(t)}" ${t ? 'stroke-dasharray="2 4"' : ''}/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">$${t}</text>`),
    ...D.map((d, i) => {
      const x = L + i * bw + 1, w = Math.max(2, bw - 2), v = d.cost_usd || 0;
      const label = `Day ${d.n}, ${d.label}: ${money(d.cost_usd)}, ${d.calls ?? '?'} calls`;
      return `<a href="#day-${d.n}" aria-label="${esc(label)}"><rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" data-tip="${esc(label)}"/>` +
        (v > 0 ? `<path class="bar" d="${bar(x, w, y(v), y(0))}"/>` : '') + '</a>' +
        (n <= 16 || i % 2 === 0 ? `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${d.n}</text>` : '');
    }), '</svg>'].join('');
  $('chart').innerHTML = `<div class="frame">${svg}</div><div class="tip" id="tip"></div><details><summary>as a table</summary><div class="scroll"><table class="t"><thead><tr><th>Day</th><th>Run</th><th>Cost</th><th>Calls</th></tr></thead><tbody>${
    D.map((d) => `<tr><td class="num">${d.n}</td><td>${esc(d.label)}</td><td class="num">${money(d.cost_usd)}</td><td class="num">${esc(d.calls ?? '—')}</td></tr>`).join('')}</tbody></table></div></details>`;
  const tip = $('tip'), box = $('chart');
  const show = (e) => {
    const t = e.target.closest('[data-tip]'); if (!t) { tip.style.opacity = 0; return; }
    tip.textContent = t.dataset.tip;
    const b = box.getBoundingClientRect(), r = t.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(0, r.left - b.left + r.width / 2 - tip.offsetWidth / 2), b.width - tip.offsetWidth)}px`;
    tip.style.top = `${Math.max(0, r.top - b.top - 6)}px`;
    tip.style.opacity = 1;
  };
  box.addEventListener('mousemove', show); box.addEventListener('focusin', show);
  box.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
}

// ---- the days, newest first ------------------------------------------------------------------
$('days').innerHTML = [...ch.days].reverse().map((d) => {
  const meta = [d.at ? d.at.slice(0, 10) : null, d.kinds.join(', '), money(d.cost_usd), d.calls != null ? `${d.calls} calls` : null,
    d.minutes != null ? `${d.minutes} min` : null, d.usage ? `usage 5h ${d.usage.five_hour}% · 7d ${d.usage.seven_day}%` : null].filter(Boolean).map(esc).join(' · ');
  const parts = [];
  if (d.why) parts.push(`<p><span class="k">why</span>${md(d.why)}</p>`);
  if (d.told) parts.push(`<details><summary>what they were told</summary><p>${md(d.told)}</p></details>`);
  if (d.lent?.refs || d.lent?.engines) parts.push(`<p><span class="k">lent</span>${[d.lent.refs && `refs: ${esc(d.lent.refs)}`, d.lent.engines && `engines: ${esc(d.lent.engines)}`].filter(Boolean).join('; ')}</p>`);
  if (d.gates) parts.push(`<p><span class="k">gates</span>${d.gates.passed}/${d.gates.measured} passed${d.gates.failed.length ? `; failed: ${esc(d.gates.failed.join(', '))}` : ''}</p>`);
  for (const p of d.projects) parts.push(`<p><span class="k">project</span><code>${esc(p.id)}</code> ${esc(p.milestones)}${p.regraded ? `, <strong>regraded to ${esc(p.regraded.milestones)}</strong>` : ''}</p>`);
  if (d.council) parts.push(`<p><span class="k">council</span>${esc(d.council.choice || 'untitled')}. Signed by ${esc(d.council.signed.map((s) => NAME[s] || s).join(', ') || 'nobody')}${d.council.stands ? '' : ': not standing'}.</p>`);
  if (d.sweep) parts.push(`<p><span class="k">sweep</span>board ${esc(d.sweep.board_before)} → ${esc(d.sweep.board_after)} characters${d.sweep.lost ? `; <span class="lost">the judge says it lost something:</span> ${esc(d.sweep.lost_what)}` : ''}</p>`);
  for (const e of d.evenings) parts.push(`<p class="eve ${esc(e.soul)}"><b>${esc(NAME[e.soul] || e.soul)}</b>${esc(e.said)}</p>`);
  for (const x of d.corrections) parts.push(`<p class="fix"><b>Lab correction.</b> ${esc(x.what)}: ${esc(x.from)} → ${esc(x.to)}. ${esc(x.why)}.</p>`);
  return `<article class="day" id="day-${d.n}"><h3><span class="n">Day ${d.n}</span>${esc(d.label)}</h3><div class="meta">${meta} · <a href="../runs/#${esc(d.dir)}">read it</a></div>${parts.join('')}</article>`;
}).join('');
if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
