// del.js — the observatory. state.json (shipped with the site) says what only a person can say:
// the phase, the benches, who is born, the log. Everything the lab produces (souls, gates,
// runs) is read live from the public repo on GitHub, so a new whetstone run shows up here
// without a redeploy. Each section fails on its own, with a sentence, never a blank.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
const TTL = 10 * 60 * 1000; // GitHub's unauthenticated API allows 60 calls an hour per IP

async function cached(url, kind = 'json') {
  const key = `del:${kind}:${url}`;
  try {
    const hit = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (hit && Date.now() - hit.t < TTL) return hit.v;
  } catch { /* storage unavailable: just fetch */ }
  const r = await fetch(url, { headers: url.includes('api.github.com') ? { Accept: 'application/vnd.github+json' } : {} });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(r.status === 403 ? 'GitHub rate limit reached; try again within the hour' : `GitHub answered ${r.status}`);
  const v = kind === 'json' ? await r.json() : await r.text();
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* fine */ }
  return v;
}

async function sha12(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 12);
}

const fmtDate = (iso) => (iso ? new Date(iso).toISOString().slice(0, 10) : '—');
const pct = (x) => (typeof x === 'number' ? (x <= 1 && x >= 0 ? x.toFixed(2) : String(x)) : '—');

const state = await fetch('state.json').then((r) => r.json());
const RAW = `https://raw.githubusercontent.com/${state.repo}/${state.branch}/`;
const API = `https://api.github.com/repos/${state.repo}`;
const BLOB = `https://github.com/${state.repo}/blob/${state.branch}/`;
const TREE = `https://github.com/${state.repo}/tree/${state.branch}/`;
$('src').innerHTML = `Source: <a href="${esc(TREE)}">${esc(state.repo)} @ ${esc(state.branch)}</a>`;

// ---- phases ------------------------------------------------------------------------------
{
  const at = state.phases.findIndex((p) => p.id === state.phase);
  $('phases').innerHTML = state.phases.map((p, i) =>
    `<div class="phase ${i < at ? 'done' : i === at ? 'now' : ''}" role="listitem" ${i === at ? 'aria-current="step"' : ''}>` +
    `<b>${esc(p.label)}</b><span>${esc(p.note)}</span></div>`).join('');
  const born = state.beings.filter((b) => b.born).length;
  $('phase-note').textContent = born
    ? `${born} of ${state.beings.length} born. Current step: ${state.phases[at]?.label}.`
    : `Nothing has launched. Both beings are in the ${state.phases[at]?.label} step.`;
}

// ---- benches and log (state only) --------------------------------------------------------
$('benches').innerHTML = state.benches.map((b) => {
  const cls = b.status === 'built' ? 'built' : b.status === 'partial' ? 'partial' : 'tobuild';
  return `<tr><td><b>${esc(b.id)}</b></td><td><span class="pill ${cls}">${esc(b.status)}</span></td><td>${esc(b.what)}</td></tr>`;
}).join('');
$('logl').innerHTML = [...state.log].reverse().map((e) => `<li><time>${esc(e.date)}</time><span>${esc(e.text)}</span></li>`).join('');
$('records').innerHTML = [
  ['The pitch', 'pitch/'],
  ['MINIPHIM.md', `${BLOB}docs/MINIPHIM.md`],
  ['HARNESS.md', `${BLOB}docs/HARNESS.md`],
  ['DELVE.md', `${BLOB}docs/DELVE.md`],
  ['whetstone', `${TREE}packages/whetstone`],
].map(([t, u]) => `<a href="${esc(u)}">${esc(t)}</a>`).join('');

// ---- the two ------------------------------------------------------------------------------
async function being(b) {
  const path = `packages/whetstone/souls/${b.key}.md`;
  const rows = [
    ['status', b.born ? `<span class="pill born">born</span>` : `<span class="pill unborn">in the lab</span>`],
    ['domain', b.domain ? esc(b.domain) : '<span class="muted">not yet</span>'],
    ['account', b.did ? `<span class="mono">${esc(b.did)}</span>` : '<span class="muted">not yet</span>'],
  ];
  try {
    const [text, commits] = await Promise.all([
      cached(RAW + path, 'text'),
      cached(`${API}/commits?sha=${encodeURIComponent(state.branch)}&path=${encodeURIComponent(path)}&per_page=1`),
    ]);
    if (text) rows.push(['soul', `<a class="mono" href="${esc(BLOB + path)}">${esc(await sha12(text))}</a> <span class="muted">(draft)</span>`]);
    const c = commits?.[0];
    if (c) rows.push(['last edit', `${esc(fmtDate(c.commit?.author?.date))} · ${esc((c.commit?.message || '').split('\n')[0].slice(0, 90))}`]);
  } catch (e) {
    rows.push(['soul', `<span class="muted">${esc(e.message)}</span>`]);
  }
  return `<article class="being ${esc(b.key)}"><h3>${esc(b.name)}</h3><p class="muted">${esc(b.axis)}</p>` +
    `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></article>`;
}
Promise.all(state.beings.map(being)).then((h) => { $('beings').innerHTML = h.join(''); });

