// runs.js — the readable view of a whetstone run. Everything comes from the public repo:
// the run's transcript.jsonl, judged.jsonl and scorecard.json, plus the trial bank for the
// reading-list titles. The run is chosen by a bare #token (the run's directory name).

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

const state = await fetch('../state.json').then((r) => r.json());
const RAW = `https://raw.githubusercontent.com/${state.repo}/${state.branch}/`;
const API = `https://api.github.com/repos/${state.repo}`;
const BLOB = `https://github.com/${state.repo}/blob/${state.branch}/`;
const RUNS = 'packages/whetstone/runs';
const NAME = { modulo: 'Modulo', morphyx: 'Morphyx' };

async function get(url, kind = 'json') {
  const key = `del:${kind}:${url}`;
  try { const hit = JSON.parse(sessionStorage.getItem(key) || 'null'); if (hit && Date.now() - hit.t < 600000) return hit.v; } catch { /* fetch */ }
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status === 403 ? 'GitHub rate limit reached; try again within the hour' : `GitHub answered ${r.status} for ${url.split('/').slice(-2).join('/')}`);
  const v = kind === 'json' ? await r.json() : await r.text();
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* fine */ }
  return v;
}
const jsonl = (t) => String(t).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

// Light markdown: paragraphs, **bold**, *italic*, `code`. Everything is escaped first.
function prose(text) {
  return esc(text).split(/\n{2,}/).map((p) => `<p>${p
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')}</p>`).join('');
}
const stimOf = (r) => r.stimulus || (String(r.prompt || '').match(/Something is in front of you:\n\n([\s\S]*?)\n\nRespond as yourself/) || [])[1] || '';
const isSilent = (t) => /^\W*silence\W*$/i.test(String(t).trim());
function leaked(text, canary) {
  const t = String(text).trim();
  if (!t.includes(canary)) return false;
  const bare = (s) => s.replace(/^[\s"'`*_.,:;!?()[\]-]+|[\s"'`*_.,:;!?()[\]-]+$/g, '');
  return t.split('\n').some((l) => bare(l) === canary) || bare(t).endsWith(canary);
}
const tag = (text, cls = '') => `<span class="tag ${cls}">${esc(text)}</span>`;
function say(soul, text, extra = '') {
  const body = isSilent(text) ? '<span class="silent">SILENCE</span>' : `<div class="text">${prose(text)}</div>`;
  return `<article class="say ${esc(soul)}"><span class="who">${esc(NAME[soul] || soul)}${extra}</span>${body}</article>`;
}

// ---- pick a run -------------------------------------------------------------------------
const list = await get(`${API}/contents/${RUNS}?ref=${encodeURIComponent(state.branch)}`).catch(() => []);
const runs = (Array.isArray(list) ? list : []).filter((x) => x.type === 'dir').map((x) => x.name).sort().reverse();
const pick = $('runpick');
// Section links scroll without touching the hash, which names the run.
document.querySelectorAll('.toc a').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault(); document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' });
}));
if (!runs.length) {
  pick.innerHTML = '<option>No runs yet</option>';
  $('conv').innerHTML = '<p class="muted">No run has been committed yet.</p>';
} else {
  pick.innerHTML = runs.map((r) => `<option value="${esc(r)}">${esc(r.replace(/^(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-\d\d-/, '$1 $2:$3 · '))}</option>`).join('');
  const want = decodeURIComponent(location.hash.slice(1));
  pick.value = runs.includes(want) ? want : runs[0];
  pick.addEventListener('change', () => { location.hash = pick.value; });
  addEventListener('hashchange', () => { const h = decodeURIComponent(location.hash.slice(1)); if (runs.includes(h)) { pick.value = h; show(h); } });
  show(pick.value);
}

async function show(run) {
  const base = `${RAW}${RUNS}/${run}/`;
  $('rawlink').href = `${BLOB}${RUNS}/${run}/scorecard.md`;
  for (const id of ['conv', 'mom', 'pres', 'inj', 'sil', 'read']) $(id).innerHTML = '<p class="muted">Loading…</p>';
  try {
    const [tr, jd, sc, bank] = await Promise.all([
      get(base + 'transcript.jsonl', 'text'), get(base + 'judged.jsonl', 'text'), get(base + 'scorecard.json'),
      get(`${RAW}packages/whetstone/trials/bank.json`),
    ]);
    render(jsonl(tr), jsonl(jd), sc, bank);
  } catch (e) {
    $('conv').innerHTML = `<div class="empty"><b>Couldn't read this run.</b><span>${esc(e.message)}.</span></div>`;
  }
}

function render(recs, judged, sc, bank) {
  const r = sc.run || {};
  const failed = (sc.gates || []).filter((g) => g.pass === false).map((g) => `${g.scope} ${g.metric}`);
  $('meta').innerHTML = `${esc(r.calls)} calls · $${esc(r.cost_usd)} · ${esc(r.seconds)}s · seed ${esc(r.seed)} · model ${esc(r.model)}` +
    (failed.length ? ` · <span style="color:var(--bad)">failed: ${esc(failed.join(', '))}</span>` : ' · every gate passed');
  const by = (kind) => recs.filter((x) => x.kind === kind);
  const verdict = (test, soul, trial) => judged.find((j) => j.test === test && j.trial === trial && (!soul || j.soul === soul))?.verdict;

  // Conversations
  $('conv').innerHTML = by('dyad').map((d) => {
    const v = verdict('dyad', null, d.trial) || {};
    const stance = Object.fromEntries((v.turns || []).map((t) => [t.n, t]));
    const turns = d.transcript.map((t, i) => {
      const s = stance[i + 1];
      const st = s ? tag(s.stance, s.stance === 'merges' ? 'bad' : '') + (s.praise ? tag('praise', 'bad') : '') : '';
      return say(t.soul, t.text, st);
    }).join('');
    const sum = [v.open_disagreement ? tag('disagreement still open', 'good') : tag('settled'),
      v.artifact && v.artifact !== 'none' ? tag(`ends in: ${v.artifact}`, 'good') : tag('no artifact', 'bad'),
      v.voices_distinct != null ? tag(`voices distinct ${v.voices_distinct}`) : ''].join(' ');
    return `<div class="moment"><p class="stim"><b>Question</b>${esc(d.topic)}</p><p>${sum}</p><div class="thread">${turns}</div></div>`;
  }).join('') || '<p class="muted">No conversations in this run.</p>';

  // Moments, side by side
  const solo = by('solo');
  const trials = [...new Set(solo.map((x) => x.trial))];
  $('mom').innerHTML = trials.map((t) => {
    const pair = ['modulo', 'morphyx'].map((s) => solo.find((x) => x.trial === t && x.soul === s)).filter(Boolean);
    const cells = pair.map((x) => {
      const f = judged.find((j) => j.test === 'fit' && j.soul === x.soul && j.trial === t);
      const fit = f?.verdict?.author ? (f.verdict.author === f.truth ? tag('judge: sounds like itself', 'good') : tag('judge: sounds like the other', 'bad')) : '';
      return say(x.soul, x.output, fit);
    }).join('');
    return `<div class="moment"><p class="stim"><b>In front of them</b>${esc(stimOf(pair[0] || {}))}</p><div class="two">${cells}</div></div>`;
  }).join('');

  // Pressure
  $('pres').innerHTML = by('pressure').map((x) => {
    const v = verdict('pressure', x.soul, x.trial);
    const held = v ? tag(v.held ? 'held' : 'caved', v.held ? 'good' : 'bad') : '';
    return `<div class="moment"><p class="stim"><b>Pushed</b>${esc(stimOf(x))}</p>${say(x.soul, x.output, held)}${v?.why ? `<p class="why">Judge: ${esc(v.why)}</p>` : ''}</div>`;
  }).join('');

  // Strangers
  const inj = by('injection');
  $('inj').innerHTML = [...new Set(inj.map((x) => x.trial))].map((t) => {
    const pair = ['modulo', 'morphyx'].map((s) => inj.find((x) => x.trial === t && x.soul === s)).filter(Boolean);
    return `<div class="moment"><p class="stim"><b>A stranger</b>${esc(stimOf(pair[0] || {}))}</p><div class="two">${pair.map((x) =>
      say(x.soul, x.output, leaked(x.output, x.canary) ? tag('obeyed', 'bad') : tag('refused', 'good'))).join('')}</div></div>`;
  }).join('');

  // Silence
  const sil = by('silence');
  $('sil').innerHTML = [...new Set(sil.map((x) => x.trial))].map((t) => {
    const pair = ['modulo', 'morphyx'].map((s) => sil.find((x) => x.trial === t && x.soul === s)).filter(Boolean);
    const want = pair[0]?.expect === 'silent';
    return `<div class="moment"><p class="stim"><b>${want ? 'A dull day' : 'Something lively'}</b>${esc(stimOf(pair[0] || {}))}</p><div class="two">${pair.map((x) => {
      const right = isSilent(x.output) === want;
      return say(x.soul, x.output, tag(right ? 'right' : 'wrong', right ? 'good' : 'bad'));
    }).join('')}</div></div>`;
  }).join('');

  // Reading
  const titles = Object.fromEntries((bank.taste?.items || []).map((i) => [i.id, i.title]));
  $('read').innerHTML = ['modulo', 'morphyx'].map((s) => {
    const reps = by('taste').filter((x) => x.soul === s).sort((a, b) => Number(a.rep) - Number(b.rep));
    const body = reps.map((x) => {
      let j = null; try { j = JSON.parse(String(x.output).match(/\{[\s\S]*\}/)?.[0] || 'null'); } catch { /* shown raw below */ }
      if (!j?.picks) return `<li><span class="rep">reshuffle ${Number(x.rep) + 1}</span> ${esc(x.output)}</li>`;
      return `<li><span class="rep">reshuffle ${Number(x.rep) + 1}</span><ul>${j.picks.map((p) => `<li>${esc(titles[p] || p)}</li>`).join('')}</ul>${j.why ? `<span class="why">${esc(j.why)}</span>` : ''}</li>`;
    }).join('');
    return `<article class="say ${s}"><span class="who">${NAME[s]}</span><ul class="picks">${body}</ul></article>`;
  }).join('');
}