// ---- the bar ------------------------------------------------------------------------------
cached(RAW + 'packages/whetstone/gates.json').then((g) => {
  if (!g) throw new Error('gates.json not found on the branch');
  const rows = [];
  for (const scope of ['soul', 'pair']) for (const [m, v] of Object.entries(g[scope] || {})) {
    const th = ['min' in v ? `≥ ${v.min}` : '', 'max' in v ? `≤ ${v.max}` : ''].filter(Boolean).join(' ');
    rows.push(`<tr><td>${scope === 'soul' ? 'each soul' : 'the pair'}</td><td class="mono">${esc(m)}</td><td class="num">${esc(th)}</td><td>${esc(v.why || '')}</td></tr>`);
  }
  $('gates').innerHTML = rows.join('');
}).catch((e) => { $('gates').innerHTML = `<tr><td colspan="4" class="muted">${esc(e.message)}</td></tr>`; });

// The subscription's usage windows as the run saw them (whetstone records rate_limit_event lines).
function windowText(w) {
  if (!w) return '';
  const pct = (x) => (x == null ? '?' : `${Math.round(x * 100)}%`);
  let wins = Object.entries(w.types || {}).map(([k, t]) => [k, t.end ?? t.peak_utilization ?? null]);
  // Second light (the first run to record windows) kept them only inside the last raw report.
  const raw = Object.values(w.types || {}).find((t) => t.last?.unifiedWindows)?.last?.unifiedWindows;
  if (raw && wins.every(([, v]) => v == null)) wins = Object.entries(raw).map(([k, v]) => [k, v?.utilization]);
  const parts = wins.map(([k, v]) => `${k.replace('_', '-')} ${pct(v)}`);
  return ` · usage window: ${parts.length ? parts.join(', ') : 'not reported'} (${w.calls_reporting}/${w.calls} calls)`;
}

// ---- the latest run -----------------------------------------------------------------------
(async () => {
  const el = $('run');
  try {
    const list = await cached(`${API}/contents/packages/whetstone/runs?ref=${encodeURIComponent(state.branch)}`);
    const runs = (Array.isArray(list) ? list : []).filter((x) => x.type === 'dir').map((x) => x.name).sort().reverse();
    if (!runs.length) {
      el.innerHTML = `<div class="empty"><b>No live run yet.</b><span>The souls are drafts, and the lab has only been run against its own scripted stand-in. The first real run starts when a request file is pushed to <span class="mono">packages/whetstone/requests/</span>.</span></div>`;
      return;
    }
    const latest = runs[0];
    const sc = await cached(`${RAW}packages/whetstone/runs/${latest}/scorecard.json`);
    if (!sc) throw new Error(`run ${latest} has no scorecard`);
    const gates = sc.gates || [];
    const failed = gates.filter((g) => g.pass === false).length;
    const r = sc.run || {};
    const head = `<p class="row"><span class="pill ${failed ? 'fail' : 'pass'}">${failed ? `${failed} gate${failed > 1 ? 's' : ''} failed` : 'every gate passed'}</span>` +
      `<span class="mono">${esc(latest)}</span><span class="muted">${esc(r.calls ?? '?')} calls · $${esc(r.cost_usd ?? '?')} · model ${esc(r.model ?? '?')}${windowText(r.window)}</span>` +
      `<a href="${esc(BLOB)}packages/whetstone/runs/${encodeURIComponent(latest)}/scorecard.md">read the transcripts</a></p>`;
    const rows = gates.map((g) => {
      const ci = g.lo !== undefined && g.lo !== null ? `${pct(g.lo)}–${pct(g.hi)}` : '';
      const pill = g.pass === true ? 'pass' : g.pass === false ? 'fail' : 'none';
      return `<tr><td>${esc(g.scope)}</td><td class="mono">${esc(g.metric)}</td><td class="num">${esc(pct(g.value))}</td><td class="num">${esc(ci)}</td><td class="num">${esc(g.n ?? '')}</td><td><span class="pill ${pill}">${pill === 'none' ? 'not measured' : pill}</span></td></tr>`;
    }).join('');
    el.innerHTML = `${head}<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Scope</th><th>Gate</th><th>Value</th><th>95% interval</th><th>n</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` +
      `<p class="muted" style="margin-top:8px">${runs.length} run${runs.length > 1 ? 's' : ''} so far.</p>`;
  } catch (e) {
    el.innerHTML = `<div class="empty"><b>Couldn't read the lab.</b><span>${esc(e.message)}.</span></div>`;
  }
})();
